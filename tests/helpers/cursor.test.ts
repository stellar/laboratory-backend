import { createHmac } from "node:crypto";
import {
  CursorData,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
} from "../../src/helpers/cursor";

// Test-only signing keys, injected explicitly so tests don't depend on
// process.env. Both are comfortably above the 32-byte minimum.
const SIGNING_KEY = "cursor-test-signing-key-0123456789abcdef";
const OTHER_SIGNING_KEY = "cursor-test-signing-key-fedcba9876543210";

const CONTRACT_ID = "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU";
const OTHER_CONTRACT_ID =
  "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CAB";

const sampleCursor = (overrides: Partial<CursorData> = {}): CursorData => ({
  cursorType: "next",
  sortField: "ttl",
  sortDirection: "asc",
  position: { keyHash: "abc123", sortValue: 61482901 },
  ...overrides,
});

/** Builds an unsigned (legacy) base64(JSON) cursor directly. */
const unsignedCursor = (obj: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

const sign = (payload: string, key: string, contractId = ""): string =>
  createHmac("sha256", key)
    .update(`${contractId}.${payload}`)
    .digest("base64url");

describe("encodeCursor", () => {
  test("does not mutate the input object", () => {
    const input: CursorData = {
      cursorType: "next",
      position: {
        keyHash: "abc",
        sortValue: BigInt(123),
      },
    };

    const originalType = input.cursorType;
    const originalSortValue = input.position.sortValue;

    encodeCursor(input, CONTRACT_ID);

    expect(input.cursorType).toBe(originalType);
    expect(input.position.sortValue).toBe(originalSortValue);
  });
});

describe("signed cursors", () => {
  test("🟢signed_cursor_roundtrips_through_encode_and_decode", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);

    // Signed wire format: <base64url payload>.<base64url signature>
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    expect(decodeCursor(cursor, CONTRACT_ID, SIGNING_KEY)).toEqual(
      sampleCursor(),
    );
  });

  test("🟢signed_cursor_carries_exact_payload_and_signature", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);
    const [payload, signature] = cursor.split(".");

    const expectedJson = JSON.stringify({
      cursorType: "next",
      sortField: "ttl",
      sortDirection: "asc",
      position: { keyHash: "abc123", sortValue: 61482901 },
    });
    expect(payload).toBe(Buffer.from(expectedJson).toString("base64url"));
    // HMAC-SHA256 is 32 bytes → 43 base64url characters without padding.
    expect(signature).toHaveLength(43);
    expect(signature).toBe(sign(payload, SIGNING_KEY, CONTRACT_ID));
  });

  test("🔴signed_cursor_issued_for_another_contract_is_rejected", () => {
    // The contract is bound via the signature, not stored in the payload, so a
    // cursor issued for one contract fails to verify against another.
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);

    expect(() => decodeCursor(cursor, OTHER_CONTRACT_ID, SIGNING_KEY)).toThrow(
      InvalidCursorError,
    );
    expect(decodeCursor(cursor, CONTRACT_ID, SIGNING_KEY)).toEqual(
      sampleCursor(),
    );

    // The contract is not leaked into the payload.
    const [payload] = cursor.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    expect(decoded.contractId).toBeUndefined();
  });

  test("🟢base64url_payload_with_url_safe_characters_roundtrips", () => {
    // A run of "?" (0x3F) bytes forces a "_" in the base64url payload, and a
    // run of "~" (0x7E) forces a "-", so both URL-safe characters are
    // exercised deterministically.
    const candidate = sampleCursor({
      position: { keyHash: "????????????~~~~~~~~~~~~", sortValue: 61482901 },
    });
    const cursor = encodeCursor(candidate, CONTRACT_ID, SIGNING_KEY);
    const payload = cursor.split(".")[0];

    expect(payload).toMatch(/-/);
    expect(payload).toMatch(/_/);
    expect(decodeCursor(cursor, CONTRACT_ID, SIGNING_KEY)).toEqual(candidate);
  });

  test("🔴tampered_payload_is_rejected", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);
    const [payload, signature] = cursor.split(".");
    const tamperedPayload =
      (payload.startsWith("A") ? "B" : "A") + payload.slice(1);

    expect(() =>
      decodeCursor(`${tamperedPayload}.${signature}`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(InvalidCursorError);
    expect(() =>
      decodeCursor(`${tamperedPayload}.${signature}`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(`Invalid cursor: ${tamperedPayload}.${signature}`);
  });

  test("🔴tampered_or_truncated_signature_is_rejected", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);
    const [payload, signature] = cursor.split(".");

    const tamperedSignature =
      (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
    expect(() =>
      decodeCursor(`${payload}.${tamperedSignature}`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(InvalidCursorError);

    const truncated = signature.slice(0, signature.length - 5);
    expect(() =>
      decodeCursor(`${payload}.${truncated}`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(InvalidCursorError);
  });

  test("🔴malformed_signed_shapes_are_rejected", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);
    const [payload, signature] = cursor.split(".");

    // Extra segment
    expect(() =>
      decodeCursor(`${payload}.${signature}.extra`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(InvalidCursorError);
    // Empty payload
    expect(() =>
      decodeCursor(`.${signature}`, CONTRACT_ID, SIGNING_KEY),
    ).toThrow(InvalidCursorError);
    // Empty signature
    expect(() => decodeCursor(`${payload}.`, CONTRACT_ID, SIGNING_KEY)).toThrow(
      InvalidCursorError,
    );
  });

  test("🔴unsigned_cursor_is_rejected_when_a_key_is_configured", () => {
    const legacy = unsignedCursor({
      cursorType: "next",
      position: { keyHash: "abc" },
    });

    expect(() => decodeCursor(legacy, CONTRACT_ID, SIGNING_KEY)).toThrow(
      InvalidCursorError,
    );
  });

  test("🔴cursor_signed_with_a_different_key_is_rejected", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);

    expect(() => decodeCursor(cursor, CONTRACT_ID, OTHER_SIGNING_KEY)).toThrow(
      InvalidCursorError,
    );
  });

  test.each([undefined, ""])(
    "🔴encoding_without_a_contract_id_(%j)_throws_when_a_key_is_configured",
    contractId => {
      expect(() =>
        encodeCursor(sampleCursor(), contractId, SIGNING_KEY),
      ).toThrow("contractId is required when cursor signing is enabled");
    },
  );

  test.each([undefined, ""])(
    "🔴decoding_without_a_contract_id_(%j)_throws_when_a_key_is_configured",
    contractId => {
      const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);

      const decode = () => decodeCursor(cursor, contractId, SIGNING_KEY);
      expect(decode).toThrow(
        "contractId is required when cursor signing is enabled",
      );
      // A missing binding is a server bug, not a bad client cursor.
      expect(decode).not.toThrow(InvalidCursorError);
    },
  );
});

