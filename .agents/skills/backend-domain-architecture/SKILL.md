---
name: backend-domain-architecture
description: Scrollect backend architecture design gate for packages/backend architectural decisions. Use when deciding where backend logic belongs, extracting pure domain logic from Convex, creating or changing public backend APIs, designing provider ports or service contexts, refactoring oversized domain modules, resolving duplicated orchestration, or reviewing DDD/SOLID/DRY/YAGNI tradeoffs. Also trigger on explicit architecture review/critique requests for backend work. Do not use for routine Convex edits that only need backend-development; use both skills when the architectural decision touches Convex functions, pipeline stages, schema-facing work, provider wiring, or service contracts.
---

# Backend Domain Architecture

Use this skill as the design-quality gate before editing or reviewing Scrollect backend code. It
turns generic architecture ideas into project-specific rules for `packages/backend`.

The goal is not architecture theater. The goal is backend code that says what Scrollect means:
saved documents become learning material, the pipeline turns material into cards, and the feed
serves useful knowledge at the right time.

## Mandatory Preparation

Before proposing architecture or editing backend files:

1. Read the existing code around the target domain. Do not infer boundaries from filenames alone.
2. Identify the domain words the code should use: documents, pipeline, feed, tags, entitlements,
   auth, billing, highlights, connections, or another explicit Scrollect concept.
3. Decide which companion skills apply.
4. Decide whether the task creates or changes a public backend API contract.
5. Decide whether the task is an implementation change, a refactor, or a review/critique.
6. If the user asks for review, critique, or validation, read
   `references/architecture-review-rubric.md` before writing findings.
7. If the task needs concrete Scrollect examples, read `references/scrollect-pattern-examples.md`.

## Companion Skills

Use this skill with other skills when their rules materially apply:

- `backend-development`: always for Convex functions, pipeline stages, provider wiring,
  validators, schema-facing work, backend testing conventions, and files under
  `packages/backend/convex/`.
- `tdd`: for behavior changes in pure logic, provider contracts, pipeline planning, feed scoring,
  deletion flows, and bug fixes where a focused regression test is practical.
- `wide-event-logging`: when adding side effects, observability, pipeline diagnostics, or replacing
  ad-hoc logs in Convex code.
- `convex-security-check`: for auth, authorization, row-level access, private data, webhooks,
  function exposure, or multi-user boundaries.
- `convex-schema-validator` and `convex-migrations`: when changing tables, validators, indexes,
  backfills, or zero-downtime data shape.
- `ai-sdk`: when the boundary involves LLM calls, structured output, tool calling, embeddings, model
  selection, or provider behavior.
- `.agents/agents/backend-public-api-reviewer.md`: spawn this reviewer whenever the change creates
  or changes a public backend API contract. Public means callable outside the defining module or
  layer, not necessarily internet-public.

Do not invoke every related skill by habit. Use the smallest set that catches the real risk.

## Architecture Score

For architecture review or design critique, give a 0-10 score and concrete steps to reach 10.

A 10/10 Scrollect backend design has:

- clear Scrollect domain language
- explicit Convex, domain logic, and provider boundaries
- dependencies pointing inward toward domain decisions
- external systems behind typed ports when that improves testability or replaceability
- no speculative abstractions, schemas, indexes, providers, or exports
- focused tests for the riskiest domain behavior
- no conflict with `backend-development` operational safety rules

If the score is below 8, name the top two changes that would most improve it.

## Architecture Map

Treat `packages/backend` as three architectural zones:

- `convex/`: the Convex edge. It exports queries, mutations, actions, HTTP handlers, schemas,
  validators, auth helpers, logging, and Convex-specific adapters.
- `src/`: non-Convex TypeScript domain logic plus provider implementations. Domain logic here
  should be pure when practical; provider implementations may call SDKs and external services. Code
  here should not import Convex runtime APIs or generated Convex types.
- `tests/`: focused tests for pure logic, provider behavior, and backend workflows.

Providers are an architectural layer, not a product domain. They should adapt external systems into
Scrollect language through ports and service contexts.

## Dependency Rule

Dependencies should point inward toward domain decisions:

