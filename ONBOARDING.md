# Welcome to Railway Fullstack Template

## How We Use Claude

Based on Davy De Waele's usage over the last 30 days:

Work Type Breakdown:
Build Feature ████████████░░░░░░░░ 60%
Write Docs ████░░░░░░░░░░░░░░░░ 20%
Improve Quality ██░░░░░░░░░░░░░░░░░░ 10%
Plan Design ██░░░░░░░░░░░░░░░░░░ 10%

Top Skills & Commands:
/init ████████████████████ 1x/month
/mcp ████████████████████ 1x/month
/context ████████████████████ 1x/month
/skills ████████████████████ 1x/month

Top MCP Servers:
railway ████████████████████ 34 calls

## Your Setup Checklist

### Codebases

- [ ] railway-fullstack-template — https://github.com/ddewaele/railway-fullstack-template

### MCP Servers to Activate

- [ ] Railway — deploy, inspect and debug the app and Postgres on Railway (status, logs, variables, domains). Run `claude mcp add railway --transport http https://mcp.railway.com`, then `/mcp` and complete the browser login with your Railway account.
- [ ] Playwright — drive a real browser against the deployed app to verify UI flows. `claude mcp add playwright -- npx -y @playwright/mcp@latest`
- [ ] GitHub — richer PR review than the `gh` CLI alone. `claude mcp add github --transport http https://api.githubcopilot.com/mcp/ --header 'Authorization: Bearer ${GH_TOKEN}'` and `export GH_TOKEN="$(gh auth token)"` in your shell profile.
- [ ] Postgres — inspect the local development database. `claude mcp add postgres -- npx -y @bytebase/dbhub --dsn "postgres://app:app@localhost:5433/app"` (start it with `docker compose up -d`).

Restart Claude Code after adding servers so their tools appear.

### Skills to Know About

- /preflight — readiness checklist (tools, auth, token scopes, ports, MCP servers, platform limits). Run it before planning any new work; it hands you the interactive steps only a human can do.
- /fullstack-scaffold — the fixed stack decisions and the recipe for adding a feature slice (schema → shared Zod schema → route → UI → tests).
- /ship-feature — take a branch through production smoke test, PR as release notes, CI-gated auto squash-merge, and sync main.
- /railway-provision — provision or verify the Railway project (Postgres, app service, variables, domain, region) and check the deploy.
- /mcp — authenticate and inspect MCP servers.
- /context — see how much of the context window is in use.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
