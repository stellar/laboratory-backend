/**
 * Cursor-based pagination helpers for efficient API pagination
 *
 * Encodes/decodes opaque cursor strings used for keyset pagination.
 * Includes Zod-based runtime validation that ensures both structural
 * correctness and type consistency between sortField and sortValue.
 *
 * When CURSOR_SIGNING_KEY is set, cursors carry an HMAC-SHA256 signature
 * (`<payload>.<signature>`, base64url) that also binds the cursor to the
 * contract it was issued for, so the server only accepts cursors it issued for
 * that contract. Without a key, the unsigned base64(JSON) form is used.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Env } from "../config/env";
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

// Bounds keep numeric cursor values within the sort column's storable range.
// ttl: live_until_ledger_sequence is a non-negative int4 column.
const TTL_MIN = 0;
const TTL_MAX = 2_147_483_647;
// updated_at: Unix epoch seconds, within to_timestamp()'s range. Fractions
// (sub-second precision) are allowed.
const UPDATED_AT_MAX = 8_210_266_876_799;

/**
 * Computes the HMAC-SHA256 signature of a cursor payload, binding it to the
 * contract it was issued for. `contractId` is base32 (never contains "."), so
 * the "." separator keeps the signed input unambiguous.
 */
const signCursorPayload = (
  payload: string,
  key: string,
  contractId = "",
): string =>
  createHmac("sha256", key)
    .update(`${contractId}.${payload}`)
    .digest("base64url");

/**
 * Cursor data object for pagination, used to encode and decode the cursor string for next/prev navigation
 */
export type CursorData = {
  cursorType: "next" | "prev";
  sortField?: string;
  sortDirection?: string;
  filterKey?: string;
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
    sortDirection: z.enum(["asc", "desc"]).optional(),
    filterKey: z.string().optional(),
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

    if (position.sortValue === undefined) {
      return;
    }

    // encodeCursor converts bigint → string (JSON has no bigint type).
    // Coerce stringified numbers back to numbers for numeric sort fields.
    if (
      NUMERIC_SORT_FIELDS.has(sortField) &&
      typeof position.sortValue === "string"
    ) {
      const parsed = Number(position.sortValue);
      if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
        position.sortValue = parsed;
      }
    }

    // Per-field range checks, applied after the string coercion above so
    // coerced values are bounded too.
    if (sortField === "ttl") {
      const v = position.sortValue;
      if (
        typeof v !== "number" ||
        !Number.isInteger(v) ||
        v < TTL_MIN ||
        v > TTL_MAX
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Sort field "ttl" requires an integer sortValue between ${TTL_MIN} and ${TTL_MAX}`,
          path: ["position", "sortValue"],
        });
      }
    } else if (sortField === "updated_at") {
      const v = position.sortValue;
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        v > UPDATED_AT_MAX
      ) {
        ctx.addIssue({
          code: "custom",
          message: `Sort field "updated_at" requires a finite sortValue between 0 and ${UPDATED_AT_MAX}`,
          path: ["position", "sortValue"],
        });
      }
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
 * @param contractId - Contract to bind a signed cursor to. It is folded into
 *   the signature rather than stored in the payload, and ignored when unsigned.
 * @param key - Signing key (defaults to Env.cursorSigningKey). When set, emits
 *   `<payload>.<signature>` (base64url); otherwise the unsigned base64(JSON) form.
 * @returns Encoded cursor string
 */
export const encodeCursor = (
  cursorData: CursorData,
  contractId?: string,
  key: string | undefined = Env.cursorSigningKey,
): string => {
  const data = {
    ...cursorData,
    cursorType:
      cursorData.cursorType === "prev" ? ("prev" as const) : ("next" as const),
    position: {
      ...cursorData.position,
      sortValue:
        typeof cursorData.position.sortValue === "bigint"
          ? cursorData.position.sortValue.toString()
          : cursorData.position.sortValue,
    },
  };

  const json = JSON.stringify(data);

  if (!key) {
    return Buffer.from(json).toString("base64");
  }

  const payload = Buffer.from(json).toString("base64url");
  return `${payload}.${signCursorPayload(payload, key, contractId)}`;
};

/**
 * Decodes and validates a pagination cursor: structure, type consistency
 * (numeric sortValue for ttl/updated_at, string for durability), and numeric
 * values within the sort column's range.
 *
 * @param cursor - Encoded cursor string
 * @param contractId - Contract the request is for. A signed cursor only
 *   verifies against the contract it was issued for; ignored when unsigned.
 * @param key - Signing key (defaults to Env.cursorSigningKey). When set, a
 *   valid signature is required; unsigned, malformed, or tampered cursors are
 *   rejected.
 * @returns Validated CursorData
 * @throws InvalidCursorError on any decoding or validation failure
 */
export const decodeCursor = (
  cursor: string,
  contractId?: string,
  key: string | undefined = Env.cursorSigningKey,
): CursorData => {
  let encoded = cursor;

  if (key) {
    // Signed cursors are exactly `<payload>.<signature>` — exactly one
    // separator and neither part empty.
    const dot = cursor.indexOf(".");
    if (
      dot <= 0 ||
      dot !== cursor.lastIndexOf(".") ||
      dot === cursor.length - 1
    ) {
      logger.warn({ cursor }, "Invalid cursor: malformed signature");
      throw new InvalidCursorError(cursor);
    }
    const payload = cursor.slice(0, dot);
    const provided = Buffer.from(cursor.slice(dot + 1), "utf8");
    const expected = Buffer.from(
      signCursorPayload(payload, key, contractId),
      "utf8",
    );
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      logger.warn({ cursor }, "Invalid cursor: bad signature");
      throw new InvalidCursorError(cursor);
    }
    // base64url payloads are accepted by Buffer.from(..., "base64").
    encoded = payload;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64").toString());
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
