import { CursorData } from "../helpers/cursor";
import {
  APIFieldToDBFieldMap,
  SortDirection,
  SortField,
} from "../types/contract_data";
import { QueryResult, SqlParam } from "./shared";

export type {
  QueryResult as ContractDataQueryResult,
  SqlParam,
} from "./shared";

/**
 * Configuration object for contract data query building
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

/**
 * Utility function to invert sort direction
 */
const invertSortDirection = (sortDirection: SortDirection): SortDirection => {
  return sortDirection === SortDirection.ASC
    ? SortDirection.DESC
    : SortDirection.ASC;
};

/**
 * Parameter manager for SQL query building
 */
class QueryParameterManager {
  private params: SqlParam[] = [];

  constructor(initialParams: SqlParam[] = []) {
    this.params = [...initialParams];
  }

  add(param: SqlParam): string {
    this.params.push(param);
    return `$${this.params.length}`;
  }

  getParams(): SqlParam[] {
    return [...this.params];
  }

  getCount(): number {
    return this.params.length;
  }
}

/**
 * Query builder for contract data with pagination
 */
class ContractDataQueryBuilder {
  private paramManager: QueryParameterManager;
  private config: ContractDataQueryConfig;

  constructor(config: ContractDataQueryConfig) {
    this.config = config;
    this.paramManager = new QueryParameterManager([
      config.contractId,
      config.latestLedgerSequence,
    ]);
  }

  private buildSelectColumns(): string {
    return `
        cd.contract_id,
        cd.ledger_sequence,
        cd.key_hash,
        cd.durability,
        cd.key_symbol,
        cd.key,
        cd.val,
        cd.closed_at,
        cd.live_until_ledger_sequence`;
  }

  private buildFromClause(): string {
    return `
      FROM contract_data cd`;
  }

  private buildPaginationClause(): string {
    const { cursorData, sortDirection, sortDbField } = this.config;

    if (!cursorData) {
      return "";
    }

    let effectiveSortDirection = sortDirection;
    if (cursorData.cursorType === "prev") {
      effectiveSortDirection = invertSortDirection(sortDirection);
    }

    const operator = effectiveSortDirection === SortDirection.DESC ? "<" : ">";

    if (cursorData.sortField && cursorData.sortField !== SortField.KEY_HASH) {
      return `
        AND (
          cd.${sortDbField} ${operator} ${this.paramManager.add(
            cursorData.position.sortValue,
          )}
          OR (
            cd.${sortDbField} = $${this.paramManager.getCount()}
            AND cd.key_hash ${operator} ${this.paramManager.add(
              cursorData.position.keyHash,
            )}
          )
        )`;
    }

    return `AND cd.key_hash ${operator} ${this.paramManager.add(
      cursorData.position.keyHash,
    )}`;
  }

  private buildOrderByClause(
    sortDirection: SortDirection,
    useTablePrefixes: boolean = false,
  ): string {
    const { sortField } = this.config;
    const sortDbField = APIFieldToDBFieldMap[sortField];

    if (sortField === SortField.KEY_HASH) {
      const keyHashColumn = useTablePrefixes ? "cd.key_hash" : "key_hash";
      return `ORDER BY ${keyHashColumn} ${sortDirection}`;
    }

    const keyHashColumn = useTablePrefixes ? "cd.key_hash" : "key_hash";
    const sortColumn = useTablePrefixes ? `cd.${sortDbField}` : sortDbField;

    return `ORDER BY ${sortColumn} ${sortDirection}, ${keyHashColumn} ${sortDirection}`;
  }

  private buildPaginatedCTE(): string {
    const { cursorData, sortDirection, limit } = this.config;

    if (!cursorData) {
      return "";
    }

    const effectiveSortDirection =
      cursorData.cursorType === "next"
        ? sortDirection
        : invertSortDirection(sortDirection);

    return `WITH paginated_result AS (
      SELECT ${this.buildSelectColumns()}
      ${this.buildFromClause()}
      WHERE cd.contract_id = $1
      ${this.buildPaginationClause()}
      ${this.buildOrderByClause(effectiveSortDirection, true)}
      LIMIT ${this.paramManager.add(limit)}
    )`;
  }

  build(): QueryResult {
    const { cursorData, sortDirection, limit } = this.config;

    const latestLedgerParam = "$2";

    let query: string;

    if (cursorData) {
      const paginatedCTE = this.buildPaginatedCTE();
      query = `${paginatedCTE}
      SELECT
        pr.*,
        (pr.live_until_ledger_sequence < ${latestLedgerParam}) AS expired
      FROM paginated_result pr
      ${this.buildOrderByClause(sortDirection)}`;
    } else {
      query = `SELECT
        ${this.buildSelectColumns().trim()},
        (cd.live_until_ledger_sequence < ${latestLedgerParam}) AS expired
      ${this.buildFromClause()}
      WHERE cd.contract_id = $1
      ${this.buildOrderByClause(sortDirection, true)}
      LIMIT ${this.paramManager.add(limit)}`;
    }

    return {
      query: query.trim(),
      params: this.paramManager.getParams(),
    };
  }
}

/**
 * Builds the complete SQL query for contract data with pagination.
 * @param config - Configuration object containing all query parameters
 * @returns Object containing the SQL query string and parameters array
 */
export const buildContractDataQuery = (
  config: ContractDataQueryConfig,
): QueryResult => {
  const builder = new ContractDataQueryBuilder(config);
  return builder.build();
};
