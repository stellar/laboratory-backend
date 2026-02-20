/**
 * Cursor-based pagination helpers for efficient API pagination
 *
 * Formats:
 * - Simple: Base64 encoded key_hash (legacy)
 * - Compound: Base64 encoded JSON with keyHash, sortValue, sortBy
 */

import { z } from "zod";

/**
 * Custom error thrown when a cursor string cannot be decoded or parsed.
 */
export class InvalidCursorError extends Error {
  constructor(cursor: string, cause?: unknown) {
    super(`Invalid cursor: ${cursor}`, { cause });
    this.name = "InvalidCursorError";
  }
}

/**
 * Cursor data object for pagination, used to encode and decode the cursor string for next/prev navigation
 */
export type CursorData = {
  /** The direction of sorting (ascending or descending) */
  cursorType: "next" | "prev";
  /** The field name used for sorting (e.g., 'key_hash', 'updated_at', 'durability', 'ttl') */
  sortField?: string;
  /** Position information for pagination. Stores the `key_hash` and `sortValue` of the boundary record used for next/prev navigation */
  position: {
    /** Key hash of the boundary record for pagination, used as the primary key */
    keyHash: string;
    /** The value of the sort field. Example: `"2025-01-01T00:00:00Z"` when `sortField: "updated_at"` */
    sortValue?: number | string | bigint;
  };
};

// Runtime validation for decoded cursors (must match CursorData above).
// Uses string | number for sortValue because JSON.parse never produces bigint.
const cursorDataSchema = z.object({
  cursorType: z.enum(["next", "prev"]),
  sortField: z.string().optional(),
  position: z.object({
    keyHash: z.string(),
    sortValue: z.union([z.number(), z.string()]).optional(),
  }),
});

/**
 * Creates a pagination cursor from record data
 *
 * @param keyHash - Key hash of the last record, used as the primary key
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
 * Parses a pagination cursor from API requests
 *
 * @param cursor - Base64 encoded cursor string
 * @returns Object with keyHash (BigInt) and optionally sortValue, sortBy
 */
export const decodeCursor = (cursor: string): CursorData => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
  } catch (err: unknown) {
    throw new InvalidCursorError(cursor, err);
  }

  const result = cursorDataSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidCursorError(cursor);
  }

  return result.data as CursorData;
};
