---
status: proposed
date: 2026-03-25
---

# ADR-016: Feed v2 ranking and serving

## Context

Issue #143. ADR-013 and ADR-015 moved card generation to write-time, producing a pool of ~50-200 `cardDrafts` per user. The old `generateFeed` action scores, generates, and validates cards in a single 4-minute LLM call. With drafts pre-computed, serving becomes a read-and-rank operation. This ADR defines the scoring formula, ordering constraints, schema simplification, and serving lifecycle that replace the old pipeline.

The app is not live yet - no migration needed. Personal scale (10-100 documents, 200-2000 drafts per user) means in-memory scoring is viable.

## Decision

### 1. Scoring formula

`score = qualityScore * computeRecencyBoost(docAge) * highlightMultiplier / (1 + servedCount)`

- `qualityScore`: 0.0-1.0, computed at draft generation time (ADR-013 section 7)
- `computeRecencyBoost`: reuse existing function from `feed/logic/constants.ts` - 2x boost for <48h, linear decay to 1.0 over 7 days
- `highlightMultiplier`: binary field check - `strategy === "highlight"` yields `HIGHLIGHT_BOOST` (3.0), else 1.0. No join required
- Saturation penalty: `1 / (1 + servedCount)`. First serve = full score, second = 50%, third = 33%. Simple, never-zero, tunable by adding a coefficient later

### 2. Configurable scoring weights

All scoring weights and constraints are extracted into a `ScoringConfig` object passed to the scoring function, not hardcoded. Export a `DEFAULT_SCORING_CONFIG` with current values.

```ts
type ScoringConfig = {
  highlightBoost: number; // 3.0
  maxConsecutiveSameType: number; // 3
  documentDiversityCap: number; // 0.4
  batchSize: number; // 15
  replenishmentThreshold: number; // 10
};
```

This matters for two concrete reasons: (a) prompt eval (Issue #142) showed that scoring parameters need rapid iteration - swapping a config object is a one-line change vs hunting through scattered constants, and (b) future feature flags and A/B testing of ranking strategies can swap the entire config without touching scoring logic. The scoring function signature is `scoreDrafts(drafts, config, now)` - pure, deterministic, trivially testable.

### 3. Ordering constraints

Applied as post-scoring reorder passes, not scoring weights:

- **Type diversity**: greedy reorder - if the next card exceeds `maxConsecutiveSameType` (3), scan forward for a different-type card and swap. If none exists, accept the violation. Best-effort, not strict
- **Document diversity**: cap at `documentDiversityCap` (40%) of batch from a single document. Excess cards demoted to end of list. Prevents large books from dominating

### 4. Schema changes

**`posts` table** - simplify attribution from chunk-level to section-level:

- Remove: `primarySourceChunkId`, `sourceChunkHash`, `primarySourcePageNumber`
- Remove index: `by_userId_sourceChunkHash`
- Add: `sectionTitle` (optional string), `pageStart` (optional number), `pageEnd` (optional number), `cardDraftId` (id of cardDrafts), `fileType` (string, denormalized from document)
- Keep: `primarySourceDocumentId`, `primarySourceDocumentTitle`

Read-site impact: `feed/queries.ts`, `bookmarks.ts`, `account.ts` (cascade), `testing.ts`, and frontend types in `cards/types.ts`, `card-shell.tsx`, `chunk-context-sheet.tsx`, `use-connection-sources.ts`. The chunk context expand sheet is removed this increment since it depends on `primarySourceChunkId`.

`pageStart`/`pageEnd` are resolved at draft-to-post conversion from `sectionSummary.chunkStartIndex/chunkEndIndex` chunk `pageNumber` values. Only populated for PDF/EPUB. `sectionTitle === "(ungrouped)"` (pipeline sentinel) must be treated as undefined at conversion time - never shown to users.

**`postSources` table** - remove entirely. Chunk-to-post tracking is no longer needed. Impacts: `documentActions.ts` cascade delete, `account.ts` data export.

**`cardDrafts` table** - extend for serving lifecycle:

- Add `servedCount` (number, default 0)
- Add `"served"` to `cardDraftStatus`: `pending | served | used | rejected`

### 5. Draft status lifecycle and replenishment

`pending` -> `served` on first serve (increment `servedCount`). Replenishment counts `pending` drafts only. When pending count drops below threshold (10), schedule regeneration via `ctx.scheduler.runAfter(0, internal.pipeline.cardDraftGeneration.regenerateDrafts, { userId })`.

When all drafts are `served` (zero `pending`), re-serve highest-scored `served` drafts with incrementing `servedCount`. Saturation penalty ensures variety across re-serves.

### 6. Query-time scoring, not materialized

At personal scale (200-2000 drafts), scoring in memory is <100ms. Materializing scores would add write amplification on every `servedCount` increment, document age tick, and config change - for zero latency gain. If draft pools exceed 10k per user, revisit with a materialized top-N approach.

### 7. Event-driven replenishment, not cron

Convex crons are global, not per-user - would require iterating all users on every tick. Event-driven `ctx.scheduler.runAfter` from the serving mutation fires only for active users, triggers instantly (no tick delay), and costs nothing when idle. Guard with a "last regeneration timestamp" check if rate-limiting is needed later.

### Alternatives considered

- **Separate `feedQueue` table with materialized scores** - Adds a sync layer between drafts and queue. At 200 drafts, sorting in memory is trivial. The queue table becomes a liability when scoring parameters change (requires full recompute)
- **Cron-based replenishment** - Polls all users on a fixed interval. Wasteful for a personal app with sporadic usage. Event-driven is immediate and zero-cost when idle
- **Strict type diversity (reject batches that violate)** - Over-constrains small draft pools. A user with mostly insight drafts would get empty feeds. Best-effort greedy reorder gracefully degrades
- **Hardcoded scoring constants** - Simpler initially, but prompt eval iteration (Issue #142) already showed we need rapid weight tuning. The config object pays for itself immediately
- **Weighted scoring for type diversity (instead of reorder pass)** - Mixing diversity into the score function couples concerns. A post-scoring reorder pass is easier to reason about and test independently

## Consequences

- Feed serving drops from ~4 minutes to <500ms - read drafts, score, reorder, convert to posts
- Old generative pipeline (`feed/logic/generateFeed.ts`, `discovery.ts`, `sampling.ts`, `connectionEnrichment.ts`, `interleaving.ts`, `highlightMatching.ts`, `selectionLogic.ts`, `feedPrompt.ts`, `validation.ts`, `feed/generation.ts`, `feed/services.ts`) is fully deleted. Delete last, after new code and tests pass
- `ScoringConfig` enables weight tuning without code changes - future A/B testing swaps config, not logic
- `fileType` denormalization on posts means frontend can render source-type-aware attribution (page ranges for PDF/EPUB, timestamps for YouTube) without joining to documents
- Chunk context expand sheet is removed this increment. Re-add later using `cardDraftId -> sectionSummaryId -> sectionSummary.summary`
- Schema assumption: personal scale (200-2000 drafts). Query-time scoring breaks above ~10k drafts per user. Current target of 10-100 documents produces well under this ceiling

## More Information

- ADR-013 defines `cardDrafts` schema and generation pipeline
- ADR-015 defines highlight-triggered draft generation and `strategy: "highlight"`
- `feed/logic/constants.ts` contains `computeRecencyBoost`, `HIGHLIGHT_BOOST`, `MAX_CONSECUTIVE_SAME_TYPE` - reused by the new scoring function
- Issue #142 established the prompt eval framework that motivates configurable scoring weights
