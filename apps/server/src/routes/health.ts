import { Hono } from "hono";
import { sql } from "../db/client.js";

export const healthRoutes = new Hono().get("/", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true, db: "up" });
  } catch {
    return c.json({ ok: false, db: "down" }, 503);
  }
});
