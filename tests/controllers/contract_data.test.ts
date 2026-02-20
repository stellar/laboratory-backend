import { Request, Response } from "express";
import { encodeCursor } from "../../src/helpers/cursor";
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
    get logLevel() {
      return "silent";
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
    expect(responseData.results).toHaveLength(5);
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

    expect(responseData.results.length).toEqual(5);
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
    const ttlValues = responseData.results.map((r: any) => r.ttl);

    // All values should be sorted in ascending order
    for (let i = 1; i < ttlValues.length; i++) {
      expect(ttlValues[i - 1]).toBeLessThanOrEqual(ttlValues[i]);
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
        error: "Invalid cursor: invalid_cursor",
      });
    });

    test("🔴cursor_valid_base64_but_wrong_shape_returns_400", async () => {
      // "e30=" decodes to "{}", which is valid JSON but not a CursorData object
      mockRequest.query = { cursor: "e30=" };

      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid cursor: e30=",
      });
    });

    test("🔴cursor_data_mismatch_with_query_options_returns_400", async () => {
      mockRequest.query = {
        cursor:
          "eyJjdXJzb3JUeXBlIjoibmV4dCIsInBvc2l0aW9uIjp7ImtleUhhc2giOiIxMTQ1ODU1MDkifX0=",
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

    /**
     * Helper: executes a single page request and returns the parsed response.
     * Resets mock state before each call so callers don't have to.
     */
    async function fetchPage(
      query: Record<string, string>,
    ): Promise<{ results: any[]; _links: any }> {
      (mockResponse.json as jest.Mock).mockClear();
      (mockResponse.status as jest.Mock).mockClear();

      mockRequest.query = query;
      await getContractDataByContractId(
        mockRequest as Request,
        mockResponse as Response,
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      return (mockResponse.json as jest.Mock).mock.calls[0][0];
    }

    /**
     * Helper: extracts cursor from a pagination link href.
     */
    function extractCursor(href: string): string {
      const url = new URL(href, "http://example.test");
      const cursor = url.searchParams.get("cursor");
      expect(cursor).toBeDefined();
      return cursor!;
    }

    /**
     * Traverses all pages forward then backward using cursor links.
     * Dynamically handles any number of records. Verifies:
     * - Each non-empty page returns exactly 1 result
     * - All key_hashes are distinct and collected in order
     * - Forward then backward traversal returns consistent results
     * - `sort_by` parameter is preserved in cursor links
     * - Correct next/prev links are present on each page
     *
     * @param sortBy - sort_by query parameter (undefined = key_hash)
     * @param order - sort order (asc/desc)
     * @param expectedRecordCount - how many total records to expect (default 5)
     */
    async function testPaginationTraversal(
      sortBy: string | undefined,
      order: string,
      expectedRecordCount: number = 5,
    ) {
      const CONTRACT_ID =
        "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU";
      const baseQuery: Record<string, string> = { limit: "1", order };
      if (sortBy) baseQuery.sort_by = sortBy;

      const linkParams = {
        contractId: CONTRACT_ID,
        order,
        limit: "1",
        ...(sortBy ? { sortBy } : {}),
      };

      // Forward traversal: collect all non-empty pages
      const forwardPages: { results: any[]; _links: any }[] = [];

      // Page 1 (no cursor)
      const page1 = await fetchPage(baseQuery);
      expect(page1.results).toHaveLength(1);
      expect(page1._links.prev).toBeUndefined();
      forwardPages.push(page1);

      // Continue fetching pages until no next link or empty results
      let currentPage = page1;
      while (currentPage._links.next) {
        const nextCursor = extractCursor(currentPage._links.next.href);
        currentPage = await fetchPage({ ...baseQuery, cursor: nextCursor });

        if (currentPage.results.length === 0) {
          // Phantom empty last page — valid end-of-pagination signal
          break;
        }
        expect(currentPage.results).toHaveLength(1);
        forwardPages.push(currentPage);
      }

      // Verify we collected exactly the expected number of records
      expect(forwardPages).toHaveLength(expectedRecordCount);

      // All key_hashes must be distinct
      const forwardKeys = forwardPages.map(p => p.results[0].key_hash);
      expect(new Set(forwardKeys).size).toBe(expectedRecordCount);

      // Verify link structure: middle pages have both next+prev
      for (let i = 1; i < forwardPages.length; i++) {
        expect(forwardPages[i]).toHaveValidPaginationLinks({
          ...linkParams,
          containsNext: true,
          containsPrev: true,
        });
      }

      // Backward traversal: from last non-empty page back to first
      // Use the last non-empty page (which has a prev link)
      const lastNonEmptyPage = forwardPages[forwardPages.length - 1];
      currentPage = lastNonEmptyPage;
      for (let i = forwardPages.length - 2; i >= 0; i--) {
        expect(currentPage._links.prev).toBeDefined();
        const prevCursor = extractCursor(currentPage._links.prev.href);
        currentPage = await fetchPage({ ...baseQuery, cursor: prevCursor });
        expect(currentPage.results).toHaveLength(1);
        expect(currentPage.results[0].key_hash).toBe(
          forwardPages[i].results[0].key_hash,
        );
      }
    }

    test("🟢pagination_with_sort_by_key_hash_desc", async () => {
      await testPaginationTraversal(undefined, "desc");
    });

    test("🟢pagination_with_sort_by_key_hash_asc", async () => {
      await testPaginationTraversal(undefined, "asc");
    });

    test("🟢pagination_with_sort_by_updated_at_desc", async () => {
      await testPaginationTraversal("updated_at", "desc");
    });

    test("🟢pagination_with_sort_by_updated_at_asc", async () => {
      await testPaginationTraversal("updated_at", "asc");
    });

    test("🟢pagination_with_sort_by_ttl_desc", async () => {
      await testPaginationTraversal("ttl", "desc");
    });

    test("🟢pagination_with_sort_by_ttl_asc", async () => {
      await testPaginationTraversal("ttl", "asc");
    });

    test("🟢pagination_with_sort_by_durability_desc", async () => {
      await testPaginationTraversal("durability", "desc");
    });

    test("🟢pagination_with_sort_by_durability_asc", async () => {
      await testPaginationTraversal("durability", "asc");
    });

    test("🟢pagination_tiebreaker_with_duplicate_ttl_values", async () => {
      // Records aa11... and bb22... share the same live_until_ledger_sequence.
      // The key_hash tiebreaker must ensure both are visited exactly once.
      await testPaginationTraversal("ttl", "asc");
    });

    test("🟢pagination_tiebreaker_with_duplicate_updated_at_values", async () => {
      // Records aa11... and bb22... share the same closed_at timestamp.
      // The key_hash tiebreaker must ensure both are visited exactly once.
      await testPaginationTraversal("updated_at", "desc");
    });

    /**
     * Helper: builds a raw base64 cursor from a plain object.
     * Bypasses encodeCursor so we can craft intentionally invalid payloads.
     */
    function rawCursor(obj: Record<string, unknown>): string {
      return Buffer.from(JSON.stringify(obj)).toString("base64");
    }

    describe("Invalid cursor sortValue validation", () => {
      test("🔴null_sortValue_for_ttl_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "ttl",
          position: { keyHash: "abc", sortValue: null },
        });
        mockRequest.query = { cursor, sort_by: "ttl" };

        (mockResponse.json as jest.Mock).mockClear();
        (mockResponse.status as jest.Mock).mockClear();

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });

      test("🔴null_sortValue_for_updated_at_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "updated_at",
          position: { keyHash: "abc", sortValue: null },
        });
        mockRequest.query = { cursor, sort_by: "updated_at" };

        (mockResponse.json as jest.Mock).mockClear();
        (mockResponse.status as jest.Mock).mockClear();

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });

      test("🔴string_sortValue_for_ttl_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "ttl",
          position: { keyHash: "abc", sortValue: "not-a-number" },
        });
        mockRequest.query = { cursor, sort_by: "ttl" };

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: expect.stringContaining("Invalid cursor:"),
        });
      });

      test("🔴string_sortValue_for_updated_at_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "updated_at",
          position: { keyHash: "abc", sortValue: "2025-01-01T00:00:00Z" },
        });
        mockRequest.query = { cursor, sort_by: "updated_at" };

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: expect.stringContaining("Invalid cursor:"),
        });
      });

      test("🔴numeric_sortValue_for_durability_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "durability",
          position: { keyHash: "abc", sortValue: 42 },
        });
        mockRequest.query = { cursor, sort_by: "durability" };

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: expect.stringContaining("Invalid cursor:"),
        });
      });

      test("🔴missing_sortValue_for_non_key_hash_field_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "ttl",
          position: { keyHash: "abc" },
        });
        mockRequest.query = { cursor, sort_by: "ttl" };

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: expect.stringContaining("Invalid cursor:"),
        });
      });

      test("🟢bigint_sortValue_roundtrips_through_encode_decode", async () => {
        // encodeCursor converts bigint → string via .toString(), so the JSON
        // payload contains a string like "61482901". decodeCursor must coerce
        // this back to a number for numeric sort fields (ttl, updated_at).

        const cursor = encodeCursor({
          cursorType: "next",
          sortField: "ttl",
          position: {
            keyHash:
              "058926d9c30491bf70498e4df7102e02c736fe2890e2465f9810eede1b42e6c6",
            sortValue: BigInt(61482901),
          },
        });

        // Use this cursor in a real request — it should succeed, not 400
        mockRequest.query = { cursor, sort_by: "ttl", order: "asc" };

        (mockResponse.json as jest.Mock).mockClear();
        (mockResponse.status as jest.Mock).mockClear();

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(200);
      });

      test("🔴unknown_sortField_in_cursor_returns_400", async () => {
        const cursor = rawCursor({
          cursorType: "next",
          sortField: "nonexistent_field",
          position: { keyHash: "abc", sortValue: 1 },
        });
        // Use key_hash sort_by so the mismatch check doesn't fire first;
        // the unknown sortField validation should catch it.
        mockRequest.query = { cursor, sort_by: "key_hash" };

        await getContractDataByContractId(
          mockRequest as Request,
          mockResponse as Response,
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith({
          error: expect.stringContaining("Invalid cursor:"),
        });
      });
    });
  });
});
