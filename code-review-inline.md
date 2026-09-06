# Code review findings (full `main` tree, 2026-09-06)

Output of `/code-review . high` over the committed tree (apps/, packages/, e2e/, .github/, .railway/, scripts/).
Every finding was verified against the code and the installed library sources. A separate security review
found no exploitable issues; the items below are correctness, resilience and hygiene bugs.

Status legend: ⬜ open · 🟡 partially fixed · ✅ fixed (link the PR when closing an item).

A parallel full-tree review lives in `code-review-clean.md` (12 findings). Overlap is mapped in the last section; items 6, 8, 9 and 10 below are unique to this file.

## Correctness

### 1. ⬜ Denying Google consent loops the user back to Google forever

- **Where:** `apps/server/src/routes/auth.ts:47`
- **Problem:** The callback route runs the same `googleAuth` middleware as the login start. Any request without `?code` is treated as a new login, so Google's `?error=access_denied&state=...` redirect is answered with another 302 to Google.
- **Scenario:** User clicks Cancel on the consent screen → consent screen reappears → repeat until they accept or close the tab.
- **Fix:** On the callback route, check `c.req.query("error")` before invoking the middleware and redirect to `${APP_URL}/login?error=oauth_failed`. Add an integration test for the `error=access_denied` callback.

### 2. 🟡 `APP_URL` with a trailing slash, or missing in production, silently breaks OAuth

> Partially fixed by #19: `envSchema.ts` now normalises `APP_URL` to `URL.origin`, so the trailing-slash case is closed. Still open: the production default of `http://localhost:5173` when the variable is unset.

- **Where:** `apps/server/src/env.ts:10`
- **Problem:** `z.url()` accepts `https://host/`, producing `redirect_uri=https://host//api/auth/google/callback` (Google: `redirect_uri_mismatch`). `APP_URL` also defaults to `http://localhost:5173`, so an unset variable in production boots a healthy server that sends a localhost redirect URI.
- **Fix:** `.transform(u => u.replace(/\/+$/, ""))` on `APP_URL`; a `superRefine` that requires `APP_URL`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` when `NODE_ENV=production` (or at least a loud warning, since the 503 gate handles the Google ids).

### 3. ⬜ Email unique constraint blocks re-created Google accounts

- **Where:** `apps/server/src/auth/user.ts:18`
- **Problem:** `onConflictDoUpdate` targets `google_id` only, but `users.email` is also `UNIQUE`. A Google account with a new `sub` and a previously stored email violates the constraint → 500 → `/login?error=oauth_failed` on every attempt.
- **Scenario:** Workspace admin deletes and recreates `alice@company.com`; or a user changes their Google email to one another row already has.
- **Fix:** Look up by email first and relink `google_id` (with the profile refresh), or drop the uniqueness on `email`. Test both the relink and the "different person, same email" outcome you decide on.

### 4. ⬜ Non-401 failure of `/api/auth/me` leaves the app on "Loading…" forever

- **Where:** `apps/web/src/App.tsx:23`
- **Problem:** `.catch` rethrows anything that is not a 401, so a 500/503/network error is an unhandled rejection and the auth state never leaves `loading`.
- **Fix:** Add an `error` branch to `AuthState` and render a retry message, or fall back to the login page with a banner.

### 5. ⬜ `toggle()` and `remove()` swallow errors; an expired session looks like a dead UI

- **Where:** `apps/web/src/components/Todos.tsx:39` (also list load at line 17)
- **Problem:** `void toggle(todo)` / `void remove(todo)` discard rejections. After the session expires (401, cookie cleared), clicks do nothing and no message is shown until a manual reload.
- **Fix:** Catch `ApiError(401)` and bubble it to `App` (sign out); surface other errors via `setError`. Component test: 401 on PATCH → `onSessionExpired` called.

### 6. ⬜ Static root resolves against `process.cwd()`; starting from `apps/server` serves no frontend

- **Where:** `apps/server/src/app.ts:42`
- **Problem:** `path.resolve(env.STATIC_DIR ?? "apps/web/dist")` is cwd-relative. `pnpm --filter @repo/server start` (cwd `apps/server`) resolves to `apps/server/apps/web/dist`; every non-API GET returns a text 404.
- **Fix:** Resolve the default relative to the package root (reuse the `packageRoot()` walk from `db/migrate.ts`, e.g. `<pkgRoot>/../web/dist`), then convert to a cwd-relative path for `serveStatic`.

### 7. ⬜ Shutdown exits before in-flight requests finish

- **Where:** `apps/server/src/index.ts:14`
- **Problem:** `server.close()` is not awaited; `process.exit(0)` runs as soon as the DB pool closes, cutting off responses during Railway's SIGTERM on every redeploy.
- **Fix:** `await new Promise(r => server.close(r))` with a timeout (e.g. 10 s) before `sql.end()`.

## Efficiency

### 8. ⬜ Sessions table grows without bound

- **Where:** `apps/server/src/auth/session.ts:19`
- **Problem:** Expired rows are deleted only when their exact token is presented again; each login inserts a new row; no `expires_at` index.
- **Fix:** In `createSession`, opportunistically `delete from sessions where expires_at < now()`; add an index on `expires_at` (new migration).

### 9. ⬜ CI builds twice

- **Where:** `.github/workflows/ci.yml:66` and `playwright.config.ts:24`
- **Problem:** The CI `Build` step runs `pnpm build`, then Playwright's `webServer.command` runs `pnpm build` again before starting the server.
- **Fix:** Make the webServer command `${process.env.CI ? "" : "pnpm build && "}node apps/server/dist/migrate.js && node apps/server/dist/index.js`, or split into `e2e:prepare` / `e2e:run` scripts.

## Test coverage

### 10. ⬜ Hard-coded `:3100` redirect URI ignores `E2E_PORT`

- **Where:** `e2e/auth.spec.ts:24`
- **Problem:** `playwright.config.ts` derives the port from `E2E_PORT`, but the assertion expects `http://localhost:3100/api/auth/google/callback`.
- **Fix:** Import `E2E_BASE_URL` from `playwright.config.ts` (as `e2e/helpers.ts` does) and build the expectation from it.

