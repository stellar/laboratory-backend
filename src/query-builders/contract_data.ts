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

const NULLABLE_SORT_DB_FIELDS: ReadonlySet<string> = new Set([
  "live_until_ledger_sequence",
]);

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

/** First-page query (no cursor). */
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

/** Cursor-paginated query when sort is by a field other than key_hash. */
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

  // Build the cursor WHERE condition, handling NULLs for nullable sort columns
  let cursorCondition: Prisma.Sql;

  if (cursorSortValue !== null) {
    // Convert Unix timestamp back to timestamptz for closed_at comparisons
    const sqlVal =
      sortDbField === "closed_at" && typeof cursorSortValue === "number"
        ? Prisma.sql`to_timestamp(${cursorSortValue})`
        : Prisma.sql`${cursorSortValue}`;

    const base = Prisma.sql`(
          ${Prisma.raw(`${sortCol} ${op}`)} ${sqlVal}
          OR (${Prisma.raw(sortCol)} = ${sqlVal} AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash})
        )`;

    // For nullable columns moving forward (op ">"), NULL rows must also be included
    cursorCondition =
      NULLABLE_SORT_DB_FIELDS.has(sortDbField) && op === ">"
        ? Prisma.sql`(${base} OR ${Prisma.raw(sortCol)} IS NULL)`
        : base;
  } else if (op === ">") {
    // NULL cursor, moving forward: stay in the NULL group, advance by key_hash
    cursorCondition = Prisma.sql`(
          ${Prisma.raw(sortCol)} IS NULL AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
        )`;
  } else {
    // NULL cursor, moving backward: all non-NULL rows + NULLs with smaller key_hash
    cursorCondition = Prisma.sql`(
          ${Prisma.raw(sortCol)} IS NOT NULL
          OR (${Prisma.raw(sortCol)} IS NULL AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash})
        )`;
  }

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

/** Cursor-paginated query when sort is by key_hash only. */
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

/** Builds the contract data query, choosing the right strategy based on cursor/sort config. */
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