describe("unsigned cursors (no key configured)", () => {
  const originalKey = process.env.CURSOR_SIGNING_KEY;

  beforeEach(() => {
    // Passing `undefined` as the key falls back to Env.cursorSigningKey, so
    // make sure no key leaks in from the environment for these tests.
    delete process.env.CURSOR_SIGNING_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.CURSOR_SIGNING_KEY;
    } else {
      process.env.CURSOR_SIGNING_KEY = originalKey;
    }
  });

  test("🟢encodeCursor_emits_the_legacy_base64_form", () => {
    const input: CursorData = {
      cursorType: "next",
      position: { keyHash: "abc" },
    };

    const cursor = encodeCursor(input, CONTRACT_ID, undefined);

    expect(cursor).toBe(
      Buffer.from(
        JSON.stringify({ cursorType: "next", position: { keyHash: "abc" } }),
      ).toString("base64"),
    );
  });

  test("🟢unsigned_form_omits_the_contract_binding", () => {
    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, undefined);

    expect(cursor).not.toContain(".");
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf8"));
    expect(decoded).toEqual({
      cursorType: "next",
      sortField: "ttl",
      sortDirection: "asc",
      position: { keyHash: "abc123", sortValue: 61482901 },
    });
  });

  test("🟢contract_id_is_optional_when_no_key_is_configured", () => {
    const cursor = encodeCursor(sampleCursor(), undefined, undefined);

    expect(cursor).not.toContain(".");
    expect(decodeCursor(cursor, undefined, undefined)).toEqual(sampleCursor());
  });

  test("🟢legacy_unsigned_cursor_still_decodes", () => {
    const legacy = unsignedCursor({
      cursorType: "prev",
      sortField: "durability",
      position: { keyHash: "abc", sortValue: "persistent" },
    });

    expect(decodeCursor(legacy, CONTRACT_ID, undefined)).toEqual({
      cursorType: "prev",
      sortField: "durability",
      position: { keyHash: "abc", sortValue: "persistent" },
    });
  });
});

