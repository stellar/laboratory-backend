import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";

const DEFAULT_TESTNET_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_PUBNET_HORIZON_URL = "https://horizon.stellar.org";
const LATEST_LEDGER_CACHE_TTL_MS = 5000;

type StellarServiceConfig = {
  networkPassphrase: string;
  rpcUrl?: string;
  horizonUrl?: string;
};

class StellarService {
  private readonly fetchLatestLedger: () => Promise<number>;
  private cachedLatestLedgerSequence: number | undefined;
  private cachedLatestLedgerAtMs: number | undefined;

  constructor({ networkPassphrase, rpcUrl, horizonUrl }: StellarServiceConfig) {
    const isTestnet = networkPassphrase === Networks.TESTNET;

    if (isTestnet) {
      const testnetRpcClient = new rpc.Server(
        rpcUrl ?? DEFAULT_TESTNET_RPC_URL,
      );
      this.fetchLatestLedger = async () =>
        (await testnetRpcClient.getLatestLedger()).sequence;
    } else if (rpcUrl) {
      const pubnetRpcClient = new rpc.Server(rpcUrl);
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

export { StellarService, type StellarServiceConfig };
