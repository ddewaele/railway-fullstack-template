import { googleAuth } from "@hono/oauth-providers/google";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../auth/middleware.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionToken,
  setSessionCookie,
} from "../auth/session.js";
import { toPublicUser, upsertGoogleUser } from "../auth/user.js";
import { env } from "../env.js";

const CALLBACK_PATH = "/api/auth/google/callback";

/**
 * Google OAuth 2.0 (authorization code) flow:
 *   GET /api/auth/google           -> sets a state cookie, redirects to Google
 *   GET /api/auth/google/callback  -> verifies state, exchanges code, upserts user, sets session cookie
 *   GET /api/auth/me               -> current user (401 when signed out)
 *   POST /api/auth/logout          -> deletes the session server-side and clears the cookie
 */
const google = googleAuth({
  client_id: env.GOOGLE_CLIENT_ID,
  client_secret: env.GOOGLE_CLIENT_SECRET,
  scope: ["openid", "email", "profile"],
  redirect_uri: `${env.APP_URL}${CALLBACK_PATH}`,
});

const googleConfigured = env.GOOGLE_CLIENT_ID !== "" && env.GOOGLE_CLIENT_SECRET !== "";

export const authRoutes = new Hono()
  // Fail loudly (and early) when the OAuth client has not been configured yet.
  .use("/google/*", async (c, next) => {
    if (!googleConfigured) {
      return c.json(
        {
          error: "Google sign-in is not configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
        },
        503,
      );
    }
    await next();
  })
  .get("/google", google)
  .get("/google/callback", google, async (c) => {
    const profile = c.get("user-google");
    if (!profile?.id || !profile.email) {
      throw new HTTPException(400, { message: "Google did not return an id and email" });
    }
    if (profile.verified_email === false) {
      throw new HTTPException(403, { message: "Google account email is not verified" });
    }
    const user = await upsertGoogleUser({
      id: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    const token = await createSession(user.id);
    setSessionCookie(c, token);
    return c.redirect(`${env.APP_URL}/`);
  })
  .get("/me", requireAuth, (c) => c.json({ user: toPublicUser(c.get("user")) }))
  .post("/logout", async (c) => {
    const token = getSessionToken(c);
    if (token) await deleteSession(token);
    clearSessionCookie(c);
    return c.json({ ok: true });
  })
  // OAuth failures (state mismatch, Google errors) land the user back on the
  // login page with a reason instead of a bare JSON error.
  .onError((err, c) => {
    if (c.req.path === CALLBACK_PATH) {
      console.error("OAuth callback failed:", err.message);
      return c.redirect(`${env.APP_URL}/login?error=oauth_failed`);
    }
    throw err;
  });
