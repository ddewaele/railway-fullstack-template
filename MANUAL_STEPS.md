# Manual steps

Everything that could not be automated, as copy-pasteable commands. Run from the repo root.
Placeholders: `<owner/repo>` = GitHub repo, `<domain>` = Railway domain (e.g. `app-production-1ce8.up.railway.app`).

## 1. One-time tooling

```bash
brew install gh railway                 # GitHub CLI + Railway CLI
corepack enable                         # pnpm from package.json#packageManager
gh auth login                           # log in with the account that owns the repo
gh auth refresh -s workflow             # needed to merge PRs touching .github/workflows from the CLI
railway login                           # browser device login (interactive, once per machine)
```

## 2. Git identity when you have several GitHub accounts

```bash
git config user.name  "Davy De Waele"
git config user.email "ddewaele@gmail.com"                        # repo-local, not --global
git remote set-url origin https://github.com/<owner/repo>.git      # HTTPS -> uses gh's credential helper
gh auth status                                                     # confirm the active account
```

## 3. Link this directory to the Railway project

```bash
railway link -p 59dd6dc7-8022-4459-9940-a4762db12b50 -e production   # project id from `railway list` / dashboard URL
railway status                                                        # verify project + environment
```

Alternative without login (project token from step 6): `export RAILWAY_TOKEN=<token>`.

## 4. Google OAuth client

Google has no API for this; use the console.

1. https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID → Web application**.
2. Authorised redirect URIs:
   ```
   http://localhost:5173/api/auth/google/callback
   https://<domain>/api/auth/google/callback
   ```
3. Local `.env`:
   ```bash
   cp -n .env.example .env
   # edit GOOGLE_CLIENT_ID=... and GOOGLE_CLIENT_SECRET=...
   ```
4. Railway (reads the values from `.env`, secret via stdin so it stays out of shell history):
   ```bash
   set -a; source .env; set +a
   railway variable set "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID" --service app --skip-deploys
   printf '%s' "$GOOGLE_CLIENT_SECRET" | railway variable set GOOGLE_CLIENT_SECRET --stdin --service app
   railway variable list --service app        # names + values: do not paste the output anywhere
   ```
   Or: Railway dashboard → `app` service → Variables.

## 5. Other Railway variables (already set for this project; needed for a fresh copy)

```bash
railway variable set NODE_ENV=production --service app --skip-deploys
railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --service app --skip-deploys
railway variable set "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')" --service app --skip-deploys
railway domain --service app                                      # generate the public domain (prints it WITH https://)
railway variable set "APP_URL=https://<domain>" --service app     # triggers a redeploy; <domain> without scheme
railway variable list --service app --json | jq -r .APP_URL       # read back: exactly one "https://", no trailing slash
```

A doubled scheme (`https://https://<domain>`) passes a plain URL check but makes Google reject every
login with `Error 400: invalid_request`. Since this change the server refuses to start with such a
value and logs `OAuth redirect URI: …` at boot; check that line in the Railway deploy logs. Variables
set with `--skip-deploys` need a final `railway variable set` without it, or
`railway redeploy --service app --yes`, before the running container sees them.

## 6. Railway project token → GitHub secret (enables the IaC workflow)

1. Railway dashboard → project → **Settings → Tokens** → create a token for environment `production`.
2. Store it (prompts for the value):
   ```bash
   gh secret set RAILWAY_TOKEN --repo <owner/repo>
   ```
3. Verify the IaC file matches the live environment:
   ```bash
   railway config plan            # expect: "Your Railway configuration is already up to date."
   ```

## 7. GitHub repo settings (done by scripts/bootstrap.sh; here for reference)

```bash
gh repo create <owner/repo> --public --source . --remote origin --push
gh api -X PATCH repos/<owner/repo> -f allow_auto_merge=true -f delete_branch_on_merge=true \
  -f allow_merge_commit=false -f allow_rebase_merge=false -f allow_squash_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY -F is_template=true
gh api -X POST repos/<owner/repo>/rulesets --input - <<'JSON'
{"name":"protect-main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["squash"]}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci"}]}}],
 "bypass_actors":[]}
JSON
```

Merge queues are unavailable on user-owned repos, hence `strict_required_status_checks_policy: false`.

## 8. Daily workflow

```bash
git checkout -b feat/<name>
pnpm check && pnpm e2e                                   # what CI runs
git push -u origin feat/<name>
gh pr create --fill
gh pr merge --auto --squash                              # merges when the `ci` check passes; Railway deploys main
```

Dependabot PRs: `gh pr merge <n> --auto --squash` (workflow-file bumps need the `workflow` scope from step 1).

## 9. Claude Code MCP servers (per developer machine)

```bash
claude mcp add railway --transport http https://mcp.railway.com          # then /mcp -> authenticate
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add postgres -- npx -y @bytebase/dbhub --dsn "postgres://app:app@localhost:5433/app"
claude mcp add github --transport http https://api.githubcopilot.com/mcp/ --header 'Authorization: Bearer ${GH_TOKEN}'
echo 'export GH_TOKEN="$(gh auth token)"' >> ~/.zshrc     # GitHub MCP has no OAuth handshake; needs a token
```

Restart `claude` after adding servers. To point the Postgres MCP at Railway instead of Docker, enable a TCP proxy on the
Postgres service (dashboard → Networking), then re-add with `--dsn "$DATABASE_PUBLIC_URL"`. This exposes the database
publicly; `railway connect Postgres` is the alternative for ad-hoc `psql` access.

## 10. Local services

```bash
docker compose up -d          # Postgres on :5433 with app + app_test databases
pnpm db:migrate
pnpm dev                      # server :3000, web :5173
```

## Known gotchas

- Railway region ids are short codes (`ams`, `iad`, `sin`, ...). `europe-west4` is the legacy name; using it in `.railway/railway.ts` shows up as a destructive "move database" in `railway config plan`.
- Railway Hobby allows one region per service. Move a service with `{"<old>": null, "<new>": {"numReplicas": 1}}`; adding a region without removing the old one is rejected as multi-region.
- Some Railway staged changes require 2FA and can only be applied in the dashboard.
- `.env` is git-ignored and only loaded outside production; Railway reads service variables exclusively.
