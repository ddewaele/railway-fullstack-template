import type { Todo, User } from "@repo/shared";
import { CreateTodoSchema } from "@repo/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api.js";

type Props = { user: User; onSignOut: () => void };

export function Todos({ user, onSignOut }: Props) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listTodos()
      .then(({ todos }) => setTodos(todos))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = CreateTodoSchema.safeParse({ title });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid title");
      return;
    }
    setError(null);
    setTitle(""); // clear immediately so fast typists can continue
    try {
      const { todo } = await api.createTodo(parsed.data);
      setTodos((prev) => [todo, ...(prev ?? [])]);
    } catch (e) {
      setTitle(parsed.data.title); // give the text back on failure
      setError(e instanceof Error ? e.message : "Could not add todo");
    }
  }

  async function toggle(todo: Todo) {
    const { todo: updated } = await api.updateTodo(todo.id, { completed: !todo.completed });
    setTodos((prev) => prev?.map((t) => (t.id === todo.id ? updated : t)) ?? null);
  }

  async function remove(todo: Todo) {
    await api.deleteTodo(todo.id);
    setTodos((prev) => prev?.filter((t) => t.id !== todo.id) ?? null);
  }

  const remaining = todos?.filter((t) => !t.completed).length ?? 0;

  return (
    <main className="page">
      <header className="topbar">
        <h1>Todos</h1>
        <div className="user">
          {user.avatarUrl && <img src={user.avatarUrl} alt="" width={28} height={28} />}
          <span>{user.name}</span>
          <button type="button" className="link" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="card">
        <form onSubmit={add} className="add">
          <input
            aria-label="New todo"
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <button type="submit">Add</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        {todos === null ? (
          <p className="muted">Loading…</p>
        ) : todos.length === 0 ? (
          <p className="muted empty">Nothing to do. Enjoy your day!</p>
        ) : (
          <ul className="todos">
            {todos.map((todo) => (
              <li key={todo.id} className={todo.completed ? "done" : ""}>
                <label>
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => void toggle(todo)}
                  />
                  <span>{todo.title}</span>
                </label>
                <button
                  type="button"
                  className="link danger"
                  aria-label={`Delete ${todo.title}`}
                  onClick={() => void remove(todo)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        {todos && todos.length > 0 && (
          <footer className="muted">
            {remaining} of {todos.length} remaining
          </footer>
        )}
      </section>
    </main>
  );
}
