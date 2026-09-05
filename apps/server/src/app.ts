import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import path from "node:path";
import { env, isProd } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";

/**
 * Builds the Hono application. Exported separately from the HTTP listener so
 * tests can call `app.request()` without opening a port.
 */
export function createApp() {
  const app = new Hono();

  if (env.NODE_ENV !== "test") app.use(logger());
  app.use(secureHeaders());

  const api = new Hono().route("/health", healthRoutes).route("/auth", authRoutes);

  app.route("/api", api);
  app.notFound((c) =>
    c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404),
  );
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: isProd ? "Internal server error" : err.message }, 500);
  });

  // Serve the built frontend (apps/web/dist) with an SPA fallback to index.html.
  const staticRoot = path.relative(process.cwd(), path.resolve(env.STATIC_DIR ?? "apps/web/dist"));
  app.get("/*", serveStatic({ root: staticRoot }));
  app.get("/*", serveStatic({ root: staticRoot, path: "index.html" }));

  return app;
}

export type App = ReturnType<typeof createApp>;
