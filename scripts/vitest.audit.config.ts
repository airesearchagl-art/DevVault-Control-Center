import { defineConfig } from "vitest/config";

// Tests of the G4 real-data audit harness (HD-5A-10), kept out of the product suite:
//   npx vitest run --config scripts/vitest.audit.config.ts
// The product test configuration (vite.config.ts, src/**/*.test.ts) is unchanged.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/lib/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
