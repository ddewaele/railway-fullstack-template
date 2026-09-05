import { afterAll, beforeAll, beforeEach } from "vitest";

// Point the app at a dedicated test database before env.ts is evaluated.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5433/app_test";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production";
process.env.APP_URL ??= "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";

const { db, sql } = await import("../db/client.js");
const { runMigrations } = await import("../db/migrate.js");

beforeAll(async () => {
  await runMigrations(db);
});

beforeEach(async () => {
  await sql`truncate table todos, sessions, users restart identity cascade`;
});

afterAll(async () => {
  await sql.end();
});
