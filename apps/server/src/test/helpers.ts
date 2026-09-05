import { afterEach, vi } from "vitest";
import { createSession, SESSION_COOKIE } from "../auth/session.js";
import { db } from "../db/client.js";
import { users, type UserRow } from "../db/schema.js";

/** Inserts a user and returns a Cookie header that authenticates as them. */
export async function signedInUser(
  overrides: Partial<typeof users.$inferInsert> = {},
): Promise<{ user: UserRow; cookie: string }> {
  const rand = Math.random().toString(36).slice(2);
  const [user] = await db
    .insert(users)
    .values({
      googleId: overrides.googleId ?? `google-${rand}`,
      email: overrides.email ?? `user-${rand}@example.com`,
      name: overrides.name ?? "Test User",
      avatarUrl: overrides.avatarUrl ?? null,
    })
    .returning();
  if (!user) throw new Error("failed to insert user");
  const token = await createSession(user.id);
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

/** Extracts a cookie value from a Response's Set-Cookie headers. */
export function cookieFromResponse(res: Response, name: string): string | undefined {
  for (const header of res.headers.getSetCookie()) {
    const match = header.match(new RegExp(`^${name}=([^;]*)`));
    if (match) return match[1];
  }
  return undefined;
}

export type GoogleFetchMock = {
  tokenResponse?: Record<string, unknown>;
  userinfoResponse?: Record<string, unknown>;
};

/**
 * Stubs global fetch so the OAuth middleware's calls to Google succeed without
 * network access. Any other URL falls through to the real fetch.
 */
export function mockGoogle({ tokenResponse, userinfoResponse }: GoogleFetchMock = {}) {
  const realFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json(
        tokenResponse ?? {
          access_token: "test-access-token",
          expires_in: 3600,
          scope: "openid email profile",
          token_type: "Bearer",
          id_token: "test-id-token",
        },
      );
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v2/userinfo")) {
      return Response.json(
        userinfoResponse ?? {
          id: "google-123",
          email: "alice@example.com",
          verified_email: true,
          name: "Alice Example",
          picture: "https://example.com/alice.png",
        },
      );
    }
    return realFetch(input, init);
  });
  afterEach(() => vi.unstubAllGlobals());
  return calls;
}
