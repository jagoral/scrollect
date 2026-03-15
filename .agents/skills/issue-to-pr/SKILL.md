---
name: issue-to-pr
description: |
  End-to-end workflow that takes a GitHub issue and delivers a pull request. Reads the issue,
  spins up an agent team (via the team-agent-prompt skill), manages issue status with labels,
  runs the team to implement the feature, creates a PR, and closes the issue.
argument-hint: "<issue-number-or-url>"
disable-model-invocation: true
---

# Issue to PR

Take a GitHub issue from assignment through implementation to a merged-ready pull request.
This skill orchestrates the full lifecycle: read the issue, plan the work, spin up an agent
team, implement, create a PR, and close the issue.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- The `team-agent-prompt` skill installed (used to generate agent team composition)
- The `pull-request` skill installed (used to create the PR at the end)

## Workflow

### Step 1: Parse and read the issue

Accept input as:

- Issue number: `123` or `#123`
- Issue URL: `https://github.com/owner/repo/issues/123`

```bash
# Extract issue number from URL if needed, then fetch details
gh issue view <number> --json title,body,labels,assignees,comments,milestone,number,url
```

Read the issue thoroughly. Pay attention to:

- **Title and description** — the core task
- **Labels** — hints about scope (bug, feature, enhancement, etc.)
- **Comments** — additional context, clarifications, design decisions
- **Milestone** — priority and timeline context
- **Linked issues or PRs** — dependencies

Summarize what the issue is asking for to the user and confirm understanding before proceeding.

### Step 2: Create a feature branch

Derive a branch name from the issue:

```bash
# Format: <type>/<issue-number>-<short-description>
# Examples:
#   feat/42-content-ingestion-pipeline
#   fix/87-feed-scroll-jank
#   chore/15-update-convex-deps

git fetch origin main
git checkout -b <branch-name> origin/main
```

Branch name rules:

- Type comes from issue labels: `bug` → `fix`, `enhancement`/`feature` → `feat`, otherwise `chore`
- Max 60 characters
- Lowercase, hyphens for spaces, strip special characters

### Step 3: Assign and mark in progress

```bash
# Self-assign the issue (assign to the authenticated GitHub user)
gh issue edit <number> --add-assignee @me

# Add "in-progress" label (create it if it doesn't exist)
gh label create "in-progress" --description "Work is underway" --color 0E8A16 --force 2>/dev/null
gh issue edit <number> --add-label "in-progress"

# Post a comment so there's a visible trail
gh issue comment <number> --body "Starting work on this issue. Branch: \`<branch-name>\`"
```

### Step 4: Generate the team prompt

Use the `/team-agent-prompt` skill to generate an appropriate agent team for this task.

When invoking the skill, provide:

- The full issue title and description
- The type of work (frontend, backend, full-stack, infrastructure, etc.)
- Specific files or areas of the codebase likely affected
- Any constraints or requirements from the issue comments

The team-agent-prompt skill will select appropriate team members from the roster
(Architect, Product Manager, Convex Expert, Vector DB Expert, Frontend Developer, Tester)
and generate a ready-to-use prompt.

**Team size guidance based on issue scope:**

- Small bug fix or docs change → skip the team, just do it directly (2-3 files)
- Medium feature (one layer) → 2-3 agents (e.g., Convex Expert + Frontend Dev + Tester)
- Large feature (cross-layer) → 4-5 agents (add Architect and/or PM)
- Major new module → full team of 5-6

If the issue is small enough that a team is overkill, skip Steps 4-5 and implement
directly. Use your judgment — don't spin up 5 agents for a typo fix.

### Step 5: Run the team

Execute the generated team prompt. This spawns the agent team which works in parallel
on the implementation.

While the team runs:

- Monitor progress via task list and teammate messages
- Resolve conflicts or ambiguities that arise
- Make architectural decisions when teammates ask
- Ensure teammates stay within their file ownership boundaries

When the team completes:

- Verify that the implementation addresses all acceptance criteria from the issue
- Check that tests pass
- Review the changes for obvious issues

