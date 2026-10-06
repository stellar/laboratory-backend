import { Prisma, PrismaClient } from "../../generated/prisma";
import { CursorData } from "../../src/helpers/cursor";
import {
  buildContractDataQuery,
  ContractDataQueryConfig,
} from "../../src/query-builders/contract_data";
import {
  SortDbField,
  SortDirection,
  SortField,
} from "../../src/types/contract_data";
import { seedTestData } from "../test-data-seeder";

declare global {
  var testPrismaClient: PrismaClient;
}

const CONTRACT_ID = "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU";
const LATEST_LEDGER = 700000;

// Mirrors the column list in src/query-builders/contract_data.ts.
const SELECT_COLUMNS =
  "cd.contract_id, cd.ledger_sequence, cd.key_hash, cd.durability, cd.key_symbol, cd.key, cd.val, cd.closed_at, cd.live_until_ledger_sequence";

const configFor = (
  overrides: Partial<ContractDataQueryConfig> = {},
): ContractDataQueryConfig => ({
  contractId: CONTRACT_ID,
  latestLedgerSequence: LATEST_LEDGER,
  limit: 5,
  sortDbField: "live_until_ledger_sequence",
  sortDirection: SortDirection.ASC,
  sortField: SortField.TTL,
  ...overrides,
});

const cursorAt = (
  sortField: string,
  sortDirection: SortDirection,
  keyHash: string,
  sortValue: number | string,
  cursorType: "next" | "prev",
): CursorData => ({
  cursorType,
  sortField,
  sortDirection,
  position: { keyHash, sortValue },
});

/**
 * The previous form of the cursor-by-sort-field query, reproduced verbatim
 * (single `(row comparison) OR (col IS NULL)` predicate, no cast on the
 * bound value) so the restructured query can be checked row-for-row against
 * the behavior it replaces.
 */
function previousContractDataQuery(args: {
  contractId: string;
  latestLedgerSequence: number;
  limit: number;
  sortDbField: SortDbField;
  sortDirection: SortDirection;
  cursorKeyHash: string;
  cursorSortValue: number | string;
  cursorType: "next" | "prev";
  filterKey?: string;
}): Prisma.Sql {
  const {
    contractId,
    latestLedgerSequence,
    limit,
    sortDbField,
    sortDirection,
    cursorKeyHash,
    cursorSortValue,
    cursorType,
    filterKey,
  } = args;

  const directionInCTE =
    cursorType === "next"
      ? sortDirection
      : sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
  const op = directionInCTE === SortDirection.DESC ? "<" : ">";
  const nulls = (d: SortDirection) =>
    d === SortDirection.ASC ? "NULLS LAST" : "NULLS FIRST";
  const orderByInCTE = `ORDER BY cd.${sortDbField} ${directionInCTE} ${nulls(directionInCTE)}, cd.key_hash ${directionInCTE}`;
  const orderByFinal = `ORDER BY ${sortDbField} ${sortDirection} ${nulls(sortDirection)}, key_hash ${sortDirection}`;
  const sortCol = `cd.${sortDbField}`;

  const sqlVal =
    sortDbField === "closed_at" && typeof cursorSortValue === "number"
      ? Prisma.sql`to_timestamp(${cursorSortValue})`
      : Prisma.sql`${cursorSortValue}`;

  const rowComparison = Prisma.sql`(${Prisma.raw(sortCol)}, cd.key_hash) ${Prisma.raw(op)} (${sqlVal}, ${cursorKeyHash})`;

  // Row-value comparison returns NULL for NULL sort columns; include them explicitly for ASC (NULLS LAST)
  const cursorCondition =
    directionInCTE === SortDirection.ASC
      ? Prisma.sql`(${rowComparison} OR ${Prisma.raw(sortCol)} IS NULL)`
      : rowComparison;

  const filter = filterKey
    ? Prisma.sql`AND cd.key_symbol = ${filterKey}`
    : Prisma.empty;

  return Prisma.sql`
    WITH paginated_result AS (
      SELECT ${Prisma.raw(SELECT_COLUMNS)}
      FROM contract_data cd
      WHERE cd.contract_id = ${contractId}
      ${filter}
        AND ${cursorCondition}
      ${Prisma.raw(orderByInCTE)}
      LIMIT ${limit}
    )
    SELECT pr.*,
      COALESCE(pr.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM paginated_result pr
    ${Prisma.raw(orderByFinal)}
  `;
}

/**
 * The previous form of the NULL-boundary cursor query, reproduced verbatim
 * (DESC as a single `(IS NULL AND key_hash < ?) OR IS NOT NULL` predicate)
 * so the restructured query can be checked row-for-row against it.
 */
