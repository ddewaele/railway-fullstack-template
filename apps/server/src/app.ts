import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import path from "node:path";
import { env, isProd } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { todoRoutes } from "./routes/todos.js";

/**
 * Builds the Hono application. Exported separately from the HTTP listener so
 * tests can call `app.request()` without opening a port.
 */
export function createApp() {
  const app = new Hono();

  if (env.NODE_ENV !== "test") app.use(logger());
  app.use(secureHeaders());

  const api = new Hono()
    .route("/health", healthRoutes)
    .route("/auth", authRoutes)
    .route("/todos", todoRoutes);

  app.route("/api", api);
  app.notFound((c) =>
    c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404),
  );
  app.onError((err, c) => {
    // Preserve intentional HTTP errors (e.g. 401/403 thrown by middleware).
    if (err instanceof HTTPException) {
      return c.json({ error: err.message || err.getResponse().statusText }, err.status);
    }
    console.error(err);
    return c.json({ error: isProd ? "Internal server error" : err.message }, 500);
  });

  // Serve the built frontend (apps/web/dist) with an SPA fallback to index.html
  // for any non-API GET, so client-side routes like /login deep-link correctly.
  const staticRoot = path.relative(process.cwd(), path.resolve(env.STATIC_DIR ?? "apps/web/dist"));
  const spaFallback = serveStatic({ root: staticRoot, path: "index.html" });
  app.get("/*", serveStatic({ root: staticRoot }));
  app.get("/*", (c, next) => (c.req.path.startsWith("/api/") ? next() : spaFallback(c, next)));

  return app;
}

export type App = ReturnType<typeof createApp>;
