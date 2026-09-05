import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { sql } from "./db/client.js";
import { env } from "./env.js";
import { CALLBACK_PATH } from "./routes/auth.js";

const app = createApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Server listening on http://localhost:${info.port} (${env.NODE_ENV})`);
  // Printed on purpose: a wrong APP_URL (e.g. a doubled scheme) is visible in the deploy logs
  // instead of surfacing as an opaque Google "invalid_request" page for the first user.
  console.log(`OAuth redirect URI: ${env.APP_URL}${CALLBACK_PATH}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
