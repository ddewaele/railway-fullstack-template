# Workflow retrospective

A critical look at how this template was built in one agent-driven session (2026-09-05): what went
wrong, why, what it cost, and what would have prevented it. Written to make the next project faster.

Scale of the session: 14 PRs, ~3.5 hours wall clock, 8 feature branches, 3 background waits per PR.
Roughly a third of the tool calls were retries, diagnostics or fixes for the incidents below.

## 1. Incidents

Ordered by how much time they cost. **Cost** is a rough estimate of wasted round trips.

| #   | Incident                                                                                                                                                                                                                      | Root cause                                                                                                                                                                   | Cost                                                                                              | Prevention                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Railway CLI needs an interactive login**, discovered after the plan (IaC via CLI) was approved. Provisioning had to pivot to the Railway MCP mid-flight, and the IaC file could not be verified with `railway config plan`. | Tool inventory checked _presence_ of tools, not _authentication state_. `gh auth status` was checked; the Railway CLI was not even installed at inventory time.              | High: plan deviation, extra explanation, unverified IaC.                                          | Preflight must check auth for every tool the plan depends on (`railway whoami`, `gh auth status`, `gcloud auth list`). Any interactive login goes into the plan as **step 0 for the user**, requested while the agent scaffolds code.                  |
| 2   | **`gh` token lacked the `workflow` scope.** Merging a Dependabot PR that touched `ci.yml` was refused; my own workflow-touching PRs only merged because auto-merge was armed before CI finished.                              | The scope list (`gist, read:org, repo`) was printed in the very first inventory command and not compared against what the plan needed (creating and merging workflow files). | Medium: one PR still open for the user, extra caution on every later PR.                          | Preflight compares scopes against a required list and asks for `gh auth refresh -s workflow` up front.                                                                                                                                                 |
| 3   | **Concurrent PRs went stale** (`BEHIND`) under strict required checks; Dependabot PRs merging in between made it worse. Tried to enable a merge queue, which is unavailable on user-owned repos.                              | Did not know the GitHub plan constraints (no merge queue for personal repos) before designing the ruleset; opened Dependabot config in PR #1 so bot PRs arrived immediately. | Medium: two manual `update-branch` calls, a failed ruleset update, relaxing to non-strict checks. | Decide `strict=false` up front for solo/agent repos. Add `dependabot.yml` in the **last** PR, or set `open-pull-requests-limit: 0` until the feature work is done.                                                                                     |
| 4   | **Auto-merge armed on the wrong PR.** `gh pr merge 2 --auto` targeted a Dependabot PR because I assumed my PR would be #2; it was #7.                                                                                         | Hardcoded PR numbers instead of reading the number returned by `gh pr create`.                                                                                               | Low-medium: an unintended (but green) merge, extra triage.                                        | Always capture the URL/number from `gh pr create --json number` and use it. Never assume sequence numbers.                                                                                                                                             |
| 5   | **SPA fallback swallowed `/api/*`**, returning `index.html` instead of a JSON 404. The test for this passed only because `apps/web/dist` did not exist yet.                                                                   | Route precedence bug plus a test that depended on an absent artifact.                                                                                                        | Medium: found late by a manual `curl`, fixed in a later PR.                                       | Tests for static serving must run against a real or fixture `dist/`. Add a negative test for every "catch-all" route. Run the production entry point (`pnpm build && pnpm start`) as part of each PR's local verification, not only once.              |
| 6   | **Railway config workflow ran red** on PR #11 (missing `RAILWAY_TOKEN`), needing PR #13 to add a guard.                                                                                                                       | Predictable: the secret cannot exist before the token is created manually.                                                                                                   | Low-medium: one extra PR.                                                                         | Any workflow that depends on a secret gets the "skip with notice when empty" guard from day one.                                                                                                                                                       |
| 7   | **Region change rejected: "Your plan can only deploy to a single region".** The staged patch added `ams` without nulling `us-west2`.                                                                                          | Instruction to the Railway agent was less explicit the second time; did not inspect the staged config before commit; did not know Hobby is single-region.                    | Low-medium: user saw an upgrade prompt, one more agent round trip.                                | Know the plan limits (Hobby: one region per service). When patching `multiRegionConfig`, always send `{old: null, new: {...}}`. Read back staged config before committing. Better: choose the region at service creation instead of moving afterwards. |
| 8   | **Docker port 5432 already in use** by another project's Postgres.                                                                                                                                                            | The inventory output listed that container and I ignored it; the template used the default port.                                                                             | Low: one failed `docker compose up`, remap to 5433.                                               | Template defaults to a non-standard port (now 5433, configurable). Preflight checks `lsof -i :5433`.                                                                                                                                                   |
| 9   | **Shell working directory drifted** into `apps/server`; three files were written to a nested wrong path.                                                                                                                      | A previous command used `cd apps/server && ...`; the Bash tool persists cwd between calls.                                                                                   | Low: detect, move files, rewrite.                                                                 | Never `cd` in tool commands; use absolute paths or `(cd dir && cmd)` subshells.                                                                                                                                                                        |
| 10  | **User's private `ignore/` notes were committed** (caught before push).                                                                                                                                                       | `git add -A` on an untracked tree without reviewing `git status` first; the folder appeared after the initial `ls`.                                                          | Low, but potentially serious (would have published personal notes).                               | Review `git status --short` before the first commit; add ignore patterns for known local folders first; prefer explicit `git add <paths>` for the initial commit.                                                                                      |
| 11  | **Missing `mkdir` before writing `packages/shared/src/*`** — heredocs failed, initial commit lacked the files, needed an amend.                                                                                               | Wrote many files in one script without creating every parent directory.                                                                                                      | Low.                                                                                              | `mkdir -p` every target directory at the top of a file-writing script; check the script's exit code, not just the last command's.                                                                                                                      |
| 12  | **e2e flakiness on first run**: shared DB connection closed by one spec's `afterAll`; a real race (input cleared after the request); `check()` on a controlled checkbox.                                                      | Playwright worker/module model not considered; the race was a genuine UX bug the suite found.                                                                                | Low-medium (3 reruns). The race was a _win_ for the tests.                                        | Never call `sql.end()` in a spec when the module is shared; use `click()` + `expect(...).toBeChecked()` for async controlled inputs.                                                                                                                   |
| 13  | **Testing Library cleanup missing** (multiple elements found) because Vitest globals are off.                                                                                                                                 | Known gotcha not applied.                                                                                                                                                    | Low.                                                                                              | Template now has `afterEach(cleanup)` in `apps/web/src/test/setup.ts`.                                                                                                                                                                                 |
| 14  | **GitHub MCP could not connect** ("does not support dynamic client registration").                                                                                                                                            | GitHub's remote MCP wants a bearer token, not OAuth.                                                                                                                         | Low.                                                                                              | Register it with `--header 'Authorization: Bearer ${GH_TOKEN}'` from the start (now in MANUAL_STEPS.md).                                                                                                                                               |
| 15  | **MCP servers added mid-session were not usable** (Playwright MCP tools never appeared).                                                                                                                                      | MCP servers load at session start.                                                                                                                                           | Low: fell back to the local Playwright CLI for the live screenshot.                               | Add MCP servers, then restart the session, _before_ the work that needs them.                                                                                                                                                                          |
| 16  | **Postgres MCP could not target Railway**: variable values are redacted for OAuth MCP clients and there was no TCP proxy.                                                                                                     | Assumed the MCP could read `DATABASE_PUBLIC_URL`.                                                                                                                            | Low: pointed it at the local database instead.                                                    | Treat secret retrieval as CLI/dashboard-only. Decide explicitly whether a public TCP proxy is acceptable.                                                                                                                                              |
| 17  | **Verbose commits on `main`** surprised the user (PR body as squash commit message).                                                                                                                                          | Deliberate setting, not communicated.                                                                                                                                        | Low.                                                                                              | State merge-message policy in the plan; offer `PR_TITLE` only.                                                                                                                                                                                         |

