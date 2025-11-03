/**
 * Serializes contract_data DB rows for API response.
 * Converts buffers to strings, timestamps to Unix format, and calculates expiration status.
 * @param results - Array of raw database results
 * @returns Array of serialized contract data objects
 */
export const serializeContractDataResults = (results: any[]): any[] => {
  return results.map((row: any) => ({
    durability: row.durability,
    expired: row.expired,
    key_hash: row.key_hash,
    key: row.key ? Buffer.from(row.key).toString() : null,
    ttl: row.live_until_ledger_sequence ?? null,
    updated: Math.floor(row.closed_at.getTime() / 1000),
    value: row.val ? Buffer.from(row.val).toString() : null,
  }));
};
