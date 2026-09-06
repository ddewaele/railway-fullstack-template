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

1. **Backup first**, through an SSH tunnel so no public TCP proxy is needed:
   ```bash
   railway connect Postgres --tunnel-only --port 15432 &   # prints local connection details
   sleep 5
   PGPASSWORD="$(railway variable list --service Postgres --json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).PGPASSWORD))')" \
     pg_dump -h localhost -p 15432 -U postgres -d railway -Fc -f "backup-$(date +%Y%m%d-%H%M).dump"
   kill %1
   ls -la backup-*.dump                                     # must be > 0 bytes
   ```
   (User/database names come from the service variables `PGUSER`/`PGDATABASE`; check them if the
   defaults above do not match.) Keep the dump outside the repo or in `ignore/`; it contains user data.
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
   railway delete --project <projectId> --yes               # add --2fa-code <code> if 2FA is enabled
   ```
   Alternative through IaC (keeps the empty project): set `resources: []` in `.railway/railway.ts`
   and run `railway config apply --yes --confirm-destructive`; revert the file afterwards so the
   repo still describes the intended environment.
4. Tell the user explicitly: the generated `*.up.railway.app` domain is gone. Re-provisioning yields
   a new one, and the Google OAuth client's authorised redirect URI must be updated by hand.

## Report back

Tier applied, commands run, backup file path and size (tiers 2/3), current `railway status`, and
the exact restore command or skill to use.
