import { loadDotenv } from "./dotenv.js";
import { EnvSchema, type Env } from "./envSchema.js";

loadDotenv();

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env: Env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export type { Env } from "./envSchema.js";
