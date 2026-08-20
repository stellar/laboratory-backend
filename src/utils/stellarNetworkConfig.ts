import { Networks, rpc, xdr } from "@stellar/stellar-sdk";

import { normalizeHttpsUrl } from "../helpers/normalizeHttpsUrl";
import { NetworkLimits } from "../types/network_settings";
import { HttpError } from "./error";
import { logger } from "./logger";

const LEDGER_ENTRY_KEY_XDRS = [
  "AAAACAAAAAA=", // contract_max_size_bytes
  "AAAACAAAAAE=", // contract_compute_v0
  "AAAACAAAAAI=", // contract_ledger_cost_v0
  "AAAACAAAAAM=", // contract_historical_data_v0
  "AAAACAAAAAQ=", // contract_events_v0
  "AAAACAAAAAU=", // contract_bandwidth_v0
  "AAAACAAAAAY=", // contract_cost_params_cpu_instructions
  "AAAACAAAAAc=", // contract_cost_params_memory_bytes
  "AAAACAAAAAg=", // contract_data_key_size_bytes
  "AAAACAAAAAk=", // contract_data_entry_size_bytes
  "AAAACAAAAAo=", // state_archival
  "AAAACAAAAAs=", // contract_execution_lanes
  "AAAACAAAAA4=", // contract_parallel_compute_v0
  "AAAACAAAAA8=", // contract_ledger_cost_ext_v0
  "AAAACAAAABA=", // scp_timing
  "AAAACAAAAAw=", // live_soroban_state_size_window
];

// Parse the base64 XDR strings into real LedgerKey objects
const LEDGER_ENTRY_KEYS: xdr.LedgerKey[] = LEDGER_ENTRY_KEY_XDRS.map(k =>
  xdr.LedgerKey.fromXDR(k, "base64"),
);

export const PASSPHRASE_BY_NETWORK_NAME = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
} as const;

/** The network the caller believes it is on, as named in the request. */
export type NetworkName = keyof typeof PASSPHRASE_BY_NETWORK_NAME;

/** The passphrase of a network this API serves — one of exactly three. */
export type NetworkPassphrase =
  (typeof PASSPHRASE_BY_NETWORK_NAME)[NetworkName];

export const NETWORK_NAMES = Object.keys(
  PASSPHRASE_BY_NETWORK_NAME,
) as NetworkName[];

export type StellarNetworkConfig = {
  /**
   * Required — the network the caller has selected (in the Laboratory UI, the
   * Testnet/Mainnet toggle). Checked against the network `rpcUrl` actually
   * serves so a mismatched pair is rejected rather than silently answered with
   * the other network's limits.
   *
   * This comes from the request, deliberately not from the deployment's
   * `NETWORK_PASSPHRASE`: the caller's selected network is the one that matters,
   * and depending on deployment env made the endpoint's behavior vary with how
   * each instance happened to be configured.
   */
  network: NetworkName;
  /**
   * Required — the caller names the RPC explicitly. There is deliberately no
   * default: a fallback let the server answer with some other network's limits
   * and a 200, which no caller can distinguish from a correct response.
   */
  rpcUrl: string;
};

/**
 * Vetted, publicly accessible Stellar RPC URLs, keyed by network passphrase.
 * These are the only RPC hosts the network-limits endpoint accepts — anything
 * else is rejected.
 *
 * Hand-synced snapshot of the "Publicly Accessible APIs" table at
 * https://developers.stellar.org/docs/data/apis/rpc/providers#publicly-accessible-apis
 * (last synced 2026-07-21). The upstream list changes over time — re-check the
 * docs when updating. The Liquify URLs embed a shared API key as published in
 * those docs.
 */
export const PUBLIC_RPC_URLS: Record<NetworkPassphrase, string[]> = {
  [Networks.PUBLIC]: [
    "https://mainnet.sorobanrpc.com", // sorobanrpc.com
    "https://soroban-rpc.mainnet.stellar.gateway.fm", // Gateway
    "https://stellar.api.onfinality.io/public", // OnFinality
    "https://rpc.lightsail.network", // Lightsail Network - Quasar
    "https://archive-rpc.lightsail.network", // Lightsail - Quasar (Archive)
    "https://rpc.ankr.com/stellar_soroban", // Ankr (Archive)
  ],
  [Networks.TESTNET]: [
    "https://soroban-testnet.stellar.org", // SDF
    "https://soroban-rpc.testnet.stellar.gateway.fm", // Gateway
  ],
  [Networks.FUTURENET]: [
    "https://rpc-futurenet.stellar.org", // SDF
  ],
};

