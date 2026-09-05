import { defineConfig } from "drizzle-kit";
import { loadDotenv } from "./src/dotenv.js";

loadDotenv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
