import { vi } from "vitest";

type Route = { method: string; path: string; status?: number; body?: unknown };

/** Stubs fetch with simple route matching so components can be tested in isolation. */
export function mockFetch(routes: Route[]) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const path =
      typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes.find((r) => r.method === method && r.path === path);
    if (!route) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    if (route.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });
  return calls;
}
