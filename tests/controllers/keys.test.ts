import { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { getAllKeysForContract } from "../../src/controllers/keys";
import "../setup-matchers"; // Import custom matchers
import { seedTestData } from "../test-data-keys";

// Global type declaration
declare global {
  var testPrismaClient: PrismaClient;
}

describe("GET /api/:network/contract/:contract_id/keys", () => {
  let testPrismaClient: PrismaClient;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeAll(async () => {
    testPrismaClient = global.testPrismaClient;
    await seedTestData(testPrismaClient);
  });

  beforeEach(() => {
    mockRequest = {
      params: {
        contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        network: "mainnet",
      },
    };

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  test("🔴unsupported_network_returns_400", async () => {
    mockRequest.params = {
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      network: "testnet",
    };

    await getAllKeysForContract(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Only mainnet is supported",
    });
  });

  test("🟡nonexistent_contract_id_returns_empty_results", async () => {
    mockRequest.params = { contract_id: "NONEXISTENT_CONTRACT_ID" };

    await getAllKeysForContract(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(responseData).toEqual({
      contract_id: "NONEXISTENT_CONTRACT_ID",
      network: "mainnet",
      total_keys: 0,
      keys: [],
    });
  });

  test("🟢valid_contract_id_returns_contract_data", async () => {
    await getAllKeysForContract(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    // Verify basic structure
    expect(responseData).toEqual({
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      network: "mainnet",
      total_keys: 4,
      keys: [
        "BillingCyclePlanName",
        "BillingCyclePrice",
        "BillingCycleTimestamp",
        "BillingPayment",
      ],
    });
  });

  test("🟢keys_with_empty_string_will_be_omitted", async () => {
    mockRequest.params = {
      contract_id: "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
      network: "mainnet",
    };

    await getAllKeysForContract(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    // Verify basic structure
    expect(responseData).toEqual({
      contract_id: "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
      network: "mainnet",
      total_keys: 2,
      keys: ["Block", "Pail"],
    });
  });
});
