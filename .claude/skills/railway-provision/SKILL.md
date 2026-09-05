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

```bash
railway whoami && railway link -p <projectId> -e production      # or railway init --name <project>
pnpm add -w -D railway                                             # IaC SDK for .railway/railway.ts
railway config plan                                                # review; values are redacted
railway config apply --yes
railway variable set "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')" --service app --skip-deploys
railway domain --service app
railway variable set "APP_URL=https://<domain>" --service app
```

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

- [ ] Deploy status SUCCESS, healthcheck passed
- [ ] Pre-deploy migration log lines present
- [ ] `/api/health` 200 with `db: up`; unknown `/api/*` is JSON 404; `/` serves the SPA
- [ ] OAuth start returns 503 "not configured" until credentials are set, then 302 to Google
- [ ] Both services in the same, intended region
- [ ] `railway config plan` reports no drift (once the CLI is logged in)
