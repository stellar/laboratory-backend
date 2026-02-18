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
}

const SELECT_COLUMNS =
  "cd.contract_id, cd.ledger_sequence, cd.key_hash, cd.durability, cd.key_symbol, cd.key, cd.val, cd.closed_at, cd.live_until_ledger_sequence";

/**
 * DB sort columns that are nullable, requiring explicit NULLS positioning.
 */
const NULLABLE_SORT_DB_FIELDS: ReadonlySet<string> = new Set([
  "live_until_ledger_sequence",
]);

/**
 * Builds an ORDER BY clause for contract_data (or CTE alias).
 * For nullable columns, appends NULLS LAST (ASC) or NULLS FIRST (DESC)
 * to ensure deterministic null positioning.
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
  const p = tablePrefix;
  if (sortField === SortField.KEY_HASH) {
    return `ORDER BY ${p}key_hash ${direction}`;
  }
  const nullsClause = NULLABLE_SORT_DB_FIELDS.has(sortDbField)
    ? direction === SortDirection.ASC
      ? " NULLS LAST"
      : " NULLS FIRST"
    : "";
  return `ORDER BY ${p}${sortDbField} ${direction}${nullsClause}, ${p}key_hash ${direction}`;
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
): Prisma.Sql {
  const orderByClause = orderBy(sortDirection, sortDbField, sortField, "cd.");
  return Prisma.sql`
    SELECT ${Prisma.raw(SELECT_COLUMNS)},
      COALESCE(cd.live_until_ledger_sequence < ${latestLedgerSequence}, false) AS expired
    FROM contract_data cd
    WHERE cd.contract_id = ${contractId}
    ${Prisma.raw(orderByClause)}
    LIMIT ${limit}
  `;
}

/**
 * Converts a cursor sort value to the appropriate Prisma.Sql for comparison.
 * For timestamptz columns (closed_at), the cursor stores a Unix timestamp (number)
 * which must be converted back to a timestamp via to_timestamp() for SQL comparison.
 */
function toSqlSortValue(
  sortDbField: SortDbField,
  value: number | string | bigint,
): Prisma.Sql {
  if (sortDbField === "closed_at" && typeof value === "number") {
    return Prisma.sql`to_timestamp(${value})`;
  }
  return Prisma.sql`${value}`;
}

/**
 * Builds the WHERE clause fragment for cursor pagination on a sort field.
 *
 * When cursorSortValue is non-null, uses standard keyset comparison:
 *   (sortCol > value) OR (sortCol = value AND key_hash > cursorKeyHash)
 *
 * When cursorSortValue is null (nullable column like live_until_ledger_sequence),
 * NULLs are positioned at the end for ASC (NULLS LAST) and at the start for DESC
 * (NULLS FIRST). The cursor sits within the NULL region, so:
 *   - Moving forward in ASC (op ">"):  stay in NULL region, tiebreak by key_hash
 *   - Moving forward in DESC (op "<"): all non-null rows plus earlier NULLs
 *   - Moving backward in ASC (op "<"): all non-null rows plus earlier NULLs
 *   - Moving backward in DESC (op ">"): stay in NULL region, tiebreak by key_hash
 */
function buildNullAwareCursorCondition(
  sortCol: string,
  op: ">" | "<",
  cursorKeyHash: string,
  cursorSortValue: number | string | bigint | null,
  sortDbField: SortDbField,
): Prisma.Sql {
  if (cursorSortValue !== null) {
    const castedSortValue = toSqlSortValue(sortDbField, cursorSortValue);
    const baseCondition = Prisma.sql`(
          ${Prisma.raw(`${sortCol} ${op}`)} ${castedSortValue}
          OR (
            ${Prisma.raw(sortCol)} = ${castedSortValue}
            AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
          )
        )`;

    // For nullable columns with NULLS LAST (ASC) / NULLS FIRST (DESC):
    // When op is ">", NULL rows sort after all non-null rows (ASC NULLS LAST)
    // or before all non-null rows going backward (DESC NULLS FIRST reversed).
    // Either way, NULLs are "greater" and must be included.
    if (NULLABLE_SORT_DB_FIELDS.has(sortDbField) && op === ">") {
      return Prisma.sql`(
          ${baseCondition}
          OR ${Prisma.raw(sortCol)} IS NULL
        )`;
    }

    return baseCondition;
  }

  // Cursor is at a NULL value. NULLs are grouped together (NULLS LAST / NULLS FIRST).
  if (op === ">") {
    // Forward in ASC or backward in DESC: stay in the NULL group, advance by key_hash
    return Prisma.sql`(
          ${Prisma.raw(sortCol)} IS NULL
          AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
        )`;
  }
  // Forward in DESC or backward in ASC: all non-NULL rows, plus NULLs with smaller key_hash
  return Prisma.sql`(
          ${Prisma.raw(sortCol)} IS NOT NULL
          OR (
            ${Prisma.raw(sortCol)} IS NULL
            AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
          )
        )`;
}

/**
 * Cursor-paginated contract data query when sort is by a field other than key_hash.
 * Uses a CTE to fetch the page then applies the requested order for the response.
 * @param cursorKeyHash - key_hash of the cursor row
 * @param cursorSortValue - sort column value at the cursor (null for nullable columns)
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
  cursorSortValue: number | string | bigint | null,
  cursorType: "next" | "prev",
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
  const sortCol = `cd.${sortDbField}`;

  const cursorCondition = buildNullAwareCursorCondition(
    sortCol,
    op,
    cursorKeyHash,
    cursorSortValue,
    sortDbField,
  );

  return Prisma.sql`
    WITH paginated_result AS (
      SELECT ${Prisma.raw(SELECT_COLUMNS)}
      FROM contract_data cd
      WHERE cd.contract_id = ${contractId}
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
    );
  }

  const { keyHash, sortValue } = cursorData.position;
  const hasCursorSortField =
    cursorData.sortField !== undefined &&
    cursorData.sortField !== SortField.KEY_HASH &&
    sortValue !== undefined;

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
  );
};
