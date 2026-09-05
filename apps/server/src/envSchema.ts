import { z } from "zod";

/**
 * A public origin: scheme + host (+ optional port), nothing else. `z.url()` alone accepts
 * `https://https://app.example.com` (host `https`, path `//app.example.com`), which once produced
 * a malformed OAuth redirect URI in production. The value is normalised to `URL.origin`, so a
 * trailing slash never yields `https://host//api/...`.
 */
export const OriginSchema = z
  .url()
  .refine(
    (value) => {
      // Zod 4 runs refinements even when `z.url()` already failed, so guard the constructor.
      let u: URL;
      try {
        u = new URL(value);
      } catch {
        return false;
      }
      return (
        (u.protocol === "https:" || u.protocol === "http:") &&
        u.pathname === "/" &&
        u.search === "" &&
        u.hash === "" &&
        u.username === "" &&
        u.password === ""
      );
    },
    {
      message: "must be an origin such as https://app.example.com (no path, query or credentials)",
    },
  )
  .transform((value) => new URL(value).origin);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Public origin of the app, e.g. https://myapp.up.railway.app (used for the OAuth redirect URI). */
  APP_URL: OriginSchema.default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  /** Used to HMAC session tokens before storing them. */
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  /** Directory of the built frontend, relative to cwd. Defaults to apps/web/dist. */
  STATIC_DIR: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
