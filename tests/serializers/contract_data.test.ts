import { serializeContractDataResults } from "../../src/serializers/contract_data";
import { ContractData } from "../../src/types/contract_data";

describe("serializeContractDataResults", () => {
  test("key and value fields return the xdr string stored in the db", () => {
    const xdrBase64 =
      "AAAAEAAAAAEAAAADAAAADwAAAARQYWlsAAAAEgAAAAAAAAAAflCF8Q5CL8OfT0K0zb238NYyqOls+Dtwb0mG0GG+BC8AAAADAAHtOQ==";
    const storedBytes = Buffer.from(xdrBase64, "utf8");

    const row: ContractData = {
      durability: "persistent",
      key_hash: "abc123",
      key: storedBytes,
      val: storedBytes,
      closed_at: new Date("2025-01-01T00:00:00Z"),
      live_until_ledger_sequence: 100,
      expired: false,
    };

    const [result] = serializeContractDataResults([row]);

    expect(result.key).toBe(xdrBase64);
    expect(result.value).toBe(xdrBase64);
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
