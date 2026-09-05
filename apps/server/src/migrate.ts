// CLI entry: applies pending SQL migrations from apps/server/drizzle.
// Used locally (`pnpm db:migrate`) and as Railway's pre-deploy command.
import { db, sql } from "./db/client.js";
import { migrationsFolder, runMigrations } from "./db/migrate.js";

console.log(`Applying migrations from ${migrationsFolder}`);
try {
  await runMigrations(db);
  console.log("Migrations applied");
} finally {
  await sql.end();
}
