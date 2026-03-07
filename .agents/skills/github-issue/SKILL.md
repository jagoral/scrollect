---
name: github-issue
description: Create GitHub issues to track work for the project. Use this skill whenever the user wants to create an issue, report a bug, propose a feature, track a task, or plan work via GitHub Issues. Also trigger when discussing new functionality, improvements, or problems that should be tracked — even if the user doesn't explicitly say "create an issue".
argument-hint: "[title or description of the issue]"
---

# GitHub Issue Creation

Create a well-structured GitHub issue using `gh`.

## Workflow

### 1. Gather Context

If the user provides a clear description, proceed directly. If vague, ask one clarifying question — don't over-interview.

Determine the issue type from context:

| Type       | When                                     |
| ---------- | ---------------------------------------- |
| `feat`     | New functionality or capability          |
| `fix`      | Something is broken                      |
| `chore`    | Maintenance, deps, config                |
| `docs`     | Documentation changes                    |
| `refactor` | Code improvement without behavior change |
| `test`     | Adding or fixing tests                   |
| `perf`     | Performance improvement                  |

### 2. Draft the Issue

Use this template — keep it short and direct:

```
## What

One or two sentences describing what needs to happen and why.

## Details

- Bullet points with specifics, constraints, or scope boundaries
- Only include what's necessary to understand the work

## Acceptance Criteria

- [ ] Concrete, verifiable conditions for "done"
- [ ] Keep to 2-5 items
```

Skip any section that doesn't apply. An issue can be just a "What" if that's all it needs.

### 3. Confirm with User

Show the draft title and body. Ask the user to confirm or adjust before creating.

**Title format:** `type: short description` (e.g., `feat: add PDF import`, `fix: feed not loading on mobile`)

### 4. Create the Issue

```bash
gh issue create \
  --title "{type}: {description}" \
  --body "{body from template}"
```

Do not assign labels, milestones, or assignees unless the user explicitly asks.

### 5. Report Result

Return the issue URL:

```
Issue created: https://github.com/org/repo/issues/42
```

## Error Handling

| Error                  | Action                                      |
| ---------------------- | ------------------------------------------- |
| `gh` not authenticated | Guide user to run `gh auth login`           |
| Repo not found         | Check if in a git repo with a GitHub remote |
| Permission denied      | Inform user they may not have write access  |
