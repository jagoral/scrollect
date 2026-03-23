---
status: accepted
date: 2026-03-22
---

# ADR-012: Service layer with dependency injection for feed generation

## Context

The feed generation pipeline (`feed/generation.ts`, ~530 lines) orchestrates chunk selection, LLM calls, validation, deduplication, interleaving, and persistence in a single Convex action handler. It creates all external dependencies internally via singletons (`getAI()`) and factory functions (`createVectorStore()`, etc.), making the orchestration logic impossible to unit-test without hitting real OpenAI, Qdrant, and PostHog APIs.

The pure logic modules (`sampling.ts`, `selectionLogic.ts`, `discovery.ts`, `interleaving.ts`, `validation.ts`, `connectionEnrichment.ts`) are already well-tested because they accept interfaces or plain data as parameters. The gap is strictly the orchestration layer that ties them together.

As the feed generation logic grows more complex (new card types, smarter selection, retry strategies), the inability to test orchestration at the unit level becomes a scaling bottleneck.

## Decision

### Service context objects with parameter injection

Introduce a `FeedServiceContext` type that bundles all injectable external dependencies:

```ts
type FeedServiceContext = {
  cardGenerator: CardGenerationService;
  embedder: EmbeddingProvider;
  vectorStore: VectorStore;
  summaryStore: SummaryVectorStore;
  analytics: AnalyticsService;
  contentFetcher: ContentFetcher;
};
```

Convex actions become thin controllers that (1) authenticate, (2) create the service context, (3) load data from Convex, (4) call the orchestration function, and (5) persist results. The orchestration function receives `FeedServiceContext` as a parameter and has no Convex `ctx` dependency.

New interfaces added to `providers/types.ts`:

- `CardGenerationService` - wraps LLM structured output generation behind a function-level seam
- `AnalyticsService` - wraps PostHog event capture and AI token usage tracking
- `ContentFetcher` - wraps lazy chunk content loading with caching

### Data loading separation

A `loadFeedData(ctx, userId)` function encapsulates all Convex queries and returns a plain `FeedInputData` object. The orchestration function operates on this data without any Convex runtime dependency.

### Metrics returned alongside results

Each phase function returns its result plus a metrics object. The controller aggregates metrics into a `WideEvent`. Business logic remains logging-unaware.

### Alternatives considered

**DI container (tsyringe, InversifyJS):** The codebase has 5-6 external dependencies in a flat list, not a complex dependency graph. A container adds ceremony (decorators, tokens, registration) without reducing complexity at this scale. Containers shine with 10+ services and deep transitive dependency trees.

**Effect.ts:** Provides typed errors, resource management, and structured concurrency. However, it requires a paradigm shift to functional effects programming, has a steep learning curve, and its runtime model (fibers, layers) maps poorly to Convex's action lifecycle. The problems it solves (typed errors, resource cleanup) are not pain points in this codebase. Would be worth revisiting if the backend grows significantly more complex.

**Provider-level injection (inject AI SDK Provider):** Would still require mocking `LanguageModelV1`, which is a complex streaming/token protocol. A function-level seam (`CardGenerationService.generateCards`) is simpler to mock and fully decoupled from AI SDK internals.

## Consequences

- **Testability**: Orchestration functions can be unit-tested with mock services. Tests inject canned LLM responses and verify the selection-generation-validation-persistence flow
- **No new dependencies**: Zero runtime dependencies added. The approach uses plain TypeScript interfaces and object composition
- **Incremental adoption**: Each pipeline stage can be migrated independently. Feed generation first, then summarizing, embedding, and extraction in follow-up PRs
- **Convex actions stay thin**: The controller pattern (authenticate, create services, load data, orchestrate, persist) becomes the standard for all complex actions
- **Shared mock factories**: `feed/__tests__/mocks.ts` provides `createMockServices()` with per-field overrides, reducing test boilerplate
- **Interface stability**: `CardGenerationService` uses `Record<string, unknown>[]` for card output to avoid circular dependencies between `providers/` and `feed/`. Callers cast to `RawCard` at the boundary

## More Information

- The `FeedServiceContext` pattern mirrors the existing partial injection in `discoverConnections` (accepts `embedder`, `vectorStore`, `fetchContent`) and `semanticSelect` (accepts `embedder`, `summaryStore`). This ADR formalizes and extends that pattern to the full orchestration layer
- The `ContentFetcher` interface wraps the lazy cache pattern currently inline in `generation.ts`. The production implementation captures `ctx` in a closure; the test implementation returns from a pre-loaded `Map`