function previousNullBoundaryQuery(args: {
  contractId: string;
  latestLedgerSequence: number;
  limit: number;
  sortDbField: SortDbField;
  sortDirection: SortDirection;
  sortField: SortField;
  cursorKeyHash: string;
  cursorType: "next" | "prev";
  filterKey?: string;
}): Prisma.Sql {
  const {
    contractId,
    latestLedgerSequence,
    limit,
    sortDbField,
    sortDirection,
    sortField,
    cursorKeyHash,
    cursorType,
    filterKey,
  } = args;

  const directionInCTE =
    cursorType === "next"
      ? sortDirection
      : sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
  const keyOp = directionInCTE === SortDirection.DESC ? "<" : ">";
  const nulls =
    directionInCTE === SortDirection.ASC ? "NULLS LAST" : "NULLS FIRST";
  const orderByInCTE = `ORDER BY cd.${sortDbField} ${directionInCTE} ${nulls}, cd.key_hash ${directionInCTE}`;
  const finalNulls =
    sortDirection === SortDirection.ASC ? "NULLS LAST" : "NULLS FIRST";
  const orderByFinal = `ORDER BY ${sortDbField} ${sortDirection} ${finalNulls}, key_hash ${sortDirection}`;
  const sortCol = `cd.${sortDbField}`;
  void sortField;

  const cursorCondition =
    directionInCTE === SortDirection.ASC
      ? Prisma.sql`${Prisma.raw(sortCol)} IS NULL AND cd.key_hash ${Prisma.raw(keyOp)} ${cursorKeyHash}`
      : Prisma.sql`(${Prisma.raw(sortCol)} IS NULL AND cd.key_hash ${Prisma.raw(keyOp)} ${cursorKeyHash}) OR ${Prisma.raw(sortCol)} IS NOT NULL`;

  const filter = filterKey
    ? Prisma.sql`AND cd.key_symbol = ${filterKey}`
    : Prisma.empty;

  return Prisma.sql`
    WITH paginated_result AS (
      SELECT ${Prisma.raw(SELECT_COLUMNS)}
      FROM contract_data cd
      WHERE cd.contract_id = ${contractId}
      ${filter}
        AND (${cursorCondition})
      ${Prisma.raw(orderByInCTE)}
      LIMIT ${limit}
    )
    SELECT pr.*,
      COALESCE(pr.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM paginated_result pr
    ${Prisma.raw(orderByFinal)}
  `;
}

/** Order-sensitive row fingerprint for parity assertions. */
const fingerprint = (rows: any[]) =>
  rows.map(r => ({
    key_hash: r.key_hash,
    contract_id: r.contract_id,
    ledger_sequence: r.ledger_sequence,
    durability: r.durability,
    key_symbol: r.key_symbol,
    closed_at: String(r.closed_at),
    live_until_ledger_sequence: r.live_until_ledger_sequence,
    expired: r.expired,
  }));

