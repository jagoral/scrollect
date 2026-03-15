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

Agent definitions live in `.agents/agents/`. **Read each agent's file** for their full persona, responsibilities, and constraints. Use these as spawn prompt foundations — adapt with task-specific context (issue reference, key files to read, deliverables, who to message).

Available agents:

| Agent file                                 | Role                     | Edits code? | When to include                                                     |
| ------------------------------------------ | ------------------------ | ----------- | ------------------------------------------------------------------- |
| `.agents/agents/architect.md`              | System design, ADRs      | Yes         | Schema changes, new modules, data flow design, integration patterns |
| `.agents/agents/project-manager.md`        | Backlog, issues, specs   | No          | Feature scoping, acceptance criteria, prioritization                |
| `.agents/agents/frontend-developer.md`     | Frontend implementation  | Yes         | UI components, pages, scroll behavior, form handling                |
| `.agents/agents/backend-developer.md`      | Backend implementation   | Yes         | Convex functions, schema, pipeline, auth, AI/embeddings             |
| `.agents/agents/qa.md`                     | Test strategy, E2E tests | Yes         | Always — every feature needs tests                                  |
| `.agents/agents/architect-reviewer.md`     | Architectural review     | No          | Cross-cutting concerns, scalability, design pattern review          |
| `.agents/agents/code-reviewer-frontend.md` | Frontend code review     | No          | React/TanStack pattern review                                       |
| `.agents/agents/code-reviewer-backend.md`  | Backend code review      | No          | Convex pattern review                                               |

**Require plan approval** for the Architect role — if the design is wrong, everything downstream is wasted work.

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
