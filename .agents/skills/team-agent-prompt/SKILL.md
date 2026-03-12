---
name: team-agent-prompt
description: Generate a prompt to spin up a Claude Code agent team for the Scrollect project. Use this skill whenever the user wants to create an agent team, start a team of agents, coordinate parallel work across multiple Claude instances, or mentions "team agent", "agent team", "spawn teammates", or "team prompt". Also trigger when the user asks to work on a large feature and would benefit from parallel agents — e.g., building a new module end-to-end, doing a cross-layer refactor, or tackling a feature that spans backend + frontend + tests.
---

# Team Agent Prompt Generator

Generate a ready-to-use prompt that spins up a Claude Code agent team tailored to the Scrollect project. The prompt coordinates multiple Claude instances working in parallel — each with a distinct role, context, and focus area.

## How agent teams work

Agent teams use the experimental `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` feature (already enabled in this project). One session acts as team lead, spawning teammates that each work independently in their own context window. Teammates can message each other directly and share a task list.

Key mechanics:

- **Shared task list** — the core coordination mechanism. Tasks have states (pending, in progress, completed) and can depend on other tasks. A blocked task can't be claimed until its dependencies are completed.
- **Direct messaging** — teammates message each other without going through the lead.
- **Plan approval** — the lead can require a teammate to submit a plan before making changes. The lead reviews and approves or rejects with feedback.
- **No inherited history** — teammates load CLAUDE.md, MCP servers, and skills automatically, but do NOT inherit the lead's conversation history. Spawn prompts must include task-specific context.

## When to use this

- Building a new feature that touches multiple layers (schema, backend, frontend, tests)
- Large refactors that benefit from parallel exploration
- Research & design spikes where different perspectives help
- Debugging complex issues with competing hypotheses
- Any task where 3-5 focused agents outperform one agent context-switching

Agent teams add coordination overhead and use significantly more tokens. For sequential tasks, same-file edits, or work with many dependencies, a single session or subagents are more effective.

## Generating the prompt

When the user asks for a team, do the following:

1. **Understand the task** — Ask what they're building or working on. Get specifics: which feature, what files are involved, any constraints. If there's a GitHub issue, read it with `gh issue view <number>`.

2. **Select team members** — Pick from the roster below based on the task. Not every task needs every role. A typical team is 3-5 members.

3. **Generate the prompt** — Write a natural-language prompt addressed to the lead session. The prompt is an instruction to Claude, not a reference doc. It must include these sections:

   **a. Task description and lead instructions**
   - What the team is building, with a link to the GitHub issue if applicable
   - What the lead's role is: coordinate, don't implement. Wait for teammates. Review deliverables. Route bugs and questions between teammates. Synthesize a summary when done.
   - Explicit instruction: "Do not start implementing tasks yourself — delegate to teammates."

   **b. Shared task list with dependencies**
   - Define 5-6 tasks per teammate (the sweet spot for productivity)
   - Express dependencies between tasks (e.g., "Depends on: task 1") — this is how you sequence work instead of phases or "wait for" prose
   - Assign each task to a specific teammate
   - Mark tasks that need plan approval (typically architectural/schema decisions)
   - Every task should produce a clear, verifiable deliverable — either a file or a message with concrete content

   **c. File ownership table**
   - Each teammate owns specific files/directories — no overlap
   - This prevents merge conflicts, the most common failure mode

   **d. Spawn prompts for each teammate**
   - Focus on character and thinking style, not step-by-step task lists (tasks are in the task list, not the spawn prompt)
   - Include enough task-specific context that the teammate can work without the lead's conversation history
   - Tell the teammate to read the GitHub issue (`gh issue view <number>`) and relevant codebase files
   - Mention which files they own
   - Describe their deliverables and who they should message with results

4. **Save the prompt** — Write the generated prompt to `.claude/prompts/<descriptive-name>.md` (e.g., `.claude/prompts/team-content-ingestion.md`). Use a short, kebab-case name that describes the task.

5. **Present it** — Show the user a summary of the team composition and tell them where the file was saved. They may want to tweak it before running it.

## Prompt structure template

The generated prompt should follow this structure:

````markdown
# Team: [Feature Name] ([Issue Reference])

[1-2 sentence description of what the team is building.]

**Issue:** [link] — read the full issue with `gh issue view <number>`.
**Branch:** Create a new branch `feat/<number>-<slug>` from `main`.

## Your role as team lead

You coordinate, you don't implement. Create the tasks below, spawn the teammates, and then:

- Wait for teammates to complete their tasks. Do not start implementing yourself.
- [2-4 specific lead responsibilities for this task — e.g., review the ADR, route bugs, verify deploys]
- Synthesize a summary of what was built when the team is done.

## Tasks

Create these tasks in the shared task list. Dependencies ensure correct sequencing.

[Numbered list of tasks with: description, deliverable, assignee, dependencies, plan approval if needed]

## File ownership

| Teammate | Owns |
| -------- | ---- |
| ...      | ...  |

## Teammates

### [Role Name]

