import { PrismaClient } from "../generated/prisma";
import { TestContractData } from "./test-data-seeder";

/**
 * Seeds the test database with contract data for keys endpoint testing
 */
export async function seedTestData(prisma: PrismaClient): Promise<void> {
  // Clear existing data (handle missing tables gracefully)
  try {
    await prisma.contract_data.deleteMany();
  } catch (error) {
    console.error("Error deleting contract data:", error);
  }

  // Test data for first contract (CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU)
  // Should have 4 distinct keys
  const testContractData: TestContractData[] = [
    {
      key_hash:
        "058926d9c30491bf70498e4df7102e02c736fe2890e2465f9810eede1b42e6c6",
      id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "persistent",
      key_decoded: "BillingCyclePlanName",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABRCaWxsaW5nQ3ljbGVQbGFuTmFtZQAAAAMAAAAD",
        "base64",
      ),
      val: Buffer.from("AAAADwAAAAZpbnZpdGUAAA==", "base64"),
      closed_at: new Date("2025-10-03T15:00:36Z"),
      pk_id: BigInt("114585509"),
    },
    {
      key_hash:
        "0617ea10a459976834fa9ce5a189133586ad546528a1407f026d4d27810a4af8",
      id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "instance",
      key_decoded: "BillingCycleTimestamp",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABVCaWxsaW5nQ3ljbGVUaW1lc3RhbXAAAAAAAAADAAAAAw==",
        "base64",
      ),
      val: Buffer.from("AAAABQAAAABpQXQF", "base64"),
      closed_at: new Date("2025-10-02T15:00:36Z"),
      pk_id: BigInt("114585471"),
    },
    {
      key_hash:
        "0c62c69563827a93daa2a3dc9247eeb71c07a504e9d9d41694bcb98e9183f525",
      id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "temporary",
      key_decoded: "BillingCyclePrice",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABFCaWxsaW5nQ3ljbGVQcmljZQAAAAAAAAMAAAAC",
        "base64",
      ),
      val: Buffer.from("AAAACgAAAAAAAAAAAAAAAAAAAAA=", "base64"),
      closed_at: new Date("2025-10-01T15:00:36Z"),
      pk_id: BigInt("114585490"),
    },
    {
      key_hash:
        "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b",
      id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "persistent",
      key_decoded: "BillingPayment",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAAA5CaWxsaW5nUGF5bWVudAAAAAADAAAAAw==",
        "base64",
      ),
      val: Buffer.from("AAAACgAAAAAAAAAAAAAAAAAAAAA=", "base64"),
      closed_at: new Date("2025-10-04T15:00:36Z"),
      pk_id: BigInt("114585510"),
    },
    // Test data for second contract (CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA)
    // Should have 2 keys (with one empty string that gets filtered)
    {
      key_hash:
        "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c",
      id: "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
      ledger_sequence: 59409311,
      durability: "persistent",
      key_decoded: "Block",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAAAVCbG9jawAAAAAAAAMAAAAD",
        "base64",
      ),
      val: Buffer.from("AAAADwAAAARkYXRhAA==", "base64"),
      closed_at: new Date("2025-10-03T15:00:36Z"),
      pk_id: BigInt("114585511"),
    },
    {
      key_hash:
        "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
      id: "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
      ledger_sequence: 59409311,
      durability: "persistent",
      key_decoded: "Pail",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAAARQYWlsAAAAAwAAAAM=",
        "base64",
      ),
      val: Buffer.from("AAAADwAAAARkYXRhAA==", "base64"),
      closed_at: new Date("2025-10-03T15:00:36Z"),
      pk_id: BigInt("114585512"),
    },
    {
      key_hash:
        "4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
      id: "CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA",
      ledger_sequence: 59409311,
      durability: "persistent",
      key_decoded: "", // Empty string - should be filtered out
      key: Buffer.from("AAAAEAAAAAEAAAACAAAADwAAAAA=", "base64"),
      val: Buffer.from("AAAADwAAAARkYXRhAA==", "base64"),
      closed_at: new Date("2025-10-03T15:00:36Z"),
      pk_id: BigInt("114585513"),
    },
  ];

  // Insert contract data using batch operation
  await prisma.contract_data.createMany({
    data: testContractData.map(data => ({
      key_hash: data.key_hash,
      id: data.id,
      ledger_sequence: data.ledger_sequence,
      durability: data.durability,
      key_decoded: data.key_decoded,
      key: data.key,
      val: data.val,
      closed_at: data.closed_at,
      pk_id: data.pk_id,
    })),
  });
}
