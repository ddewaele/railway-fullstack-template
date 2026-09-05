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

## Files in this skill

- `preflight.sh`: the read-only checker. It sits next to this file so the skill works both as a
  project skill (`.claude/skills/preflight/`) and as a user skill (`~/.claude/skills/preflight/`).

## Steps

1. Locate and run the script from the project root. Try the project copy first, then the user copy:
   ```bash
   S=.claude/skills/preflight/preflight.sh; [ -f "$S" ] || S=~/.claude/skills/preflight/preflight.sh
   bash "$S" --repo <owner/name> --port 5433        # add --railway-project <id> when known
   ```
   The script changes to the git root itself, so it can be invoked from any subdirectory.
2. Read the table. Every ❌ is something automation cannot do (browser login, scope refresh, port
   conflict, missing daemon) and makes the script exit 1. Every ⚠️ is a decision or a caveat.
3. Ask the user, with AskUserQuestion, the decisions that change the plan and cannot be inferred:
   - Which GitHub account (if the SSH identity and `gh` account differ) and public vs private repo.
   - Whether a merge queue is available (org-owned repo) or the ruleset should use non-strict checks.
   - Railway region (pick once; Hobby plans cannot move a service later without a single-region patch;
     region ids are short codes such as `ams`, `iad`, `sin`).
   - Whether a public TCP proxy on Postgres is acceptable (needed for a Postgres MCP against Railway).
4. Produce a **"Do this now" list** for the user, in copy-paste form, covering every ❌:
   `gh auth login`, `gh auth refresh -s workflow`, `railway login`, `docker start`, freeing a port,
   creating the Google OAuth client (console link + both redirect URIs), `export GH_TOKEN=...`.
   Tell them these can run while the agent scaffolds code, and which later steps block on each.
5. Turn every ⚠️ into a concrete guard in the very next command that could trip on it. Examples from
   past runs: SSH identity ≠ `gh` account → create the repo **without** `--push`, set an HTTPS remote
   and a repo-local `credential.helper '!gh auth git-credential'`, then push; a stale Docker volume
   for this directory name → `docker compose down -v` before `up`; occupied ports → pick the new
   ports once and use them everywhere (compose, `.env.example`, Vite proxy, docs).
6. Only then move to planning. Put the user tasks as **step 0** of the plan and reference them.

## Plan approval (do not skip)

The user approves the plan **once**, so they must actually see it. Writing it to a plan file is not
showing it; exiting plan mode is not approval.

1. Resolve placeholders first. If the brief still contains `<owner>/<repo>`, `<workspace>`,
   `<region>` or an unstated merge-message policy, ask them in **one** AskUserQuestion together with
   any preflight decisions from step 3. Recommend a default for each.
2. Post the plan **in the chat** as a compact document: step 0 (user tasks with what they block),
   branch sequence, provisioning path (CLI IaC or MCP, and why), merge-message policy, Dependabot
   timing, verification section. A file path is not enough.
3. Wait for an explicit "yes" (AskUserQuestion with an "Approve plan" option, or the ExitPlanMode
   approval). Until then: no writes, no repo creation, no `railway init`.
4. After approval, report only decisions that change the plan and steps only the user can do, plus a
   one-line status every few tool calls so long silent stretches do not look like a hang.

## Rules

- Never fix a ❌ by working around it silently (e.g. switching from CLI to MCP provisioning) without
  telling the user; state the trade-off and let them choose.
- Compare scopes against what the plan needs, not against "logged in".
- If MCP servers are added during this step, remind the user the session must be restarted before
  their tools appear.
- Record the results (account, region, plan constraints) in the plan so later steps do not re-derive them.
- Keep `preflight.sh` read-only. It reports; it never installs, logs in or edits files.