const NETWORK_NAME_BY_PASSPHRASE = Object.fromEntries(
  Object.entries(PASSPHRASE_BY_NETWORK_NAME).map(([name, passphrase]) => [
    passphrase,
    name as NetworkName,
  ]),
) as Record<NetworkPassphrase, NetworkName>;

// The allowlist entries, canonicalized once so membership tests are
// trailing-slash-safe even if an entry above is later written with one.
const VETTED_RPC_URLS = Object.fromEntries(
  Object.entries(PUBLIC_RPC_URLS).map(
    ([passphrase, urls]): [NetworkPassphrase, readonly string[]] => [
      passphrase as NetworkPassphrase,
      urls.map(normalizeHttpsUrl),
    ],
  ),
) as Record<NetworkPassphrase, readonly string[]>;

/**
 * Reverse index of the allowlist: canonical RPC URL -> the network passphrase
 * it serves. Built once at module load, which is also where a URL listed under
 * two networks would be caught — the mapping has to stay one-to-one for a URL
 * to pin down the network it belongs to.
 */
const NETWORK_BY_RPC_URL: ReadonlyMap<string, NetworkPassphrase> = (() => {
  const index = new Map<string, NetworkPassphrase>();
  for (const [passphrase, urls] of Object.entries(VETTED_RPC_URLS) as [
    NetworkPassphrase,
    readonly string[],
  ][]) {
    for (const url of urls) {
      const existing = index.get(url);
      if (existing !== undefined && existing !== passphrase) {
        throw new Error(
          `PUBLIC_RPC_URLS lists "${url}" under two networks ` +
            `("${existing}" and "${passphrase}"); each URL must map to one network.`,
        );
      }
      index.set(url, passphrase);
    }
  }
  return index;
})();

// Exported so tests reference the single source of truth rather than
// re-hardcoding the durations (and to make the cache window discoverable).
export const NETWORK_LIMITS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const NETWORK_LIMITS_STALE_MAX_MS = 10 * 60 * 1000; // serve stale up to 10 min on refresh failure

// Total request-duration cap for the RPC call. Benchmarking the allowlisted
// providers showed successful getLedgerEntries responses at ~150–840ms; 5s
// gives generous headroom for production tail latency while still aborting a
// genuinely stuck request quickly. The SDK's `timeout` aborts via AbortSignal,
// so this bounds total wall-clock duration (incl. body read), not just socket idle.
const NETWORK_LIMITS_RPC_TIMEOUT_MS = 5000;

// Cap the RPC response size. The real payload is ~7KB; 256KB is ample headroom
// for growth yet bounds a malicious/oversized response. The SDK streams the body
// and aborts (reader.cancel()) once this many bytes arrive — it does not
// buffer-the-whole-thing-then-check.
const NETWORK_LIMITS_MAX_RESPONSE_BYTES = 256 * 1024;

type NetworkLimitsCacheEntry = {
  value?: NetworkLimits;
  atMs?: number;
  inFlight?: Promise<NetworkLimits>;
};

/**
 * Module-level cache keyed by RPC URL. Network limits are identical for every
 * caller on a given network and change rarely, so we serve cached values for a
 * short TTL, coalesce concurrent refreshes (single-flight), and fall back to a
 * recent stale value if a refresh fails — mirroring LedgerSequenceService.
 */
const networkLimitsCache = new Map<string, NetworkLimitsCacheEntry>();

export class StellarNetworkConfigService {
  private readonly rpcUrl: string;

  /**
   * The passphrase of the network that answered — always the one the caller
   * asked for, since a mismatch is rejected in the constructor. Echoed in the
   * response so the caller can confirm which network the numbers describe.
   */
  readonly networkPassphrase: NetworkPassphrase;

  constructor({ network, rpcUrl }: StellarNetworkConfig) {
    // The route validates both with Zod; these are defense-in-depth for any
    // non-HTTP caller. Neither has a default to fall back to.
    if (!network) {
      throw new HttpError("network is required", 400);
    }

    const expected = PASSPHRASE_BY_NETWORK_NAME[network];
    if (!expected) {
      throw new HttpError(
        `network must be one of: ${NETWORK_NAMES.join(", ")}`,
        400,
      );
    }

    if (!rpcUrl) {
      throw new HttpError("rpc_url is required", 400);
    }

    // Normalize (enforces https + strips trailing slash) before the allowlist
    // check so the stored value is canonical and shared as the cache key.
    this.rpcUrl = normalizeHttpsUrl(rpcUrl);
    this.checkRpcUrlServesNetwork(network, expected);
    this.networkPassphrase = expected;
  }

