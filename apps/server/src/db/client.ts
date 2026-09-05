import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env.js";
import * as schema from "./schema.js";

export const sql = postgres(env.DATABASE_URL, {
  max: 10,
  // Railway's DATABASE_URL uses the private network without TLS; the public
  // URL and most hosted providers require it. Let the URL decide via sslmode.
  onnotice: () => {},
});

export const db = drizzle(sql, { schema });
export type Db = typeof db;