- `convex/` may import `src/` logic and provider types.
- `src/providers/` may implement SDK or network adapters.
- `src/pipeline/logic`, `src/feed/logic`, and `src/logic` should not import Convex generated APIs,
  Convex validators, `ctx`, SDK construction, environment variables, or `WideEvent`.
- Pure domain logic should depend on typed capabilities, not concrete providers.

When this direction feels hard, treat it as a design signal. Either the domain code is doing too
much persistence work, or the Convex handler is hiding a domain decision that should be named.

## Controller / Orchestration / Service

Use this as the default shape:

1. **Controller at the Convex edge**: authenticate, validate args, read/write Convex state,
   schedule work, emit `WideEvent`s, capture analytics, and translate Convex IDs or validators.
2. **Orchestration in pure domain code when reusable or policy-heavy**: decide what should happen,
   order provider calls through typed ports, compute plans, normalize inputs, and return records or
   metrics that the Convex edge can persist.
3. **Services behind typed ports**: external systems and LLMs enter through interfaces in
   `src/providers/types.ts`; concrete wiring happens at the edge, usually in
   `convex/pipeline/services.ts` or a similarly local factory.

This is Scrollect's practical version of Clean/Hexagonal Architecture. Adapt the dependency rule,
ports, and adapters to the current Convex-first backend. Do not impose a generic folder template.

Keep simple Convex functions simple. Do not extract a one-off `ctx.db.patch` into `src/` just to
make the layers look symmetrical.

## Placement Decision Tree

Ask these questions in order:

1. Does it need `ctx.db`, `ctx.storage`, `ctx.scheduler`, `ctx.runQuery`, `ctx.runMutation`,
   `ctx.runAction`, Convex validators, generated `api`, generated `Id`, auth helpers, or
   `WideEvent`? Keep that part in `convex/`.
2. Can the rule be expressed over plain TypeScript inputs and outputs? Put it in `src/`.
3. Does it call OpenAI, Qdrant, Marker, PostHog, Polar, Decodo, storage, or another external system?
   Define or reuse a typed port, then wire the concrete adapter at the edge.
4. Is it duplicated domain policy used by multiple Convex functions? Extract to `src/`.
5. Is it duplicated shape only, with different domain meaning? Leave it alone or name two separate
   domain helpers.
6. Does it need a new schema field, index, provider, or export only for a future idea? Do not add it
   yet.

## Interface Design

When adding or reshaping a provider port, service context, or domain use-case interface, do a small
"design it twice" pass before coding:

1. Name the callers: Convex action, internal mutation, pure logic test, provider implementation, or
   future scheduled workflow.
2. List the operations the caller really needs now.
3. Sketch two materially different shapes:
   - narrow: the smallest interface that serves the current use case
   - flexible: the shape that would support the likely next nearby use case
4. Compare them in prose: ease of correct use, ease of misuse, testability, implementation
   efficiency, and how much complexity the interface hides.
5. Choose the narrowest shape that still has enough depth to hide real complexity.

For large interface decisions, use subagents to generate genuinely different options. For small
ports, do the comparison inline and keep moving.

## Public API Review Gate

Before implementing a new or changed public backend API, spawn a dedicated public API reviewer
subagent from `.agents/agents/backend-public-api-reviewer.md` and incorporate the feedback before
finalizing the API shape.

Public backend API means any contract that another module, layer, or caller depends on:

- exported Convex queries, mutations, actions, HTTP actions, and internal functions
- new or changed `args` or `returns` validators for backend functions
- provider ports, service contexts, concrete service factories, and service methods
- exported pure use-case functions from `src/` that are called outside their local module
- shared DTOs, plan/result types, error shapes, and capability interfaces

Do not trigger this gate for private helpers that are used only inside one file, test-only factories,
or mechanical implementation changes that keep an existing contract stable.

Give the reviewer enough context to judge the API, not just the diff:

- the intended current caller and any near-term caller already in scope
- the proposed function or interface signature
- whether the API is Convex edge, pure domain logic, provider port, service context, or adapter
- expected authorization, idempotency, pagination, retry, and error behavior
- what tests will lock the contract down

