import { Horizon, Networks, rpc } from "@stellar/stellar-sdk";
import { StellarService } from "../../src/utils/stellar";

jest.mock("@stellar/stellar-sdk", () => ({
  rpc: {
    Server: jest.fn(),
  },
  Horizon: {
    Server: jest.fn(),
  },
  Networks: {
    TESTNET: "Test SDF Network ; September 2015",
    PUBLIC: "Public Global Stellar Network ; September 2015",
  },
}));

const mockRpcServer = rpc.Server as jest.Mock;
const mockHorizonServer = Horizon.Server as jest.Mock;

describe("getLatestLedger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("🟢testnet_uses_rpc_with_configured_url", async () => {
    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 123 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith("https://rpc.testnet.example");
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(latest).toBe(123);
  });

  test("🟢testnet_uses_default_rpc_url_when_missing", async () => {
    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 456 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith(
      "https://soroban-testnet.stellar.org",
    );
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(latest).toBe(456);
  });

  test("🟢pubnet_uses_rpc_when_rpc_url_provided", async () => {
    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 789 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
      rpcUrl: "https://rpc.pubnet.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).toHaveBeenCalledWith("https://rpc.pubnet.example");
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);
    expect(mockHorizonServer).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(latest).toBe(789);

    warnSpy.mockRestore();
  });

  test("🟡pubnet_falls_back_to_horizon_with_custom_url", async () => {
    const rootMock = jest
      .fn()
      .mockResolvedValue({ core_latest_ledger: 654321 });
    mockHorizonServer.mockReturnValue({ root: rootMock });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
      horizonUrl: "https://horizon.custom.example",
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).not.toHaveBeenCalled();
    expect(mockHorizonServer).toHaveBeenCalledWith(
      "https://horizon.custom.example",
      {},
    );
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
    );
    expect(latest).toBe(654321);

    warnSpy.mockRestore();
  });

  test("🟡pubnet_falls_back_to_default_horizon_when_missing_url", async () => {
    const rootMock = jest
      .fn()
      .mockResolvedValue({ core_latest_ledger: 987654 });
    mockHorizonServer.mockReturnValue({ root: rootMock });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });
    const latest = await service.getLatestLedger();

    expect(mockRpcServer).not.toHaveBeenCalled();
    expect(mockHorizonServer).toHaveBeenCalledWith(
      "https://horizon.stellar.org",
      {},
    );
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "RPC_URL is empty for pubnet; falling back to Horizon for latest ledger.",
    );
    expect(latest).toBe(987654);

    warnSpy.mockRestore();
  });

  test("🟢uses_cache_within_5_seconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 111 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    const second = await service.getLatestLedger();

    expect(first).toBe(111);
    expect(second).toBe(111);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  test("🟢cache_still_valid_at_4999ms", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 222 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    jest.setSystemTime(4999);
    const second = await service.getLatestLedger();

    expect(first).toBe(222);
    expect(second).toBe(222);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  test("🟢refreshes_cache_after_5_seconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const getLatestLedgerMock = jest
      .fn()
      .mockResolvedValue({ sequence: 222 });
    mockRpcServer.mockReturnValue({ getLatestLedger: getLatestLedgerMock });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    const first = await service.getLatestLedger();
    jest.setSystemTime(5001);
    const second = await service.getLatestLedger();

    expect(first).toBe(222);
    expect(second).toBe(222);
    expect(getLatestLedgerMock).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  test("🔴rpc_error_propagates_to_caller", async () => {
    const rpcError = new Error("RPC connection failed");
    mockRpcServer.mockReturnValue({
      getLatestLedger: jest.fn().mockRejectedValue(rpcError),
    });

    const service = new StellarService({
      networkPassphrase: Networks.TESTNET,
      rpcUrl: "https://rpc.testnet.example",
    });

    await expect(service.getLatestLedger()).rejects.toThrow("RPC connection failed");
  });

  test("🔴horizon_error_propagates_to_caller", async () => {
    const horizonError = new Error("Horizon unreachable");
    mockHorizonServer.mockReturnValue({
      root: jest.fn().mockRejectedValue(horizonError),
    });
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });

    await expect(service.getLatestLedger()).rejects.toThrow("Horizon unreachable");

    warnSpy.mockRestore();
  });

  test("🟢horizon_calls_are_cached", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);

    const rootMock = jest
      .fn()
      .mockResolvedValue({ core_latest_ledger: 333 });
    mockHorizonServer.mockReturnValue({ root: rootMock });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation();

    const service = new StellarService({
      networkPassphrase: Networks.PUBLIC,
    });

    const first = await service.getLatestLedger();
    const second = await service.getLatestLedger();

    expect(first).toBe(333);
    expect(second).toBe(333);
    expect(mockHorizonServer).toHaveBeenCalledTimes(1);
    expect(rootMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    jest.useRealTimers();
  });
});
