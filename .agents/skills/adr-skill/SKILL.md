---
name: adr-skill
description: Create and maintain Architecture Decision Records (ADRs) optimized for agentic coding workflows. Use when you need to propose, write, update, accept/reject, deprecate, or supersede an ADR; bootstrap an adr folder and index; consult existing ADRs before implementing changes; or enforce ADR conventions. This skill uses Socratic questioning to capture intent before drafting, and validates output against an agent-readiness checklist.
metadata:
  internal: true
---

# ADR Skill

## Philosophy

ADRs are a **decision log**, not design documents. Each record answers three questions:

1. What did we decide?
2. Why did we decide it (and what did we reject)?
3. What are the consequences?

An ADR should be scannable in under 2 minutes. If it doesn't fit concisely, split it into multiple ADRs.

**Length budget: 100–300 lines.** Exceeding 300 lines is a signal that implementation details are leaking in. Move those to the issue/PR.

### What belongs in an ADR

- The decision itself (specific enough to act on)
- Context: why now, what constraints
- Alternatives considered and why rejected
- Consequences: what gets easier, harder, riskier
- References to issues, prior ADRs

### What does NOT belong in an ADR

- Full code implementations or schema dumps (reference the file path instead)
- CI/CD workflow YAML
- Detailed error-handling matrices
- Future speculation ("we could later...") — write a new ADR when the time comes
- Prototype results or success metrics (put those in issues or separate docs)
- Implementation plans with file-by-file instructions (that's the issue's job)
- Code separators or excessive formatting

## When to Write an ADR

Write an ADR when a decision:

- **Changes how the system is built** (new dependency, architecture pattern, data model change)
- **Is hard to reverse** once code is written against it
- **Has real alternatives** that were considered and rejected
- **Would confuse a future agent/developer** if left undocumented

Do NOT write an ADR for:

- Routine implementation within an established pattern
- Bug fixes or typo corrections
- Style choices covered by linters or formatters
- Decisions already captured in an existing ADR (update it instead)

### Proactive Triggers (For Agents)

If you encounter any of these situations, **stop and propose an ADR** before continuing:

- You are about to introduce a new dependency not already in the project
- You are about to create a new architectural pattern others must follow
- You are choosing between alternatives with non-obvious tradeoffs
- You are about to contradict an existing accepted ADR

**How to propose**: Tell the user what decision you've hit, why it matters, and ask if they want an ADR. If yes, run the workflow below. If no, note it in a code comment and move on.

## Creating an ADR

### Step 1: Scan the Codebase

Before asking questions, gather context:

1. Read existing ADRs in `docs/adr/` — note related decisions and the next sequential number
2. Check relevant code, schema (`packages/backend/convex/schema.ts`), and `AGENTS.md`
3. Identify prior decisions that constrain or relate to this one

### Step 2: Capture Intent

