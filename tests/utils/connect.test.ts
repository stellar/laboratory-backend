import { PrismaClient } from "../../generated/prisma";

// tests/setup.ts mocks "../src/utils/connect" (to stub getPrisma), so the real
// helpers must be pulled in explicitly.
const { withStatementTimeout, STATEMENT_TIMEOUT_MS } = await vi.importActual<
  typeof import("../../src/utils/connect")
>("../../src/utils/connect");

describe("withStatementTimeout", () => {
  test("🟢adds the statement_timeout option to a plain URL", () => {
    const url = new URL(withStatementTimeout("postgresql://u@localhost/db"));

    expect(url.searchParams.get("options")).toBe(
      `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    );
  });

  test("🟢preserves an existing query string (e.g. the connector host param)", () => {
    const url = new URL(
      withStatementTimeout("postgresql://u@localhost/db?host=/var/run/socket"),
    );

    expect(url.searchParams.get("host")).toBe("/var/run/socket");
    expect(url.searchParams.get("options")).toBe(
      `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    );
  });

  test("🟢keeps any options already present alongside the timeout", () => {
    const url = new URL(
      withStatementTimeout(
        "postgresql://u@localhost/db?options=-c%20search_path%3Dpublic",
      ),
    );

    expect(url.searchParams.get("options")).toBe(
      `-c search_path=public -c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    );
  });
});

describe("statement_timeout enforcement (real database)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      datasourceUrl: withStatementTimeout(global.testDatabaseUrl),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("🟢the timeout reaches the PostgreSQL session", async () => {
    const rows = await prisma.$queryRaw<
      { statement_timeout: string }[]
    >`SHOW statement_timeout`;

    // PostgreSQL normalizes 3000ms to "3s".
    expect(rows[0].statement_timeout).toBe("3s");
  });

  test("🔴a query exceeding the timeout is cancelled (57014)", async () => {
    const err = await prisma.$queryRaw`SELECT pg_sleep(4)`.then(
      () => {
        throw new Error("expected the query to be cancelled by the timeout");
      },
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe("P2010");
    expect((err as { meta?: { code?: string } }).meta?.code).toBe("57014");
  });
});
