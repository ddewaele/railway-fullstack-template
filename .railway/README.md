# Railway configuration

`railway.ts` is the single source of truth for the Railway environment
(database, app service, variables). It is evaluated by the Railway CLI.

| Task                                        | Command                       |
| ------------------------------------------- | ----------------------------- |
| Preview drift between this file and Railway | `railway config plan`         |
| Apply the file to the linked environment    | `railway config apply`        |
| Import the live environment into this file  | `railway config pull --force` |

In CI, `.github/workflows/railway-config.yml` posts a plan on every pull
request that touches this directory and applies the reviewed plan on merge.
It needs a `RAILWAY_TOKEN` repository secret (a project token for the
production environment).
