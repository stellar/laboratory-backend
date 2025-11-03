/**
 * Cursor-based pagination helpers for efficient API pagination
 *
 * Formats:
 * - Simple: Base64 encoded pk_id (legacy)
 * - Compound: Base64 encoded JSON with pkId, sortValue, sortBy
 */

/**
 * Custom error thrown when a cursor string cannot be decoded or parsed.
 */
export class InvalidCursorError extends Error {
  constructor(cursor: string) {
    super(`Invalid cursor: ${cursor}`);
    this.name = "InvalidCursorError";
  }
}

/**
 * Creates a pagination cursor from record data
 *
 * @param pkId - Primary key ID of the last record
 * @param sortValue - Sort value for multi-field sorting
 * @param sortBy - Field name used for sorting
 * @returns Base64 encoded cursor string
 */
export const encodeCursor = (cursorData: CursorData): string => {
  if (cursorData.cursorType !== "prev") {
    cursorData.cursorType = "next";
  }

  if (typeof cursorData.position.sortValue === "bigint") {
    cursorData.position.sortValue = cursorData.position.sortValue.toString();
  }

  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
};

/**
 * Cursor data object for pagination, used to encode and decode the cursor string for next/prev navigation
 */
export type CursorData = {
  /** The direction of sorting (ascending or descending) */
  cursorType: "next" | "prev";
  /** The field name used for sorting (e.g., 'pk_id', 'updated_at', 'durability') */
  sortField?: string;
  /** Position information for pagination. Stores the `pk_id` and `sortValue` of the boundary record used for next/prev navigation */
  position: {
    /** Primary key ID of the boundary record for pagination */
    pkId: string;
    /** The value of the sort field. Example: `"2025-01-01T00:00:00Z"` when `sortField: "updated_at"` */
    sortValue?: number | string | bigint;
  };
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
    return parsed as CursorData;
  } catch (error) {
    throw new InvalidCursorError(cursor);
  }
};
