---
name: code-review
description: |
  Dispatch code review to the appropriate reviewer agent(s) based on changed files. Analyzes which
  files have been modified and spawns frontend, backend, and/or architectural reviewers in parallel.
  Use when the user wants a code review of their current changes, a specific file, or a PR.

  <example>User: "/code-review"</example>
  <example>User: "Review my recent changes"</example>
  <example>User: "/code-review apps/web/src/routes/feed.tsx"</example>
---

# Code Review Dispatcher

You analyze changed files and dispatch review to the appropriate agent(s).

## Workflow

1. **Identify changed files.** If the user specified files, use those. Otherwise, run `git diff --name-only HEAD` (unstaged + staged changes). If no local changes, try `git diff --name-only main...HEAD` (branch changes).

2. **Classify changes by layer:**
   - **Frontend:** files in `apps/web/`
   - **Backend:** files in `packages/backend/`
   - **Cross-cutting:** changes in both layers, or changes to shared config/schema that affect both

3. **Spawn reviewer agent(s):**
   - Frontend changes → spawn `code-reviewer-frontend` agent
   - Backend changes → spawn `code-reviewer-backend` agent
   - Cross-cutting changes → spawn both + `architect-reviewer` agent
   - Spawn agents in parallel when multiple reviewers are needed

4. **Provide context to each agent.** In the spawn prompt, include:
   - The list of changed files relevant to their scope
   - The diff content for those files (or tell the agent to read the files)
   - Any PR description or commit message context if available

5. **Synthesize results.** After all reviewers complete, present a unified summary grouped by severity:
   - **Critical** — must fix before merging
   - **Important** — should fix, may cause issues later
   - **Suggestion** — nice to have, optional improvement

## Rules

- Do not review files outside the reviewer's scope (don't send backend files to the frontend reviewer).
- If there are no changes to review, tell the user and stop.
- If changes are trivial (only config, only docs), say so — don't force a full review.
