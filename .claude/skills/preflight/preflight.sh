#!/usr/bin/env bash
# Readiness check for building/deploying this stack. Prints a table and exits 1 if
# anything the automated workflow depends on is missing. Read-only: changes nothing.
#
# Lives inside the `preflight` skill so it travels with it (project or ~/.claude/skills).
# Usage: bash .claude/skills/preflight/preflight.sh [--port 5433] [--repo owner/name] [--railway-project <id>]
#   or:  bash ~/.claude/skills/preflight/preflight.sh ...   (from any project directory)
set -uo pipefail

# Run project checks (.nvmrc, .env, docker compose, git identity) from the repo root when inside one.
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

PORT=5433; REPO=""; RW_PROJECT=""
while [ $# -gt 0 ]; do case "$1" in
  --port) PORT="$2"; shift 2;; --repo) REPO="$2"; shift 2;; --railway-project) RW_PROJECT="$2"; shift 2;;
  *) echo "unknown arg $1"; exit 2;; esac; done

fail=0
row() { # status name detail
  local icon; case "$1" in ok) icon="✅";; warn) icon="⚠️ ";; fail) icon="❌"; fail=1;; esac
  printf '%s %-28s %s\n' "$icon" "$2" "$3"
}
have() { command -v "$1" >/dev/null 2>&1; }

echo "== Tools =="
for t in node pnpm git gh railway docker openssl; do
  if have "$t"; then row ok "$t" "$($t --version 2>&1 | head -1)"; else row fail "$t" "missing"; fi
done
if have node; then
  want=$(cat .nvmrc 2>/dev/null || echo 22); got=$(node -v | sed 's/^v//' | cut -d. -f1)
  [ "$got" = "$want" ] && row ok "node version" "matches .nvmrc ($want)" || row warn "node version" "have $got, .nvmrc wants $want"
fi

echo; echo "== GitHub =="
if have gh && gh auth status >/dev/null 2>&1; then
  acct=$(gh api user --jq .login 2>/dev/null); row ok "gh auth" "logged in as $acct"
  scopes=$(gh auth status 2>&1 | grep -oE "Token scopes: .*" | head -1)
  echo "$scopes" | grep -q "'repo'"     && row ok "scope: repo" "present"     || row fail "scope: repo" "missing -> gh auth refresh -s repo"
  echo "$scopes" | grep -q "'workflow'" && row ok "scope: workflow" "present" || row fail "scope: workflow" "missing -> gh auth refresh -s workflow (needed to merge PRs touching .github/workflows)"
  plan=$(gh api user --jq '.plan.name // "free"' 2>/dev/null); row warn "account plan" "$plan: merge queues need an org-owned repo; personal repos -> use non-strict required checks"
  if [ -n "$REPO" ]; then
    gh repo view "$REPO" >/dev/null 2>&1 && row warn "repo $REPO" "already exists (bootstrap will reuse it)" || row ok "repo $REPO" "free to create"
  fi
  sshid=$(ssh -T git@github.com 2>&1 | grep -oE "Hi [^!]+" | cut -d' ' -f2)
  [ -n "$sshid" ] && [ "$sshid" != "$acct" ] && row warn "ssh identity" "SSH key is '$sshid' but gh is '$acct' -> use an HTTPS remote + repo-local user.email"
  git config user.email >/dev/null 2>&1 && row ok "git user.email" "$(git config user.email)" || row warn "git user.email" "unset"
else
  row fail "gh auth" "run: gh auth login"
fi

echo; echo "== Railway =="
if have railway; then
  if railway whoami >/dev/null 2>&1; then row ok "railway auth" "$(railway whoami 2>/dev/null | head -1)"; else row fail "railway auth" "run: railway login (interactive) or export RAILWAY_TOKEN"; fi
  if railway status >/dev/null 2>&1; then row ok "railway link" "directory is linked"; else row warn "railway link" "not linked -> railway link${RW_PROJECT:+ -p $RW_PROJECT} -e production"; fi
  row warn "railway plan limits" "Hobby: one region per service; pick the region at creation, never add a second one"
fi

echo; echo "== Local services =="
if have docker && docker info >/dev/null 2>&1; then
  row ok "docker daemon" "running"
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    if docker compose ps --status running 2>/dev/null | grep -q postgres; then row ok "port $PORT" "used by this project's Postgres"; else row fail "port $PORT" "in use by something else -> set POSTGRES_PORT or stop it"; fi
  else row ok "port $PORT" "free"; fi
else row fail "docker daemon" "not running"; fi
[ -f .env ] && row ok ".env" "present (git-ignored)" || row warn ".env" "missing -> cp .env.example .env"
if [ -f .env ]; then
  grep -qE '^GOOGLE_CLIENT_ID=.+' .env && row ok "GOOGLE_CLIENT_ID" "set in .env" || row warn "GOOGLE_CLIENT_ID" "empty -> Google Cloud Console (manual, see MANUAL_STEPS.md §4)"
fi

echo; echo "== Claude Code MCP servers =="
if have claude; then
  for s in railway playwright github postgres; do
    if claude mcp get "$s" >/dev/null 2>&1; then row ok "mcp: $s" "configured (restart the session if added just now)"; else row warn "mcp: $s" "not configured (MANUAL_STEPS.md §9)"; fi
  done
  [ -n "${GH_TOKEN:-}" ] && row ok "GH_TOKEN" "exported (GitHub MCP)" || row warn "GH_TOKEN" "not exported -> export GH_TOKEN=\"\$(gh auth token)\""
fi

echo
if [ $fail -eq 0 ]; then echo "Preflight passed. ⚠️  rows are advisory."; else echo "Preflight FAILED: fix ❌ rows before starting (they are interactive/manual and block automation)."; fi
exit $fail