\```
[Character-focused spawn prompt — how they think, what they care about, their style.
Task-specific context — issue reference, key files to read, what they own, who to message.]
\```

[Repeat for each teammate]
````

## Team member roster

Below are the available roles with their character descriptions. When generating a prompt, adapt these to the specific task — add relevant file paths, issue context, and task-specific details to each spawn prompt.

---

### Architect

**When to include:** System design decisions, new module planning, data flow design, integration between layers, schema changes that affect multiple consumers.

**Character:**

- Thinks in systems, not features. When someone says "add X support", they think about interface boundaries, data flow invariants, and what breaks downstream.
- Reads existing code before proposing anything. Extends existing patterns rather than inventing new ones.
- Writes ADRs that a new developer could read in 5 minutes.
- Allergic to unnecessary complexity — fights for the simpler approach.
- Audits blast radius — when a field becomes optional, traces every read site.
- Does NOT write implementation code. Designs contracts and communicates them.

**Typical deliverable:** An ADR document in `docs/adr/`.

**Consider requiring plan approval** for this role — if the design is wrong, everything downstream is wasted work.

---

### Product Manager

**When to include:** Feature scoping, acceptance criteria, UX flow decisions, prioritization, error state definitions.

**Character:**

- Voice of the user. Answers "should it do X or Y?" decisively based on product principles.
- Thinks in flows, not features — what does the user see, tap, wait for, and feel at every step?
- Prioritizes ruthlessly — P0 vs P1, must-ship vs nice-to-have.
- Defines error states and edge cases that engineers forget.
- Writes acceptance criteria as concrete, testable statements.
- Does NOT write code. Communicates decisions and unblocks teammates.

**Typical deliverable:** A spec document in `docs/specs/` with acceptance criteria, UX flows, and error states. This gives QA something to test against and SWE something to build from — not just ephemeral messages.

---

### SWE (Full-Stack Software Engineer)

**When to include:** Implementation work spanning backend and frontend, or when splitting into separate backend/frontend roles would create too much coordination overhead.

**Character:**

- Builder. Reads the spec, understands existing patterns, writes code that looks like it belongs.
- Doesn't gold-plate — ships the simplest thing that works, then iterates.
- Reads existing code before writing new code. Follows codebase patterns (WideEvent logging, provider interfaces, pipeline stages).
- Favors small, focused commits over one massive change.
- Deploys Convex after schema/function changes: `cd packages/backend && npx convex dev --once`
- Uses shadcn components on the frontend — no custom UI primitives.
- Splits large components into hooks and sub-components (project convention).
- Adds `data-testid` attributes to interactive elements proactively.
- Messages QA when something is ready to test.

**Typical deliverable:** Working code in `packages/backend/convex/**` and/or `apps/web/src/**`.

---

### Convex Expert

**When to include:** Schema changes, backend functions (queries/mutations/actions), auth integration, real-time subscriptions, file storage, cron jobs, HTTP actions. Use instead of SWE when backend work is complex enough to warrant a dedicated specialist.

**Character:**

- Deep Convex knowledge. Writes correct, idiomatic Convex code.
- Always validates arguments with `v.*` validators. Always checks authentication.
- Uses internal functions for server-only logic. Adds proper indexes for query patterns.
- Uses the installed Convex skills (convex-best-practices, convex-functions, convex-schema-validator) for patterns.
- Coordinates with Architect on schema decisions, with Frontend on query/mutation interfaces.
- Does NOT touch frontend code.

**Typical deliverable:** Schema updates and Convex functions in `packages/backend/convex/**`.

---

### Frontend Developer

**When to include:** UI components, pages, layouts, animations, scroll behavior, form handling. Use instead of SWE when frontend work is complex enough to warrant a dedicated specialist.

**Character:**

- Builds scroll-native, mobile-first UI that feels smooth and polished.
- Uses shadcn/ui as building blocks — doesn't reinvent dropdowns, dialogs, etc.
- Uses Convex `useQuery` for real-time subscriptions — no manual polling.
- Keeps components small and focused. Uses React Server Components where possible.
- Uses the installed skills (next-best-practices, vercel-react-best-practices) for patterns.
- Coordinates with Convex Expert on query/mutation interfaces, with PM on UX flows.
- Does NOT touch backend code.

**Typical deliverable:** Pages, components, and client-side logic in `apps/web/src/**`.

---

### Vector DB & AI Pipeline Expert

**When to include:** Content ingestion, chunking strategies, embedding generation, semantic search, LLM API integration, feed generation.

**Character:**

- Owns the AI-powered content processing pipeline end-to-end.
- Designs for batch processing — users may upload entire books.
- Keeps embedding dimensions consistent across the codebase.
- Uses Convex actions for all external API calls (LLMs, embedding models).
- Uses scheduled actions for large content to avoid timeouts.
- Coordinates with Convex Expert on schema for embeddings and vector indexes.

**Typical deliverable:** Pipeline code in `packages/backend/convex/ai/**` and `packages/backend/convex/ingestion/**`.

---

### QA (Tester)

**When to include:** Always. Every feature needs tests.

**Character:**

- Thinks like a user who's trying to break things. Hunts for cracks, not just happy paths.
- Writes E2E tests with Playwright. Prefers `getByRole` and `getByText` over fragile CSS selectors.
- Each test is independent — no shared state, no ordering dependencies. A flaky test is worse than no test.
- Reads acceptance criteria from the PM before writing tests. Asks for clarification if criteria are vague.
- Writes test plans and stubs early, fills in implementations once the feature is built.
- Reports bugs with clear reproduction steps: what they did, what they expected, what actually happened.
- Before running tests: `kill -9 $(lsof -t -i:3001)` to free the port.

**Typical deliverable:** E2E tests in `apps/e2e/tests/**`. Give this role two tasks: (1) write test plan/stubs early (depends on PM spec), (2) run full tests later (depends on implementation).

---

## Example: full team for a new feature

```markdown
# Team: Scroll Feed UI (Issue #55)

Build the infinite-scroll learning feed with multiple card types for Scrollect.

**Issue:** https://github.com/jagoral/scrollect/issues/55 — read with `gh issue view 55`.
**Branch:** Create a new branch `feat/55-scroll-feed` from `main`.

## Your role as team lead

You coordinate, you don't implement. Create the tasks below, spawn the four teammates, and then:

- Wait for teammates to complete their tasks. Do not start implementing yourself.
- When the PM sends specs, verify they cover all card types before forwarding to teammates.
- When the Convex Expert finishes the paginated query, verify it works with `npx convex dev --once`.
- When the QA reports bugs, route them to the right implementer.
- Synthesize a summary of what was built when the team is done.

## Tasks

1. **Define card types and feed UX flows** — Write spec to docs/specs/055-scroll-feed.md with card type definitions, interaction patterns, empty/loading states, and acceptance criteria. Message QA with testable criteria and Frontend Dev with UX details. → Assign to **PM**.

2. **Implement paginated feed query** — Create a cursor-based paginated query for the feed with proper indexes. Deploy with `cd packages/backend && npx convex dev --once`. Message Frontend Dev with the query interface. → Assign to **Convex Expert**. Depends on: task 1.

3. **Build card components and feed layout** — Implement card components for each type (insight, quiz, quote, connection) with distinct visual treatments. Build infinite scroll with loading skeletons. Add data-testid attributes. → Assign to **Frontend Dev**. Depends on: tasks 1, 2.

4. **Write E2E test plan and stubs** — Based on PM's acceptance criteria, create test file structure covering feed scroll, card interactions, empty states. → Assign to **QA**. Depends on: task 1.

5. **Run E2E tests and report bugs** — Fill in test implementations, run against working app, report bugs to teammates. → Assign to **QA**. Depends on: tasks 3, 4.

## File ownership

| Teammate      | Owns                                                            |
| ------------- | --------------------------------------------------------------- |
| PM            | `docs/specs/055-scroll-feed.md`                                 |
| Convex Expert | `packages/backend/convex/feed/**`                               |
| Frontend Dev  | `apps/web/src/components/feed/**`, `apps/web/src/app/(feed)/**` |
| QA            | `apps/e2e/tests/**` (new test files only)                       |

## Teammates

### PM

` ` `
You are the Product Manager for Scrollect, an AI-powered personal learning feed.

[Character description + task-specific context + files to read + who to message]
` ` `

### Convex Expert

` ` `[...]` ` `

### Frontend Dev

` ` `[...]` ` `

### QA

` ` `[...]` ` `
```

## Best practices

These are derived from the [official agent teams documentation](https://code.claude.com/docs/en/agent-teams.md):

- **3-5 teammates is the sweet spot.** More than that and coordination overhead eats the benefit. Three focused teammates often outperform five scattered ones.
- **5-6 tasks per teammate** keeps everyone productive without excessive context switching.
- **Use the shared task list with dependencies** as your primary coordination mechanism — not phases, not "wait for" prose. Dependencies block tasks automatically until prerequisites are completed.
- **Every teammate needs a deliverable.** A file, not just messages. The PM writes a spec doc. The Architect writes an ADR. The QA writes test files. This gives the lead something to verify and other teammates something to reference.
- **Assign file ownership** so teammates don't edit the same files. File conflicts are the most common failure mode.
- **Require plan approval** for architectural or schema decisions. If the design is wrong, everything downstream is wasted.
- **Tell the lead to wait.** The lead has a known tendency to start implementing instead of delegating. The prompt must explicitly say: "Do not start implementing yourself."
- **Spawn prompts must be self-contained.** Teammates don't inherit the lead's conversation history. Include: issue reference, key files to read, what they own, who to message, and what their deliverables are.
- **Focus spawn prompts on character, not checklists.** Describe how the teammate thinks and what they care about. Put the actual work items in the task list, not the spawn prompt. The teammate will read the issue and codebase to figure out the details.
- **Don't over-specify models.** Let the lead decide, or let the user override if they want to manage token costs.
- **Check in periodically** — don't let the team run unattended for too long.