### Step 5b: Ensure CI will pass

Before committing, run the **exact same checks** that CI runs (see `.github/workflows/ci.yml`).
Fix any failures before proceeding — do NOT suppress errors or skip steps.

```bash
# 1. Lint and format (matches CI "Check (lint & format)" step)
bun run check

# If oxfmt reformatted files, stage those formatting changes
git add -u

# 2. Build all packages (matches CI "Build" step)
bun turbo run build

# 3. Run E2E tests (matches CI "Run E2E tests" step)
bun run test:e2e
```

If any step fails:

1. **Lint errors (`oxlint`)** — fix the violations in the source files and re-run `bun run check`
2. **Build errors** — read the error output, fix type errors or missing imports, re-run `bun turbo run build`
3. **E2E test failures** — investigate the failing test, fix the implementation or the test, re-run `bun run test:e2e`

Repeat until all three steps pass cleanly. Only then proceed to commit.

### Step 5c: Code Review Gate

**Before committing, run code review on ALL changed files. Every finding must be fixed.**

1. Spawn specialized reviewer agents in parallel:
   - `code-reviewer-backend` for any changes in `packages/backend/`
   - `code-reviewer-frontend` for any changes in `apps/web/`
   - `architect-reviewer` if the change spans multiple layers or introduces new patterns

2. Collect ALL findings from every reviewer — critical, high, medium, AND low severity.

3. **Fix every finding.** Do not skip items based on severity. Low-severity issues (accessibility,
   naming, comments) are just as required as critical ones. The goal is a clean review pass.

4. After fixing, re-run the CI checks from Step 5b (lint, build, E2E tests) to ensure fixes
   don't introduce regressions.

5. Re-run the reviewers on the updated code. Repeat until all reviewers return zero findings.

Only proceed to Step 6 once both CI and code review pass clean.

### Step 6: Commit and create the PR

Stage and commit all changes with a conventional commit message derived from the issue:

```bash
# Stage changes (be specific about files, avoid secrets)
git add <specific-files>

# Commit with conventional format referencing the issue
git commit -m "$(cat <<'EOF'
feat(#<issue-number>): <short description from issue title>

<longer description of what was implemented>

Closes #<issue-number>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

Then use the `/pull-request` skill to create the PR:

- Base branch: `main`
- Title: conventional commit format with issue reference — e.g., `feat(#42): add content ingestion pipeline`
- Body: reference the issue, summarize changes, include test plan
- The PR body should include `Closes #<issue-number>` so GitHub auto-closes the issue on merge

### Step 7: Enable auto-merge and close the issue

After the PR is created, enable auto-merge so it merges automatically once CI passes:

```bash
# Enable auto-merge (squash) on the PR
gh pr merge <pr-number> --auto --squash

# Remove in-progress label
gh issue edit <number> --remove-label "in-progress"

# Comment with the PR link and close
gh issue comment <number> --body "PR ready for review: <pr-url>"
gh issue close <number> --reason completed
```

## Error handling

| Situation                       | Action                                        |
| ------------------------------- | --------------------------------------------- |
| Issue doesn't exist             | Tell the user, ask for correct number         |
| Issue is already closed         | Warn the user, ask if they want to reopen     |
| Issue is already assigned       | Warn the user, ask if they want to take over  |
| Branch already exists           | Ask to reuse or create a new one              |
| `gh` not authenticated          | Guide user to `gh auth login`                 |
| CI checks fail (lint/build/e2e) | Fix all failures in Step 5b before committing |
| Team agent fails or times out   | Fall back to direct implementation            |
| PR creation fails               | Show the error, attempt manual `gh pr create` |

## Important notes

- Always read the full issue (including comments) before starting work
- Confirm your understanding of the issue with the user before spinning up a team
- For small issues, skip the team and implement directly — use your judgment
- Never force-push or rewrite history on shared branches
- Always include `Closes #<number>` in the PR body for auto-closing
- If the issue references other issues or PRs, read those too for context
- Keep the user informed at each major step (branch created, team spawned, PR ready)
