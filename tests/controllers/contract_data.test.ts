import { Request, Response } from "express";
const getLatestLedgerMock = jest.fn();

jest.mock("../../src/config/env", () => ({
  Env: {
    get networkPassphrase() {
      return "Test SDF Network ; September 2015";
    },
    get rpcUrl() {
      return "https://rpc.testnet.example";
    },
    get horizonUrl() {
      return "https://horizon.testnet.example";
    },
  },
}));

jest.mock("../../src/utils/stellar", () => ({
  getStellarService: jest.fn().mockImplementation(() => ({
    getLatestLedger: getLatestLedgerMock,
  })),
}));

import { PrismaClient } from "../../generated/prisma";
import { getContractDataByContractId } from "../../src/controllers/contract_data";
import "../setup-matchers"; // Import custom matchers
import { seedTestData } from "../test-data-seeder";

// Global type declaration
declare global {
  var testPrismaClient: PrismaClient;
}

describe("GET /api/contract/:contract_id/storage", () => {
  let testPrismaClient: PrismaClient;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeAll(async () => {
    testPrismaClient = global.testPrismaClient;
    await seedTestData(testPrismaClient);
  });

  beforeEach(() => {
    getLatestLedgerMock.mockResolvedValue(700000);

    mockRequest = {
      params: {
        contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      },
      query: {},
    };

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  test("🔴invalid_limit_returns_400", async () => {
    mockRequest.query = { limit: "invalid" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: "Invalid limit=invalid, must be an integer between 1 and 200",
    });
  });

  test("🔴invalid_sort_parameter_returns_400", async () => {
    mockRequest.query = { sort_by: "invalid_field", order: "invalid_order" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error:
        "Invalid sort_by parameter invalid_field must be one of durability, key_hash, ttl, updated_at",
    });
  });

  test("🟡nonexistent_contract_id_returns_empty_results", async () => {
    mockRequest.params = { contract_id: "NONEXISTENT_CONTRACT_ID" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
    expect(responseData.results).toEqual([]);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "NONEXISTENT_CONTRACT_ID",
      order: "desc",
      limit: "20",
    });
  });

  test("🟢valid_contract_id_returns_contract_data", async () => {
    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    // Verify basic structure
    expect(responseData.results).toHaveLength(3);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      order: "desc",
      limit: "20",
    });

    // Verify result structure
    responseData.results.forEach((item: any) => {
      expect(item).toEqual({
        durability: expect.any(String),
        expired: expect.any(Boolean),
        key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        key: expect.any(String),
        ttl: expect.any(Number),
        updated: expect.any(Number),
        value: expect.any(String),
      });
    });

    // Verify a known item exists (ordering may vary based on key_hash)
    const expectedKeyHash =
      "058926d9c30491bf70498e4df7102e02c736fe2890e2465f9810eede1b42e6c6";
    const matchingItem = responseData.results.find(
      (item: any) => item.key_hash === expectedKeyHash,
    );
    expect(matchingItem).toBeDefined();
    expect(matchingItem).toEqual({
      durability: "persistent",
      expired: expect.any(Boolean),
      key_hash: expectedKeyHash,
      key: expect.stringContaining("BillingCyclePlanName"),
      ttl: 61482901,
      updated: Math.floor(new Date("2025-10-03T15:00:36Z").getTime() / 1000),
      value: expect.stringContaining("invite"),
    });
  });

  test("🟢limit=1_returns_1_result", async () => {
    mockRequest.query = { limit: "1" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    expect(responseData.results).toHaveLength(1);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      order: "desc",
      limit: "1",
      containsNext: true,
    });
    expect(responseData).toHaveValidCursor("next");
  });

  test("🟢sorting_by_durability", async () => {
    mockRequest.query = { sort_by: "durability", order: "asc" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    expect(responseData.results.length).toEqual(3);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      sortBy: "durability",
      order: "asc",
      limit: "20",
    });

    // Assert sorting order of durability
    for (let i = 1; i < responseData.results.length; i++) {
      const prevDurability = responseData.results[i - 1].durability;
      const currentDurability = responseData.results[i].durability;
      expect(prevDurability <= currentDurability).toBe(true);
    }
  });

  test("🟢sorting_by_updated_at", async () => {
    mockRequest.query = { sort_by: "updated_at", order: "desc" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    expect(responseData.results.length).toBeGreaterThan(0);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      sortBy: "updated_at",
      order: "desc",
      limit: "20",
    });

    // Assert sorting order of updated timestamp
    for (let i = 1; i < responseData.results.length; i++) {
      expect(responseData.results[i - 1].updated).toBeGreaterThanOrEqual(
        responseData.results[i].updated,
      );
    }
  });

  test("🟢sorting_by_ttl", async () => {
    mockRequest.query = { sort_by: "ttl", order: "asc" };

    await getContractDataByContractId(
      mockRequest as Request,
      mockResponse as Response,
    );

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledTimes(1);

    const responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];

    expect(responseData.results.length).toBeGreaterThan(0);
    expect(responseData).toHaveValidPaginationLinks({
      contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      sortBy: "ttl",
      order: "asc",
      limit: "20",
    });

    // Assert sorting order of ttl
    for (let i = 1; i < responseData.results.length; i++) {
      expect(responseData.results[i - 1].ttl).toBeLessThanOrEqual(
        responseData.results[i].ttl,
      );
    }
  });

  // Cursor Pagination Tests
  describe("Cursor Pagination", () => {
    test("🔴invalid_cursor_returns_400", async () => {
      mockRequest.query = { cursor: "invalid_cursor" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.stringContaining("Invalid cursor"),
      });
    });

    test("🔴cursor_data_mismatch_with_query_options_returns_400", async () => {
      mockRequest.query = {
        cursor:
          "eyJzb3J0RGlyZWN0aW9uIjoiZGVzYyIsInBvc2l0aW9uIjp7ImtleUhhc2giOiIxMTQ1ODU1MDkifX0=",
        sort_by: "updated_at",
      };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: expect.stringContaining(
          `Cursor parameter mismatch for field "sort_by"`,
        ),
      });
    });

    test("🟢next_and_prev_links_work_as_expected", async () => {
      // Page 1/3 (without cursor)
      mockRequest.query = { limit: "1" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledTimes(1);

      let responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.results).toHaveLength(1);
      expect(responseData).toHaveValidPaginationLinks({
        contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        order: "desc",
        limit: "1",
        containsNext: true,
      });
      expect(responseData).toHaveValidCursor("next");
      // Reset mocks for the second call
      (mockResponse.json as jest.Mock).mockClear();
      (mockResponse.status as jest.Mock).mockClear();

      // Page 2/3 (using page1.next)
      let nextUrl = new URL(
        responseData._links.next.href,
        "http://example.test",
      );
      let nextCursor = nextUrl.searchParams.get("cursor");
      expect(nextCursor).toBeDefined();
      mockRequest.query = { cursor: nextCursor! as string, limit: "1" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.results).toHaveLength(1);
      expect(responseData).toHaveValidPaginationLinks({
        contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        order: "desc",
        limit: "1",
        containsPrev: true,
        containsNext: true,
      });
      expect(responseData).toHaveValidCursor("prev");
      expect(responseData).toHaveValidCursor("next");
      // Reset mocks for the third call
      (mockResponse.json as jest.Mock).mockClear();
      (mockResponse.status as jest.Mock).mockClear();

      // Page 3/3 (using page2.next)
      nextUrl = new URL(responseData._links.next.href, "http://example.test");
      nextCursor = nextUrl.searchParams.get("cursor");
      expect(nextCursor).toBeDefined();
      mockRequest.query = { cursor: nextCursor! as string, limit: "1" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.results).toHaveLength(1);
      expect(responseData).toHaveValidPaginationLinks({
        contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        order: "desc",
        limit: "1",
        containsPrev: true,
        containsNext: true,
      });
      expect(responseData).toHaveValidCursor("prev");
      expect(responseData).toHaveValidCursor("next");
      // Reset mocks for the third call
      (mockResponse.json as jest.Mock).mockClear();
      (mockResponse.status as jest.Mock).mockClear();

      // Page 2/3 (using page3.prev)
      let prevUrl = new URL(
        responseData._links.prev.href,
        "http://example.test",
      );
      let prevCursor = prevUrl.searchParams.get("cursor");
      expect(prevCursor).toBeDefined();
      mockRequest.query = { cursor: prevCursor! as string, limit: "1" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.results).toHaveLength(1);
      expect(responseData).toHaveValidPaginationLinks({
        contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        order: "desc",
        limit: "1",
        containsNext: true,
        containsPrev: true,
      });
      expect(responseData).toHaveValidCursor("next");
      expect(responseData).toHaveValidCursor("prev");

      // Page 1/3 (using page2.prev)
      prevUrl = new URL(responseData._links.prev.href, "http://example.test");
      prevCursor = prevUrl.searchParams.get("cursor");
      expect(prevCursor).toBeDefined();
      mockRequest.query = { cursor: prevCursor! as string, limit: "1" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      responseData = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseData.results).toHaveLength(1);
      expect(responseData).toHaveValidPaginationLinks({
        contractId: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
        order: "desc",
        limit: "1",
        containsNext: true,
        containsPrev: true,
      });
      expect(responseData).toHaveValidCursor("next");
      expect(responseData).toHaveValidCursor("prev");
    });
  });
});
