import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "../test/mockFetch.js";
import { Todos } from "./Todos.js";

const user = { id: "u1", email: "a@example.com", name: "Alice", avatarUrl: null };
const todo = { id: "t1", title: "Ship it", completed: false, createdAt: "", updatedAt: "" };

afterEach(() => vi.unstubAllGlobals());

describe("Todos", () => {
  it("adds a todo and clears the input", async () => {
    const calls = mockFetch([
      { method: "GET", path: "/api/todos", body: { todos: [] } },
      { method: "POST", path: "/api/todos", status: 201, body: { todo } },
    ]);
    render(<Todos user={user} onSignOut={() => {}} />);
    expect(await screen.findByText(/nothing to do/i)).toBeInTheDocument();

    const input = screen.getByLabelText("New todo");
    fireEvent.change(input, { target: { value: "  Ship it " } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("Ship it")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ title: "Ship it" });
  });

  it("rejects an empty title client-side without calling the API", async () => {
    const calls = mockFetch([{ method: "GET", path: "/api/todos", body: { todos: [] } }]);
    render(<Todos user={user} onSignOut={() => {}} />);
    await screen.findByText(/nothing to do/i);

    fireEvent.submit(screen.getByLabelText("New todo").closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Title is required");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("toggles and deletes todos", async () => {
    mockFetch([
      { method: "GET", path: "/api/todos", body: { todos: [todo] } },
      { method: "PATCH", path: "/api/todos/t1", body: { todo: { ...todo, completed: true } } },
      { method: "DELETE", path: "/api/todos/t1", status: 204 },
    ]);
    render(<Todos user={user} onSignOut={() => {}} />);
    const checkbox = await screen.findByRole("checkbox", { name: "Ship it" });
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());

    fireEvent.click(screen.getByRole("button", { name: "Delete Ship it" }));
    await waitFor(() => expect(screen.queryByText("Ship it")).not.toBeInTheDocument());
  });

  it("signs out", async () => {
    mockFetch([{ method: "GET", path: "/api/todos", body: { todos: [] } }]);
    const onSignOut = vi.fn();
    render(<Todos user={user} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
