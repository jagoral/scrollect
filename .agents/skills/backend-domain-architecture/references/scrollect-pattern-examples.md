# Scrollect Pattern Examples

These examples point to the current backend as of the skill creation. Treat paths as examples of the
pattern, not permanent contracts. If the code moves, preserve the architectural shape.

## Document Deletion Cascade

Current files:

- `packages/backend/convex/documentActions.ts`
- `packages/backend/src/logic/documentDeletion.ts`
- `packages/backend/src/providers/types.ts`
- `packages/backend/convex/pipeline/services.ts`
- `packages/backend/tests/logic/documentDeletion.test.ts`

Pattern:

- The public action owns authentication, `WideEvent`, document status transitions, recovery, retry,
  and internal mutation orchestration.
- The pure use case accepts plain embedding IDs and `VectorDeletionServices`.
- Provider factories create concrete vector stores at the Convex edge.
- Unit tests mock `VectorStore` and `SummaryVectorStore`.

Why it is good:

- external vector deletion policy can be reused without duplicating provider calls
- Convex state transitions stay in Convex
- tests do not need Qdrant or Convex runtime

Watch-outs:

- do not move `ctx.runMutation` cascade calls into `src/`
- do not instantiate Qdrant stores in pure deletion logic
- do not set terminal document status before external cleanup that must succeed

## Card Draft Pipeline

Current files:

- `packages/backend/convex/pipeline/cardDraftGeneration.ts`
- `packages/backend/convex/pipeline/cardDraftSectionGeneration.ts`
- `packages/backend/src/pipeline/logic/draftGenerationPlan.ts`
- `packages/backend/src/pipeline/logic/cardDraftGeneration.ts`
- `packages/backend/convex/pipeline/services.ts`

Pattern:

- Convex actions fetch documents/sections, handle learning-goal waits, create jobs, schedule
  batches, record metrics, persist drafts, retry failures, and mark job completion.
- Pure logic plans draft counts, selects card types, scores section candidates, selects chunks,
  validates type data, and builds draft records.
- Service contexts inject LLMs and validators where the pure use case needs external capability.

Why it is good:

- generation policy can evolve under unit tests
- Convex exports remain stable while internals move
- provider calls are isolated behind typed service contexts

Watch-outs:

- do not make planning depend on Convex rows directly if plain input objects would work
- do not hide scheduler retry decisions inside pure logic
- do not add a service context for a helper that has no external dependency

## Feed Serving Scoring

Current files:

- `packages/backend/convex/feed/serving.ts`
- `packages/backend/src/feed/logic/scoring.ts`
- `packages/backend/src/feed/logic/servingAnalyticsMetrics.ts`

Pattern:

- The Convex mutation owns user auth, bounded queries, joining just enough data, mutation writes,
  analytics capture, and replenishment scheduling.
- Pure scoring and analytics helpers operate over plain draft/document inputs.
- The boundary protects real-time Convex behavior while making ranking math testable.

Why it is good:

- ranking can be tested without a live Convex deployment
- feed-serving policy is not trapped inside one large mutation
- Convex still owns the transaction and subscription-relevant data flow

Watch-outs:

- keep user-facing queries bounded
- do not make scoring fetch its own data
- do not duplicate ranking constants in Convex and pure logic

## Provider Boundary

Current files:

- `packages/backend/src/providers/types.ts`
- `packages/backend/src/providers/*`
- `packages/backend/convex/pipeline/services.ts`
- `packages/backend/src/providers/stubs.ts`

Pattern:

- `src/providers/types.ts` names capabilities such as embedding, vector storage, summary vector
  storage, LLM generation, validation, analytics, extraction, and metadata inference.
- Concrete providers implement those capabilities.
- Convex edge factories choose production or stub implementations.
- Pure use cases receive service contexts instead of constructing providers.

Why it is good:

- tests can inject mocks or stubs
- external SDK churn stays out of domain logic
- capability names stay close to Scrollect use cases

Watch-outs:

- keep ports small and capability-focused
- avoid one giant provider context for unrelated domains
- do not leak provider response shapes into feed or pipeline domain logic
