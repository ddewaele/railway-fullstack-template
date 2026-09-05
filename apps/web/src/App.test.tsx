import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { mockFetch } from "./test/mockFetch.js";

afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows the login page when signed out", async () => {
    mockFetch([
      { method: "GET", path: "/api/auth/me", status: 401, body: { error: "Unauthorized" } },
    ]);
    render(<App />);
    const link = await screen.findByRole("link", { name: /continue with google/i });
    expect(link).toHaveAttribute("href", "/api/auth/google");
  });

  it("shows the OAuth error message from the query string", async () => {
    window.history.replaceState(null, "", "/login?error=oauth_failed");
    mockFetch([
      { method: "GET", path: "/api/auth/me", status: 401, body: { error: "Unauthorized" } },
    ]);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in with google failed/i);
    window.history.replaceState(null, "", "/");
  });

  it("shows todos for a signed-in user", async () => {
    mockFetch([
      {
        method: "GET",
        path: "/api/auth/me",
        body: { user: { id: "u1", email: "a@example.com", name: "Alice", avatarUrl: null } },
      },
      {
        method: "GET",
        path: "/api/todos",
        body: {
          todos: [
            { id: "t1", title: "Ship it", completed: false, createdAt: "", updatedAt: "" },
            { id: "t2", title: "Done thing", completed: true, createdAt: "", updatedAt: "" },
          ],
        },
      },
    ]);
    render(<App />);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(await screen.findByText("Ship it")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /done thing/i })).toBeChecked();
    expect(screen.getByText("1 of 2 remaining")).toBeInTheDocument();
  });
});
