---
status: accepted
date: 2026-03-15
---

# ADR-007: Freshness mechanics for recently uploaded documents

## Context

Issue #74 asks for visual and algorithmic treatment of recently uploaded documents: a "New" badge on feed cards whose source document was uploaded within the last 48 hours, and a honeymoon boost (2x sampling weight) for chunks from those documents during feed generation. Both should decay gracefully when the freshness window expires.

The backend already has a `computeRecencyBoost()` function in `sampling.ts` that returns 2.0 for docs under 48h old and linearly decays to 1.0 over 7 days. However, this boost only applies in the `weightedSample()` selection path. The `semanticSelect()` path delegates final ranking to `rankByUsage()` which ignores document age entirely, and the legacy/random path uses `shuffle()` with no weighting at all. On the frontend, the `list()` query returns no freshness information, so cards have no way to know whether their source document is new.

There are two distinct questions: (1) how to apply recency boost consistently across all selection paths, and (2) how to surface freshness to the frontend for the badge.

## Decision

### 1. Extract freshness constants to `packages/backend/convex/feed/constants.ts`

The constants are consumed by three files within `feed/` (`sampling.ts`, `selectionLogic.ts`, `queries.ts`), justifying a shared module. The file contains only freshness-related domain logic - not a grab-bag utility.

Named exports:

- `FRESHNESS_WINDOW_MS` - 48 hours
- `FRESHNESS_DECAY_WINDOW_MS` - 7 days
- `FRESHNESS_BOOST_FACTOR` - 2.0
- `computeRecencyBoost()` - pure function with three phases: full boost, linear decay, baseline

The frontend does not need these constants because `isNew` is computed server-side (see decision 3).

### 2. Apply recency boost in `rankByUsage()` and `frontLoadFreshChunks()`

The `semanticSelect()` function calls `rankByUsage()` for its final chunk ordering. The `rankByUsage()` function now accepts optional `docCreatedAtMap` and `now` fields and multiplies the recency boost into the weight calculation, exactly as `weightedSample()` already does.

For shuffle fallback paths (no doc summaries, empty semantic chunks), `frontLoadFreshChunks()` moves fresh chunks to the front but caps them at `count / 2` to preserve cross-document diversity. Without capping, a single large fresh document could dominate all selected chunks.

Updated approach per selection path:

- `weightedSample()` - already applies recency boost correctly (no change)
- `semanticSelect()` primary path - recency boost via `rankByUsage()` with `docCreatedAtMap`/`now`
- `semanticSelect()` fallback paths - `frontLoadFreshChunks()` with diversity cap
- Legacy `shuffle()` path - deliberately unweighted (on its way out)

### 3. Compute `isNew` server-side in the `list()` query - no schema change

The `list()` query reads source documents via a deduplicated `Map<Id, Doc>` (one `db.get()` per unique document, not per post) and computes `isNew: (now - doc.createdAt) < FRESHNESS_WINDOW_MS`.

**Note on reactivity:** `Date.now()` in Convex queries is non-deterministic. The `isNew` flag will update on the next query re-evaluation triggered by any data write - not at the exact 48-hour mark. This is acceptable: user interactions (generate feed, bookmark, react) trigger re-evaluation frequently.

**Why server-side computation, not client-side:**

- Client-side computation requires sharing the freshness constant across packages
- Client-side `Date.now()` drifts from server time
- The `isNew` boolean is a single derived field with no client-side variation

**Why runtime lookup, not denormalization:**

- `isNew` is transient (no post is "new" after 48h) but a schema field persists forever
- Deduplicated doc lookups keep the read count low (unique docs per page, not N per post)
- Same trade-off as ADR-006 for tags: runtime resolution, always-consistent

### 4. Frontend "New" badge in `CardShell`, `freshness` Badge variant

Add `isNew?: boolean` to the `PostCardData` interface (optional so existing code is unaffected).

The "New" badge renders inside `CardShell` above the card content, ensuring it appears consistently across all card types regardless of whether a card type renders `SourceBadge` or not.

Uses a dedicated `freshness` Badge variant in `badge.tsx` (emerald color scheme) instead of inline color overrides, following shadcn semantic styling patterns. The badge includes `aria-label` and `aria-hidden` on the decorative dot for accessibility.

### Alternatives considered

- **Denormalize `sourceDocumentCreatedAt` onto posts table** - Write-once so no fan-out risk, but adds a permanent field for a transient flag. The runtime lookup costs one `db.get()` per unique document per page which is trivial at personal scale.
- **Client-side freshness computation** - Expose `sourceDocumentCreatedAt` and let the frontend compare against `Date.now()`. Introduces cross-package constant coupling and client/server clock skew.
- **Separate `freshness` query endpoint** - Over-engineered for a single boolean. Tags justified a separate query because they involve a join; freshness is a field comparison.
- **Apply recency boost inside `semanticSelect()` before calling `rankByUsage()`** - Pre-filtering by recency would fight the semantic relevance signal. The right place is inside the ranking function.

## Consequences

- **Recency boost coverage**: All active selection paths (semantic and weighted) respect document freshness. Fallback paths cap fresh chunks at 50% for diversity. Legacy random path remains unweighted
- **Feed query cost**: Deduplicated document lookups add at most `uniqueDocCount` reads per page (typically 5-8 for a 10-post page). Well within Convex query budget
- **Schema stability**: No schema migration needed. `isNew` is computed at query time
- **Frontend impact**: `PostCardData.isNew` is optional. `CardShell` gains a small conditional badge render. New `freshness` Badge variant centralizes the color scheme
- **Testability**: `computeRecencyBoost()` is a pure function with deterministic tests. `rankByUsage()` gains optional params with defaults so existing tests pass unchanged. Critical invariant tested: unused old content outranks heavily-used fresh content (freshness boosts, not overrides)
- **Clock dependency**: `isNew` depends on `Date.now()` and updates on the next data-triggered re-evaluation, not at the exact 48-hour mark

## More Information

- The `computeRecencyBoost()` linear decay from 2.0 to 1.0 over 48h-7d is intentionally different from the badge's hard 48h cutoff: the badge is a binary visual signal, the weight is a continuous ranking factor
- If Scrollect later adds user-configurable freshness windows, the constants become fields on a settings table. The architecture supports this without structural changes
- Related: ADR-006 (tagging system) made the same denormalize-vs-runtime trade-off and chose runtime
