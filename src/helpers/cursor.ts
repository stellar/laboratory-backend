/**
 * Cursor-based pagination helpers for efficient API pagination
 *
 * Formats:
 * - Simple: Base64 encoded pk_id (legacy)
 * - Compound: Base64 encoded JSON with pkId, sortValue, sortBy
 */

/**
 * Creates a pagination cursor from record data
 *
 * @param pkId - Primary key ID of the last record
 * @param sortValue - Sort value for multi-field sorting
 * @param sortBy - Field name used for sorting
 * @returns Base64 encoded cursor string
 */
export const encodeCursor = (
  pkId: bigint,
  sortValue?: any,
  sortBy?: string
): string => {
  if (sortBy && sortValue !== null && sortValue !== undefined) {
    const compound = { pkId: pkId.toString(), sortValue, sortBy };
    return Buffer.from(JSON.stringify(compound)).toString("base64");
  }
  return Buffer.from(pkId.toString()).toString("base64");
};

export type CursorData = {
  pkId: bigint;
  sortValue?: any;
  sortBy?: string;
};

/**
 * Parses a pagination cursor from API requests
 *
 * @param cursor - Base64 encoded cursor string
 * @returns Object with pkId (BigInt) and optionally sortValue, sortBy
 */
export const decodeCursor = (cursor: string): CursorData => {
  const decoded = Buffer.from(cursor, "base64").toString();
  try {
    const parsed = JSON.parse(decoded);
    if (parsed.pkId && parsed.sortBy) {
      return {
        pkId: BigInt(parsed.pkId),
        sortValue: parsed.sortValue,
        sortBy: parsed.sortBy,
      };
    }
  } catch {
    // Fallback for old cursor format or invalid JSON
  }
  return { pkId: BigInt(decoded) };
};