  /**
   * The URL must be allowlisted *and* belong to the network the caller says it
   * is on. Selecting Testnet in the UI and pasting a Mainnet RPC URL is a
   * caller mistake worth surfacing, not something to silently answer with
   * Mainnet's limits.
   */
  private checkRpcUrlServesNetwork(
    network: NetworkName,
    expected: NetworkPassphrase,
  ): void {
    const allowedForNetwork = VETTED_RPC_URLS[expected];
    const actual = NETWORK_BY_RPC_URL.get(this.rpcUrl);

    if (actual === undefined) {
      throw new HttpError(
        `RPC URL "${this.rpcUrl}" is not on the allowlist. ` +
          `Allowed ${network} URLs: ${allowedForNetwork.join(", ")}`,
        400,
      );
    }

    if (actual !== expected) {
      throw new HttpError(
        `RPC URL "${this.rpcUrl}" serves ${NETWORK_NAME_BY_PASSPHRASE[actual]}, ` +
          `but network=${network} was requested. ` +
          `Allowed ${network} URLs: ${allowedForNetwork.join(", ")}`,
        400,
      );
    }
  }

  async getNetworkLimits(): Promise<NetworkLimits> {
    const rpcUrl = this.rpcUrl;
    const cached = networkLimitsCache.get(rpcUrl);

    // Fresh cache hit — serve without touching the RPC.
    if (
      cached?.value !== undefined &&
      cached.atMs !== undefined &&
      Date.now() - cached.atMs <= NETWORK_LIMITS_CACHE_TTL_MS
    ) {
      return cached.value;
    }

    // A refresh is already in flight — join it instead of starting another.
    if (cached?.inFlight) {
      return cached.inFlight;
    }

    const inFlight = this.fetchNetworkLimits()
      .then(value => {
        networkLimitsCache.set(rpcUrl, { value, atMs: Date.now() });
        return value;
      })
      .catch(err => {
        // Refresh failed: serve a recent stale value if we have one.
        const prev = networkLimitsCache.get(rpcUrl);
        const staleMs =
          prev?.atMs !== undefined ? Date.now() - prev.atMs : Infinity;
        if (
          prev?.value !== undefined &&
          staleMs < NETWORK_LIMITS_STALE_MAX_MS
        ) {
          logger.warn(
            { err, staleMs, rpcUrl },
            "Failed to refresh network limits, serving stale cache",
          );
          return prev.value;
        }
        throw err;
      })
      .finally(() => {
        // Clear the in-flight marker, preserving any cached value/timestamp.
        const entry = networkLimitsCache.get(rpcUrl);
        if (entry?.inFlight) {
          networkLimitsCache.set(rpcUrl, {
            value: entry.value,
            atMs: entry.atMs,
          });
        }
      });

    networkLimitsCache.set(rpcUrl, { ...cached, inFlight });
    return inFlight;
  }

  private async fetchNetworkLimits(): Promise<NetworkLimits> {
    const server = new rpc.Server(this.rpcUrl, {
      timeout: NETWORK_LIMITS_RPC_TIMEOUT_MS,
    });
    // maxContentLength isn't exposed via rpc.Server options, so set it on the
    // underlying http client. The SDK enforces it by aborting the body stream
    // as bytes arrive, capping the response size.
    server.httpClient.defaults.maxContentLength =
      NETWORK_LIMITS_MAX_RESPONSE_BYTES;

    const response = await server.getLedgerEntries(...LEDGER_ENTRY_KEYS);
    return this.parseNetworkLimits(response);
  }

