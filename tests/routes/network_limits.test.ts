import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

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
    ({ server, baseUrl } = await startTestServer());
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const get = (query: string) => fetch(`${baseUrl}/api/network_limits${query}`);

  test("🟢valid_https_rpc_url_returns_200_with_rpc_url", async () => {
    const rpcUrl = "https://mainnet.sorobanrpc.com";

    const res = await get(`?rpc_url=${encodeURIComponent(rpcUrl)}`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rpc_url: rpcUrl });
  });

  test("🔴missing_rpc_url_returns_400", async () => {
    const res = await get("");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe("Invalid query parameters");
    expect(body.issues).toEqual([expect.objectContaining({ path: "rpc_url" })]);
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
});
