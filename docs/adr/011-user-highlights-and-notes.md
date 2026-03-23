---
status: proposed
date: 2026-03-22
---

# ADR-011: User highlights and notes as document annotations

## Context

Scrollect generates learning cards from uploaded documents, but it has no signal for what the user actually cared about within those documents. The feed generator treats all chunks equally - a throwaway paragraph and a passage the user highlighted and annotated get the same sampling weight.

We are adding support for importing highlights and notes from Pocketbook e-readers. Pocketbook exports an HTML file per book containing highlighted passages, optional user notes, page numbers, colors, and stable UUIDs. This is the first highlight source; Kindle and Readwise are likely follow-ups.

The core architectural question is where highlights live in the data model and how they influence feed generation without becoming a parallel content pipeline.

## Decision

### 1. Highlights as annotations on existing documents - not standalone content

Highlights are stored in a dedicated `highlights` table linked to documents via `documentId`. A highlight cannot exist without its parent document already being uploaded and processed. This matches the real-world relationship: a highlight is a user's annotation of content that Scrollect already knows about, not new content to ingest.

```ts
highlights: defineTable({
  documentId: v.id("documents"),
  text: v.string(),
  note: v.optional(v.string()),
  pageNumber: v.optional(v.number()),
  sourceMetadata: v.optional(v.record(v.string(), v.string())),
  externalId: v.string(),
  source: highlightSource, // v.union(v.literal("pocketbook"))
  userId: v.string(),
  createdAt: v.number(),
})
  .index("by_userId_documentId", ["userId", "documentId"])
  .index("by_userId_externalId", ["userId", "externalId"]);
```

The `sourceMetadata` field is a flexible key-value bag for source-specific metadata (Pocketbook highlight colors, Kindle locations, Readwise tags) rather than polluting the core schema with per-source fields.

The `by_userId_documentId` index serves the hot path: fetching all highlights for a document when generating cards. The `by_userId_externalId` index enables O(1) dedup on re-import.

### 2. Client-side HTML parsing with DOMParser

Pocketbook export files are HTML. Rather than uploading the HTML to Convex storage and parsing server-side, we parse client-side using the browser's native `DOMParser`. The structured highlight data (text, note, page, color, UUID) is sent directly to a Convex mutation.

This avoids a storage round-trip for a file with no long-term value - the HTML is a transport format, not a source of truth. The browser's DOM parser handles malformed HTML gracefully and requires zero dependencies. If a future source (Kindle, Readwise) provides JSON or CSV, the same pattern applies: parse client-side, send structured data to the mutation.

### 3. Deduplication via externalId

Re-importing the same Pocketbook file must not create duplicate highlights. Each Pocketbook highlight has a stable UUID. We store it as `externalId` and check the `by_userId_externalId` compound index before inserting. New highlights from an updated export are added; existing ones are skipped.

This dedup strategy is source-agnostic - any future source that provides stable IDs (Kindle's annotation ID, Readwise's highlight ID) plugs into the same field and index.

### 4. Text matching for chunk-highlight association

E-reader page numbers do not correspond to PDF page numbers (different font sizes, screen dimensions, reading settings). Instead of page-based matching, we associate highlights with chunks via text containment: a chunk "overlaps" a highlight if the highlight text appears as a substring within the chunk content.

This matching runs at feed generation time, not at import time. There is no denormalized join between highlights and chunks. The cost is bounded: a document with 10-100 highlights and 50-500 chunks means 500-50,000 string containment checks - trivially fast in a single action.

### 5. Feed integration via weight boost and prompt enrichment

Highlights influence feed generation through two mechanisms:

- **Sampling weight boost**: Chunks that overlap with at least one highlight receive a 3x weight multiplier during the weighted random sampling step (see ADR-003 for the sampling algorithm). This makes highlighted passages more likely to appear in card generation batches without excluding non-highlighted content entirely.
- **Prompt enrichment**: When a batch includes chunks that overlap highlights, the generation prompt includes the highlight text and any user notes. This gives the LLM context about what the user found important, enabling more targeted card content (e.g., a quiz focused on the specific concept the user highlighted rather than an adjacent detail).

The 3x multiplier is a starting point. It compounds with the existing recency boost from ADR-003 but caps total weight contribution from highlights to avoid starving non-highlighted chunks entirely.

### 6. Extensible source discriminator

The `source` field uses `v.union(v.literal("pocketbook"))` rather than an open `v.string()`. Adding Kindle support means adding `v.literal("kindle")` to the union - a schema migration, but one that enforces type safety and prevents bad data. The migration cost is low (Convex schema pushes are non-destructive for union extensions), and the safety benefit is high (no typos like "pocktbook" silently accepted).

### Alternatives considered

- **Page number matching** - Mapping e-reader pages to PDF pages. Rejected because e-reader pagination depends on font size, screen dimensions, and reading settings. There is no stable mapping.
- **Server-side regex parsing** - Parsing HTML in a Convex action using regex or a Node HTML parser. Rejected because regex-based HTML parsing is fragile, adding a server dependency (cheerio, jsdom) increases bundle size for a one-time parse, and `DOMParser` is free in the browser.
- **Highlights as a new document type** - Treating highlight files as uploadable documents with their own chunks and embeddings. Rejected because highlights are annotations of existing content, not content themselves. This would create duplicate chunks and confuse the feed generator.
- **Upload HTML to Convex storage** - Store the raw HTML file, parse it in a Convex action, delete the file. Rejected because the HTML has no long-term value. A storage upload + action + deletion is three steps for work the browser can do in one.
- **Open `v.string()` for source** - Maximum flexibility for adding new sources. Rejected because it loses type safety and allows bad data. The schema migration cost of adding a new literal is negligible.
- **Denormalized highlight-chunk join table** - Pre-computing which chunks overlap which highlights at import time. Rejected because it adds write complexity, a new table, and staleness risk (if chunks are re-processed). The runtime text match is fast enough at personal scale.

## Consequences

- **Schema addition**: One new table (`highlights`) with two indexes. No changes to existing tables. Existing documents, chunks, and posts are unaffected
- **Import UX**: Client-side parsing means the import flow is synchronous from the user's perspective - no polling for processing status, no error states from server-side parsing failures
- **Feed quality**: Highlights give the feed generator a direct signal of user interest. Cards generated from highlighted passages should feel more relevant, though this needs validation through usage
- **Generation cost**: Text matching at generation time adds a linear scan over highlights per document. Bounded at personal scale (10-100 highlights per document). If highlight counts grow significantly (1000+ per document from automated tools like Readwise), a pre-computed index or embedding-based matching would be needed
- **Extensibility**: Adding a new highlight source (Kindle, Readwise) requires a client-side parser, a union literal addition, and source-specific `externalId` extraction. The mutation, dedup, storage, and feed integration are source-agnostic
- **No migration burden**: The `highlights` table is additive. Existing documents without highlights continue to work - the feed generator treats absence of highlights as uniform weight (no boost, no penalty)

## More Information

- Future iteration: embed highlight text in Qdrant alongside chunk embeddings. This enables semantic similarity matching (rather than exact text containment) and opens the door to highlight-to-quote card seeds where the AI generates a card directly from a highlighted passage
- Future iteration: color-based intent taxonomy. Pocketbook supports colored highlights. If users develop consistent color conventions (yellow = important, red = disagree), color can inform card generation tone
- Future iteration: cross-document highlight connections. When the same concept is highlighted in multiple documents, the connection card type (ADR-003) becomes highlight-driven rather than purely chunk-similarity-driven
- The 3x weight multiplier should be revisited after observing real usage patterns. It may need per-user tuning or adaptive adjustment based on highlight density
