---
status: proposed
date: 2026-03-12
---

# ADR-004: Add URL content ingestion to the processing pipeline

## Context

Scrollect currently requires users to upload a file (PDF or Markdown) to add content to their library. This is the single biggest friction barrier — users must locate and download a file before they can use the product. Most learning content lives at URLs (articles, blog posts, YouTube videos) or in the user's clipboard (copied text).

The existing pipeline (`pipeline/index.ts`) routes on `fileType` and assumes every document has a `storageId` pointing to an uploaded file in Convex storage. Extending the pipeline to URL-based content requires:

1. A way to create documents without a file upload (`storageId` becomes optional).
2. New extraction logic that converts a URL into markdown (the common format the downstream pipeline expects).
3. A routing mechanism to dispatch to the correct extractor based on content type.

The extraction step is the only new work — everything downstream (chunking, embedding, card generation) is unchanged. A URL-based document produces a markdown blob, just like a PDF or uploaded Markdown file does.

## Decision

### 1. `ContentExtractor` interface in `providers/types.ts`

Follow the existing provider pattern (`PdfParser`, `EmbeddingProvider`, `VectorStore`) — define an interface, implement per content type, swap freely.

```ts
interface ContentExtractor {
  extract(url: string): Promise<ExtractResult>;
}
```

`ExtractResult` contains:

- `markdown` — The extracted content, ready for `storeMarkdownBlob` → `chunkAndStore`.
- `title` — Auto-extracted from the source. If present, the pipeline patches the document title (useful when the user pastes a URL without typing a title).
- `metadata` — Structured data specific to the content type. For YouTube: `{ segments: Array<{ start: number; text: string }> }` (timestamp-linked transcript segments). Stored as a JSON blob for future use (timestamp-linked quiz cards). Not used by the current pipeline — a forward-compatible hook.

Two implementations for Phase 1:

| Class                        | Content type   | Dependencies                |
| ---------------------------- | -------------- | --------------------------- |
| `MarkdownNewExtractor`       | Articles       | Zero — one `fetch()` call   |
| `YouTubeTranscriptExtractor` | YouTube videos | Zero — pure `fetch()` calls |

**Why a new interface instead of extending `PdfParser`:** `PdfParser` models an async submit/poll pattern (submit returns a check URL, poll returns a status). URL extraction is synchronous from the caller's perspective — one call, one result. Forcing it into submit/poll adds unnecessary complexity. The two interfaces coexist in `providers/types.ts`; the pipeline router picks the right one.

### 2. Schema changes

**`storageId` becomes optional** — URL-based documents have no uploaded file. They get their markdown from an extractor, which stores the result via `storeMarkdownBlob` (same as the PDF path). After extraction, URL documents _do_ have a storage ID — it's the markdown blob — but it's set by the pipeline, not by the user at creation time.

**`storageId` invariant:** Always present when `fileType` is `"pdf"`, `"md"`, or `"text"`. Absent at creation time for `"article"` and `"youtube"`, set later by the extraction pipeline. The type assertion `doc.storageId!` in the `"pdf"`/`"md"` branches is safe because the schema + mutation pair guarantee the invariant.

**New `sourceUrl` field** — `v.optional(v.string())`, present for `"article"` and `"youtube"` documents. Used by extractors and displayed in the UI as a source link.

**New `fileType` values:**

- `"article"` — Any non-YouTube URL. Extracted via `MarkdownNewExtractor`.
- `"youtube"` — YouTube URLs (`youtube.com/watch`, `youtu.be`). Extracted via `YouTubeTranscriptExtractor`.
- `"text"` — Raw text pasted by the user. Stored as a blob via the existing upload flow, enters the existing `fetchAndParseMarkdownImpl` path. No extractor needed.

**New `documents.createFromUrl` mutation** handles URL-based documents (no `storageId` at creation). The existing `documents.create` mutation is unchanged — it handles file uploads with `storageId`. The two mutations have non-overlapping argument shapes.

**Raw text** does not need a new mutation. The frontend uploads the text as a blob via the existing `generateUploadUrl` → `create` flow with `fileType: "text"`.

### 3. Article extraction via markdown.new, YouTube via 3-level fallback

