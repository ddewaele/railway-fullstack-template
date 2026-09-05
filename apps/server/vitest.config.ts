import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    // Tests share one database and truncate between tests, so run files serially.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
  },
});
