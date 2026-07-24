import express, { type Express } from "express";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Shared control surface for the mocked Soroban RPC server. `getLedgerEntries`
 * is swapped per test so we can exercise both success and failure paths without
 * touching the network. `mockResponse` is built once inside the mock factory
 * from a captured fixture using the *real* xdr codec.
 */
const rpcMock = vi.hoisted(() => ({
  getLedgerEntries: null as unknown as (...keys: unknown[]) => unknown,
  mockResponse: null as unknown,
}));

// Keep the real SDK (we need the genuine `xdr` codec to load the fixture and to
// build the module-level LedgerKeys); only replace `rpc.Server`.
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

const expectedLimits = JSON.parse(
  readFileSync(
    new URL("../fixtures/network_limits_expected.json", import.meta.url),
    "utf8",
  ),
);

/**
 * Boots the network_limits router on an ephemeral port and returns a base URL.
 *
 * The router's rate limiter is a module-level singleton whose hit counts
 * persist for the lifetime of the imported module. We reset the module
 * registry and rebuild the app per test so each test gets an isolated
 * rate-limit budget (matching how `src/index.ts` mounts it under `/api`).
 */
async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  vi.resetModules();
  const { default: networkLimitsRoutes } =
    await import("../../src/routes/network_limits");

  const app: Express = express();
  app.use("/api", networkLimitsRoutes);

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("GET /api/network_limits", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    // Default: RPC succeeds with the captured fixture. Read mockResponse
    // lazily — it is populated when the mock factory first loads the fixture,
    // which happens during startTestServer's dynamic import below. Individual
    // tests may override rpcMock.getLedgerEntries before issuing a request.
    rpcMock.getLedgerEntries = vi.fn(() =>
      Promise.resolve(rpcMock.mockResponse),
    );
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const get = (query: string) => fetch(`${baseUrl}/api/network_limits${query}`);

  test("🟢valid_https_rpc_url_returns_200_with_parsed_network_limits", async () => {
    const rpcUrl = "https://mainnet.sorobanrpc.com";

    const res = await get(`?rpc_url=${encodeURIComponent(rpcUrl)}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expectedLimits);
  });

  test("🟢numeric_fields_are_numbers_and_64bit_fees_are_strings", async () => {
    const res = await get(
      `?rpc_url=${encodeURIComponent("https://mainnet.sorobanrpc.com")}`,
    );
    const body = await res.json();

    // 64-bit (i64) fields are serialized as decimal strings to avoid precision
    // loss; genuinely 32-bit fields stay numbers.
    expect(typeof body.tx_max_instructions).toBe("string");
    expect(typeof body.ledger_max_instructions).toBe("string");
    expect(typeof body.fee_rate_per_instructions_increment).toBe("string");
    expect(typeof body.contract_max_size_bytes).toBe("number");
    expect(typeof body.fee_disk_read_ledger_entry).toBe("string");
    expect(typeof body.fee_disk_read_1kb).toBe("string");
    expect(Array.isArray(body.live_soroban_state_size_window)).toBe(true);
  });

  test("🟢second_request_served_from_cache_without_refetching", async () => {
    const q = `?rpc_url=${encodeURIComponent("https://mainnet.sorobanrpc.com")}`;

    const first = await get(q);
    const second = await get(q);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual(expectedLimits);
    // Second request is a cache hit → the RPC is queried only once.
    expect(rpcMock.getLedgerEntries).toHaveBeenCalledTimes(1);
  });

  test("🔴rpc_failure_returns_502", async () => {
    rpcMock.getLedgerEntries = vi
      .fn()
      .mockRejectedValue(new Error("upstream RPC unreachable"));

    const res = await get(
      `?rpc_url=${encodeURIComponent("https://mainnet.sorobanrpc.com")}`,
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch network limits");
  });

  test("🔴missing_config_entry_returns_502", async () => {
    // Drop the first entry so a required config setting is absent.
    const partial = {
      ...(rpcMock.mockResponse as { latestLedger: number; entries: unknown[] }),
      entries: (rpcMock.mockResponse as { entries: unknown[] }).entries.slice(
        1,
      ),
    };
    rpcMock.getLedgerEntries = vi.fn().mockResolvedValue(partial);

    const res = await get(
      `?rpc_url=${encodeURIComponent("https://mainnet.sorobanrpc.com")}`,
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to fetch network limits");
  });

  test("🟢missing_rpc_url_uses_network_default_and_returns_200", async () => {
    const res = await get("");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(expectedLimits);
  });

  test("🔴non_https_rpc_url_returns_400", async () => {
    const res = await get(
      `?rpc_url=${encodeURIComponent("http://mainnet.sorobanrpc.com")}`,
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Invalid query parameters");
    expect(body.issues[0].path).toBe("rpc_url");
  });

  test("🔴malformed_rpc_url_returns_400", async () => {
    const res = await get(`?rpc_url=${encodeURIComponent("not-a-url")}`);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues[0].path).toBe("rpc_url");
  });

  test("🔴exceeding_rate_limit_returns_429", async () => {
    const path = `?rpc_url=${encodeURIComponent("https://mainnet.sorobanrpc.com")}`;

    // The limiter allows 10 requests/min; the 11th must be throttled.
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await get(path);
      statuses.push(res.status);
      // Drain the body so sockets are freed before the server closes.
      await res.arrayBuffer();
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  test("🔴disallowed_but_valid_url_returns_400", async () => {
    const res = await get(
      `?rpc_url=${encodeURIComponent("https://evil.example.com")}`,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/is not allowed/);
  });
});