Treat the reviewer as a design checkpoint, not a veto machine. If you reject feedback, state why the
current contract is still easier to use correctly, harder to misuse, and aligned with Scrollect's
backend boundaries.

## Domain Modeling Rules

### Ubiquitous Language

Use Scrollect words in modules, functions, variables, and events. Prefer `planDraftGeneration`,
`deleteDocumentVectors`, or `scoreDrafts` over `processData`, `manager`, `handlerHelper`, or
`utils`.

If a concept is hard to name without a technical placeholder, pause and identify the domain action
or capability it represents.

### Bounded Contexts

Bounded contexts are model boundaries, not deployment boundaries. Keep the monorepo and Convex
deployment shape unless the task explicitly requires a larger structural change.

Current contexts include documents, pipeline, feed, tags, entitlements, auth, billing, highlights,
and connections. The same row can be viewed differently by different contexts; translate at the
boundary rather than passing a bloated universal model everywhere.

### Core / Supporting / Generic

Scrollect's core domain is the personal learning pipeline and feed: turning saved content into
useful learning cards and deciding what to serve next. Invest the deepest modeling there.

Supporting and generic domains should stay appropriately thin:

- auth and billing integrate proven tools and enforce Scrollect-specific policy
- providers adapt external systems into Scrollect language
- migrations and admin utilities should be explicit and boring

### Entities, Values, and Consistency

Use DDD ideas without forcing object-oriented ceremony onto Convex rows:

- durable records with identity, such as documents, card drafts, tags, highlights, and processing
  jobs, are entity-like
- computed inputs, scores, plans, filters, vector IDs, and provider result shapes are value-like
- a Convex mutation or internal mutation group is the immediate consistency boundary
- scheduled actions and retries are how eventual work crosses boundaries

Do not introduce aggregate classes unless behavior and tests clearly benefit. A well-named pure
function over plain data is often the right Scrollect shape.

### Domain Events

Do not create an event system by default. Use domain-event thinking to name facts and transitions:
`pipeline.stage_completed`, `pipeline.stage_failed`, `documentActions.deleteDocument`, and similar
wide events or analytics events should describe what happened in Scrollect language.

Only add a new event or event-like abstraction when another current workflow consumes it or when it
materially improves observability.

## Design Principles

### SOLID

Keep each module focused on one reason to change. Split a file when it mixes transport, persistence,
provider wiring, and domain policy. Depend on abstractions at external boundaries, but do not wrap
internal functions in interfaces just because SOLID sounds impressive.

### DRY With Judgment

Deduplicate repeated domain decisions and repeated workflows. Leave duplication alone when it is
only structural coincidence, when a helper would hide important domain language, or when two domains
are likely to evolve differently.

### YAGNI

Avoid speculative schemas, indexes, providers, service contexts, exports, and generic abstractions.
Add an abstraction only when there is a current caller, a testable payoff, or repeated logic already
making changes risky.

### Modularity

Prefer small domain files over god files. Split by responsibility, not just by line count. When
refactoring Convex functions, preserve stable exported function names unless the API change is part
of the task.

### Parameter Shape

Do not create functions with more than three positional parameters. Use an object parameter so call
sites name the values they pass.

## Pre-Edit Checklist

Answer these before changing backend architecture:

- Which companion skills apply?
- Which backend domain owns this change?
- What Scrollect domain words should appear in the code?
- Is this Convex edge behavior, pure domain logic, provider implementation, or provider wiring?
- Does any new `src/` code import Convex runtime APIs or generated Convex modules? If yes, redesign.
- Is there an existing port or service context to reuse?
- Does this create or change a public backend API? If yes, what should the
  `backend-public-api-reviewer` inspect before the contract is finalized?
- Are retries, recovery, scheduler boundaries, and state transitions still owned by Convex code?
- Is external I/O completed before status transitions that imply durable completion?
- Is this abstraction serving a current caller and testable need?
- What focused tests would catch a behavior change?

## Implementation Flow

When implementing or refactoring:

1. Load the companion skills identified in the pre-edit checklist.
2. If behavior changes and a focused test is practical, use `tdd`: write or update the smallest
   failing test first, then make it pass.
3. Move only the boundary that the task requires. Avoid opportunistic domain reshuffles.
4. If creating or changing a public backend API, run the Public API Review Gate before committing to
   the final signature.
