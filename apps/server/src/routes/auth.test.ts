import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { cookieFromResponse, mockGoogle, signedInUser } from "../test/helpers.js";

const app = createApp();

describe("GET /api/auth/google", () => {
  it("returns 503 with a clear message when Google is not configured", async () => {
    const { authRoutesWithEnv } = await import("../test/authRoutesWithEnv.js");
    const unconfigured = await authRoutesWithEnv({
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
    });
    const res = await unconfigured.request("/google");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("not configured") });
  });

  it("redirects to Google with the configured callback and a state cookie", async () => {
    const res = await app.request("/api/auth/google");
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    const state = cookieFromResponse(res, "state");
    expect(state).toBeTruthy();
    expect(location.searchParams.get("state")).toBe(state);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("creates the user, sets a session cookie and redirects home", async () => {
    mockGoogle();
    const res = await app.request("/api/auth/google/callback?code=abc&state=xyz", {
      headers: { cookie: "state=xyz" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
    const session = cookieFromResponse(res, "session");
    expect(session).toBeTruthy();

    const me = await app.request("/api/auth/me", { headers: { cookie: `session=${session}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      user: {
        id: expect.any(String),
        email: "alice@example.com",
        name: "Alice Example",
        avatarUrl: "https://example.com/alice.png",
      },
    });
  });

  it("updates an existing user on repeat login instead of duplicating", async () => {
    mockGoogle();
    await app.request("/api/auth/google/callback?code=a&state=s", {
      headers: { cookie: "state=s" },
    });
    mockGoogle({
      userinfoResponse: {
        id: "google-123",
        email: "alice@example.com",
        verified_email: true,
        name: "Alice Renamed",
        picture: null,
      },
    });
    const res = await app.request("/api/auth/google/callback?code=b&state=s", {
      headers: { cookie: "state=s" },
    });
    const session = cookieFromResponse(res, "session");
    const me = await app.request("/api/auth/me", { headers: { cookie: `session=${session}` } });
    const body = (await me.json()) as { user: { name: string; avatarUrl: string | null } };
    expect(body.user.name).toBe("Alice Renamed");
    expect(body.user.avatarUrl).toBeNull();
  });

  it("rejects a state mismatch and sends the user back to login", async () => {
    mockGoogle();
    const res = await app.request("/api/auth/google/callback?code=abc&state=wrong", {
      headers: { cookie: "state=right" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=oauth_failed");
    expect(cookieFromResponse(res, "session")).toBeUndefined();
  });

  it("rejects unverified Google emails", async () => {
    mockGoogle({
      userinfoResponse: { id: "g1", email: "x@example.com", verified_email: false, name: "X" },
    });
    const res = await app.request("/api/auth/google/callback?code=abc&state=s", {
      headers: { cookie: "state=s" },
    });
    expect(res.headers.get("location")).toContain("error=oauth_failed");
  });
});

describe("session handling", () => {
  it("GET /me returns 401 without a cookie", async () => {
    const res = await app.request("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("GET /me returns 401 and clears an unknown cookie", async () => {
    const res = await app.request("/api/auth/me", { headers: { cookie: "session=bogus" } });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toMatch(/^session=;/);
  });

  it("POST /logout invalidates the session server-side", async () => {
    const { cookie } = await signedInUser();
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(200);

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/^session=;/);

    // Replaying the old cookie no longer works.
    expect((await app.request("/api/auth/me", { headers: { cookie } })).status).toBe(401);
  });
});