## Suggested batching

- **PR A (auth + env):** items 1, 2, 3 with integration tests.
- **PR B (frontend resilience):** items 4, 5 with component tests.
- **PR C (server runtime + hygiene):** items 6, 7, 8 (includes one migration).
- **PR D (CI/e2e):** items 9, 10.

## Cross-reference with `code-review-clean.md`

| This file                            | `code-review-clean.md`                                   | Notes                                                      |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| 1 consent-denial loop                | 1 (High)                                                 | Same finding                                               |
| 2 `APP_URL` validation               | —                                                        | Trailing slash fixed by #19; production default still open |
| 3 email conflict                     | 2 (High)                                                 | Same finding                                               |
| 4 `/auth/me` non-401 → stuck Loading | 4 (Medium)                                               | Same finding                                               |
| 5 toggle/remove swallow errors       | 5 (Medium)                                               | Same finding; their 6 (failed sign-out) is the same class  |
| 6 static root vs cwd                 | —                                                        | Unique here                                                |
| 7 shutdown drops in-flight requests  | 10 (Low)                                                 | Same finding                                               |
| 8 sessions table growth              | —                                                        | Unique here                                                |
| 9 CI builds twice                    | —                                                        | Unique here                                                |
| 10 hard-coded e2e port               | —                                                        | Unique here                                                |
| —                                    | 3 `NODE_ENV=test` ships a dev React bundle in e2e        | Only in the other file                                     |
| —                                    | 7, 8 `GET /api` and missing assets answered with the SPA | Only in the other file                                     |
| —                                    | 9, 11, 12 preflight/bootstrap/secret-placeholder hygiene | Only in the other file                                     |
