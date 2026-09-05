import type { CreateTodo, Todo, UpdateTodo, User } from "@repo/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin typed wrapper over fetch for the same-origin /api. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText);
  return body;
}

export const api = {
  me: () => request<{ user: User }>("/auth/me"),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
  listTodos: () => request<{ todos: Todo[] }>("/todos"),
  createTodo: (input: CreateTodo) =>
    request<{ todo: Todo }>("/todos", { method: "POST", body: JSON.stringify(input) }),
  updateTodo: (id: string, patch: UpdateTodo) =>
    request<{ todo: Todo }>(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTodo: (id: string) => request<void>(`/todos/${id}`, { method: "DELETE" }),
};

/** Full-page navigation: the OAuth flow is a redirect, not an XHR. */
export const loginUrl = "/api/auth/google";