describe("default signing key resolution", () => {
  const originalKey = process.env.CURSOR_SIGNING_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CURSOR_SIGNING_KEY;
    } else {
      process.env.CURSOR_SIGNING_KEY = originalKey;
    }
  });

  test("🟢defaults_to_Env.cursorSigningKey_when_no_key_is_passed", () => {
    process.env.CURSOR_SIGNING_KEY = SIGNING_KEY;

    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, CONTRACT_ID)).toEqual(sampleCursor());
  });

  test("🟢explicit_key_argument_overrides_the_environment", () => {
    process.env.CURSOR_SIGNING_KEY = OTHER_SIGNING_KEY;

    const cursor = encodeCursor(sampleCursor(), CONTRACT_ID, SIGNING_KEY);
    expect(decodeCursor(cursor, CONTRACT_ID, SIGNING_KEY)).toEqual(
      sampleCursor(),
    );
    expect(() => decodeCursor(cursor, CONTRACT_ID)).toThrow(InvalidCursorError);
  });
});

describe("sortValue range validation", () => {
  const originalKey = process.env.CURSOR_SIGNING_KEY;

  beforeEach(() => {
    // Range validation lives behind signature verification when a key is
    // configured; keep these payloads unsigned so they reach validation.
    delete process.env.CURSOR_SIGNING_KEY;
  });

  afterAll(() => {
    if (originalKey === undefined) {
      delete process.env.CURSOR_SIGNING_KEY;
    } else {
      process.env.CURSOR_SIGNING_KEY = originalKey;
    }
  });

  const ttlCursor = (sortValue: unknown) =>
    unsignedCursor({
      cursorType: "next",
      sortField: "ttl",
      position: { keyHash: "abc", sortValue },
    });

  test.each([1e19, 1e300, -1, 2147483648, 1000.5])(
    "🔴ttl_sortValue_%s_outside_the_int4_domain_is_rejected",
    sortValue => {
      const cursor = ttlCursor(sortValue);
      expect(() => decodeCursor(cursor, undefined, undefined)).toThrow(
        InvalidCursorError,
      );
      expect(() => decodeCursor(cursor, undefined, undefined)).toThrow(
        `Invalid cursor: ${cursor}`,
      );
    },
  );

  test.each(["1e19", "1000.5", "2147483648"])(
    "🔴ttl_string_sortValue_%s_outside_the_int4_domain_is_rejected_after_coercion",
    sortValue => {
      const cursor = ttlCursor(sortValue);
      expect(() => decodeCursor(cursor, undefined, undefined)).toThrow(
        InvalidCursorError,
      );
    },
  );

  test.each([0, 2147483647, 61482901])(
    "🟢ttl_sortValue_%s_within_the_int4_domain_is_accepted",
    sortValue => {
      const decoded = decodeCursor(ttlCursor(sortValue), undefined, undefined);
      expect(decoded.position.sortValue).toBe(sortValue);
    },
  );

  test("🟢ttl_string_sortValue_2147483647_is_coerced_and_accepted", () => {
    const decoded = decodeCursor(ttlCursor("2147483647"), undefined, undefined);
    expect(decoded.position.sortValue).toBe(2147483647);
    expect(typeof decoded.position.sortValue).toBe("number");
  });

  test("🟢omitted_sortValue_still_validates_as_a_null_boundary", () => {
    const decoded = decodeCursor(
      unsignedCursor({
        cursorType: "next",
        sortField: "ttl",
        position: { keyHash: "abc" },
      }),
      undefined,
      undefined,
    );

    expect(decoded.position.sortValue).toBeUndefined();
  });

  test("🟢updated_at_fractional_value_is_accepted", () => {
    const decoded = decodeCursor(
      unsignedCursor({
        cursorType: "next",
        sortField: "updated_at",
        position: { keyHash: "abc", sortValue: 1_700_000_000.5 },
      }),
      undefined,
      undefined,
    );

    expect(decoded.position.sortValue).toBe(1_700_000_000.5);
  });

  test.each([1e300, -5, 8_210_266_876_800])(
    "🔴updated_at_sortValue_%s_outside_the_supported_range_is_rejected",
    sortValue => {
      const cursor = unsignedCursor({
        cursorType: "next",
        sortField: "updated_at",
        position: { keyHash: "abc", sortValue },
      });
      expect(() => decodeCursor(cursor, undefined, undefined)).toThrow(
        InvalidCursorError,
      );
    },
  );

  test("🔴durability_non_string_sortValue_is_rejected", () => {
    const cursor = unsignedCursor({
      cursorType: "next",
      sortField: "durability",
      position: { keyHash: "abc", sortValue: 42 },
    });
    expect(() => decodeCursor(cursor, undefined, undefined)).toThrow(
      InvalidCursorError,
    );
  });
});
