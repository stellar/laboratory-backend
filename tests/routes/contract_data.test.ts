import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import proxyAddr from "proxy-addr";

/**
 * The route's rate limiter is what these tests exercise, so the controller is
 * replaced with a stub: it records each call and answers 200. A request that
 * reaches it was let through by the limiter and the validators.
 */
const controllerMock = vi.hoisted(() => ({
  getContractDataByContractId: vi.fn(),
}));

vi.mock("../../src/controllers/contract_data", () => ({
  getContractDataByContractId: (
    ...args: Parameters<typeof controllerMock.getContractDataByContractId>
  ) => controllerMock.getContractDataByContractId(...args),
}));

const VALID_CONTRACT_ID =
  "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU";

const STORAGE_LIMIT = 100;

/**
 * Boots the contract_data router on an ephemeral port and returns a base URL.
 *
 * The router's rate limiter is a module-level singleton whose hit counts
 * persist for the lifetime of the imported module. We reset the module
 * registry and rebuild the app per test so each test gets an isolated
 * rate-limit budget (matching how `src/index.ts` mounts it under `/api`).
 */
async function startTestServer(
  configure: (app: Express) => void = () => {},
): Promise<{ server: Server; baseUrl: string }> {
  vi.resetModules();
  const { default: contractRoutes } =
    await import("../../src/routes/contract_data");

  const app: Express = express();
  configure(app);
  app.use("/api", contractRoutes);

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe("GET /api/contract/:contract_id/storage rate limiting", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(() => {
    controllerMock.getContractDataByContractId.mockImplementation(
      (_req: express.Request, res: express.Response) => {
        res.status(200).json({ ok: true });
      },
    );
  });

  afterEach(async () => {
    controllerMock.getContractDataByContractId.mockReset();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const get = async (headers: Record<string, string> = {}) => {
    const res = await fetch(
      `${baseUrl}/api/contract/${VALID_CONTRACT_ID}/storage`,
      { headers },
    );
    // Drain the body so sockets are freed before the server closes.
    const body = await res.text();
    return { status: res.status, headers: res.headers, body };
  };

  test("🔴exceeding_rate_limit_returns_429", async () => {
    ({ server, baseUrl } = await startTestServer());

    const statuses: number[] = [];
    let last: Awaited<ReturnType<typeof get>> | undefined;
    for (let i = 0; i < STORAGE_LIMIT + 1; i++) {
      last = await get();
      statuses.push(last.status);
    }

    expect(statuses.slice(0, STORAGE_LIMIT)).toEqual(
      Array(STORAGE_LIMIT).fill(200),
    );
    expect(statuses[STORAGE_LIMIT]).toBe(429);
    // The throttled request never reaches the controller.
    expect(controllerMock.getContractDataByContractId).toHaveBeenCalledTimes(
      STORAGE_LIMIT,
    );

    expect(JSON.parse(last!.body)).toEqual({
      error: "Too Many Requests",
      message: "Too many requests from this IP, please try again later.",
    });
    expect(last!.headers.get("ratelimit-limit")).toBe(String(STORAGE_LIMIT));
    expect(last!.headers.get("ratelimit-remaining")).toBe("0");
    expect(last!.headers.get("retry-after")).toBe("60");
    // Legacy headers are disabled.
    expect(last!.headers.get("x-ratelimit-limit")).toBeNull();
  });

  test("🟢rate_limit_budget_is_keyed_by_client_ip", async () => {
    // Trust the loopback proxy, as `src/index.ts` does by default, so the
    // client IP comes from X-Forwarded-For rather than the socket address.
    ({ server, baseUrl } = await startTestServer(app => {
      app.set("trust proxy", proxyAddr.compile(["loopback"]));
    }));

    const clientA = { "X-Forwarded-For": "203.0.113.10" };
    const clientB = { "X-Forwarded-For": "203.0.113.20" };

    for (let i = 0; i < STORAGE_LIMIT; i++) {
      expect((await get(clientA)).status).toBe(200);
    }
    expect((await get(clientA)).status).toBe(429);

    // A different client still has its full budget.
    const other = await get(clientB);
    expect(other.status).toBe(200);
    expect(other.headers.get("ratelimit-remaining")).toBe(
      String(STORAGE_LIMIT - 1),
    );
  });
});

describe("GET /api/contract/:contract_id/storage query validation", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(s => new Promise<void>(resolve => s.close(() => resolve()))),
    );
  });

  test.each(["Balance", ""])(
    "🔴filter_key_%j_is_rejected_with_400",
    async filterKey => {
      const { server, baseUrl } = await startTestServer();
      servers.push(server);

      const res = await fetch(
        `${baseUrl}/api/contract/${VALID_CONTRACT_ID}/storage?filter_key=${filterKey}`,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        message: "Invalid query parameters",
        issues: [
          {
            path: "filter_key",
            message: "filter_key is not supported",
            code: "invalid_type",
          },
        ],
      });
      expect(controllerMock.getContractDataByContractId).not.toHaveBeenCalled();
    },
  );
});
