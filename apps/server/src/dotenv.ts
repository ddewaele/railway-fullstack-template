import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads the nearest `.env` file (walking up from cwd) into process.env using
 * Node's built-in loader. Existing variables are never overridden, and nothing
 * is loaded in production where the platform (Railway) injects configuration.
 */
export function loadDotenv(): void {
  if (process.env.NODE_ENV === "production") return;
  let dir = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile(candidate);
      } catch {
        // ignore malformed .env; validation happens in env.ts
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
