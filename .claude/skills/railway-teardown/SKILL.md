---
name: railway-teardown
description: >
  Stop or remove the Railway deployment to cut cost, at the right level: pause the app (zero compute,
  keep domain/variables/data), stop everything including Postgres (keep the volume and data), or
  destroy the project after a database backup. Use when the user says "tear down", "stop railway",
  "pause the deployment", "cut railway cost", "shut it down for now", "delete the railway project".
allowed-tools: Bash, AskUserQuestion, Read, mcp__railway__*
---

# Railway teardown

Three tiers. Always confirm the tier with AskUserQuestion before running anything, and never skip the
backup step in tiers 2 and 3. Everything below assumes `railway login` and `railway link` are done
(check with `railway status`); otherwise use `-p <projectId> -e production` on every command.

| Tier      | What stops                      | What survives                                                     | Residual cost             | Restore                           |
| --------- | ------------------------------- | ----------------------------------------------------------------- | ------------------------- | --------------------------------- |
| 1 Pause   | `app` container                 | project, both services, domain, variables, Postgres running, data | Postgres compute + volume | seconds                           |
| 2 Stop    | `app` and `Postgres` containers | project, services, domain, variables, **volume with data**        | volume storage only       | minutes                           |
| 3 Destroy | everything                      | nothing on Railway (backup file locally)                          | none                      | full re-provision, **new domain** |

Cost context (Hobby): compute is billed per running container; a removed deployment costs nothing;
the Postgres volume is billed per GB regardless. Tier 2 is the usual answer to "cut cost but keep it".

## Tier 1: pause the app

```bash
railway down --service app --yes          # removes the active deployment; service keeps domain + vars
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/health   # expect 404/502 now
```

Verified on this project: `railway redeploy --service app --from-source --yes` brings it back
(rebuilds from the connected GitHub `main`), healthcheck passes, same domain.

## Tier 2: stop app and Postgres (keep data)

1. **Backup first.** Two things learned running this for real: `railway ssh` needs an SSH key that a
   human has linked to the Railway account (registering it with `railway ssh keys add` is not enough,
   the first connection returns a `signup_required` URL), and a local `pg_dump` older than the server
   (Hobby template runs Postgres 18) refuses to dump. The reliable path is a **temporary TCP proxy**
   plus a matching client in Docker:
   ```bash
   # 1) expose Postgres briefly: MCP create-tcp-proxy (service Postgres, port 5432) or dashboard → Networking → TCP Proxy
   #    then read the endpoint: MCP list-tcp-proxies → e.g. altaria.proxy.rlwy.net:38619
   export PGPASSWORD="$(railway variable list --service Postgres --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).PGPASSWORD))')"
   H=<proxy-host>; P=<proxy-port>; TS=$(date +%Y%m%d-%H%M); mkdir -p ignore
   until docker run --rm -e PGPASSWORD postgres:18-alpine pg_isready -h $H -p $P -U postgres | grep -q accepting; do sleep 5; done
   docker run --rm -e PGPASSWORD postgres:18-alpine pg_dump -h $H -p $P -U postgres -d railway -Fc > ignore/backup-$TS.dump
   docker run --rm -e PGPASSWORD postgres:18-alpine pg_dump -h $H -p $P -U postgres -d railway -Fp > ignore/backup-$TS.sql
   chmod 600 ignore/backup-$TS.*
   docker run --rm -i postgres:18-alpine pg_restore -l < ignore/backup-$TS.dump | grep -c "TABLE DATA"   # expect 4 (3 tables + drizzle migrations)
   docker run --rm -e PGPASSWORD postgres:18-alpine psql -h $H -p $P -U postgres -d railway -Atc "select 'users',count(*) from users union all select 'todos',count(*) from todos"
   # 2) close the door again: MCP delete-tcp-proxy (port 5432)
   ```
   `PGUSER`/`PGDATABASE` are `postgres`/`railway` on the official template; check the service variables
   if yours differ. The proxy exposes the database publicly (password-protected) for the minute this
   takes; delete it immediately afterwards. Keep dumps in `ignore/` (git-ignored); they contain user data.
2. Remove both deployments:
   ```bash
   railway down --service app --yes
   railway down --service Postgres --yes
   railway status                                           # both services: no active deployment
   ```
   The volume stays attached to the Postgres service, so the data is intact for `railway-restore`.

## Tier 3: destroy the project

1. Take the backup exactly as in tier 2.
2. Note everything the restore will need and save it in `ignore/railway-restore-notes.md`:
   `railway variable list --service app --json` (contains secrets: keep local), the current domain,
   and the Google OAuth client's redirect URIs.
3. Delete:
   ```bash
   railway delete --project <projectId> --yes --json        # add --2fa-code <code> if 2FA is enabled
   railway status                                           # "Project is deleted"; MCP get-status → "Project not found"
   railway unlink
   ```
   Railway soft-deletes: `railway list --json` keeps showing the project with a `deletedAt` about 48 h
   in the future (grace period). The domain answers 404 immediately.
   Alternative through IaC (keeps the empty project): set `resources: []` in `.railway/railway.ts`
   and run `railway config apply --yes --confirm-destructive`; revert the file afterwards so the
   repo still describes the intended environment.
4. Tell the user explicitly: the generated `*.up.railway.app` domain is gone. Re-provisioning yields
   a new one, and the Google OAuth client's authorised redirect URI must be updated by hand.

## Report back

Tier applied, commands run, backup file path and size (tiers 2/3), current `railway status`, and
the exact restore command or skill to use.
