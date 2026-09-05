---
name: railway-provision
description: >
  Provision or verify a Railway project for a Node monorepo with Postgres: project, database from the
  official template, app service from GitHub, variables, domain, region, then verify the deploy via
  logs and health. Use when the user says "deploy to Railway", "set up Railway", "provision the
  infrastructure", or when .railway/railway.ts exists and needs applying/verifying.
allowed-tools: Bash, Read, mcp__railway__*
---

# Provision Railway

Two paths. Prefer **IaC via CLI** when `railway whoami` works (reproducible, reviewable). Fall back to
the **Railway MCP** when the CLI is not logged in, and say so explicitly; the IaC file must then be
verified later with `railway config plan`.

## Before starting

- Region: decide once. Hobby plans allow one region per service; moving later requires a patch of the
  form `{"<old>": null, "<new>": {"numReplicas": 1}}`, and adding a region without removing the old
  one is rejected as multi-region ("upgrade to Pro").
- Secrets never go into git or into the IaC file (`preserve()`); they are set on the service.
- Variable values are **redacted** when read through the MCP (OAuth client). Anything that needs a
  secret value (e.g. `DATABASE_PUBLIC_URL` for a local tool) is a CLI/dashboard step.
- Some staged changes require 2FA and can only be applied in the dashboard; report that instead of retrying.

## Path A: IaC via CLI

Ship `.railway/railway.ts` and the `railway` dev dependency **in the first slice**, so the plan can
run from the repo from minute one. The CLI evaluates the file with the SDK from `node_modules`; a
scratch directory needs its own `npm i railway` and `railway link`, which is one detour too many.

```bash
railway whoami && railway init --name <project> --workspace "<workspace>" --json   # capture the project id from the JSON
pnpm add -w -D railway                                             # IaC SDK for .railway/railway.ts
railway config plan                                                # expect "N to add": read the list
railway config apply --yes --verbose                               # read the applied list: count must match the plan
railway config plan                                                # MUST be "already up to date" now; see "Region drift" below
railway variable set "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')" --service app --skip-deploys
DOMAIN=$(railway domain --service app --json | jq -r .domain | sed -E 's#^https?://##; s#/*$##')   # --json returns the domain WITH its scheme
railway variable set "APP_URL=https://$DOMAIN" --service app
railway variable list --service app --json | jq -r .APP_URL        # read back: must equal https://$DOMAIN, exactly one "https://"
```

**Read back everything you set.** A value written once and never re-read caused the only production
bug of the second run: `APP_URL=https://https://<domain>` (the domain command already includes the
scheme). Health was 200, the 503 "not configured" check passed, and Google rejected the first real
login with `Error 400: invalid_request`. The server now refuses such a value at boot (`envSchema.ts`)
and logs `OAuth redirect URI: ...` on start; check that line in the deploy logs.

**Region drift.** In the current SDK/CLI the `postgres("Postgres", { region })` template deploy can
ignore `region` and land in Railway's default (`us-west2`) while the app honours `replicas`. The plan
right after the first apply then shows `~ Move database Postgres to <region>` marked destructive.
Apply it **immediately, while the database is empty**, and say so before running it:
`railway config apply --yes --confirm-destructive`. A deploy that starts during the move fails in
pre-deploy with `getaddrinfo ENOTFOUND postgres.railway.internal`; the next push succeeds.

Keep `.github/workflows/railway-config.yml` guarded so it skips until `RAILWAY_TOKEN` exists.

## Path B: MCP (no CLI login)

Order matters: variables before source, so the first deploy does not crash on env validation.

1. `create-project` (name, workspaceId).
2. Postgres: ask `railway-agent` to deploy the official `postgres` template into the environment,
   named `Postgres`, in the chosen region. Confirm with `get-service-config` (image
   `ghcr.io/railwayapp-templates/postgres-ssl`, volume at `/var/lib/postgresql/data`).
3. `create-service` (empty, name `app`, environmentId).
4. `update-service`: buildCommand `pnpm build`, startCommand `node apps/server/dist/index.js`,
   preDeployCommand `["node apps/server/dist/migrate.js"]`, healthcheckPath `/api/health`,
   healthcheckTimeout 120, restartPolicyType ON_FAILURE, maxRetries 5.
5. Region for `app`: via `railway-agent` with the explicit single-region patch above. Read the staged
   config back before it commits.
6. `generate-domain` → `https://<x>.up.railway.app`.
7. `set-variables` with `skipDeploys: true`: `NODE_ENV=production`,
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `APP_URL=https://<domain>`, `SESSION_SECRET=<openssl rand>`.
8. `connect-service-source` repo `owner/name`, branch `main` → first deploy.
9. Verify: `get-status` until SUCCESS; `get-logs` types `["build","deploy"]` and look for the
   migration lines and "Healthcheck succeeded"; `curl https://<domain>/api/health`,
   `curl https://<domain>/api/does-not-exist` (must be JSON 404), `curl -I https://<domain>/`.
10. Tell the user which secrets remain (Google OAuth client id/secret) and give the exact
    `railway variable set` lines or the dashboard path. Do not accept secrets through chat unless the
    user chooses that explicitly after hearing that they land in the transcript.

## Verification checklist

Run it after the first deploy **and again after every variable change**; the 503 path proves nothing
about the redirect URI.

- [ ] Deploy status SUCCESS, healthcheck passed (`railway deployment list --service app --json | jq '.[0].status'`)
- [ ] Pre-deploy migration log lines present (`railway logs -s app -d <id>`)
- [ ] Deploy log line `OAuth redirect URI: https://<domain>/api/auth/google/callback` matches the domain exactly
- [ ] `railway variable list --service app --json | jq -r .APP_URL` equals `https://<domain>` (one scheme, no trailing slash)
- [ ] `/api/health` 200 with `db: up`; unknown `/api/*` is JSON 404; `/` and a deep link serve the SPA
- [ ] OAuth start returns 503 "not configured" until credentials are set; **after** the user sets them,
      `curl -s -o /dev/null -w '%{redirect_url}' https://<domain>/api/auth/google` must contain
      `redirect_uri=https%3A%2F%2F<domain>%2Fapi%2Fauth%2Fgoogle%2Fcallback` and the user should try one real login
- [ ] Both services in the same, intended region (`railway status --json` → `serviceInstances[].latestDeployment.meta.serviceManifest.deploy.multiRegionConfig`)
- [ ] `railway config plan` reports no drift
- [ ] Tell the user that setting variables redeploys only when the last `variable set` runs without `--skip-deploys` (or `railway redeploy --service app --yes`)