## 2. Patterns behind the incidents

1. **Inventory checked presence, not readiness.** Tools, auth, scopes, ports and plan limits (GitHub personal repo, Railway Hobby) all had signals available at minute one. Four incidents (#1, #2, #3, #8) trace back to not acting on them.
2. **Assumptions instead of reading return values** (#4, #7, #11). Every CLI here returns the thing that was assumed.
3. **Tests that passed for the wrong reason** (#5). A passing test against a missing artifact is a false positive; production-shaped verification found it.
4. **Working ahead of merges with a chain of rebased branches** saved wall-clock time but added risk and cognitive load. It worked, and each PR stayed small, but it required three `rebase --onto` operations and one stash dance (#9 happened during this).
5. **Bots and automation started too early.** Dependabot, strict checks and auto-merge interacted before the base workflow had settled (#3, #4).

## 3. What would have made it faster

### A preflight script (now bundled in the `preflight` skill as `.claude/skills/preflight/preflight.sh`)

Runs before planning and prints a readiness table:

```bash
gh auth status                              # account
gh auth status 2>&1 | grep -q workflow      # scope needed to merge workflow PRs
railway whoami                              # CLI logged in?
docker ps --format '{{.Ports}}' | grep 5433 # port free?
gh api user --jq .plan.name                 # personal vs org -> merge queue availability
node -v; pnpm -v                            # versions vs .nvmrc / packageManager
```

Anything red becomes a user task listed at the top of the plan, to be done while the agent scaffolds.

### Plan-level changes

- Put every interactive login in **step 0 of the plan**, not step 3.
- Decide ruleset strictness, merge-message policy and Dependabot timing explicitly in the plan.
- Provision infrastructure **before** writing the last feature, so deploy feedback arrives while there is still time to react (here the first deploy exposed the missing "not configured" handling and the 500 → 503 change).
- Pick the region at creation time; never move services afterwards.

### Execution-level changes

- Capture identifiers from tool output (`--json`) instead of assuming them.
- Read staged/remote state back before committing it (Railway staged patches, ruleset payloads).
- Verify each PR with the production entry point (`pnpm build && pnpm start` + `curl`), not only unit tests.
- Use absolute paths in every shell command; no `cd`.
- `git status` before the first commit; explicit `git add` paths.
- Guard every workflow that needs a secret with a "skip when empty" step from the first version.

### Template-level changes already made because of this session

- Postgres on a non-default port, separate `app_test` database.
- `afterEach(cleanup)` in the web test setup.
- SPA fallback excludes `/api/*` and is covered by a test that runs against a built `dist/`.
- 503 with a clear message when OAuth is not configured; `HTTPException`s keep their status.
- Railway config workflow skips with a notice without `RAILWAY_TOKEN`.
- `MANUAL_STEPS.md` lists every human step with commands.

## 4. What went well

- Feature-branch → PR → CI → auto-squash-merge worked for all 14 PRs; nothing was force-merged and every merge had a green `ci` run.
- The test pyramid caught two real bugs before users did (SPA fallback via manual curl, the add-todo race via Playwright).
- Provisioning through the Railway MCP took under ten minutes once the CLI-login constraint was accepted, and the first deploy succeeded on the first try (migrations in pre-deploy, healthcheck gating).
- Explicit env validation failed fast and made misconfiguration visible instead of mysterious.

## 5. Checklist for the next project

- [ ] Run preflight; hand the user the interactive logins and scope refreshes first.
- [ ] Confirm platform limits: GitHub plan (rulesets, merge queue), Railway plan (regions), CDN/registry access.
- [ ] Add MCP servers needed for verification, then restart the session.
- [ ] Plan: strictness, merge message policy, Dependabot timing, region, secrets guard.
- [ ] Scaffold with `mkdir -p` + absolute paths; `git status` before first commit.
- [ ] Each PR: `pnpm check`, `pnpm build && pnpm start` smoke test, then open PR and arm auto-merge using the returned PR number.
- [ ] Provision infra as soon as the health endpoint exists; iterate on deploy feedback in parallel with features.
- [ ] Verify IaC against live state (`railway config plan`) before declaring done.