  // Extract the network limits from the parsed ledger entries using the SDK's
  // typed XDR accessors. Each entry's `val` is a ConfigSettingEntry union keyed
  // by its ConfigSettingID; index them by that id so we can pull each setting.
  private parseNetworkLimits = (
    response: rpc.Api.GetLedgerEntriesResponse,
  ): NetworkLimits => {
    if (!Array.isArray(response?.entries) || response.entries.length === 0) {
      throw new Error("RPC returned no ledger entries for network limits");
    }

    const settings = new Map<string, xdr.ConfigSettingEntry>();
    for (const { val } of response.entries) {
      const cs = val.configSetting();
      settings.set(cs.switch().name, cs);
    }

    const mustGet = (id: string): xdr.ConfigSettingEntry => {
      const cs = settings.get(id);
      if (!cs) {
        throw new Error(`Missing config setting entry: ${id}`);
      }
      return cs;
    };

    const compute = mustGet("configSettingContractComputeV0").contractCompute();
    const ledgerCost = mustGet(
      "configSettingContractLedgerCostV0",
    ).contractLedgerCost();
    const ledgerCostExt = mustGet(
      "configSettingContractLedgerCostExtV0",
    ).contractLedgerCostExt();
    const events = mustGet("configSettingContractEventsV0").contractEvents();
    const bandwidth = mustGet(
      "configSettingContractBandwidthV0",
    ).contractBandwidth();
    const historicalData = mustGet(
      "configSettingContractHistoricalDataV0",
    ).contractHistoricalData();
    const parallelCompute = mustGet(
      "configSettingContractParallelComputeV0",
    ).contractParallelCompute();
    const stateArchival = mustGet(
      "configSettingStateArchival",
    ).stateArchivalSettings();
    const maxSizeBytes = mustGet(
      "configSettingContractMaxSizeBytes",
    ).contractMaxSizeBytes();
    const dataKeySizeBytes = mustGet(
      "configSettingContractDataKeySizeBytes",
    ).contractDataKeySizeBytes();
    const liveStateSizeWindow = mustGet(
      "configSettingLiveSorobanStateSizeWindow",
    ).liveSorobanStateSizeWindow();

    return {
      // Per-transaction limits
      tx_max_instructions: compute.txMaxInstructions().toString(),
      tx_memory_limit: compute.txMemoryLimit(),
      tx_max_footprint_entries: ledgerCostExt.txMaxFootprintEntries(),
      tx_max_disk_read_entries: ledgerCost.txMaxDiskReadEntries(),
      tx_max_write_ledger_entries: ledgerCost.txMaxWriteLedgerEntries(),
      tx_max_disk_read_bytes: ledgerCost.txMaxDiskReadBytes(),
      tx_max_write_bytes: ledgerCost.txMaxWriteBytes(),
      tx_max_contract_events_size_bytes: events.txMaxContractEventsSizeBytes(),
      contract_data_key_size_bytes: dataKeySizeBytes,
      contract_max_size_bytes: maxSizeBytes,

      // Ledger-wide limits
      ledger_max_instructions: compute.ledgerMaxInstructions().toString(),
      ledger_max_disk_read_entries: ledgerCost.ledgerMaxDiskReadEntries(),
      ledger_max_disk_read_bytes: ledgerCost.ledgerMaxDiskReadBytes(),
      ledger_max_write_ledger_entries: ledgerCost.ledgerMaxWriteLedgerEntries(),
      ledger_max_write_bytes: ledgerCost.ledgerMaxWriteBytes(),
      ledger_max_txs_size_bytes: bandwidth.ledgerMaxTxsSizeBytes(),
      ledger_max_dependent_tx_clusters:
        parallelCompute.ledgerMaxDependentTxClusters(),

      // State archival TTL extension parameters
      max_entry_ttl: stateArchival.maxEntryTtl(),
      min_temporary_ttl: stateArchival.minTemporaryTtl(),
      min_persistent_ttl: stateArchival.minPersistentTtl(),

      // Resource fees (in stroops). 64-bit values are returned as strings to
      // avoid precision loss beyond Number.MAX_SAFE_INTEGER.
      fee_rate_per_instructions_increment: compute
        .feeRatePerInstructionsIncrement()
        .toString(),
      fee_disk_read_ledger_entry: ledgerCost
        .feeDiskReadLedgerEntry()
        .toString(),
      fee_write_ledger_entry: ledgerCost.feeWriteLedgerEntry().toString(),
      fee_disk_read_1kb: ledgerCost.feeDiskRead1Kb().toString(),
      fee_write_1kb: ledgerCostExt.feeWrite1Kb().toString(),
      fee_tx_size_1kb: bandwidth.feeTxSize1Kb().toString(),
      fee_historical_1kb: historicalData.feeHistorical1Kb().toString(),
      fee_contract_events_1kb: events.feeContractEvents1Kb().toString(),
      persistent_rent_rate_denominator: stateArchival
        .persistentRentRateDenominator()
        .toString(),
      temp_rent_rate_denominator: stateArchival
        .tempRentRateDenominator()
        .toString(),

      // Rent-related config parameters for computing fee_per_rent_1kb
      live_soroban_state_size_window: liveStateSizeWindow.map(v =>
        v.toString(),
      ),
      state_target_size_bytes: ledgerCost
        .sorobanStateTargetSizeBytes()
        .toString(),
      rent_fee_1kb_state_size_low: ledgerCost
        .rentFee1KbSorobanStateSizeLow()
        .toString(),
      rent_fee_1kb_state_size_high: ledgerCost
        .rentFee1KbSorobanStateSizeHigh()
        .toString(),
      state_size_rent_fee_growth_factor:
        ledgerCost.sorobanStateRentFeeGrowthFactor(),
    };
  };
}
