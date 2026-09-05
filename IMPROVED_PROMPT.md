# Improved prompt: build and deploy a full-stack template end to end

The original request that produced this repo was good but left the agent to discover constraints
mid-flight (interactive logins, token scopes, platform limits, merge-queue availability). The prompt
below front-loads those decisions, names the skills to use, and defines "done" precisely.

Copy everything between the lines. Replace `<...>` placeholders.

---

You are building a new application on my standard stack, using `ddewaele/railway-fullstack-template`
as the reference. Work autonomously; I approve the plan once, then I only want to hear from you for
decisions that change the plan or for steps only I can do.

## Step 0: readiness (do this before planning)

Run the `preflight` skill. Check tools _and_ authentication state _and_ token scopes _and_ free ports
_and_ platform plan limits. Anything interactive (browser logins, `gh auth refresh -s workflow`,
Google OAuth client creation, exporting `GH_TOKEN`) goes into a "do this now" list for me. Start it
immediately and I will complete it while you scaffold. Tell me which later steps block on each item.

Facts you can assume:

- GitHub account: `<owner>` (use HTTPS remotes; my SSH key belongs to another account; set a
  repo-local `user.email`).
- Repo: `<owner>/<repo>`, public, marked as a template repository.
- Railway workspace: `<workspace name>`; region `<europe-west4 | us-west2 | ...>` chosen once at creation.
- Railway plan: Hobby (one region per service). GitHub plan: personal (no merge queue; use a ruleset
  with required check `ci`, non-strict, squash-only, PR required, no reviews required).

## What to build

`<one paragraph: the app, its 2-3 core entities, and the demo flow>`. Google SSO for auth, per-user
data, a minimal UI. Follow the `fullstack-scaffold` skill for structure and conventions; do not
re-debate the fixed decisions in it.

## How to work

- Plan first. If any fact above is still a `<placeholder>`, ask me for it together with the other
  plan-changing decisions in one question. Then **post the full plan in this chat** (not only in a
  plan file) and wait for my explicit approval before creating anything. Include: the user task list
  from preflight as step 0, the feature-branch sequence, the Railway provisioning path (IaC via CLI if
  `railway whoami` works, otherwise MCP, and say which), the merge-message policy, when Dependabot is
  enabled, how much of the reference code you will reuse verbatim, and a verification section.
- Give me a one-line status every few tool calls; announce destructive operations before running them.
- Feature branches, one slice each, in this order: server foundation + CI → auth → domain API → web →
  e2e → infrastructure as code → docs. Use the `ship-feature` skill for every branch: production
  smoke test before PR, PR body written as release notes with screenshots when UI changed,
  auto-merge armed immediately using the PR number returned by `gh pr create`, background wait.
- Provision Railway with the `railway-provision` skill as soon as the health endpoint exists, not at
  the end, so deploy feedback arrives while features are still being built.
- Every workflow that depends on a secret must skip with a notice when the secret is absent.
- Keep secrets out of git and out of this chat. For values I must supply (OAuth client id/secret),
  give me the exact `railway variable set` commands or dashboard path.
- Never `cd` in shell commands; `git status` before the first commit; capture identifiers from tool
  output instead of assuming them.
- After every value you set (Railway variables, repo settings, rulesets, IaC apply) read it back and
  compare it with what you intended before moving on. Copy pinned versions from the reference
  verbatim; never retype them. Chain destructive git commands with `&&`, never `;`.

## Definition of done

1. `main` is green, every PR merged through CI, no force merges.
2. The app is live on Railway: `/api/health` reports the database up, unknown `/api/*` is JSON 404,
   `/` serves the SPA, OAuth start redirects to Google (or 503 "not configured" until I add
   credentials), **and** the deploy log line `OAuth redirect URI: https://<domain>/api/auth/google/callback`
   matches the domain exactly. When I tell you the credentials are set, verify the 302 `redirect_uri`
   before reporting.
3. `.railway/railway.ts` describes the live environment; `railway config plan` shows no drift (or you
   tell me it could not be verified and why).
4. README: architecture, local dev, auth flow, testing strategy, delivery workflow, deployment model,
   "use as template" section. `MANUAL_STEPS.md`: every human step as copy-pasteable commands.
5. A final report: what shipped, what deviated from the plan and why, and the remaining manual steps
   in order with commands.
6. `OPTIMIZE_WORKFLOW.md`: a short retrospective of incidents, retries and what would have prevented
   them, so the next run is faster.

---

## Why this prompt is better than the original

| Original                                                                  | Improved                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "Explore MCP options"                                                     | Names the servers and requires them to be added and the session restarted _before_ work needs them                      |
| Discovered `railway login`, `workflow` scope and port conflicts mid-build | Step 0 preflight with a user task list, started in parallel with scaffolding                                            |
| Stack named, structure open                                               | `fullstack-scaffold` skill fixes structure, ports, test layout and known gotchas                                        |
| "Auto-merge yourself"                                                     | `ship-feature` skill: production smoke test, PR number from output, auto-merge armed before CI ends, no assumed numbers |
| Deploy at the end                                                         | Provision as soon as `/api/health` exists; iterate on deploy feedback                                                   |
| "Explain what is manual"                                                  | `MANUAL_STEPS.md` with commands is part of the definition of done                                                       |
| Constraints implicit                                                      | GitHub plan, Railway plan, region, merge policy, Dependabot timing stated up front                                      |
| Plan approval implied by "approve once"                                   | Plan posted in chat, placeholders resolved in one question, explicit yes before any write (second-run lesson)           |
| "Verify it works" = health 200                                            | Read back every value set; deploy log shows the OAuth redirect URI; post-credentials 302 check (second-run lesson)      |

## Skills shipped with this repo (`.claude/skills/`)

| Skill                | Purpose                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preflight`          | Guided readiness checklist; runs `.claude/skills/preflight/preflight.sh`, asks the plan-changing questions, hands the user their interactive tasks |
| `fullstack-scaffold` | Fixed decisions, feature-slice recipe, gotchas for this stack                                                                                      |
| `ship-feature`       | Branch → verify like production → PR as release notes → auto-merge → sync                                                                          |
| `railway-provision`  | IaC-first, MCP fallback provisioning with the exact order, region rules and verification checklist                                                 |

They are project-scoped and self-contained (the preflight checker ships inside its skill directory). To reuse them everywhere, copy the directories to `~/.claude/skills/`:

```bash
curl -sL https://github.com/ddewaele/railway-fullstack-template/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=3 -C ~/.claude/skills railway-fullstack-template-main/.claude/skills
```
