import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { signedInUser } from "../test/helpers.js";

const app = createApp();

const json = (body: unknown, cookie: string, method = "POST") => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function createTodo(cookie: string, title: string) {
  const res = await app.request("/api/todos", json({ title }, cookie));
  expect(res.status).toBe(201);
  const { todo } = (await res.json()) as {
    todo: { id: string; title: string; completed: boolean };
  };
  return todo;
}

describe("/api/todos", () => {
  it("requires authentication", async () => {
    expect((await app.request("/api/todos")).status).toBe(401);
    expect((await app.request("/api/todos", json({ title: "x" }, ""))).status).toBe(401);
  });

  it("creates and lists todos newest first", async () => {
    const { cookie } = await signedInUser();
    await createTodo(cookie, "first");
    await createTodo(cookie, "second");

    const res = await app.request("/api/todos", { headers: { cookie } });
    expect(res.status).toBe(200);
    const { todos } = (await res.json()) as { todos: { title: string; completed: boolean }[] };
    expect(todos.map((t) => t.title)).toEqual(["second", "first"]);
    expect(todos.every((t) => t.completed === false)).toBe(true);
  });

  it("validates the payload", async () => {
    const { cookie } = await signedInUser();
    const empty = await app.request("/api/todos", json({ title: "   " }, cookie));
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: "Validation failed" });

    const missing = await app.request("/api/todos", json({}, cookie));
    expect(missing.status).toBe(400);
  });

  it("trims titles", async () => {
    const { cookie } = await signedInUser();
    const todo = await createTodo(cookie, "  padded  ");
    expect(todo.title).toBe("padded");
  });

  it("updates completion and title", async () => {
    const { cookie } = await signedInUser();
    const todo = await createTodo(cookie, "todo");

    const res = await app.request(
      `/api/todos/${todo.id}`,
      json({ completed: true, title: "renamed" }, cookie, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      todo: { id: todo.id, completed: true, title: "renamed" },
    });
  });

  it("deletes a todo", async () => {
    const { cookie } = await signedInUser();
    const todo = await createTodo(cookie, "bye");
    const del = await app.request(`/api/todos/${todo.id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(del.status).toBe(204);
    const list = (await (await app.request("/api/todos", { headers: { cookie } })).json()) as {
      todos: unknown[];
    };
    expect(list.todos).toHaveLength(0);
  });

  it("isolates todos between users", async () => {
    const alice = await signedInUser();
    const bob = await signedInUser();
    const todo = await createTodo(alice.cookie, "alice's");

    const bobList = (await (
      await app.request("/api/todos", { headers: { cookie: bob.cookie } })
    ).json()) as {
      todos: unknown[];
    };
    expect(bobList.todos).toHaveLength(0);

    const patch = await app.request(
      `/api/todos/${todo.id}`,
      json({ completed: true }, bob.cookie, "PATCH"),
    );
    expect(patch.status).toBe(404);
    const del = await app.request(`/api/todos/${todo.id}`, {
      method: "DELETE",
      headers: { cookie: bob.cookie },
    });
    expect(del.status).toBe(404);

    // Alice's todo is untouched.
    const aliceList = (await (
      await app.request("/api/todos", { headers: { cookie: alice.cookie } })
    ).json()) as {
      todos: { completed: boolean }[];
    };
    expect(aliceList.todos).toEqual([expect.objectContaining({ completed: false })]);
  });

  it("returns 400 for malformed ids and 404 for unknown ids", async () => {
    const { cookie } = await signedInUser();
    expect(
      (await app.request("/api/todos/not-a-uuid", { method: "DELETE", headers: { cookie } }))
        .status,
    ).toBe(400);
    expect(
      (
        await app.request("/api/todos/00000000-0000-4000-8000-000000000000", {
          method: "DELETE",
          headers: { cookie },
        })
      ).status,
    ).toBe(404);
  });
});
