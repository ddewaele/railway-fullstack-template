import { createMiddleware } from "hono/factory";
import type { UserRow } from "../db/schema.js";
import { clearSessionCookie, getSessionToken, getUserBySessionToken } from "./session.js";

export type AuthEnv = { Variables: { user: UserRow } };

/** Loads the signed-in user from the session cookie or responds 401. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getSessionToken(c);
  const user = token ? await getUserBySessionToken(token) : null;
  if (!user) {
    if (token) clearSessionCookie(c);
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
});
