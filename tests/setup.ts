import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "child_process";

import { PrismaClient } from "../generated/prisma";
import { setupCustomMatchers } from "./setup-matchers";

// Global type declaration
declare global {
  var testPrismaClient: PrismaClient;
}

let testContainer: StartedPostgreSqlContainer;

const _mockPrisma: Record<string, unknown> = {};

vi.mock("../src/utils/connect", () => ({
  getPrisma: () => _mockPrisma,
}));

beforeAll(async () => {
  // Setup custom Vitest matchers
  setupCustomMatchers();

  console.log("Starting postgres using testcontainers...");

  testContainer = await new PostgreSqlContainer("postgres:17-alpine")
    .withDatabase("testdb")
    .withUsername("testuser")
    .withPassword("testpass")
    .start();
  const testDbUrl = testContainer.getConnectionUri();
  console.log("Test database URL:", testDbUrl);

  console.log("Updating database from Prisma schema...");
  // --skip-generate: the client is already generated; without it, parallel
  // test workers each rewrite generated/prisma concurrently and can corrupt
  // the query engine binary.
  execSync(
    `DATABASE_URL="${testDbUrl}" npx prisma db push --accept-data-loss --skip-generate`,
    {
      stdio: "inherit",
      shell: "/bin/bash",
    },
  );

  console.log("Creating test PrismaClient, and enforcing it globally...");
  global.testPrismaClient = new PrismaClient({
    datasourceUrl: testDbUrl,
  });

  // Global mocks assigning:
  Object.assign(_mockPrisma, global.testPrismaClient);

  console.log("🪣✅ Database setup complete!");
});

afterAll(async () => {
  if (global.testPrismaClient) {
    await global.testPrismaClient.$disconnect();
  }
  if (testContainer) {
    await testContainer.stop();
  }
});
