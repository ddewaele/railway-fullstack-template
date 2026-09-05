---
name: preflight
description: >
  Guided readiness checklist before building or deploying a Vite + Hono + Postgres + Railway app.
  Use at the very start of a project, before planning, or whenever the user says "preflight",
  "are we ready", "check my setup", "what do I need before we start". Verifies tools, auth state,
  gh token scopes, Railway login, free ports, MCP servers and platform plan limits, then hands the
  user the interactive steps that only they can do.
allowed-tools: Bash, AskUserQuestion, Read
---

# Preflight

Presence of a tool is not readiness. Most wasted time in past sessions came from discovering an
interactive login, a missing token scope, an occupied port or a platform limit _after_ the plan was
approved. This skill front-loads those discoveries.

## Steps

1. Run `scripts/preflight.sh` (add `--repo <owner/name>` if the target repo name is known, and
   `--port <n>` if the project uses a non-default Postgres port). If the script does not exist yet
   (fresh directory), run the equivalent checks by hand: `gh auth status` (account **and** scopes,
   need `repo` + `workflow`), `railway whoami`, `docker info`, `lsof -nP -iTCP:5433 -sTCP:LISTEN`,
   `ssh -T git@github.com` vs `gh api user --jq .login`, `claude mcp list`.
2. Read the table. Every ❌ is something automation cannot do (browser login, scope refresh, port
   conflict, missing daemon). Every ⚠️ is a decision or a caveat.
3. Ask the user, with AskUserQuestion, the decisions that change the plan and cannot be inferred:
   - Which GitHub account (if the SSH identity and `gh` account differ) and public vs private repo.
   - Whether a merge queue is available (org-owned repo) or the ruleset should use non-strict checks.
   - Railway region (pick once; Hobby plans cannot move a service later without a single-region patch).
   - Whether a public TCP proxy on Postgres is acceptable (needed for a Postgres MCP against Railway).
4. Produce a **"Do this now" list** for the user, in copy-paste form, covering every ❌:
   `gh auth login`, `gh auth refresh -s workflow`, `railway login`, `docker start`, freeing a port,
   creating the Google OAuth client (console link + both redirect URIs), `export GH_TOKEN=...`.
   Tell them these can run while the agent scaffolds code, and which later steps block on each.
5. Only then move to planning. Put the user tasks as **step 0** of the plan and reference them.

## Rules

- Never fix a ❌ by working around it silently (e.g. switching from CLI to MCP provisioning) without
  telling the user; state the trade-off and let them choose.
- Compare scopes against what the plan needs, not against "logged in".
- If MCP servers are added during this step, remind the user the session must be restarted before
  their tools appear.
- Record the results (account, region, plan constraints) in the plan so later steps do not re-derive them.
