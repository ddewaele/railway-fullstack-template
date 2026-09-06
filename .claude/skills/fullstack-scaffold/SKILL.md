---
name: fullstack-scaffold
description: >
  Scaffold or extend a TypeScript full-stack app on the Vite + React / Hono / Postgres (Drizzle) /
  Google SSO / Railway stack in a pnpm workspace, with the conventions and gotchas learned from
  railway-fullstack-template. Use when starting a new app on this stack, adding a feature slice
  (schema + shared schema + route + UI + tests), or when the user says "same stack as the template".
allowed-tools: Bash, Read, Edit, Write
---

# Full-stack scaffold (Vite + Hono + Postgres + Google SSO on Railway)

Reference implementation: https://github.com/ddewaele/railway-fullstack-template. Prefer "Use this
template" + `scripts/bootstrap.sh` over re-scaffolding from scratch. Use this skill to make
consistent additions or when the template is not available.

## Fixed decisions (do not re-debate per project)

| Area     | Decision                                                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout   | pnpm workspace: `apps/web`, `apps/server`, `packages/shared` (Zod schemas + types, consumed from source, no build)                                                                                                                                                                                                     |
| Runtime  | Node 22 (`.nvmrc` + `engines`), `packageManager` pinned, TypeScript 5.x, `"type": "module"` at root                                                                                                                                                                                                                    |
| Server   | Hono on `@hono/node-server`; `createApp()` factory separate from the listener so tests use `app.request()`                                                                                                                                                                                                             |
| Build    | `tsup` bundles server + migration runner to `dist/`, inlining `@repo/*`; web via `vite build`; prod = `node apps/server/dist/index.js` from repo root                                                                                                                                                                  |
| Config   | Zod-validated `process.env`: pure schema in `envSchema.ts` (unit-tested), side effects in `env.ts`; `APP_URL` must be a bare origin (rejects `https://https://…`, paths, trailing slash); `.env` auto-loaded outside production with `process.loadEnvFile`; fail fast with a readable list of issues                   |
| DB       | Drizzle + postgres.js; SQL migrations committed under `apps/server/drizzle`; applied by `dist/migrate.js` as Railway pre-deploy                                                                                                                                                                                        |
| Auth     | `@hono/oauth-providers/google` + `sessions` table; cookie holds a random token, DB stores its HMAC keyed by `SESSION_SECRET`; `httpOnly`, `SameSite=Lax`, `Secure` in prod; redirect URI built from `APP_URL`                                                                                                          |
| Topology | One service: Hono serves `/api/*` and the built SPA with `index.html` fallback that **skips `/api/*`**                                                                                                                                                                                                                 |
| Local DB | docker-compose Postgres on host port **5433** (`${POSTGRES_PORT:-5433}`) with an `app_test` database created by an init script                                                                                                                                                                                         |
| Tests    | Vitest integration tests on the real test DB (truncate between tests, `fileParallelism: false`); Vitest + Testing Library for web with `afterEach(cleanup)`; Playwright e2e against the production build seeding sessions directly in the DB                                                                           |
| CI       | One job named `ci` (the required status check): lint, format check, typecheck, tests with a Postgres service container, build, **production smoke test** (boot `dist/index.js`, curl health / SPA / JSON 404 / 503, grep the redirect-URI log line), e2e; triggers on `pull_request`, `merge_group`, `push` to main    |
| Slice 1  | Ships CI, `/api/health`, JSON 404, the SPA fallback test against a fixture `dist`, `.railway/railway.ts` **and** the `railway` dev dependency, so provisioning can start the moment the slice merges                                                                                                                   |
| Schema   | Grows per slice: slice 1 has an empty `schema.ts` and an empty Drizzle journal (`{"version":"7","dialect":"postgresql","entries":[]}`); auth generates `0000`, the domain slice `0001`. The test setup truncates every `public` table except `__drizzle_migrations` dynamically, so it needs no edits as tables appear |

## Adding a feature slice (in this order)

1. `apps/server/src/db/schema.ts` → `pnpm db:generate` → review the SQL.
2. `packages/shared/src/schemas.ts`: Zod input schemas + inferred types (client and server share them).
3. `apps/server/src/routes/<feature>.ts`: `new Hono<AuthEnv>().use(requireAuth)`, `zValidator` for
   `json`/`param`, every query scoped by `user.id`, 404 for other users' rows, serialize dates to ISO.
   Mount in `app.ts` under `/api/<feature>`.
4. Integration tests next to the route using `signedInUser()` from `src/test/helpers.ts`. Cover: 401,
   happy path, validation, ownership isolation, malformed and unknown ids.
5. `apps/web/src/api.ts` methods + component under `apps/web/src/components/`; component tests with
   the `mockFetch` route stub. Clear inputs optimistically and restore on failure.
6. One Playwright scenario for the user-visible flow.
7. Run the ship-feature skill.

## Gotchas that cost time before

- **Static fallback order**: `serveStatic` for assets, then a fallback that returns `next()` for
  `/api/*`. Test it with a built `dist/` present or the test is meaningless.
- **Paths**: never `cd` in tool commands; `mkdir -p` every directory before heredoc writes; check
  the exit status of multi-file scripts.
- **First commit**: `git status --short` first; ignore local scratch folders; use explicit `git add`.
- **Ports**: check `lsof -nP -iTCP:<port> -sTCP:LISTEN` before `docker compose up`.
- **Zod 4**: `z.uuid()`, `z.email()`, `z.url()` (not `z.string().uuid()`).
- **`@hono/oauth-providers`**: the same middleware handles start and callback; pass `redirect_uri`
  explicitly (behind a proxy `c.req.url` is http). Its `state` cookie is `Secure`, fine on localhost.
- **Playwright**: do not `sql.end()` in a spec when the helper module is shared across specs; use
  `click()` + `expect().toBeChecked()` for controlled checkboxes; wait for the first item before
  typing the second.
- **Workflows that need secrets**: guard with `env: TOKEN: ${{ secrets.X }}` and step-level
  `if: env.TOKEN != ''`, printing a `::notice` otherwise.
- **Dependabot**: add it last (or `open-pull-requests-limit: 0` initially); ignore majors of
  `typescript` and `@types/node`. Copy Action versions from the reference **verbatim**; a retyped
  older major means Dependabot opens one PR per action the minute it is enabled.
- **Copying from the reference**: say so in the plan ("the reference is already this app; product code
  is reused, effort goes into delivery") instead of letting the user discover it. Diff the copied
  tree against the reference before the first commit (`diff -r`), so retyped values stand out.
- **Config values**: after every `set` (Railway variables, repo settings, rulesets), read the value back
  and compare it with the intended one. `z.url()` accepted `https://https://host`; only a read-back or
  the origin refinement in `envSchema.ts` catches it.
