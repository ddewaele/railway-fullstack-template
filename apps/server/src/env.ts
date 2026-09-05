import { z } from "zod";
import { loadDotenv } from "./dotenv.js";

loadDotenv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Public origin of the app, e.g. https://myapp.up.railway.app */
  APP_URL: z.url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  /** Used to HMAC session tokens before storing them. */
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  /** Directory of the built frontend, relative to cwd. Defaults to apps/web/dist. */
  STATIC_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

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
