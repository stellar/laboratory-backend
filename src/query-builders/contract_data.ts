import { Prisma } from "../../generated/prisma";
import { CursorData } from "../helpers/cursor";
import {
  SortDbField,
  SortDirection,
  SortField,
  VALID_SORT_DB_FIELDS,
} from "../types/contract_data";

const sortDbFieldSet: ReadonlySet<string> = new Set(VALID_SORT_DB_FIELDS);

function assertValidSortDbField(field: SortDbField): void {
  if (!sortDbFieldSet.has(field)) {
    throw new Error(`Invalid sort DB field: ${field}`);
  }
}

/**
 * Configuration for building a contract data query (storage endpoint).
 */
export interface ContractDataQueryConfig {
  contractId: string;
  cursorData?: CursorData;
  latestLedgerSequence: number;
  limit: number;
  sortDbField: SortDbField;
  sortDirection: SortDirection;
  sortField: SortField;
  filterKey?: string;
}

const SELECT_COLUMNS =
  "cd.contract_id, cd.ledger_sequence, cd.key_hash, cd.durability, cd.key_symbol, cd.key, cd.val, cd.closed_at, cd.live_until_ledger_sequence";

/**
 * Builds an ORDER BY clause for contract_data (or CTE alias).
 * @param direction - ASC or DESC
 * @param sortDbField - DB column used for sort (e.g. closed_at, durability)
 * @param sortField - API sort field; KEY_HASH uses key_hash only
 * @param tablePrefix - Table/alias prefix: "", "cd.", or "pr."
 * @returns SQL ORDER BY fragment (no trailing semicolon)
 */
function orderBy(
  direction: SortDirection,
  sortDbField: SortDbField,
  sortField: SortField,
  tablePrefix: "" | "cd." | "pr.",
): string {
  assertValidSortDbField(sortDbField);
  if (direction !== SortDirection.ASC && direction !== SortDirection.DESC) {
    throw new Error(`Invalid sort direction: ${direction}`);
  }

  const p = tablePrefix;
  const nulls = direction === SortDirection.ASC ? "NULLS LAST" : "NULLS FIRST";
  if (sortField === SortField.KEY_HASH) {
    return `ORDER BY ${p}key_hash ${direction}`;
  }
  return `ORDER BY ${p}${sortDbField} ${direction} ${nulls}, ${p}key_hash ${direction}`;
}

/**
 * Builds an optional WHERE fragment for key_symbol filtering.
 * Returns empty SQL when no filter is applied.
 */
function filterClause(filterKey?: string): Prisma.Sql {
  if (!filterKey) {
    return Prisma.empty;
  }
  return Prisma.sql`AND cd.key_symbol = ${filterKey}`;
}

/**
 * First-page contract data query (no cursor). Parameterized for $queryRaw.
 * @returns Prisma.Sql for a single SELECT from contract_data with `expired` column.
 */
function queryWithoutCursor(
  contractId: string,
  latestLedgerSequence: number,
  limit: number,
  sortDbField: SortDbField,
  sortDirection: SortDirection,
  sortField: SortField,
  filterKey?: string,
): Prisma.Sql {
  const orderByClause = orderBy(sortDirection, sortDbField, sortField, "cd.");
  return Prisma.sql`
    SELECT ${Prisma.raw(SELECT_COLUMNS)},
      COALESCE(cd.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM contract_data cd
    WHERE cd.contract_id = ${contractId}
    ${filterClause(filterKey)}
    ${Prisma.raw(orderByClause)}
    LIMIT ${limit}
  `;
}

/**
 * Cursor-paginated contract data query when sort is by a field other than key_hash.
 * Uses a CTE to fetch the page then applies the requested order for the response.
 * @param cursorKeyHash - key_hash of the cursor row
 * @param cursorSortValue - sort column value at the cursor (for tiebreaker)
 * @param cursorType - "next" or "prev" (inverts comparison in CTE)
 * @returns Prisma.Sql for WITH ... SELECT from paginated_result
 */
