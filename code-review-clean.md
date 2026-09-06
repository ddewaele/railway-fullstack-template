# Code review — `main` @ `fe8fd11`

Scope: the whole `main` branch (all tracked files at HEAD), not a diff. The only working-tree
change is an untracked `ONBOARDING.md`. Every finding below was read in context, and the routing,
build, upsert and OAuth behaviours were verified empirically.

## Findings

### 1. High — declining Google consent bounces the user back to the consent screen forever

`apps/server/src/routes/auth.ts:47`

The same `google` middleware instance guards both `/google` and `/google/callback`, and
`@hono/oauth-providers` branches purely on `code` being present:
`if (!auth.code) { setCookie(state); return c.redirect(auth.redirect()) }`.

When a user clicks "Cancel", Google redirects to
`/api/auth/google/callback?error=access_denied&state=…` with no `code`, so the callback route
re-issues a new state cookie and 302s straight back to `accounts.google.com`.

Verified: that request returns `302 → https://accounts.google.com/o/oauth2/v2/auth?...`. The route
never inspects `c.req.query("error")`.

**Fix:** reject / redirect to `/login?error=…` when `error` is present (or when `code` is absent)
before the `google` middleware runs.

### 2. High — a Google identity whose email is already registered can never sign in, invisibly

`apps/server/src/auth/user.ts:15`

`onConflictDoUpdate({ target: users.googleId })` only handles the `google_id` conflict, but
`users.email` also has `users_email_unique` (`apps/server/drizzle/0000_flaky_proemial_gods.sql:25`).

If a second `google_id` presents an already-registered email — Workspace account deleted and
recreated (new `sub`, same address), or an address moved between a consumer and a Workspace
account — Postgres raises `23505`. Reproduced against `app_test`:

```
ERROR:  duplicate key value violates unique constraint "users_email_unique"
DETAIL:  Key (email)=(shared@example.com) already exists.
```

The exception is then swallowed by the callback's `onError` (`apps/server/src/routes/auth.ts:74-78`)
into `redirect(/login?error=oauth_failed)`, so the user sees the generic "Sign-in with Google
failed" and retries forever with the cause only in the server logs.

**Fix:** key the upsert on email as well, or detect `23505` and surface a distinct error.

### 3. Medium — `NODE_ENV: "test"` makes `pnpm e2e` build and ship a _development_ React bundle

`playwright.config.ts:29`

`webServer.command` is `pnpm build && …`, and `webServer.env` sets `NODE_ENV=test` for that whole
command. Vite bakes the ambient `NODE_ENV` into `process.env.NODE_ENV` in the client bundle, so
`react-dom/client`'s `if (process.env.NODE_ENV === 'production')` check picks the development build.

Verified:

| build                      | size      | contains dev-only string |
| -------------------------- | --------- | ------------------------ |
| `NODE_ENV=test vite build` | 470,340 B | yes                      |
| `vite build`               | 270,436 B | no                       |

(dev-only string: `Each child in a list should have a unique`)

The current `apps/web/dist/assets/index-DmcbRhS7.js` (470,383 B) is exactly that dev bundle. So the
e2e suite does not exercise what ships (dev-mode React, StrictMode double-invoked effects, extra
warnings), and `pnpm start` afterwards serves a dev build.

**Fix:** build outside the `NODE_ENV=test` env — e.g. move the build into `globalSetup`, or
`NODE_ENV=production pnpm build && NODE_ENV=test node …`.

### 4. Medium — any non-401 failure of `/api/auth/me` leaves the app stuck on "Loading…" forever

`apps/web/src/App.tsx:21`

```ts
.catch((err: unknown) => {
  if (err instanceof ApiError && err.status === 401) setAuth({ status: "anonymous" });
  else throw err;
});
```

Throwing inside a `.catch` callback only produces an unhandled rejection; `auth` stays
`{ status: "loading" }`, so line 32 renders "Loading…" indefinitely.

Concrete case: the database is briefly down, `requireAuth` → `getUserBySessionToken` throws,
`app.onError` returns 500, and the user gets a permanently blank loading screen with nothing in the
UI.

**Fix:** set an error state and render something actionable.

### 5. Medium — failed toggles and deletes are silently swallowed

`apps/web/src/components/Todos.tsx:38` (and `:43`)

`toggle` and `remove` have no `try/catch`, and the call sites are `onChange={() => void toggle(todo)}`
and `onClick={() => void remove(todo)}` (lines 93, 101).

If the session expired (401), the row was deleted in another tab (404), or the network dropped, the
promise rejects, `setTodos` never runs, and the checkbox silently snaps back with no
`role="alert"` message — the user believes the write went through until they reload.

`add()` already handles this correctly; mirror it.

