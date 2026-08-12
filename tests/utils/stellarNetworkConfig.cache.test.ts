import type { StellarNetworkConfigService as ServiceType } from "../../src/utils/stellarNetworkConfig";
import type { NetworkLimits } from "../../src/types/network_settings";
import { readFileSync } from "node:fs";

import {
  NETWORK_LIMITS_CACHE_TTL_MS,
  NETWORK_LIMITS_STALE_MAX_MS,
} from "../../src/utils/stellarNetworkConfig";

/**
 * Cache-orchestration tests for StellarNetworkConfigService.getNetworkLimits():
 * TTL expiry, single-flight coalescing, and recovery after a failed refresh.
 * The stale-cache 200/502 contract is exercised at the HTTP boundary in
 * tests/routes/network_limits.test.ts, where the status code is observable.
 *
 * We mock only the Soroban RPC boundary (`rpc.Server#getLedgerEntries`) with a
 * captured XDR fixture, so the real fetch + parse + caching code runs — same
 * approach as the route test. The cache lives at module scope, so every test
 * resets the module registry and re-imports the service to start cold.
 */
const rpcMock = vi.hoisted(() => ({
  getLedgerEntries: null as unknown as (...keys: unknown[]) => unknown,
  mockResponse: null as unknown,
}));

// Keep the real SDK (we need the genuine `xdr` codec); only replace `rpc.Server`.
vi.mock("@stellar/stellar-sdk", async importOriginal => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  const fs = await import("node:fs");

  const fixture = JSON.parse(
    fs.readFileSync(
      new URL("../fixtures/network_limits_entries.json", import.meta.url),
      "utf8",
    ),
  );
  rpcMock.mockResponse = {
    latestLedger: fixture.latestLedger,
    entries: fixture.entries.map(
      (e: {
        keyXdr: string;
        valXdr: string;
        lastModifiedLedgerSeq: number;
      }) => ({
        key: actual.xdr.LedgerKey.fromXDR(e.keyXdr, "base64"),
        val: actual.xdr.LedgerEntryData.fromXDR(e.valXdr, "base64"),
        lastModifiedLedgerSeq: e.lastModifiedLedgerSeq,
      }),
    ),
  };

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      // Regular function (not an arrow) so `new rpc.Server(url)` works.
      Server: vi.fn().mockImplementation(function (
        this: Record<string, unknown>,
      ) {
        this.getLedgerEntries = (...keys: unknown[]) =>
          rpcMock.getLedgerEntries(...keys);
        // The service sets maxContentLength on httpClient.defaults; model it.
        this.httpClient = { defaults: {} };
      }),
    },
  };
});

const expectedLimits: NetworkLimits = JSON.parse(
  readFileSync(
    new URL("../fixtures/network_limits_expected.json", import.meta.url),
    "utf8",
  ),
);

const RPC_URL = "https://mainnet.sorobanrpc.com"; // allowlisted

// Re-import the service against a fresh module registry so its module-level
// cache starts cold for every test.
async function freshService(rpcUrl = RPC_URL): Promise<ServiceType> {
  vi.resetModules();
  const { StellarNetworkConfigService } =
    await import("../../src/utils/stellarNetworkConfig");
  return new StellarNetworkConfigService({ network: "mainnet", rpcUrl });
}

describe("StellarNetworkConfigService caching", () => {
  beforeEach(() => {
    // Default: RPC succeeds with the captured fixture. Tests override as needed.
    rpcMock.getLedgerEntries = vi.fn(() =>
      Promise.resolve(rpcMock.mockResponse),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("TTL expiry", () => {
    it("serves from cache within the TTL without hitting the RPC again", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const service = await freshService();

      await service.getNetworkLimits(); // cold: populates the cache
      // Still inside the TTL window.
      vi.setSystemTime(
        new Date(Date.now() + NETWORK_LIMITS_CACHE_TTL_MS - 1000),
      );
      await service.getNetworkLimits(); // cache hit

      expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(1);
    });

    it("refetches from the RPC once the TTL has expired", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      const service = await freshService();

      await service.getNetworkLimits(); // cold: populates the cache
      // Just past the TTL: the entry is no longer fresh.
      vi.setSystemTime(
        new Date(Date.now() + NETWORK_LIMITS_CACHE_TTL_MS + 1000),
      );
      await expect(service.getNetworkLimits()).resolves.toEqual(expectedLimits);

      expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(2);
    });
  });

  describe("single-flight", () => {
    it("coalesces concurrent cold-cache requests into one RPC call", async () => {
      // Hold the RPC open so both callers are genuinely in flight together.
      let resolveRpc!: () => void;
      const gate = new Promise<void>(resolve => {
        resolveRpc = resolve;
      });
      rpcMock.getLedgerEntries = vi.fn(() =>
        gate.then(() => rpcMock.mockResponse),
      );

      const service = await freshService();

      const p1 = service.getNetworkLimits();
      const p2 = service.getNetworkLimits();

      // The second caller joins the in-flight refresh rather than starting its
      // own, so the RPC has been hit exactly once while both pend.
      expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(1);

      resolveRpc();
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(r1).toEqual(expectedLimits);
      expect(r2).toEqual(expectedLimits);
      expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(1);
    });
  });

  describe("recovery after a failed refresh", () => {
    it("retries the RPC on the next request instead of reusing the dead in-flight promise", async () => {
      rpcMock.getLedgerEntries = vi
        .fn()
        .mockRejectedValueOnce(new Error("upstream RPC unreachable")) // first attempt fails
        .mockResolvedValue(rpcMock.mockResponse); // subsequent attempts succeed

      const service = await freshService();

      // Cold cache + failing RPC (no stale value to fall back on) → rejects.
      await expect(service.getNetworkLimits()).rejects.toThrow(
        "upstream RPC unreachable",
      );

      // The failed refresh must have cleared the in-flight marker: the next
      // request starts a fresh fetch and succeeds rather than re-awaiting the
      // already-rejected promise.
      await expect(service.getNetworkLimits()).resolves.toEqual(expectedLimits);
      expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(2);
    });
  });

  it("re-exports the cache window constants used by these tests", () => {
    // Guards against the durations silently drifting out from under the suite.
    expect(NETWORK_LIMITS_CACHE_TTL_MS).toBe(5 * 60 * 1000);
    expect(NETWORK_LIMITS_STALE_MAX_MS).toBe(10 * 60 * 1000);
  });
});
