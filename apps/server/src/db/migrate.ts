import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";

/** Finds the @repo/server package root whether running from src/ or dist/. */
function packageRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const pkg = path.join(dir, "package.json");
    if (existsSync(pkg)) {
      const { name } = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
      if (name === "@repo/server") return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error("Could not locate @repo/server package root");
}

export const migrationsFolder = path.join(packageRoot(), "drizzle");

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder });
}