**Article extraction** uses [markdown.new](https://markdown.new/) — a 3-tier Cloudflare pipeline that converts web pages to markdown:

- Free, no API key, 500 req/day/IP
- One HTTP call, 0.1–0.6s response times, ~80% token reduction vs raw HTML
- Handles JS-heavy pages via Cloudflare headless Browser Rendering API
- If unreliable, swap in Jina Reader API (`r.jina.ai/{url}`) behind the same `ContentExtractor` interface — one-file change

**YouTube transcript extraction** uses a 3-level HTTP-only fallback chain ported from the [summarize](https://github.com/steipete/summarize) project (MIT-licensed, pure TypeScript, zero dependencies):

- **Level 1: YouTubei API** — Fetch the watch page HTML, extract bootstrap config, call `/youtubei/v1/get_transcript`. Returns transcript with timestamps.
- **Level 2: Caption tracks** — Extract `captionTracks` from the player response, fetch the caption track URL directly (XML with timestamps). Falls back to Android player endpoint.
- **Level 3: Apify** (optional last resort) — Only attempted if `APIFY_API_TOKEN` env var is set.

All methods are pure `fetch()` — runs in Convex default runtime. Transcript segments are converted to markdown with timestamp section headers, sized by natural breaks (pauses > 2s or topic shifts).

**Why not npm packages:** `youtube-transcript` is abandoned (last commit Apr 2021, 20 open issues). `youtubei.js` is 14.9MB for one feature. `youtube-transcript-api` reverse-engineers a third-party service, abandoned since Sept 2023. YouTube Data API v3 requires OAuth 2.0, only downloads captions from videos the user owns, and has a 50 downloads/day quota.

### 4. Pipeline routing

`pipeline/index.ts` extends from 2-way to 5-way dispatch on `doc.fileType`:

- `"pdf"` → `submitPdfParsingImpl` (existing)
- `"md"` / `"text"` → `fetchAndParseMarkdownImpl` (existing)
- `"article"` → `extractArticleImpl` (new)
- `"youtube"` → `extractYouTubeImpl` (new)

Each `extract*Impl` function: instantiates the appropriate `ContentExtractor`, calls `extract(url)`, patches the document title if auto-extracted, stores the markdown blob, and schedules `chunkAndStore` — the same downstream path as PDF and Markdown.

All extractors follow the existing error convention: catch errors → set document to `"error"` status with `failedAt: "parsing"` → log via `WideEvent`. The `retry` mutation works unchanged — retrying a URL document re-enters `startProcessing`, which re-runs the extractor.

URL type detection runs client-side by checking the hostname (`youtube.com`, `youtu.be`, `m.youtube.com` → `"youtube"`, everything else → `"article"`). The server trusts the `fileType` argument.

### Alternatives considered

- **Extend `PdfParser` interface for URLs** — Forces URL extraction into an async submit/poll pattern that doesn't fit. URL extraction is synchronous — one call, one result.
- **Use `youtube-transcript` npm package** — Abandoned (last commit Apr 2021), 20 open issues, breaks in production. Other npm options are similarly unmaintained or too large.
- **YouTube Data API v3** — Requires OAuth 2.0 (not just API key), can only download captions from videos the user owns, 50 downloads/day quota.

## Consequences

- **Zero impact on downstream pipeline**: Chunking, embedding, and card generation are unchanged. URL extraction produces a markdown blob — the same input format as existing processing
- **No new environment variables for Phase 1**: markdown.new is free/keyless. YouTube extraction is pure HTTP. Apify (Level 3) is optional and only attempted if `APIFY_API_TOKEN` is set
- **`storageId` optionality is the riskiest change**: 6 read sites identified in the codebase — all guarded by `fileType` dispatch or explicit optional checks. Invariant enforced by the mutation layer (`create` requires it, `createFromUrl` doesn't set it)
- **Rate limits not a concern at personal scale**: markdown.new 500 req/day/IP, YouTube has no formal limit. For a personal tool with single-digit daily ingestions, neither is relevant. If Scrollect grows to shared-IP scale, swap to Jina Reader or self-hosted behind the same interface
- **YouTube extraction fragility**: YouTube regularly changes page structure, which can break bootstrap config parsing. The 3-level fallback provides resilience — if Level 1 breaks, Levels 2 and 3 still work. We own the code and can fix immediately (unlike abandoned npm packages)
- **Extractor swappability**: The `ContentExtractor` interface ensures any extractor can be replaced without touching the pipeline — one-file change in `providers/`

## More Information

- ADR-005 covers the E2E testing strategy for URL ingestion (stub vs real extractors).
- See `providers/types.ts` for the `ContentExtractor` and `ExtractResult` interface definitions.
- Source files for YouTube extraction ported from `summarize/packages/core/src/content/transcript/providers/youtube/` (MIT-licensed).
