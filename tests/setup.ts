import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "child_process";

import { PrismaClient } from "../generated/prisma";
import { prisma } from "../src/utils/connect";
import { setupCustomMatchers } from "./setup-matchers";

// Global type declaration
declare global {
  var testPrismaClient: PrismaClient;
}

let testContainer: StartedPostgreSqlContainer;

// Global mocks:
jest.mock("../src/utils/connect", () => ({
  prisma: {},
}));

beforeAll(async () => {
  // Setup custom Jest matchers
  setupCustomMatchers();

  console.log("Starting postgres using testcontainers...");

  testContainer = await new PostgreSqlContainer("postgres:15")
    .withDatabase("testdb")
    .withUsername("testuser")
    .withPassword("testpass")
    .start();
  const testDbUrl = testContainer.getConnectionUri();
  console.log("Test database URL:", testDbUrl);

  console.log("Updating database from Prisma schema...");
  execSync(
    `DATABASE_URL="${testDbUrl}" npx prisma db push --accept-data-loss`,
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
  Object.assign(prisma, global.testPrismaClient);

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