describe("buildContractDataQuery", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = global.testPrismaClient;
    await seedTestData(prisma);
  });

  describe("cursor sort value binding (SQL shape)", () => {
    test("🟢ttl_cursor_value_is_bound_with_an_int_cast", () => {
      const query = buildContractDataQuery(
        configFor({
          cursorData: cursorAt(
            "ttl",
            SortDirection.ASC,
            "abc",
            61482901,
            "next",
          ),
        }),
      );

      expect(query.sql).toMatch(/\?::int/);
      expect(query.values).toContain(61482901);
      expect(query.values).toContain("abc");
      expect(query.values).toContain(CONTRACT_ID);

      // The cast applies to the descending direction as well.
      const descQuery = buildContractDataQuery(
        configFor({
          sortDirection: SortDirection.DESC,
          cursorData: cursorAt(
            "ttl",
            SortDirection.DESC,
            "abc",
            61482901,
            "next",
          ),
        }),
      );
      expect(descQuery.sql).toMatch(/\?::int/);
      expect(descQuery.values).toContain(61482901);
    });

    test("🟢closed_at_cursor_value_keeps_the_to_timestamp_wrap", () => {
      const query = buildContractDataQuery(
        configFor({
          sortDbField: "closed_at",
          sortField: SortField.UPDATED_AT,
          cursorData: cursorAt(
            "updated_at",
            SortDirection.ASC,
            "abc",
            1_700_000_000.5,
            "next",
          ),
        }),
      );

      expect(query.sql).toContain("to_timestamp(");
      expect(query.sql).not.toContain("::int");
      expect(query.values).toContain(1_700_000_000.5);
    });

    test("🟢durability_cursor_value_is_bound_without_a_cast", () => {
      const query = buildContractDataQuery(
        configFor({
          sortDbField: "durability",
          sortField: SortField.DURABILITY,
          cursorData: cursorAt(
            "durability",
            SortDirection.ASC,
            "abc",
            "persistent",
            "next",
          ),
        }),
      );

      expect(query.sql).not.toContain("::int");
      expect(query.sql).not.toContain("to_timestamp(");
      expect(query.values).toContain("persistent");
    });
  });

  describe("cursor sort value binding (real database)", () => {
    test("🔴ttl_cursor_value_outside_int4_fails_on_the_parameter", async () => {
      // Bypasses API-level validation to prove the bound value itself is
      // checked by the database: 1e19 does not fit in the int4 column, and
      // the ::int cast on the parameter raises 22003 immediately.
      const query = buildContractDataQuery(
        configFor({
          cursorData: cursorAt("ttl", SortDirection.ASC, "abc", 1e19, "next"),
        }),
      );

      const err = await prisma.$queryRaw(query).then(
        () => {
          throw new Error("expected the query to be rejected");
        },
        (e: unknown) => e,
      );

      expect(err).toBeInstanceOf(Error);
      expect((err as { code?: string }).code).toBe("P2010");
      expect((err as { meta?: { code?: string } }).meta?.code).toBe("22003");
    });

    test("🟢in_range_ttl_cursor_value_executes_against_the_index", async () => {
      const query = buildContractDataQuery(
        configFor({
          limit: 20,
          cursorData: cursorAt(
            "ttl",
            SortDirection.ASC,
            "ee55555555555555555555555555555555555555555555555555555555555555",
            61482907,
            "next",
          ),
        }),
      );

      const rows = await prisma.$queryRaw<any[]>(query);
      expect(rows.map(r => r.key_hash)).toEqual([
        "1100000000000000000000000000000000000000000000000000000000000001",
        "1100000000000000000000000000000000000000000000000000000000000002",
        "ff66666666666666666666666666666666666666666666666666666666666666",
      ]);
    });

    test("🟢in_range_fractional_ttl_value_is_rounded_by_the_cast", async () => {
      // 61482906.5::int rounds to 61482907, so the page starts above that
      // boundary (and still includes the tie row whose key_hash is greater).
      const query = buildContractDataQuery(
        configFor({
          limit: 20,
          cursorData: cursorAt(
            "ttl",
            SortDirection.ASC,
            "abc",
            61482906.5,
            "next",
          ),
        }),
      );

      const rows = await prisma.$queryRaw<any[]>(query);
      expect(rows.map(r => r.key_hash)).toEqual([
        "ee55555555555555555555555555555555555555555555555555555555555555",
        "1100000000000000000000000000000000000000000000000000000000000001",
        "1100000000000000000000000000000000000000000000000000000000000002",
        "ff66666666666666666666666666666666666666666666666666666666666666",
      ]);
    });
  });

  describe("ascending NULL-region restructure", () => {
    type BoundaryRow = {
      key_hash: string;
      live_until_ledger_sequence: number | null;
      closed_at: Date;
      durability: string | null;
    };

    let boundaries: BoundaryRow[];

    beforeAll(async () => {
      boundaries = await prisma.$queryRaw<BoundaryRow[]>`
        SELECT key_hash, live_until_ledger_sequence, closed_at, durability
        FROM contract_data
        WHERE contract_id = ${CONTRACT_ID}
      `;
      expect(boundaries).toHaveLength(11);
    });

    const sortCases: Array<{
      sortField: SortField;
      sortDbField: SortDbField;
      sortValue: (row: BoundaryRow) => number | string | null;
      expectedBoundaryCount: number;
    }> = [
      {
        sortField: SortField.TTL,
        sortDbField: "live_until_ledger_sequence",
        sortValue: row => row.live_until_ledger_sequence,
        // The NULL-ttl row is not a valid boundary for the value cursor.
        expectedBoundaryCount: 10,
      },
      {
        sortField: SortField.UPDATED_AT,
        sortDbField: "closed_at",
        sortValue: row => row.closed_at.getTime() / 1000,
        expectedBoundaryCount: 11,
      },
      {
        sortField: SortField.DURABILITY,
        sortDbField: "durability",
        sortValue: row => row.durability,
        expectedBoundaryCount: 11,
      },
    ];

    for (const {
      sortField,
      sortDbField,
      sortValue,
      expectedBoundaryCount,
    } of sortCases) {
      test(`🟢${sortField}_pages_match_the_previous_form_row_for_row`, async () => {
        let comparisons = 0;

        for (const boundary of boundaries) {
          const value = sortValue(boundary);
          if (value === null || value === undefined) {
            continue;
          }

          for (const sortDirection of [SortDirection.ASC, SortDirection.DESC]) {
            for (const cursorType of ["next", "prev"] as const) {
              for (const limit of [1, 3, 20]) {
                const current = buildContractDataQuery(
                  configFor({
                    limit,
                    sortDbField,
                    sortDirection,
                    sortField,
                    cursorData: cursorAt(
                      sortField,
                      sortDirection,
                      boundary.key_hash,
                      value,
                      cursorType,
                    ),
                  }),
                );
                const previous = previousContractDataQuery({
                  contractId: CONTRACT_ID,
                  latestLedgerSequence: LATEST_LEDGER,
                  limit,
                  sortDbField,
                  sortDirection,
                  cursorKeyHash: boundary.key_hash,
                  cursorSortValue: value,
                  cursorType,
                });

                const [currentRows, previousRows] = await Promise.all([
                  prisma.$queryRaw<any[]>(current),
                  prisma.$queryRaw<any[]>(previous),
                ]);

                expect(fingerprint(currentRows)).toEqual(
                  fingerprint(previousRows),
                );
                comparisons++;
              }
            }
          }
        }

        expect(comparisons).toBe(expectedBoundaryCount * 2 * 2 * 3);
      }, 60000);
    }

    test("🟢filter_key_inside_the_restructured_query_matches_the_previous_form", async () => {
      // SharedEntry rows: cc33 (61482905), dd44 (61482906), ee55 (61482907).
      for (const cursorType of ["next", "prev"] as const) {
        const current = buildContractDataQuery(
          configFor({
            limit: 20,
            filterKey: "SharedEntry",
            cursorData: cursorAt(
              "ttl",
              SortDirection.ASC,
              "cc33333333333333333333333333333333333333333333333333333333333333",
              61482905,
              cursorType,
            ),
          }),
        );
        const previous = previousContractDataQuery({
          contractId: CONTRACT_ID,
          latestLedgerSequence: LATEST_LEDGER,
          limit: 20,
          sortDbField: "live_until_ledger_sequence",
          sortDirection: SortDirection.ASC,
          cursorKeyHash:
            "cc33333333333333333333333333333333333333333333333333333333333333",
          cursorSortValue: 61482905,
          cursorType,
          filterKey: "SharedEntry",
        });

        const [currentRows, previousRows] = await Promise.all([
          prisma.$queryRaw<any[]>(current),
          prisma.$queryRaw<any[]>(previous),
        ]);

        expect(fingerprint(currentRows)).toEqual(fingerprint(previousRows));
        // "next" from the lowest SharedEntry boundary returns the other two
        // SharedEntry rows; "prev" from that same boundary has nothing before
        // it, so the page is empty.
        expect(currentRows.map(r => r.key_hash)).toEqual(
          cursorType === "next"
            ? [
                "dd44444444444444444444444444444444444444444444444444444444444444",
                "ee55555555555555555555555555555555555555555555555555555555555555",
              ]
            : [],
        );
      }
    });

    test("🟢null_region_is_scanned_only_when_the_page_is_not_full", async () => {
      type PlanNode = {
        "One-Time Filter"?: string;
        "Actual Loops": number;
        Plans?: PlanNode[];
      };
      const findGate = (node: PlanNode): PlanNode | undefined =>
        node["One-Time Filter"] !== undefined
          ? node
          : node.Plans?.map(findGate).find(Boolean);

      // 9 non-NULL rows follow the lowest ttl boundary.
      const [lowest] = boundaries
        .flatMap(({ key_hash, live_until_ledger_sequence: ttl }) =>
          ttl === null ? [] : [{ key_hash, ttl }],
        )
        .sort((a, b) => a.ttl - b.ttl);

      const nullScanLoops = async (limit: number): Promise<number> => {
        const query = buildContractDataQuery(
          configFor({
            limit,
            cursorData: cursorAt(
              "ttl",
              SortDirection.ASC,
              lowest.key_hash,
              lowest.ttl,
              "next",
            ),
          }),
        );
        const [{ "QUERY PLAN": plan }] = await prisma.$queryRaw<
          { "QUERY PLAN": { Plan: PlanNode }[] }[]
        >(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`);
        const gate = findGate(plan[0].Plan);
        expect(gate?.Plans).toHaveLength(1);
        return gate?.Plans?.[0]["Actual Loops"] ?? -1;
      };

      expect(await nullScanLoops(3)).toBe(0);
      expect(await nullScanLoops(20)).toBe(1);
    });
  });
  describe("NULL-boundary restructure", () => {
    // The NULL-ttl seed row (ff66...) is the only NULL boundary in the seed
    // data, so ttl is the sort field under test.
    const NULL_TTL_KEY_HASH =
      "ff66666666666666666666666666666666666666666666666666666666666666";

    const nullCursor = (
      sortDirection: SortDirection,
      cursorType: "next" | "prev",
      filterKey?: string,
    ): CursorData => ({
      cursorType,
      sortField: SortField.TTL,
      sortDirection,
      filterKey,
      position: { keyHash: NULL_TTL_KEY_HASH },
    });

    test("🟢pages_from_a_null_boundary_match_the_previous_form_row_for_row", async () => {
      let comparisons = 0;

      for (const sortDirection of [SortDirection.ASC, SortDirection.DESC]) {
        for (const cursorType of ["next", "prev"] as const) {
          for (const limit of [1, 3, 20]) {
            const current = buildContractDataQuery(
              configFor({
                limit,
                sortDirection,
                cursorData: nullCursor(sortDirection, cursorType),
              }),
            );
            const previous = previousNullBoundaryQuery({
              contractId: CONTRACT_ID,
              latestLedgerSequence: LATEST_LEDGER,
              limit,
              sortDbField: "live_until_ledger_sequence",
              sortDirection,
              sortField: SortField.TTL,
              cursorKeyHash: NULL_TTL_KEY_HASH,
              cursorType,
            });

            const [currentRows, previousRows] = await Promise.all([
              prisma.$queryRaw<any[]>(current),
              prisma.$queryRaw<any[]>(previous),
            ]);

            expect(fingerprint(currentRows)).toEqual(fingerprint(previousRows));
            comparisons++;
          }
        }
      }

      expect(comparisons).toBe(2 * 2 * 3);
    });

    test("🟢desc_next_from_the_null_boundary_returns_the_non_null_rows_in_order", async () => {
      // DESC puts NULLs first, so "next" from the only NULL row is every
      // non-NULL row, ordered by ttl DESC then key_hash DESC.
      const rows = await prisma.$queryRaw<any[]>(
        buildContractDataQuery(
          configFor({
            limit: 20,
            sortDirection: SortDirection.DESC,
            cursorData: nullCursor(SortDirection.DESC, "next"),
          }),
        ),
      );

      expect(rows).toHaveLength(10);
      expect(rows.every(r => r.live_until_ledger_sequence !== null)).toBe(true);
      const order = rows.map(r => [r.live_until_ledger_sequence, r.key_hash]);
      const sorted = [...order].sort(([ttlA, khA], [ttlB, khB]) =>
        ttlA !== ttlB ? ttlB - ttlA : khB.localeCompare(khA),
      );
      expect(order).toEqual(sorted);
    });

    test("🟢filter_key_inside_the_restructured_null_query_matches_the_previous_form", async () => {
      for (const sortDirection of [SortDirection.ASC, SortDirection.DESC]) {
        for (const cursorType of ["next", "prev"] as const) {
          const current = buildContractDataQuery(
            configFor({
              limit: 20,
              sortDirection,
              filterKey: "SharedEntry",
              cursorData: nullCursor(sortDirection, cursorType, "SharedEntry"),
            }),
          );
          const previous = previousNullBoundaryQuery({
            contractId: CONTRACT_ID,
            latestLedgerSequence: LATEST_LEDGER,
            limit: 20,
            sortDbField: "live_until_ledger_sequence",
            sortDirection,
            sortField: SortField.TTL,
            cursorKeyHash: NULL_TTL_KEY_HASH,
            cursorType,
            filterKey: "SharedEntry",
          });

          const [currentRows, previousRows] = await Promise.all([
            prisma.$queryRaw<any[]>(current),
            prisma.$queryRaw<any[]>(previous),
          ]);

          expect(fingerprint(currentRows)).toEqual(fingerprint(previousRows));
          // The three SharedEntry rows all have a ttl, so they follow the NULL
          // region in DESC order and precede it in ASC order.
          const expectFull =
            (sortDirection === SortDirection.DESC && cursorType === "next") ||
            (sortDirection === SortDirection.ASC && cursorType === "prev");
          expect(currentRows).toHaveLength(expectFull ? 3 : 0);
        }
      }
    });
  });
});
