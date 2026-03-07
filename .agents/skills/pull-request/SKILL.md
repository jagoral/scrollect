---
name: pull-request
description: Create a pull request for the current branch or for specific commits. Use when user wants to create a PR with /pull-request or explicitly asks to create a pull request. Supports cherry-picking specific commits into a new PR via --commit flag.
argument-hint: "[--base <branch>] [--commit <hash|HEAD>] [--branch <name>]"
disable-model-invocation: true
---

# Pull Request Creation

Create a pull request for the current branch, or cherry-pick specific commits into a standalone PR.

**Usage:**

- `/pull-request` - PR the current branch against `main` (default)
- `/pull-request --base main` - PR against `main`
- `/pull-request --commit HEAD` - PR just the last commit on a new branch
- `/pull-request --commit abc123` - PR a specific commit on a new branch
- `/pull-request --commit HEAD --branch my-branch` - Override the auto-generated branch name

## Workflow

### 1. Determine Mode

**Two modes based on arguments:**

- **Branch mode** (default): PR the current branch as-is. Used when no `--commit` flag.
- **Cherry-pick mode**: Create a new branch from `origin/{base}`, cherry-pick the specified commit(s), then PR that branch. Used when `--commit` is provided.

### 2. Determine Base Branch

**Priority order:**

1. Explicit argument: `--base <branch>` → use that branch
2. No argument → default to `main`

### 3. Gather Context

**IMPORTANT:** Always fetch the remote base branch first. Local `main` may be stale, causing inflated diffs. Always compare against `origin/{base}`.

```bash
# Fetch latest remote base branch
git fetch origin {base}

# Get current branch
git branch --show-current

# Get commits not in base branch (use origin/{base}, NOT local {base})
git log origin/{base}..HEAD --oneline

# Get changed files (use origin/{base})
git diff origin/{base} --name-only

# Check if branch is pushed
git status -sb
```

### 4. Cherry-pick mode (only when `--commit` is provided)

When `--commit` is specified, create a new branch and cherry-pick:

#### 4a. Generate branch name

If `--branch` is provided, use that. Otherwise derive from the commit message:

Parse commit message `type(scope): description` into branch name:

- `docs(agents): improve changeset skill` → `docs/improve-changeset-skill`
- `feat(cli): add indexer export` → `feat/add-indexer-export`
- `fix(#456): cart total calculation` → `fix/456-cart-total-calculation`

Rules: lowercase, spaces to hyphens, strip special characters, max 60 chars.

#### 4b. Create branch and cherry-pick

```bash
# Create new branch from remote base
git checkout -b {new-branch} origin/{base}

# Cherry-pick the commit
git cherry-pick {commit-hash}

# If cherry-pick fails, abort and inform user
git cherry-pick --abort
```

#### 4c. After PR is created, return to original branch

```bash
git checkout {original-branch}
```

### 5. Extract GitHub Issue (if present)

Parse branch name for issue number pattern:

- Branch: `feat/123-description` → Issue: `#123`
- Branch: `feature-without-issue` → No issue

### 6. Generate PR Title

**PR titles MUST follow conventional commit format (CI will fail otherwise).**

**Format:** `type(scope): description`

| Type       | Use For                                  |
| ---------- | ---------------------------------------- |
| `feat`     | New features                             |
| `fix`      | Bug fixes                                |
| `perf`     | Performance improvements                 |
| `docs`     | Documentation changes                    |
| `style`    | Code style (formatting, no logic change) |
| `refactor` | Code refactoring                         |
| `test`     | Adding/updating tests                    |
| `chore`    | Maintenance tasks                        |
| `ci`       | CI/CD changes                            |

**Auto-detection:**

- **Cherry-pick mode**: Check if the commit message already follows `type(scope): description` or `type: description` format. If yes, use it directly as the PR title. If not, derive a conventional commit title from the commit message (infer type from content/branch, use ticket as scope if present, use the commit subject as description).
- **Branch mode**: Derive from branch name:
  - `feat/123-add-auth` → `feat(#123): add auth`
  - `fix/456-cart-bug` → `fix(#456): cart bug`
  - `chore/update-deps` → `chore: update deps`

**Scope priority:** GitHub issue number when available, otherwise component name or omit.

Ask user to confirm or modify the generated title.

### 7. Push Branch

```bash
git push -u origin {branch}
```

### 8. Create Pull Request

Use the PR template from `.github/PULL_REQUEST_TEMPLATE.md` for the body structure.

```bash
gh pr create \
  --base {base} \
  --title "{conventional commit title}" \
  --body "{body from shared template}"
```

### 9. Enable Auto-Merge with Squash

After creating the PR, always enable auto-merge with squash:

```bash
gh pr merge {pr-number} --auto --squash
```

### 10. Report Result and Cleanup

Return the PR URL:

```
Pull request created: https://github.com/org/repo/pull/123
Auto-merge (squash) enabled.
```

If in cherry-pick mode, switch back to original branch:

```bash
git checkout {original-branch}
```

## Error Handling

| Error                        | Action                                         |
| ---------------------------- | ---------------------------------------------- |
| Not on a branch              | Ask user to checkout a branch                  |
| Base branch doesn't exist    | List available branches, ask user to choose    |
| No commits ahead of base     | Inform user there's nothing to PR              |
| Branch not pushed            | Push automatically                             |
| gh auth failed               | Guide user to run `gh auth login`              |
| PR already exists for branch | Show existing PR URL                           |
| Cherry-pick conflict         | Abort cherry-pick, inform user of conflicts    |
| Commit hash not found        | Ask user for correct hash, show recent commits |

## Notes

- Default base branch is `main`, customizable via `--base`
- Do not modify any files or make commits (except cherry-pick in cherry-pick mode)
