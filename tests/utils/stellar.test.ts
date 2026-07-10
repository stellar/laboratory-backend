import type { Mock } from "vitest";
import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";
import { logger } from "../../src/utils/logger";
import { StellarService } from "../../src/utils/stellar";

vi.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: vi.fn(),
  },
  Horizon: {
    Server: vi.fn(),
  },
  Networks: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
}));

vi.mock("../../src/utils/logger", () => ({
  logger: { warn: vi.fn() },
}));

const mockLoggerWarn = logger.warn as Mock;

const mockRpcServer = rpc.Server as Mock;
const mockHorizonServer = Horizon.Server as Mock;

/** Builds a mock server instance with the httpClient.defaults stub required by StellarService. */
const mockServer = (methods: Record<string, Mock>) => ({
  ...methods,
  httpClient: { defaults: {} },
});

describe("getLatestLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("🟢testnet_uses_rpc_with_configured_url", async () => {
    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 123 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith("https://rpc.testnet.example", {
      timeout: 10000,
    });
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(latest).toBe(123);
  });

  test("🟢testnet_uses_default_rpc_url_when_missing", async () => {
    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 456 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith(
      "https://soroban-testnet.stellar.org",
      { timeout: 10000 },
    );
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(latest).toBe(456);
  });

  test("🟢pubnet_uses_rpc_when_rpc_url_provided", async () => {
    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 789 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: "https://rpc.pubnet.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith("https://rpc.pubnet.example", {
      timeout: 10000,
    });
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(latest).toBe(789);
  });

  test("🟡pubnet_falls_back_to_horizon_with_custom_url", async () => {
    const rootMock = vi.fn().mockResolvedValue({ core_latest_ledger: 654321 });
    mockHorizonServer.mockImplementation(function () {
      return mockServer({ root: rootMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
      horizonUrl: "https://horizon.custom.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).not.toHaveBeenCalled();
    expect(mockHorizonServer).toHaveBeenCalledWith(
      "https://horizon.custom.example",
    );
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
    );
    expect(latest).toBe(654321);
  });

  test("🟡pubnet_falls_back_to_default_horizon_when_missing_url", async () => {
    const rootMock = vi.fn().mockResolvedValue({ core_latest_ledger: 987654 });
    mockHorizonServer.mockImplementation(function () {
      return mockServer({ root: rootMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).not.toHaveBeenCalled();
    expect(mockHorizonServer).toHaveBeenCalledWith(
      "https://horizon.stellar.org",
    );
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
    );
    expect(latest).toBe(987654);
  });

  test("🟢uses_cache_within_5_seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 111 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    const second = await service.getLatestLedger();

    expect(first).toBe(111);
    expect(second).toBe(111);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  test("🟢cache_still_valid_at_4999ms", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 222 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    vi.setSystemTime(4999);
    const second = await service.getLatestLedger();

    expect(first).toBe(222);
    expect(second).toBe(222);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  test("🟢refreshes_cache_after_5_seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const getLatestLedgerMock = vi.fn().mockResolvedValue({ sequence: 222 });
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    vi.setSystemTime(5001);
    const second = await service.getLatestLedger();

    expect(first).toBe(222);
    expect(second).toBe(222);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  test("🔴rpc_error_propagates_to_caller", async () => {
    const rpcError = new Error("RPC connection failed");
    mockRpcServer.mockImplementation(function () {
      return mockServer({
        getLatestLedger: vi.fn().mockRejectedValue(rpcError),
      });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    await expect(service.getLatestLedger()).rejects.toThrow(
      "RPC connection failed",
    );
  });

  test("🔴horizon_error_propagates_to_caller", async () => {
    const horizonError = new Error("Horizon unreachable");
    mockHorizonServer.mockImplementation(function () {
      return mockServer({
        root: vi.fn().mockRejectedValue(horizonError),
      });
    });

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });

    await expect(service.getLatestLedger()).rejects.toThrow(
      "Horizon unreachable",
    );
  });

  test("returns_stale_cache_when_fetch_fails_within_staleness_window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const getLatestLedgerMock = vi
      .fn()
      .mockResolvedValueOnce({ sequence: 500 })
      .mockRejectedValueOnce(new Error("RPC timeout"));
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    expect(first).toBe(500);

    vi.setSystemTime(6000);
    const second = await service.getLatestLedger();
    expect(second).toBe(500);

    vi.useRealTimers();
  });

  test("throws_when_stale_cache_exceeds_max_staleness", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const getLatestLedgerMock = vi
      .fn()
      .mockResolvedValueOnce({ sequence: 500 })
      .mockRejectedValueOnce(new Error("RPC timeout"));
    mockRpcServer.mockImplementation(function () {
      return mockServer({ getLatestLedger: getLatestLedgerMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    await service.getLatestLedger();

    vi.setSystemTime(11_000);
    await expect(service.getLatestLedger()).rejects.toThrow("RPC timeout");

    vi.useRealTimers();
  });

  test("🟢horizon_calls_are_cached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const rootMock = vi.fn().mockResolvedValue({ core_latest_ledger: 333 });
    mockHorizonServer.mockImplementation(function () {
      return mockServer({ root: rootMock });
    });

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });

    const first = await service.getLatestLedger();
    const second = await service.getLatestLedger();

    expect(first).toBe(333);
    expect(second).toBe(333);
    expect(mockHorizonServer).toHaveBeenCalledTimes(1);
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
    );

    vi.useRealTimers();
  });
});