Ask the user concise questions to fill gaps. Key questions (skip what's already clear from context):

1. **What are you deciding?** — Push for a verb phrase ("Choose X", "Adopt Y", "Replace Z")
2. **Why now?** — What broke, what's changing, what will break?
3. **What constraints exist?** — Tech stack, scale, existing patterns
4. **What options have you considered?** — At least two
5. **Which way are you leaning and why?**

**Ask one question at a time**, building on previous answers. Don't dump a list.

**Before drafting**, confirm a summary:

> **Title**: {verb phrase}
> **Trigger**: {why now}
> **Options**: A vs B [vs C]
> **Lean**: {which and why}
> **Non-goals**: {what's explicitly out of scope}

Do NOT proceed to drafting until the user confirms.

### Step 3: Draft

Use the template at `assets/templates/adr-simple.md`. Fill every section with real content — no placeholders. Apply these rules:

- **Context**: 3–5 sentences. Why now. Link to issues or prior ADRs. Enough for a newcomer to understand without follow-up.
- **Decision**: Concise. Use numbered sub-decisions (`### 1. Sub-title`) only when truly making multiple related choices. 1–2 paragraphs per sub-decision. Include code signatures or pseudocode _only_ when essential to understanding the decision — never full implementations or schema dumps.
- **Alternatives considered**: 1–2 sentences each. What was rejected and why. Can be a table if comparing 3+ options, but keep it brief.
- **Consequences**: Bulleted list. What gets easier, what gets harder, what risks exist, what follow-up issues to create. Be concrete — not "improves performance" but "feed query drops from 10 reads to 3 per page".

Preferred: generate the file with `scripts/new_adr.cjs`:

```bash
node .agents/skills/adr-skill/scripts/new_adr.cjs --title "Choose auth provider" --status proposed
```

The script auto-detects `docs/adr/`, assigns the next number, and fills metadata.

### Step 4: Review

Check against these criteria:

- [ ] A newcomer can understand this without prior context
- [ ] Every section has real content (no placeholders or TODOs)
- [ ] Under 300 lines? If not, what can move to the issue?
- [ ] Alternatives are genuine (not straw-men)
- [ ] Consequences are concrete and specific
- [ ] Decision is specific enough for an agent to act on

See `references/review-checklist.md` for the full checklist.

If there are gaps, propose fixes — don't just flag problems. Ask the user to approve.

## Consulting Existing ADRs

Agents should read existing ADRs **before implementing changes** that touch architecture.

1. Check `docs/adr/` — scan filenames and statuses
2. Read relevant ADRs fully, including consequences
3. If your work contradicts an accepted ADR, flag it to the user
4. Reference relevant ADRs in PR descriptions

## Other Operations

### Update Status

```bash
node .agents/skills/adr-skill/scripts/set_adr_status.cjs docs/adr/001-foo.md --status accepted
```

Supports YAML frontmatter (`status: proposed`), bold format (`**Status:** Proposed`), bullet format (`- Status: proposed`), and section format (`## Status`).

### Supersede an ADR

1. Create a new ADR referencing the old one
2. Set the old ADR's status to `superseded by ADR-NNN`
3. Link both ways: old → new, new → old

### Deprecate an ADR

Set status to `deprecated`. Add a note explaining the replacement path.

### Add Learnings to an Existing ADR

Append to `## More Information` with a date stamp. Do not rewrite history.

## Scrollect Conventions

- **Directory**: `docs/adr/`
- **Naming**: `NNN-slug.md` (e.g., `007-choose-auth-provider.md`) — numbered sequentially
- **Metadata**: YAML frontmatter with `status` and `date`
- **Statuses**: `proposed` → `accepted` | `rejected` | `deprecated` | `superseded by ADR-NNN`
- **Template**: `assets/templates/adr-simple.md` (single lean template)
- **Length**: 100–300 lines target

## Resources

### scripts/

- `scripts/new_adr.cjs` — Create a new ADR file with auto-numbering and metadata
- `scripts/set_adr_status.cjs` — Update an ADR's status in-place (handles multiple formats)
- `scripts/bootstrap_adr.cjs` — Create ADR directory, index, and initial "Adopt ADRs" decision

### references/

- `references/review-checklist.md` — Review checklist for Step 4
- `references/adr-conventions.md` — Directory, filename, status, and lifecycle conventions
- `references/examples.md` — Filled-out example ADR in Scrollect format

### Script Usage

```bash
# Create a new ADR (auto-detects directory and numbering)
node .agents/skills/adr-skill/scripts/new_adr.cjs --title "Choose database" --status proposed

# With index update
node .agents/skills/adr-skill/scripts/new_adr.cjs --title "Choose database" --status proposed --update-index

# Update status
node .agents/skills/adr-skill/scripts/set_adr_status.cjs docs/adr/007-choose-database.md --status accepted

# Machine-readable output
node .agents/skills/adr-skill/scripts/new_adr.cjs --title "Choose database" --json
```