function queryWithCursorSortField(
  contractId: string,
  latestLedgerSequence: number,
  limit: number,
  sortDbField: SortDbField,
  sortDirection: SortDirection,
  sortField: SortField,
  cursorKeyHash: string,
  cursorSortValue: number | string | bigint,
  cursorType: "next" | "prev",
  filterKey?: string,
): Prisma.Sql {
  const directionInCTE =
    cursorType === "next"
      ? sortDirection
      : sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
  const op: ">" | "<" = directionInCTE === SortDirection.DESC ? "<" : ">";
  const orderByInCTE = orderBy(directionInCTE, sortDbField, sortField, "cd.");
  const orderByFinal = orderBy(sortDirection, sortDbField, sortField, "");
  // ORDER BY for the UNION result (ASC only); union columns have no alias prefix.
  const orderByUnion = orderBy(directionInCTE, sortDbField, sortField, "");
  const sortCol = `cd.${sortDbField}`;

  // Cast bound values to match column types (closed_at via to_timestamp,
  // live_until_ledger_sequence as int4) so comparisons stay index-safe.
  const sqlVal =
    sortDbField === "closed_at" && typeof cursorSortValue === "number"
      ? Prisma.sql`to_timestamp(${cursorSortValue})`
      : sortDbField === "live_until_ledger_sequence"
        ? Prisma.sql`${cursorSortValue}::int`
        : Prisma.sql`${cursorSortValue}`;

  const rowComparison = Prisma.sql`(${Prisma.raw(sortCol)}, cd.key_hash) ${Prisma.raw(op)} (${sqlVal}, ${cursorKeyHash})`;

  // Build a CTE SELECT branch.
  const cteBranch = (predicate: Prisma.Sql): Prisma.Sql => Prisma.sql`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM contract_data cd
    WHERE cd.contract_id = ${contractId}
    ${filterClause(filterKey)}
      AND ${predicate}
    ${Prisma.raw(orderByInCTE)}
    LIMIT ${limit}`;

  // ASC (NULLS LAST) needs the NULL region too. Split it into two indexable
  // branches — non-NULL rows and the NULL region — each pre-limited; the outer
  // ORDER BY/LIMIT then keeps the first `limit` rows of the union. The NULL
  // branch runs only if the non-NULL rows don't fill the page: its index
  // region can hold many dead entries.
  const ctes =
    directionInCTE === SortDirection.ASC
      ? Prisma.sql`
    WITH non_null AS MATERIALIZED (${cteBranch(rowComparison)}),
    paginated_result AS (
      (SELECT * FROM non_null)
      UNION ALL
      (${cteBranch(Prisma.sql`${Prisma.raw(sortCol)} IS NULL AND (SELECT count(*) FROM non_null) < ${limit}`)})
      ${Prisma.raw(orderByUnion)}
      LIMIT ${limit}
    )`
      : Prisma.sql`
    WITH paginated_result AS (
      ${cteBranch(rowComparison)}
    )`;

  return Prisma.sql`
    ${ctes}
    SELECT pr.*,
      COALESCE(pr.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM paginated_result pr
    ${Prisma.raw(orderByFinal)}
  `;
}

/**
 * Cursor-paginated contract data query when sort is by key_hash only.
 * Uses a CTE to fetch the page then applies the requested order for the response.
 * @param cursorKeyHash - key_hash of the cursor row
 * @param cursorType - "next" or "prev" (inverts comparison in CTE)
 * @returns Prisma.Sql for WITH ... SELECT from paginated_result
 */
function queryWithCursorKeyHash(
  contractId: string,
  latestLedgerSequence: number,
  limit: number,
  sortDbField: SortDbField,
  sortDirection: SortDirection,
  sortField: SortField,
  cursorKeyHash: string,
  cursorType: "next" | "prev",
  filterKey?: string,
): Prisma.Sql {
  const directionInCTE =
    cursorType === "next"
      ? sortDirection
      : sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
  const op = directionInCTE === SortDirection.DESC ? "<" : ">";
  const orderByInCTE = orderBy(directionInCTE, sortDbField, sortField, "cd.");
  const orderByFinal = orderBy(sortDirection, sortDbField, sortField, "");

  return Prisma.sql`
    WITH paginated_result AS (
      SELECT ${Prisma.raw(SELECT_COLUMNS)}
      FROM contract_data cd
      WHERE cd.contract_id = ${contractId}
      ${filterClause(filterKey)}
        AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
      ${Prisma.raw(orderByInCTE)}
      LIMIT ${limit}
    )
    SELECT pr.*,
      COALESCE(pr.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM paginated_result pr
    ${Prisma.raw(orderByFinal)}
  `;
}

