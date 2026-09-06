# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`railway-fullstack-template`: a TODO app with Google sign-in meant to be cloned as the starting point
for new apps. pnpm workspace, TypeScript everywhere: Vite 8 + React 19 (`apps/web`), Hono 4
(`apps/server`), Postgres via Drizzle + postgres.js, Zod 4 schemas shared in `packages/shared`,
deployed to Railway from `main`. README.md is the long-form reference; MANUAL_STEPS.md lists the
human-only setup steps (Google OAuth client, `railway login`, tokens).

## Commands (run from repo root)

```bash
pnpm install
docker compose up -d          # Postgres on localhost:5433 (db `app` + `app_test`), NOT 5432
cp .env.example .env          # fill GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (optional; login returns 503 without)
pnpm db:migrate               # apply apps/server/drizzle/*.sql
pnpm dev                      # Hono :3000 + Vite :5173 (Vite proxies /api -> :3000); open :5173

pnpm check                    # lint + format:check + typecheck + test  (what CI runs before build/e2e)
pnpm lint | pnpm format | pnpm format:check
pnpm typecheck                # all packages + e2e/ + .railway/ tsconfigs
pnpm test                     # Vitest in every package; server tests need Postgres (app_test)
pnpm --filter @repo/server test -- src/routes/todos.test.ts   # single server test file
pnpm --filter @repo/web test -- src/components/Todos.test.tsx # single web test file
pnpm --filter @repo/server test:watch                         # watch mode (also for @repo/web)
pnpm e2e                      # Playwright: builds, migrates, boots prod build on :3100, drives Chromium
pnpm e2e -- e2e/todos.spec.ts # single e2e spec;  pnpm e2e:ui for the inspector
pnpm build && pnpm start      # production build and run exactly as Railway does
pnpm db:generate              # drizzle-kit: new SQL migration from schema.ts changes (commit the output)
pnpm railway:plan / pnpm railway:apply   # IaC drift preview / apply (.railway/railway.ts; needs railway login+link)
```

Test databases: server Vitest and Playwright both default to
`postgres://app:app@localhost:5433/app_test` and override via `TEST_DATABASE_URL`. Tests truncate
`todos, sessions, users` between cases, so never point them at a real database.

## Architecture

**One deployable unit.** In production Hono serves the JSON API under `/api/*` and the built React
app from `apps/web/dist` with an `index.html` SPA fallback. Same origin, no CORS, first-party
session cookie. `apps/server/src/app.ts` is the `createApp()` factory (routes, error handler, static
serving); `src/index.ts` is only the listener. Tests call `app.request()` without a port.

**Route-order gotcha in `app.ts`:** `serveStatic` for assets first, then a fallback that returns
`next()` for `/api/*` so unknown API paths produce a JSON 404 instead of `index.html`. Unit tests
for this are only meaningful when `apps/web/dist` exists; the ship-feature skill's production smoke
test (`curl /api/does-not-exist` must be JSON 404) is what actually catches regressions.

**Config:** `apps/server/src/env.ts` Zod-validates `process.env` at import time and exits with a
list of issues. Outside production, `src/dotenv.ts` loads the nearest `.env` with Node's built-in
`process.loadEnvFile` (no dotenv package). Because `env` is evaluated once per module graph, tests
that need different env values must use `src/test/authRoutesWithEnv.ts` (`vi.resetModules()` +
re-import) rather than mutating `process.env` after import.

**Database:** schema in `apps/server/src/db/schema.ts`; migrations are generated SQL committed to
`apps/server/drizzle/` and applied by `src/migrate.ts` (bundled to `dist/migrate.js`), which Railway
runs as the pre-deploy command. `db/migrate.ts` finds the migrations folder by walking up to the
`@repo/server` package.json so it works from both `src/` and `dist/`.

**Auth (hand-rolled, `apps/server/src/auth/`):** `@hono/oauth-providers/google` handles both the
start and callback routes of `/api/auth/google*`; `redirect_uri` is built from `APP_URL` so the same
code works locally and on Railway. The cookie holds a random token; the `sessions.id` column stores
its HMAC-SHA256 keyed by `SESSION_SECRET`. `requireAuth` (`auth/middleware.ts`) sets `c.get("user")`
and returns 401 otherwise. Without Google credentials the `/google/*` routes return 503.

