import { serializeContractDataResults } from "../../src/serializers/contract_data";
import { ContractData } from "../../src/types/contract_data";

describe("serializeContractDataResults", () => {
  test("key and value fields encode binary data as base64", () => {
    // XDR data containing bytes 0x80-0xFF that are invalid standalone UTF-8
    const binaryData = Buffer.from([
      0x00, 0x00, 0x10, 0x80, 0xff, 0xfe, 0xab, 0xcd,
    ]);

    const row: ContractData = {
      durability: "persistent",
      key_hash: "abc123",
      key: binaryData,
      val: binaryData,
      closed_at: new Date("2025-01-01T00:00:00Z"),
      live_until_ledger_sequence: 100,
      expired: false,
    };

    const [result] = serializeContractDataResults([row]);

    // The serialized value must be base64-encoded to preserve binary integrity
    const expectedBase64 = binaryData.toString("base64");
    expect(result.key).toBe(expectedBase64);
    expect(result.value).toBe(expectedBase64);

    // Round-trip: decoding the base64 must yield the original bytes
    expect(Buffer.from(result.key!, "base64")).toEqual(binaryData);
    expect(Buffer.from(result.value!, "base64")).toEqual(binaryData);
  });

  test("null key and value remain null", () => {
    const row: ContractData = {
      durability: "persistent",
      key_hash: "abc123",
      key: null,
      val: null,
      closed_at: new Date("2025-01-01T00:00:00Z"),
      live_until_ledger_sequence: 100,
      expired: false,
    };

    const [result] = serializeContractDataResults([row]);

    expect(result.key).toBeNull();
    expect(result.value).toBeNull();
  });
});
