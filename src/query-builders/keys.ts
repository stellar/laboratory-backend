import { QueryResult } from "./shared";

/**
 * Builds a "skip scan" query to efficiently retrieve distinct key_symbol
 * values for a contract. Uses a recursive CTE to jump between distinct
 * values in the index instead of scanning all rows, reducing 44M-row
 * scans from ~15s to ~3ms.
 */
export const buildKeysQuery = (contractId: string): QueryResult => {
  const query = `
    WITH RECURSIVE keys AS (
      (SELECT key_symbol
       FROM contract_data
       WHERE contract_id = $1
         AND key_symbol IS NOT NULL
       ORDER BY key_symbol
       LIMIT 1)
      UNION ALL
      SELECT (SELECT cd.key_symbol
              FROM contract_data cd
              WHERE cd.contract_id = $1
                AND cd.key_symbol IS NOT NULL
                AND cd.key_symbol > k.key_symbol
              ORDER BY cd.key_symbol
              LIMIT 1)
      FROM keys k
      WHERE k.key_symbol IS NOT NULL
    )
    SELECT key_symbol FROM keys WHERE key_symbol IS NOT NULL ORDER BY key_symbol`.trim();

  return { query, params: [contractId] };
};
