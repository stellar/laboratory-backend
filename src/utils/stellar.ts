import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";
import { Env } from "../config/env";

const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_PUBNET_HORIZON_URL = "https://horizon.stellar.org";
const LATEST_LEDGER_CACHE_TTL_MS = 5000;
const UPSTREAM_REQUEST_TIMEOUT_MS = 10_000;

export type StellarServiceConfig = {
  networkPassphrase: string;
  rpcUrl?: string;
  horizonUrl?: string;
};

export class StellarService {
  private readonly fetchLatestLedger: () => Promise<number>;
  private cachedLatestLedgerSequence: number | undefined;
  private cachedLatestLedgerAtMs: number | undefined;

  constructor({ networkPassphrase, rpcUrl, horizonUrl }: StellarServiceConfig) {
    const isTestnet = networkPassphrase === Networks.TESTNET;

    if (isTestnet) {
      const testnetRpcClient = new rpc.Server(
        rpcUrl ?? DEFAULT_TESTNET_RPC_URL,
      );
      testnetRpcClient.httpClient.defaults.timeout =
        UPSTREAM_REQUEST_TIMEOUT_MS;
      this.fetchLatestLedger = async () =>
        (await testnetRpcClient.getLatestLedger()).sequence;
    } else if (rpcUrl) {
      const pubnetRpcClient = new rpc.Server(rpcUrl);
      pubnetRpcClient.httpClient.defaults.timeout = UPSTREAM_REQUEST_TIMEOUT_MS;
      this.fetchLatestLedger = async () =>
        (await pubnetRpcClient.getLatestLedger()).sequence;
    } else {
      console.warn(
        "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
      );
      const pubnetHorizonClient = new Horizon.Server(
        horizonUrl ?? DEFAULT_PUBNET_HORIZON_URL,
        {},
      );
      pubnetHorizonClient.httpClient.defaults.timeout =
        UPSTREAM_REQUEST_TIMEOUT_MS;
      this.fetchLatestLedger = async () =>
        (await pubnetHorizonClient.root()).core_latest_ledger;
    }

    this.cachedLatestLedgerSequence = undefined;
    this.cachedLatestLedgerAtMs = undefined;
  }

  private getCachedLatestLedger(): number | undefined {
    if (
      this.cachedLatestLedgerSequence === undefined ||
      this.cachedLatestLedgerAtMs === undefined ||
      Date.now() - this.cachedLatestLedgerAtMs > LATEST_LEDGER_CACHE_TTL_MS
    ) {
      return undefined;
    }

    return this.cachedLatestLedgerSequence;
  }

  async getLatestLedger(): Promise<number> {
    const cached = this.getCachedLatestLedger();
    if (cached !== undefined) {
      return cached;
    }

    const latest = await this.fetchLatestLedger();
    this.cachedLatestLedgerSequence = latest;
    this.cachedLatestLedgerAtMs = Date.now();
    return latest;
  }
}

/**
 * Singleton instance of StellarService.
 */
let _stellarService: StellarService | undefined;

/**
 * Returns a lazily-initialized singleton instance of StellarService.
 * The service is configured using environment variables (NETWORK_PASSPHRASE, RPC_URL, HORIZON_URL).
 */
export const getStellarService = (): StellarService => {
  if (!_stellarService) {
    _stellarService = new StellarService({
      networkPassphrase: Env.networkPassphrase,
      rpcUrl: Env.rpcUrl,
      horizonUrl: Env.horizonUrl,
    });
  }
  return _stellarService;
};
