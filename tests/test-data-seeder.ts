import { Prisma, PrismaClient } from "../generated/prisma";

export interface TestContractData {
  key_hash: string;
  contract_id: string;
  ledger_sequence: number;
  durability: string;
  key_symbol: string;
  key: Buffer;
  val: Buffer;
  closed_at: Date;
  live_until_ledger_sequence?: number;
}

/**
 * Seeds the test database with basic contract data for testing
 */
export async function seedTestData(prisma: PrismaClient): Promise<void> {
  // Clear existing data
  try {
    await prisma.contract_data.deleteMany();
  } catch (error) {
    console.error("Error deleting contract data:", error);
  }

  // Simple test data - just a few records for basic functionality
  const testContractData: TestContractData[] = [
    {
      key_hash:
        "058926d9c30491bf70498e4df7102e02c736fe2890e2465f9810eede1b42e6c6",
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "persistent",
      key_symbol: "BillingCyclePlanName",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABRCaWxsaW5nQ3ljbGVQbGFuTmFtZQAAAAMAAAAD",
        "base64",
      ),
      val: Buffer.from("AAAADwAAAAZpbnZpdGUAAA==", "base64"),
      closed_at: new Date("2025-10-03T15:00:36Z"),
      live_until_ledger_sequence: 61482901,
    },
    {
      key_hash:
        "0617ea10a459976834fa9ce5a189133586ad546528a1407f026d4d27810a4af8",
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "instance",
      key_symbol: "BillingCycleTimestamp",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABVCaWxsaW5nQ3ljbGVUaW1lc3RhbXAAAAAAAAADAAAAAw==",
        "base64",
      ),
      val: Buffer.from("AAAABQAAAABpQXQF", "base64"),
      closed_at: new Date("2025-10-02T15:00:36Z"),
      live_until_ledger_sequence: 61482902,
    },
    {
      key_hash:
        "0c62c69563827a93daa2a3dc9247eeb71c07a504e9d9d41694bcb98e9183f525",
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "temporary",
      key_symbol: "BillingCyclePrice",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAABFCaWxsaW5nQ3ljbGVQcmljZQAAAAAAAAMAAAAC",
        "base64",
      ),
      val: Buffer.from("AAAACgAAAAAAAAAAAAAAAAAAAAA=", "base64"),
      closed_at: new Date("2025-10-01T15:00:36Z"),
      live_until_ledger_sequence: 61482903,
    },
    // Additional records to test cursor pagination with sort_by=ttl
    {
      key_hash:
        "aa11111111111111111111111111111111111111111111111111111111111111",
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "temporary",
      key_symbol: "TtlEntry4",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAAA1OdWxsVHRsRW50cnkxAAAAAAAAAwAAAAE=",
        "base64",
      ),
      val: Buffer.from("AAAAAwAAAAE=", "base64"),
      closed_at: new Date("2025-10-04T15:00:36Z"),
      live_until_ledger_sequence: 61482904,
    },
    {
      key_hash:
        "bb22222222222222222222222222222222222222222222222222222222222222",
      contract_id: "CBEARZCPO6YEN2Z7432Z2TXMARQWDFBIACGTFPUR34QEDXABEOJP4CPU",
      ledger_sequence: 59409310,
      durability: "temporary",
      key_symbol: "TtlEntry5",
      key: Buffer.from(
        "AAAAEAAAAAEAAAACAAAADwAAAA1OdWxsVHRsRW50cnkyAAAAAAAAAwAAAAI=",
        "base64",
      ),
      val: Buffer.from("AAAAAwAAAAI=", "base64"),
      closed_at: new Date("2025-10-05T15:00:36Z"),
      live_until_ledger_sequence: 61482905,
    },
  ];

  // Insert contract data using batch operation
  await prisma.contract_data.createMany({
    data: testContractData.map(data => ({
      key_hash: data.key_hash,
      contract_id: data.contract_id,
      ledger_sequence: data.ledger_sequence,
      durability: data.durability,
      key_symbol: data.key_symbol,
      key: data.key,
      val: data.val,
      closed_at: data.closed_at,
      live_until_ledger_sequence: data.live_until_ledger_sequence,
    })) as Prisma.contract_dataCreateManyInput[],
  });
}
