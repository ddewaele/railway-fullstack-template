---
name: railway-restore
description: >
  Bring a paused, stopped or destroyed Railway deployment back: redeploy the app and Postgres from
  source, or re-provision from .railway/railway.ts and restore a database backup. Use when the user
  says "bring railway back", "resume the deployment", "redeploy", "restore the database", "undo the
  teardown". First-time provisioning is the railway-provision skill; this one is the inverse of
  railway-teardown.
allowed-tools: Bash, AskUserQuestion, Read, mcp__railway__*
---

# Railway restore

Pick the path matching the teardown tier. Check the current state first:

```bash
railway status                                   # which services exist
railway deployment list --service app --json     # newest first; status SUCCESS/REMOVED/...
railway variable list --service app --json | node -e 'process.stdin.on("data",d=>console.log(Object.keys(JSON.parse(d)).join(" ")))'
```

## After tier 1 (app paused) or tier 2 (app + Postgres stopped)

Order matters: the database must be up before the app's pre-deploy migration runs.

```bash
railway redeploy --service Postgres --from-source --yes   # skip if Postgres was never stopped
until [ "$(railway deployment list --service Postgres --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s)[0]?.status))')" = "SUCCESS" ]; do sleep 10; done
railway redeploy --service app --from-source --yes        # rebuilds from GitHub main, runs migrations, healthcheck
until [ "$(curl -s -o /dev/null -w '%{http_code}' https://<domain>/api/health)" = "200" ]; do sleep 10; done
curl -s https://<domain>/api/health                       # {"ok":true,"db":"up"}
```

`--from-source` pulls the latest commit or image; plain `redeploy` re-runs the last deployment,
which no longer exists after `railway down`. The volume was never detached, so no data restore is
needed. The MCP `redeploy` tool is an alternative when the CLI is not logged in.

## After tier 3 (project destroyed)

1. Re-provision with the `railway-provision` skill (IaC path): `railway init --name <project>` or
   `railway link`, then `railway config apply --yes`. This recreates `Postgres` and `app`.
2. Restore secrets from the notes saved during teardown (never from chat):
   ```bash
   railway variable set "SESSION_SECRET=..." --service app --skip-deploys
   railway variable set "GOOGLE_CLIENT_ID=..." --service app --skip-deploys
   printf '%s' "$GOOGLE_CLIENT_SECRET" | railway variable set GOOGLE_CLIENT_SECRET --stdin --service app --skip-deploys
   ```
3. Domain and OAuth:
   ```bash
   railway domain --service app                            # new *.up.railway.app domain
   railway variable set "APP_URL=https://<new-domain>" --service app
   ```
   Then **the user** adds `https://<new-domain>/api/auth/google/callback` to the Google OAuth
   client's authorised redirect URIs (Cloud Console; no API). Until then login fails with
   `redirect_uri_mismatch`.
4. Restore the database once the app has deployed (migrations create the schema; the dump has data).
   Same mechanics as the backup: temporary TCP proxy (MCP `create-tcp-proxy` on Postgres:5432, read the
   endpoint with `list-tcp-proxies`) and a Postgres 18 client in Docker, then `delete-tcp-proxy`:
   ```bash
   export PGPASSWORD="$(railway variable list --service Postgres --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).PGPASSWORD))')"
   docker run --rm -i -e PGPASSWORD postgres:18-alpine pg_restore -h <proxy-host> -p <proxy-port> -U postgres -d railway --data-only --no-owner < ignore/backup-<ts>.dump
   ```
   Use `--clean --if-exists` instead of `--data-only` if the dump should fully replace the schema
   (then run `railway redeploy --service app --from-source --yes` afterwards so migrations are re-checked).
5. Verify as in `railway-provision`: health, JSON 404 on `/api/nope`, SPA on `/`, OAuth start 302,
   `railway config plan` reports no drift.

## Report back

Path taken, deployment ids or statuses, health check result, whether the domain changed and, if so,
the exact redirect URI the user must add to Google.
