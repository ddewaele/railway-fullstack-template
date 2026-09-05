import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the production build (Hono serving the Vite
// bundle) on a dedicated port, backed by the test database.
const PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${PORT}`;
export const E2E_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5433/app_test";
export const E2E_SESSION_SECRET = "e2e-session-secret-not-for-production";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm build && node apps/server/dist/migrate.js && node apps/server/dist/index.js",
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
      PORT: String(PORT),
      APP_URL: E2E_BASE_URL,
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: E2E_SESSION_SECRET,
      GOOGLE_CLIENT_ID: "e2e-client-id",
      GOOGLE_CLIENT_SECRET: "e2e-client-secret",
    },
  },
});
