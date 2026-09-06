---
name: ship-feature
description: >
  Take the current feature branch through checks, PR creation and CI-gated auto squash-merge, then
  sync main. Use when the user says "ship it", "open a PR and merge when green", "land this branch",
  or when a feature slice is complete in an agent-driven workflow with a protected main branch.
allowed-tools: Bash, Read
---

# Ship a feature branch

Encodes the lessons from building this template: verify like production, never assume PR numbers,
arm auto-merge _before_ CI finishes, and keep secrets and scratch files out of the commit.

## Preconditions

- On a branch other than `main` (`git branch --show-current`). If on `main`, stop and ask for a branch name.
- `gh auth status` succeeds. If the diff touches `.github/workflows/**`, the token needs the `workflow`
  scope; otherwise GitHub refuses the merge when it is performed by this token. Arming auto-merge
  while CI is still running avoids this because GitHub performs the merge, but warn the user.

## Steps

1. **Inspect before staging.** `git status --short`. Look for files that must not ship: `.env*`
   (except `.env.example`), local notes, screenshots outside `docs/`, editor files. Add ignore
   patterns first, then stage with explicit paths or `git add -A` only once the list is clean.
2. **Verify like CI and like production.**
   ```bash
   pnpm check                 # lint, format:check, typecheck, unit + integration tests
   pnpm build && (PORT=3999 node apps/server/dist/index.js & echo $! > /tmp/srv.pid; sleep 2; \
     curl -sf localhost:3999/api/health && curl -s -o /dev/null -w '%{http_code}\n' localhost:3999/; \
     curl -s localhost:3999/api/does-not-exist; kill $(cat /tmp/srv.pid))
   pnpm e2e                   # when the branch touches UI, routing or auth
   ```
   A test that passes against a missing artifact (e.g. no `apps/web/dist`) is a false positive; the
   production smoke test above catches route-precedence bugs unit tests miss.
   Run the full `pnpm check` **once** per branch state. After a `rebase --onto` of a squash-merged
   parent the tree is identical; a `pnpm typecheck && pnpm test` is enough, not a second full run.
3. **Commit** with a conventional-commit subject and a short body of bullets. Use absolute paths in
   every command; never `cd` (the shell cwd persists between tool calls). When copying pinned
   versions (GitHub Actions `@vN`, package ranges, image tags) from a reference repo, copy them
   **verbatim** with `cp`/`sed`, never retype them from memory: a retyped `@v4` where the reference
   has `@v7` produced four Dependabot PRs within a minute of enabling it.
4. **Push and open the PR**, capturing the number from the output rather than guessing it:
   ```bash
   git push -u origin "$(git branch --show-current)"
   URL=$(gh pr create --title "<type(scope): summary>" --body-file /tmp/pr-body.md | grep -oE 'https://github.com/[^ ]+/pull/[0-9]+')
   N=${URL##*/}
   ```
   PR body = release notes: what, why, how it was verified, screenshots if UI changed. With squash
   merges configured to use the PR body, this becomes the commit message on `main`.
5. **Arm auto-merge immediately**: `gh pr merge "$N" --auto --squash`. Do this before CI completes.
   Confirm it took: `gh pr view "$N" --json autoMergeRequest --jq .autoMergeRequest.mergeMethod`
   must print `SQUASH`. Read back every state you set; do not infer it from a silent exit code.
6. **Wait without polling in the foreground.** Use a background command:
   `until [ "$(gh pr view $N --json state --jq .state)" != "OPEN" ]; do sleep 20; done; gh pr view $N --json state,mergedAt`
   Meanwhile work on the next branch only if it is independent. **When CI takes under ~3 minutes,
   just wait**: stacking saves little and every merge costs a `rebase --onto`. If you do stack:
   branch from this one, **commit or `git stash -u` before rebasing** (a dirty tree makes
   `rebase --onto` refuse), then `git rebase --onto origin/main <this-branch> <next-branch>` after the
   squash merge. Chain destructive git commands with `&&`, never `;`: a `git branch -D` must not run
   after a failed rebase.
7. **If CI fails**: read the failing step with `gh run view <id> --log-failed`, fix on the same branch,
   push. Never bypass the ruleset or force-merge.
8. **If the PR is `BEHIND`** and checks are strict: `gh api -X PUT repos/<owner/repo>/pulls/$N/update-branch`.
   Prefer configuring the ruleset with non-strict checks for solo/agent repos to avoid this loop.
9. **After merge**: `git checkout main && git pull && git branch -D <branch>`. Confirm the platform
   deploy if one is wired to `main`: `railway deployment list --service app --json | jq '.[0].status'`
   until `SUCCESS`, then `curl` the health URL. A `FAILED` deploy has logs at
   `railway logs -s app -d <deploymentId>` (the `-s` is required even in a linked directory).
10. **Keep the user informed.** One line of status every few tool calls ("PR 3 open, CI running;
    writing the web slice"). A long silent stretch reads as a hang and triggers "are you still
    working?" round trips.

## Report back

One paragraph: PR link, what merged, how it was verified (checks, smoke test, e2e), deploy status,
and anything the user must still do.
