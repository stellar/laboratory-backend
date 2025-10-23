import { SortDirection, SortField, APIFieldToDBFieldMap } from "../types/contract_data";

/**
 * Adds a parameter to the params array and returns its PostgreSQL placeholder.
 * @param newParam - The parameter value to add
 * @param params - The array of parameters to append to (mutated by this function)
 * @returns The PostgreSQL parameter placeholder (e.g., "$1", "$2")
 */
export const addParamAndGetPlaceholder = (newParam: any, params: any[]) => {
  params.push(newParam);
  return `$${params.length}`;
};

/**
 * Builds SQL pagination clause using cursor-based pagination.
 * @param sqlParams - Array to add SQL query parameters to
 * @param sortDbField - Database field name for sorting
 * @param sortDirection - Current sort direction
 * @param cursorData - Cursor data for pagination position
 * @returns SQL WHERE clause for pagination or empty string
 */
export const preparePaginationClause = (
  sqlParams: any[],
  sortDbField: string,
  sortDirection: SortDirection,
  cursorData?: any // Will be properly typed when we extract cursor logic
): string => {
  if (!cursorData) {
    return "";
  }

  const invertSortDirection = (sortDirection?: SortDirection): SortDirection => {
    return sortDirection === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC;
  };

  if (cursorData.cursorType === "prev") {
    sortDirection = invertSortDirection(sortDirection);
  }
  let operator = sortDirection === SortDirection.DESC ? "<" : ">";

  if (cursorData.sortField && cursorData.sortField !== SortField.PK_ID) {
    return `
    AND ${sortDbField} ${operator} ${addParamAndGetPlaceholder(cursorData.position.sortValue, sqlParams)}
    OR (
      ${sortDbField} = $${sqlParams.length}
      AND pk_id ${operator} ${addParamAndGetPlaceholder(BigInt(cursorData.position.pkId), sqlParams)}
    )`;
  }

  return `AND pk_id ${operator} ${addParamAndGetPlaceholder(BigInt(cursorData.position.pkId), sqlParams)}`;
};

/**
 * Builds SQL ORDER BY clause for sorting results.
 * @param sortField - Field to sort by
 * @param sortDirection - ASC or DESC
 * @returns SQL ORDER BY clause
 */
export const prepareOrderByClause = (sortField: SortField, sortDirection: SortDirection): string => {
  if (sortField === SortField.PK_ID) {
    return `ORDER BY pk_id ${sortDirection}`;
  } else {
    return `ORDER BY ${APIFieldToDBFieldMap[sortField]} ${sortDirection}, pk_id ${sortDirection}`;
  }
};

/**
 * Builds the complete SQL query for contract data with TTL caching and pagination.
 * @param contractId - The contract ID to query
 * @param params - Array to collect SQL parameters
 * @param cursorData - Cursor data for pagination
 * @param limit - Maximum number of results
 * @param sortDbField - Database field name for sorting
 * @param sortDirection - Sort direction
 * @param sortField - Sort field
 * @returns Complete SQL query string
 */
export const buildContractDataQuery = (
  contractId: string,
  params: any[],
  cursorData: any,
  limit: number,
  sortDbField: string,
  sortDirection: SortDirection,
  sortField: SortField
): string => {
  const invertSortDirection = (sortDirection?: SortDirection): SortDirection => {
    return sortDirection === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC;
  };

  return `
    WITH cd_latest AS (
      SELECT DISTINCT ON (key_hash) *
      FROM contract_data
      WHERE id = $1
      ORDER BY key_hash, ledger_sequence DESC
    ),
    final_result AS (
      SELECT cd_latest.*, ttl_latest.live_until_ledger_sequence
      FROM cd_latest
      LEFT JOIN LATERAL (
        SELECT live_until_ledger_sequence
        FROM ttl
        WHERE ttl.key_hash = cd_latest.key_hash
        ORDER BY ledger_sequence DESC
        LIMIT 1
      ) ttl_latest ON true
    )
    ${
      cursorData
        ? `,paginated_result AS (
      SELECT *
      FROM final_result
      WHERE
        1=1
        ${preparePaginationClause(params, sortDbField, sortDirection, cursorData)}
      ${prepareOrderByClause(
        sortField,
        cursorData?.cursorType === "next" ? sortDirection : invertSortDirection(sortDirection)
      )} -- ORDER BY (...)
      LIMIT ${addParamAndGetPlaceholder(limit, params)}
    )`
        : ""
    }
    SELECT *
    FROM ${cursorData ? "paginated_result" : "final_result"}
    WHERE
        1=1
    ${prepareOrderByClause(sortField, sortDirection)} -- ORDER BY (...)
    LIMIT ${addParamAndGetPlaceholder(limit, params)};
  `;
};
