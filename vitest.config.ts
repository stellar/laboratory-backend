import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "{src,tests}/**/__tests__/**/*.ts",
      "{src,tests}/**/*.{test,spec}.ts",
    ],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    // Each test file boots its own Postgres testcontainer in beforeAll;
    // give container startup + prisma db push plenty of headroom.
    hookTimeout: 120000,
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
});