5. Keep exported Convex function names stable unless the API change is intentional.
6. Prefer extracting pure logic before introducing a service context. Add the context only when the
   use case needs external capabilities or clearer tests.
7. Keep persistence, scheduling, retries, and recovery at the Convex edge.
8. Run focused tests for pure logic and the repo checks appropriate to the changed files.
9. If Convex schema or functions changed, follow `backend-development` and deploy with
   `cd packages/backend && npx convex dev --once`.

## Review Flow

When reviewing a backend design or implementation:

1. Gather context: changed files, relevant domain, existing tests, linked issues or ADRs, and
   companion skills used.
2. Score the architecture from 0 to 10 using `references/architecture-review-rubric.md`.
3. Lead with findings ordered by risk.
4. For each finding, name the violated boundary or design rule and give a small repair path.
5. Call out over-engineering separately from under-engineering.
6. End with what would make the score a 10.

Be direct. Vague architecture feedback wastes time.

## Review Checklist

Use this checklist during review:

- Convex handlers are thin enough: auth, validation, reads/writes, scheduling, logging, analytics,
  and persistence stay there; domain policy does not accumulate there.
- Pure logic in `src/` has no Convex runtime imports and is testable with plain objects or mocked
  service contexts.
- Provider code is behind typed ports; concrete SDK construction and environment-based stubs are
  wired at the edge.
- Dependency direction is preserved: domain logic does not know about frameworks, generated Convex
  APIs, SDK construction, or environment variables.
- Names use Scrollect domain language instead of technical placeholders.
- No junk-drawer module, god file, or coincidental helper was added.
- No speculative schema, index, provider, export, or generic framework was added.
- Existing `backend-development` rules still hold for auth, validators, wide events, indexed
  queries, bounded user-facing reads, batch operations, and pipeline safety.
- New or changed public API contracts were reviewed by `backend-public-api-reviewer`, or the review
  was intentionally skipped because the contract remained private or unchanged.
- Tests match the risk: pure logic gets unit tests; Convex behavior gets targeted integration or
  E2E coverage only when it is stable and maintainable.

## Pattern Examples

For implementation-specific examples with current paths, read
`references/scrollect-pattern-examples.md`.

### Document Deletion Cascade

A document deletion action should own auth, logging, status transitions, recovery, and cascade
mutation boundaries. Provider-independent vector deletion policy should live in pure logic behind
a typed vector-deletion service. Tests should exercise the pure deletion use case with mocked vector
stores.

This pattern avoids duplicating vector cleanup logic across user deletion, document deletion, and
retry paths while keeping Convex state transitions in Convex.

### Pipeline Logic Extraction

Pipeline stages should keep scheduling, retries, status recovery, and persistence at the Convex edge.
Planning, scoring, prompt-independent selection, grouping, and provider-independent generation rules
belong in pure logic. Provider calls should flow through service contexts so tests can use stubs.

### Feed Serving Scoring

Feed serving should own user auth, bounded Convex reads, mutation writes, analytics capture, and
replenishment scheduling. Ranking math and analytics metric calculations should be pure functions
over plain draft/document inputs.

### Provider Boundary

Provider ports should be capability-focused: embed text, upsert vectors, search summaries, generate
cards, validate cards. Concrete SDK construction and environment-based stub selection should happen
at the Convex edge, not inside pure domain logic.

## Avoid These Traps

- Do not say "all orchestration belongs in `src/`." Convex orchestration is legitimate when it
  coordinates transactions, scheduling, recovery, and internal functions.
- Do not implement a generic Clean Architecture directory template. Respect Scrollect's current
  Convex-first architecture.
- Do not make service contexts mandatory ceremony. They are useful when they reduce coupling or
  make domain logic testable.
- Do not copy `backend-development`. Reference it and keep this skill about architectural judgment.
- Do not split files mechanically. A small file with the wrong responsibility is still wrong; a
  larger file can be acceptable when it protects a stable Convex API and has clear internal
  structure.
- Do not hide domain language behind generic names like `manager`, `processor`, `helper`, or
  `utils`. Name the use case or capability directly.
