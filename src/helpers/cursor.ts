/**
 * Cursor-based pagination helpers for efficient API pagination
 *
 * Encodes/decodes opaque cursor strings (base64 JSON) used for
 * keyset pagination. Includes Zod-based runtime validation that
 * ensures both structural correctness and type consistency between
 * sortField and sortValue.
 */

import { z } from "zod";
import { logger } from "../utils/logger";

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
 * Sort fields that expect a numeric sortValue in the cursor.
 * - ttl: stored as live_until_ledger_sequence (int)
 * - updated_at: stored as Unix timestamp in seconds (int)
 */
const NUMERIC_SORT_FIELDS: ReadonlySet<string> = new Set(["ttl", "updated_at"]);

/**
 * Sort fields that expect a string sortValue in the cursor.
 * - durability: stored as text (e.g. "persistent", "instance", "temporary")
 */
const STRING_SORT_FIELDS: ReadonlySet<string> = new Set(["durability"]);

/**
 * All recognized sort fields (used to reject unknown values).
 */
const VALID_SORT_FIELDS: ReadonlySet<string> = new Set([
  "key_hash",
  "durability",
  "ttl",
  "updated_at",
]);

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
    /** The value of the sort field (number for ttl/updated_at, string for durability) */
    sortValue?: number | string | bigint;
  };
};

// Runtime validation for decoded cursors (must match CursorData above).
// Validation issues added via superRefine are intentionally detailed for
// server-side logging, and they're NOT exposed to API consumers.
const cursorDataSchema = z
  .object({
    cursorType: z.enum(["next", "prev"]),
    sortField: z.string().optional(),
    position: z.object({
      keyHash: z.string(),
      sortValue: z.union([z.number(), z.string()]).optional(),
    }),
  })
  .superRefine((data, ctx) => {
    const { sortField, position } = data;

    // If sortField is present, it must be a recognized value
    if (sortField !== undefined && !VALID_SORT_FIELDS.has(sortField)) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown sort field: "${sortField}"`,
        path: ["sortField"],
      });
      return;
    }

    // key_hash sort uses no sortValue — nothing more to validate
    if (sortField === undefined || sortField === "key_hash") {
      return;
    }

    // Non-key_hash sort fields require a sortValue
    if (position.sortValue === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `Sort field "${sortField}" requires a sortValue`,
        path: ["position", "sortValue"],
      });
      return;
    }

    const actualType = typeof position.sortValue;

    if (NUMERIC_SORT_FIELDS.has(sortField) && actualType !== "number") {
      ctx.addIssue({
        code: "custom",
        message: `Sort field "${sortField}" requires a numeric sortValue, got ${actualType}`,
        path: ["position", "sortValue"],
      });
    }

    if (STRING_SORT_FIELDS.has(sortField) && actualType !== "string") {
      ctx.addIssue({
        code: "custom",
        message: `Sort field "${sortField}" requires a string sortValue, got ${actualType}`,
        path: ["position", "sortValue"],
      });
    }
  });

/**
 * Creates a pagination cursor from record data
 *
 * @param cursorData - Cursor data to encode
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
 * Decodes and validates a pagination cursor from API requests.
 * Validates both structure and type consistency (e.g. numeric sortValue
 * for ttl/updated_at, string sortValue for durability).
 *
 * @param cursor - Base64 encoded cursor string
 * @returns Validated CursorData
 * @throws InvalidCursorError on any decoding or validation failure
 */
export const decodeCursor = (cursor: string): CursorData => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64").toString());
  } catch (err: unknown) {
    logger.warn({ cursor, err }, "Invalid cursor: not valid base64 JSON");
    throw new InvalidCursorError(cursor, err);
  }

  const result = cursorDataSchema.safeParse(parsed);
  if (!result.success) {
    const customIssue = result.error.issues.find(i => i.code === "custom");
    const detail = customIssue?.message ?? "Cursor structure is invalid";
    logger.warn({ cursor, detail }, "Invalid cursor parameter received");
    throw new InvalidCursorError(cursor);
  }

  return result.data as CursorData;
};
