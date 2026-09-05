import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_SESSION_SECRET } from "../playwright.config.js";

/**
 * Direct database access for test setup. Google sign-in cannot be automated,
 * so tests create a user and a session row and hand the browser the cookie,
 * mirroring apps/server/src/auth/session.ts.
 */
// Specs share this module within a worker; idle connections close themselves,
// so specs must not call sql.end().
export const sql = postgres(E2E_DATABASE_URL, { max: 2, idle_timeout: 5, onnotice: () => {} });

export async function resetDatabase(): Promise<void> {
  await sql`truncate table todos, sessions, users restart identity cascade`;
}

export async function signIn(
  context: BrowserContext,
  user: { name?: string; email?: string } = {},
): Promise<{ id: string; name: string; email: string }> {
  const id = randomUUID();
  const name = user.name ?? "E2E User";
  const email = user.email ?? `e2e-${id.slice(0, 8)}@example.com`;
  await sql`insert into users (id, google_id, email, name) values (${id}, ${`google-${id}`}, ${email}, ${name})`;

  const token = randomBytes(32).toString("base64url");
  const hash = createHmac("sha256", E2E_SESSION_SECRET).update(token).digest("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await sql`insert into sessions (id, user_id, expires_at) values (${hash}, ${id}, ${expires})`;

  const { hostname } = new URL(E2E_BASE_URL);
  await context.addCookies([
    { name: "session", value: token, domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  return { id, name, email };
}