**Build:** tsup bundles the server to `apps/server/dist/{index,migrate}.js` with `@repo/*` inlined
(`noExternal`), so `packages/shared` has no build step and is consumed from source via
`exports: "./src/index.ts"`. Prod start is `node apps/server/dist/index.js` from the repo root
(static dir defaults to `apps/web/dist`, override with `STATIC_DIR`).

**Shared contract:** `packages/shared/src/schemas.ts` holds the Zod input/output schemas and inferred
types used by both the server (`zValidator`) and the React client (`apps/web/src/api.ts`, a thin
typed fetch wrapper that throws `ApiError`). Zod 4 API: `z.uuid()`, `z.email()`, `z.url()`.

### Adding a feature slice (order matters)

1. `apps/server/src/db/schema.ts` → `pnpm db:generate` → review and commit the SQL.
2. `packages/shared/src/schemas.ts`: Zod schemas + inferred types.
3. `apps/server/src/routes/<feature>.ts`: `new Hono<AuthEnv>().use(requireAuth)`, `zValidator` for
   `json`/`param` with the shared `onValidationError` shape, every query scoped by `user.id`, 404 for
   other users' rows, serialize dates to ISO strings. Mount in `app.ts` under `/api/<feature>`.
4. Integration tests next to the route using `signedInUser()` and `mockGoogle()` from
   `src/test/helpers.ts`. Cover 401, happy path, validation, ownership isolation, bad/unknown ids.
5. `apps/web/src/api.ts` methods + component in `apps/web/src/components/`; tests with the
   `mockFetch` route stub from `src/test/mockFetch.ts`.
6. One Playwright scenario in `e2e/`. Google login cannot be automated: `e2e/helpers.ts` `signIn()`
   inserts a user + hashed session row directly and sets the cookie. Do not call `sql.end()` in specs
   (the helper module is shared across specs).

## Testing layout

| Layer  | Where                             | Notes                                                                                         |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| Server | `apps/server/src/**/*.test.ts`    | Real Postgres, `fileParallelism: false`, truncate in `beforeEach`; Google `fetch` is stubbed. |
| Web    | `apps/web/src/**/*.test.{ts,tsx}` | jsdom + Testing Library; `fetch` stubbed via `mockFetch`; `afterEach(cleanup)` in setup.      |
| E2E    | `e2e/*.spec.ts`                   | Production build on `:3100`, `workers: 1`; screenshots land in `e2e/screenshots/`.            |

## Delivery and deployment

- `main` is protected by a GitHub ruleset: PRs only, required status check is the job named `ci`
  in `.github/workflows/ci.yml`, squash merges only, no reviews required. Ship with
  `gh pr merge <n> --auto --squash` right after `gh pr create` (see the `ship-feature` skill).
  Merging a PR that touches `.github/workflows` from the CLI needs `gh auth refresh -s workflow`.
- Railway redeploys on every push to `main`: `pnpm build` → pre-deploy `node apps/server/dist/migrate.js`
  → start → healthcheck `/api/health` must return 200 before traffic switches.
- Infra is declared in `.railway/railway.ts` (Railway IaC; the old `railway.json` is deprecated).
  Secrets are `preserve()` placeholders, never values. `.github/workflows/railway-config.yml` posts a
  plan on PRs touching `.railway/**` and applies on merge; it skips with a notice until the
  `RAILWAY_TOKEN` secret exists. Region id is `ams` (Hobby plan: one region per service).
- Workflows that depend on a secret must guard with `if: env.TOKEN != ''` and print a `::notice`.

## Project skills (`.claude/skills/`)

`preflight` (tool/auth/port readiness check, run first), `fullstack-scaffold` (conventions and
gotchas for feature slices), `railway-provision` (IaC via CLI, MCP fallback), `ship-feature` (checks,
PR, auto-merge, sync main). Follow them rather than re-deriving the workflow.

## Conventions and gotchas

- Never `cd` in shell commands; the cwd persists across tool calls. Use absolute paths.
- Prettier: double quotes, trailing commas, `printWidth: 100`. ESLint ignores `**/drizzle/**`.
- ESM everywhere (`"type": "module"`); relative imports inside `apps/server` use `.js` extensions.
- `ignore/` is git-ignored local scratch; `.env` is git-ignored, only `.env.example` is committed.
- Rename checklist when cloning the template: `name` in the `package.json` files, `REPO`/`APP_NAME`
  in `.railway/railway.ts`, `<title>` in `apps/web/index.html`, README.
