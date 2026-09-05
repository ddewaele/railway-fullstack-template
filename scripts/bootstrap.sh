#!/usr/bin/env bash
# Bootstraps a fresh copy of this template: GitHub repo + rules, Railway project,
# infrastructure, public domain. Idempotent where the underlying tools allow it.
#
# Prerequisites (one-time, interactive):
#   gh auth login            (scopes: repo, workflow)
#   railway login
#
# Usage:
#   scripts/bootstrap.sh <github-owner/repo> [railway-project-name]
set -euo pipefail

REPO="${1:?usage: scripts/bootstrap.sh <owner/repo> [railway-project-name]}"
PROJECT="${2:-${REPO#*/}}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "Preflight"
bash .claude/skills/preflight/preflight.sh --repo "$REPO" || { echo "Fix the ❌ rows above, then rerun."; exit 1; }

step "Checking tools"
for t in gh railway pnpm node openssl; do command -v "$t" >/dev/null || { echo "missing: $t"; exit 1; }; done
gh auth status >/dev/null
railway whoami >/dev/null || { echo "run: railway login"; exit 1; }

step "Pointing .railway/railway.ts at $REPO"
sed -i.bak -E "s#^const REPO = \".*\";#const REPO = \"$REPO\";#" .railway/railway.ts && rm -f .railway/railway.ts.bak

step "GitHub repository $REPO"
# Order matters: create -> HTTPS remote -> push -> settings -> ruleset. `--push` would use gh's git
# protocol (often SSH, possibly another account's key), and a ruleset created before the first push
# rejects that push ("push declined due to repository rule violations").
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public >/dev/null
fi
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$REPO.git"
else
  git remote add origin "https://github.com/$REPO.git"
fi
git config credential.helper '!gh auth git-credential'   # repo-local: HTTPS pushes use gh's token
git push -u origin "$(git branch --show-current)"
gh api -X PATCH "repos/$REPO" -f allow_auto_merge=true -f delete_branch_on_merge=true \
  -f allow_merge_commit=false -f allow_rebase_merge=false -f allow_squash_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null
if ! gh api "repos/$REPO/rulesets" --jq '.[].name' | grep -qx protect-main; then
  gh api -X POST "repos/$REPO/rulesets" --input - >/dev/null <<'JSON'
{"name":"protect-main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["~DEFAULT_BRANCH"],"exclude":[]}},
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false,"allowed_merge_methods":["squash"]}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"do_not_enforce_on_create":false,"required_status_checks":[{"context":"ci"}]}}],
 "bypass_actors":[]}
JSON
fi

step "Railway project $PROJECT"
if ! railway status --json >/dev/null 2>&1; then
  railway init --name "$PROJECT"
fi

step "Applying infrastructure (.railway/railway.ts)"
railway config apply --yes --verbose

step "Verifying the live environment matches the file"
# The Postgres template deploy has been seen to ignore `region` and land in Railway's default.
# Right after the first apply the database is empty, so a destructive move costs nothing; later it
# would drop data. Exit code 2 = changes pending.
if railway config plan --detailed-exit-code >/dev/null 2>&1; then
  echo "No drift."
else
  echo "Drift right after apply (typically the database region). Applying while the database is still empty:"
  railway config plan --verbose
  railway config apply --yes --confirm-destructive --verbose
  railway config plan --detailed-exit-code || { echo "Still drifting; inspect with: railway config plan --verbose"; exit 1; }
fi

step "Secrets (only set when absent)"
existing="$(railway variable list --service app --json 2>/dev/null || echo '{}')"
if ! grep -q SESSION_SECRET <<<"$existing"; then
  railway variable set "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')" --service app --skip-deploys
fi

step "Public domain"
# `railway domain --json` returns {"domain":"https://..."} WITH the scheme; strip it, then add exactly one.
DOMAIN="$(railway domain --service app --json 2>/dev/null | jq -r '.domain // empty' | sed -E 's#^https?://##; s#/*$##')"
if [ -n "$DOMAIN" ]; then
  railway variable set "APP_URL=https://$DOMAIN" --service app
  got="$(railway variable list --service app --json | jq -r '.APP_URL // empty')"
  if [ "$got" != "https://$DOMAIN" ]; then
    echo "APP_URL read-back mismatch: wanted https://$DOMAIN, got '$got'"; exit 1
  fi
  echo "APP_URL = $got (verified)"
else
  echo "Could not determine the generated domain; set APP_URL manually and read it back."
  DOMAIN="<your-service>.up.railway.app"
fi

cat <<EOT

Done. Remaining manual steps:
  1. Create a Google OAuth 2.0 Web client (https://console.cloud.google.com/apis/credentials) with redirect URIs:
       https://$DOMAIN/api/auth/google/callback
       http://localhost:5173/api/auth/google/callback
     then: railway variable set "GOOGLE_CLIENT_ID=..." --service app --skip-deploys
           printf '%s' "<secret>" | railway variable set GOOGLE_CLIENT_SECRET --stdin --service app   # this one redeploys
     verify: curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://$DOMAIN/api/auth/google
             -> 302 and a redirect_uri of exactly https://$DOMAIN/api/auth/google/callback; then sign in once for real.
  2. Create a Railway project token (production) and store it for the IaC workflow:
       gh secret set RAILWAY_TOKEN --repo $REPO
  3. Ensure your gh token has the 'workflow' scope (gh auth refresh -s workflow) so PRs
     touching .github/workflows can be merged from the CLI.
EOT