function queryWithCursorNullSortField(
  contractId: string,
  latestLedgerSequence: number,
  limit: number,
  sortDbField: SortDbField,
  sortDirection: SortDirection,
  sortField: SortField,
  cursorKeyHash: string,
  cursorType: "next" | "prev",
  filterKey?: string,
): Prisma.Sql {
  const directionInCTE =
    cursorType === "next"
      ? sortDirection
      : sortDirection === SortDirection.ASC
        ? SortDirection.DESC
        : SortDirection.ASC;
  const keyOp = directionInCTE === SortDirection.DESC ? "<" : ">";
  const orderByInCTE = orderBy(directionInCTE, sortDbField, sortField, "cd.");
  const orderByFinal = orderBy(sortDirection, sortDbField, sortField, "");
  const orderByUnion = orderBy(directionInCTE, sortDbField, sortField, "");
  const sortCol = `cd.${sortDbField}`;

  // Rows after the boundary inside the NULL region: same NULL sort value,
  // ordered by key_hash alone.
  const nullRegion = Prisma.sql`${Prisma.raw(sortCol)} IS NULL AND cd.key_hash ${Prisma.raw(keyOp)} ${cursorKeyHash}`;

  const cteBranch = (predicate: Prisma.Sql): Prisma.Sql => Prisma.sql`
    SELECT ${Prisma.raw(SELECT_COLUMNS)}
    FROM contract_data cd
    WHERE cd.contract_id = ${contractId}
    ${filterClause(filterKey)}
      AND ${predicate}
    ${Prisma.raw(orderByInCTE)}
    LIMIT ${limit}`;

  // ASC (NULLS LAST): nothing follows the NULL region, so one branch suffices.
  // DESC (NULLS FIRST): every non-NULL row follows it. Keep the two regions as
  // separate indexable branches, each pre-limited, instead of one OR predicate
  // that would be applied as a per-row filter.
  const cteBody =
    directionInCTE === SortDirection.ASC
      ? cteBranch(nullRegion)
      : Prisma.sql`
      (${cteBranch(nullRegion)})
      UNION ALL
      (${cteBranch(Prisma.sql`${Prisma.raw(sortCol)} IS NOT NULL`)})
      ${Prisma.raw(orderByUnion)}
      LIMIT ${limit}`;

  return Prisma.sql`
    WITH paginated_result AS (
      ${cteBody}
    )
    SELECT pr.*,
      COALESCE(pr.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM paginated_result pr
    ${Prisma.raw(orderByFinal)}
  `;
}

/**
 * Builds the contract data query for the storage endpoint.
 * Chooses no-cursor, cursor-by-sort-field, or cursor-by-key-hash based on config.
 * @param config - Contract id, cursor (if any), limit, sort, and latest ledger
 * @returns Prisma.Sql safe for prisma.$queryRaw (parameterized)
 */
export const buildContractDataQuery = (
  config: ContractDataQueryConfig,
): Prisma.Sql => {
  const {
    contractId,
    cursorData,
    filterKey,
    latestLedgerSequence,
    limit,
    sortDbField,
    sortDirection,
    sortField,
  } = config;

  assertValidSortDbField(sortDbField);

  if (!cursorData) {
    // First query (not paginated)
    return queryWithoutCursor(
      contractId,
      latestLedgerSequence,
      limit,
      sortDbField,
      sortDirection,
      sortField,
      filterKey,
    );
  }

  const { keyHash, sortValue } = cursorData.position;
  const hasCursorSortField =
    cursorData.sortField !== undefined &&
    cursorData.sortField !== SortField.KEY_HASH;

  if (!hasCursorSortField) {
    // Cursor-paginated query (simple cursor w/ `key_hash` only)
    return queryWithCursorKeyHash(
      contractId,
      latestLedgerSequence,
      limit,
      sortDbField,
      sortDirection,
      sortField,
      keyHash,
      cursorData.cursorType,
      filterKey,
    );
  }

  if (sortValue === undefined) {
    // Cursor boundary record has a NULL sort column — use IS NULL + key_hash tiebreaker
    return queryWithCursorNullSortField(
      contractId,
      latestLedgerSequence,
      limit,
      sortDbField,
      sortDirection,
      sortField,
      keyHash,
      cursorData.cursorType,
      filterKey,
    );
  }

  // Cursor-paginated query (combined cursor w/ `key_hash` and a sortField)
  return queryWithCursorSortField(
    contractId,
    latestLedgerSequence,
    limit,
    sortDbField,
    sortDirection,
    sortField,
    keyHash,
    sortValue,
    cursorData.cursorType,
    filterKey,
  );
};
