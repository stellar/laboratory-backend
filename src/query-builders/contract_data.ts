import { CursorData } from "../helpers/cursor";
import { SortDirection, SortField, APIFieldToDBFieldMap } from "../types/contract_data";

/**
 * Configuration object for contract data query building
 */
export interface ContractDataQueryConfig {
  contractId: string;
  cursorData?: CursorData;
  limit: number;
  sortDbField: string;
  sortDirection: SortDirection;
  sortField: SortField;
}

/**
 * Utility function to invert sort direction
 */
const invertSortDirection = (sortDirection: SortDirection): SortDirection => {
  return sortDirection === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC;
};

/**
 * Parameter manager for SQL query building
 */
class QueryParameterManager {
  private params: any[] = [];

  constructor(initialParams: any[] = []) {
    this.params = [...initialParams];
  }

  add(param: any): string {
    this.params.push(param);
    return `$${this.params.length}`;
  }

  getParams(): any[] {
    return [...this.params];
  }

  getCount(): number {
    return this.params.length;
  }
}

/**
 * Query builder for contract data with TTL caching
 */
class ContractDataQueryBuilder {
  private paramManager: QueryParameterManager;
  private config: ContractDataQueryConfig;

  constructor(config: ContractDataQueryConfig) {
    this.config = config;
    this.paramManager = new QueryParameterManager([config.contractId]);
  }

  private buildBaseQuery(): string {
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
      )`;
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

    if (cursorData.sortField && cursorData.sortField !== SortField.PK_ID) {
      return `
        AND ${sortDbField} ${operator} ${this.paramManager.add(cursorData.position.sortValue)}
        OR (
          ${sortDbField} = $${this.paramManager.getCount()}
          AND pk_id ${operator} ${this.paramManager.add(BigInt(cursorData.position.pkId))}
        )`;
    }

    return `AND pk_id ${operator} ${this.paramManager.add(BigInt(cursorData.position.pkId))}`;
  }

  private buildOrderByClause(sortDirection: SortDirection): string {
    const { sortField } = this.config;

    if (sortField === SortField.PK_ID) {
      return `ORDER BY pk_id ${sortDirection}`;
    }
    return `ORDER BY ${APIFieldToDBFieldMap[sortField]} ${sortDirection}, pk_id ${sortDirection}`;
  }

  private buildPaginatedCTE(): string {
    const { cursorData, sortDirection, limit } = this.config;

    if (!cursorData) {
      return "";
    }

    const effectiveSortDirection =
      cursorData.cursorType === "next" ? sortDirection : invertSortDirection(sortDirection);

    return `,paginated_result AS (
      SELECT *
      FROM final_result
      WHERE 1=1
      ${this.buildPaginationClause()}
      ${this.buildOrderByClause(effectiveSortDirection)}
      LIMIT ${this.paramManager.add(limit)}
    )`;
  }

  build(): { query: string; params: any[] } {
    const { cursorData, sortDirection, limit } = this.config;

    const baseQuery = this.buildBaseQuery();
    const paginatedCTE = this.buildPaginatedCTE();
    const fromClause = cursorData ? "paginated_result" : "final_result";
    const finalOrderBy = this.buildOrderByClause(sortDirection);
    const finalLimit = this.paramManager.add(limit);

    const query = `${baseQuery}${paginatedCTE}
      SELECT *
      FROM ${fromClause}
      WHERE 1=1
      ${finalOrderBy}
      LIMIT ${finalLimit};`;

    return {
      query: query.trim(),
      params: this.paramManager.getParams(),
    };
  }
}

/**
 * Builds the complete SQL query for contract data with TTL caching and pagination.
 * @param config - Configuration object containing all query parameters
 * @returns Object containing the SQL query string and parameters array
 */
export const buildContractDataQuery = (config: ContractDataQueryConfig): { query: string; params: any[] } => {
  const builder = new ContractDataQueryBuilder(config);
  return builder.build();
};
