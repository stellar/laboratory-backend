import { Prisma } from "../../generated/prisma";
import { CursorData } from "../helpers/cursor";
import { SortDirection, SortField } from "../types/contract_data";

/**
 * Configuration for building a contract data query (storage endpoint).
 */
export interface ContractDataQueryConfig {
  contractId: string;
  cursorData?: CursorData;
  latestLedgerSequence: number;
  limit: number;
  sortDbField: string;
  sortDirection: SortDirection;
  sortField: SortField;
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
  sortDbField: string,
  sortField: SortField,
  tablePrefix: "" | "cd." | "pr.",
): string {
  const p = tablePrefix;
  if (sortField === SortField.KEY_HASH) {
    return `ORDER BY ${p}key_hash ${direction}`;
  }
  return `ORDER BY ${p}${sortDbField} ${direction}, ${p}key_hash ${direction}`;
}

/**
 * First-page contract data query (no cursor). Parameterized for $queryRaw.
 * @returns Prisma.Sql for a single SELECT from contract_data with `expired` column.
 */
function queryWithoutCursor(
  contractId: string,
  latestLedgerSequence: number,
  limit: number,
  sortDbField: string,
  sortDirection: SortDirection,
  sortField: SortField,
): Prisma.Sql {
  const orderByClause = orderBy(sortDirection, sortDbField, sortField, "cd.");
  return Prisma.sql`
    SELECT ${Prisma.raw(SELECT_COLUMNS)},
      (cd.live_until_ledger_sequence < ${latestLedgerSequence}) AS expired
    FROM contract_data cd
    WHERE cd.contract_id = ${contractId}
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
  sortDbField: string,
  sortDirection: SortDirection,
  sortField: SortField,
  cursorKeyHash: string,
  cursorSortValue: number | string | bigint,
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
  const sortCol = `cd.${sortDbField}`;

  return Prisma.sql`
    WITH paginated_result AS (
      SELECT ${Prisma.raw(SELECT_COLUMNS)}
      FROM contract_data cd
      WHERE cd.contract_id = ${contractId}
        AND (
          ${Prisma.raw(`${sortCol} ${op}`)} ${cursorSortValue}
          OR (
            ${Prisma.raw(sortCol)} = ${cursorSortValue}
            AND cd.key_hash ${Prisma.raw(op)} ${cursorKeyHash}
          )
        )
      ${Prisma.raw(orderByInCTE)}
      LIMIT ${limit}
    )
    SELECT pr.*,
      (pr.live_until_ledger_sequence < ${latestLedgerSequence}) AS expired
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
  sortDbField: string,
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
      (pr.live_until_ledger_sequence < ${latestLedgerSequence}) AS expired
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
  const hasSortField =
    cursorData.sortField &&
    cursorData.sortField !== SortField.KEY_HASH &&
    sortValue !== undefined;

  if (!hasSortField) {
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
