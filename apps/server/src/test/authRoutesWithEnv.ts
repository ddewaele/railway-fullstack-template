import { vi } from "vitest";

/**
 * Loads a fresh copy of the auth routes with overridden environment values.
 * `env.ts` is evaluated once per module graph, so we reset modules and
 * mutate process.env before importing.
 */
export async function authRoutesWithEnv(overrides: Record<string, string>) {
  const previous: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    previous[k] = process.env[k];
    process.env[k] = v;
  }
  vi.resetModules();
  try {
    const { authRoutes } = await import("../routes/auth.js");
    return authRoutes;
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.resetModules();
  }
}
