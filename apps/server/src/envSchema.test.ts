import { describe, expect, it } from "vitest";
import { EnvSchema, OriginSchema } from "./envSchema.js";

const base = {
  DATABASE_URL: "postgres://app:app@localhost:5433/app",
  SESSION_SECRET: "0123456789abcdef",
};

describe("APP_URL validation", () => {
  it("accepts a plain origin and normalises a trailing slash", () => {
    expect(EnvSchema.parse({ ...base, APP_URL: "https://app.example.com" }).APP_URL).toBe(
      "https://app.example.com",
    );
    expect(EnvSchema.parse({ ...base, APP_URL: "https://app.example.com/" }).APP_URL).toBe(
      "https://app.example.com",
    );
    expect(EnvSchema.parse({ ...base, APP_URL: "http://localhost:5173" }).APP_URL).toBe(
      "http://localhost:5173",
    );
  });

  it("rejects a doubled scheme (the value that broke Google sign-in once)", () => {
    const result = OriginSchema.safeParse("https://https://app-production-1234.up.railway.app");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("origin");
  });

  it("rejects paths, queries, credentials and non-http schemes", () => {
    for (const bad of [
      "https://app.example.com/login",
      "https://app.example.com/?x=1",
      "https://user:pw@app.example.com",
      "ftp://app.example.com",
      "app.example.com",
    ]) {
      expect(OriginSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("falls back to the local Vite origin when APP_URL is unset", () => {
    expect(EnvSchema.parse(base).APP_URL).toBe("http://localhost:5173");
  });
});