### 6. Low — a failed sign-out leaves the user signed in with no feedback

`apps/web/src/App.tsx:27`

`signOut` is `async` but is passed through `onSignOut: () => void` and wired directly to `onClick`
(`apps/web/src/components/Todos.tsx:57`). If `POST /api/auth/logout` fails, `await api.logout()`
rejects, `setAuth({ status: "anonymous" })` never runs, and the rejection is unhandled — the button
appears to do nothing.

### 7. Low — `GET /api` returns the SPA with 200 instead of a JSON 404

`apps/server/src/app.ts:45`

`c.req.path.startsWith("/api/")` requires the trailing slash, so `/api` (and `/apifoo`) falls
through to `spaFallback`. Verified with a standalone reproduction of these two handlers:
`/api` → `200 text/html`.

This contradicts the contract asserted in `apps/server/src/app.test.ts:13` and in CLAUDE.md's
"route-order gotcha".

**Fix:** use `path === "/api" || path.startsWith("/api/")`.

### 8. Low — the SPA fallback answers missing static assets with `200 text/html`

`apps/server/src/app.ts:45`

Verified: `/assets/nope.js` → `200 text/html; charset=utf-8` (index.html).

After a redeploy, a browser holding a cached `index.html` requests a hashed chunk that no longer
exists and receives HTML with a 200, so the module fails to parse and the page breaks with a
confusing syntax error rather than a clean 404.

**Fix:** restrict the fallback to requests that accept HTML / have no file extension.

### 9. Low — the "read-only" preflight can hang on an interactive SSH prompt

`.claude/skills/preflight/preflight.sh:44`

```bash
sshid=$(ssh -T git@github.com 2>&1 | grep -oE "Hi [^!]+" | cut -d' ' -f2)
```

This runs with inherited stdin and no `-o BatchMode=yes -o ConnectTimeout=5
-o StrictHostKeyChecking=accept-new`. On a machine where `github.com` is not yet in `known_hosts`,
ssh prints the fingerprint prompt and blocks waiting for input; offline it blocks on the TCP
timeout. `scripts/bootstrap.sh:21` runs this script first, so the whole bootstrap hangs before
printing anything actionable.

### 10. Low — in-flight requests are dropped on every Railway redeploy

`apps/server/src/index.ts:14`

`shutdown()` calls `server.close()` without awaiting its callback and then `process.exit(0)`
immediately after `sql.end({ timeout: 5 })`. On SIGTERM (each redeploy, each restart), requests
still being served are aborted mid-response.

**Fix:** await the close before ending the pool and exiting.

### 11. Low — an existing-but-empty `SESSION_SECRET` is never populated, and the check can false-positive

`scripts/bootstrap.sh:60`

```bash
if ! grep -q SESSION_SECRET <<<"$existing"; then
```

This matches the _key name_ anywhere in the JSON, so a service where `SESSION_SECRET` exists with an
empty value is treated as configured; the app then exits at boot with
`SESSION_SECRET must be at least 16 characters` (`apps/server/src/env.ts:15`). The bare grep also
matches if the string appears in any other variable's value.

**Fix:** parse the JSON, e.g. `jq -e '.SESSION_SECRET | length >= 16'`.

### 12. Low — the committed placeholder secret passes validation

`.env.example:19`

`SESSION_SECRET=change-me-to-a-long-random-string` is 33 characters, so it satisfies
`z.string().min(16)`. `cp .env.example .env` (the documented first step in README.md and CLAUDE.md)
yields a fully working app whose session-signing key is public in the repo, with nothing prompting a
change.

**Fix:** ship an obviously-invalid placeholder (empty, or `<generate: openssl rand -base64 32>`) so
`env.ts` fails loudly.

## Notes (not findings)

- `pnpm lint` and `pnpm typecheck` are clean; `pnpm --filter @repo/server test` passes 19/19 against
  the local Postgres. `pnpm format:check` currently fails, but only on the untracked
  `ONBOARDING.md` — committing it as-is would break CI's format step.
- Suspicions checked and cleared:
  - `apps/server/src/dotenv.ts` does not override existing env vars (verified `process.loadEnvFile`
    precedence), so e2e cannot truncate a developer's real database.
  - Hono's `.use("/google/*")` does match `/google`, and `c.req.path` is the full path inside the
    mounted sub-app (both verified), so the 503 guard and the callback `onError` path check are
    correct.
  - An absolute `STATIC_DIR` survives the `path.relative` round-trip in `serveStatic`.
- `ONBOARDING.md` (untracked) contains an HTML comment with instructions addressed to Claude; it was
  ignored as out of scope for this review.
- Reproduction side effects were limited to truncating `app_test` (which the test suite truncates
  anyway) and writing build output to a scratch directory.
