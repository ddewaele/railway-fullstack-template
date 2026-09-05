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
5. Only then move to planning. Put the user tasks as **step 0** of the plan and reference them.

## Rules

- Never fix a ❌ by working around it silently (e.g. switching from CLI to MCP provisioning) without
  telling the user; state the trade-off and let them choose.
- Compare scopes against what the plan needs, not against "logged in".
- If MCP servers are added during this step, remind the user the session must be restarted before
  their tools appear.
- Record the results (account, region, plan constraints) in the plan so later steps do not re-derive them.
- Keep `preflight.sh` read-only. It reports; it never installs, logs in or edits files.
