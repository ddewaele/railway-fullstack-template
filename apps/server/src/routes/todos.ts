import { zValidator } from "@hono/zod-validator";
import { CreateTodoSchema, UpdateTodoSchema, type Todo } from "@repo/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthEnv } from "../auth/middleware.js";
import { db } from "../db/client.js";
import { todos, type TodoRow } from "../db/schema.js";

const IdParam = z.object({ id: z.uuid() });

function serialize(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Uniform 400 payload for request validation failures. */
const onValidationError: Parameters<typeof zValidator>[2] = (result, c) => {
  if (!result.success) {
    return c.json({ error: "Validation failed", issues: result.error.issues }, 400);
  }
};

/**
 * Per-user TODO CRUD. Every query is scoped by the signed-in user's id, so a
 * user can never read or modify another user's todos (they simply get 404).
 */
export const todoRoutes = new Hono<AuthEnv>()
  .use(requireAuth)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(todos)
      .where(eq(todos.userId, c.get("user").id))
      .orderBy(desc(todos.createdAt));
    return c.json({ todos: rows.map(serialize) });
  })
  .post("/", zValidator("json", CreateTodoSchema, onValidationError), async (c) => {
    const { title } = c.req.valid("json");
    const [row] = await db
      .insert(todos)
      .values({ userId: c.get("user").id, title })
      .returning();
    return c.json({ todo: serialize(row!) }, 201);
  })
  .patch(
    "/:id",
    zValidator("param", IdParam, onValidationError),
    zValidator("json", UpdateTodoSchema, onValidationError),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const [row] = await db
        .update(todos)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(todos.id, id), eq(todos.userId, c.get("user").id)))
        .returning();
      if (!row) return c.json({ error: "Not found" }, 404);
      return c.json({ todo: serialize(row) });
    },
  )
  .delete("/:id", zValidator("param", IdParam, onValidationError), async (c) => {
    const { id } = c.req.valid("param");
    const deleted = await db
      .delete(todos)
      .where(and(eq(todos.id, id), eq(todos.userId, c.get("user").id)))
      .returning({ id: todos.id });
    if (deleted.length === 0) return c.json({ error: "Not found" }, 404);
    return c.body(null, 204);
  });
