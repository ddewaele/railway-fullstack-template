import type { User } from "@repo/shared";
import { useEffect, useState } from "react";
import { api, ApiError } from "./api.js";
import { Login } from "./components/Login.js";
import { Todos } from "./components/Todos.js";

type AuthState =
  { status: "loading" } | { status: "anonymous" } | { status: "signedIn"; user: User };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    api
      .me()
      .then(({ user }) => {
        // Landed on /login while already signed in (e.g. after OAuth) -> go home.
        if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
        setAuth({ status: "signedIn", user });
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) setAuth({ status: "anonymous" });
        else throw err;
      });
  }, []);

  async function signOut() {
    await api.logout();
    setAuth({ status: "anonymous" });
  }

  if (auth.status === "loading") return <main className="centered">Loading…</main>;
  if (auth.status === "anonymous") return <Login />;
  return <Todos user={auth.user} onSignOut={signOut} />;
}
