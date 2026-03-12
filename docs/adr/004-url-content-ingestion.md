# ADR-004: URL Content Ingestion

**Status:** Proposed
**Date:** 2026-03-12
**Author:** Scrollect Team

## Context

Scrollect currently requires users to upload a file (PDF or Markdown) to add content to their library. This is the single biggest friction barrier — users must locate and download a file before they can use the product. Most learning content lives at URLs (articles, blog posts, YouTube videos) or in the user's clipboard (copied text).

The existing pipeline (`pipeline/index.ts`) routes on `fileType` and assumes every document has a `storageId` pointing to an uploaded file in Convex storage. Extending the pipeline to URL-based content requires:

1. A way to create documents without a file upload (`storageId` becomes optional).
2. New extraction logic that converts a URL into markdown (the common format the downstream pipeline expects).
3. A routing mechanism to dispatch to the correct extractor based on content type.

The extraction step is the only new work — everything downstream (chunking, embedding, card generation) is unchanged. A URL-based document produces a markdown blob, just like a PDF or uploaded Markdown file does.

## Decisions

### 1. `ContentExtractor` interface in `providers/types.ts`

Follow the existing provider pattern (`PdfParser`, `EmbeddingProvider`, `VectorStore`) — define an interface, implement per content type, swap freely.

```ts
// providers/types.ts — new interface

interface ContentExtractor {
  extract(url: string): Promise<ExtractResult>;
}

interface ExtractResult {
  markdown: string;
  title?: string;
  metadata?: Record<string, unknown>;
}
```

- `markdown` — the extracted content, ready for `storeMarkdownBlob` → `chunkAndStore`.
- `title` — auto-extracted from the source. If present, the pipeline patches the document title (useful when the user pastes a URL without typing a title).
- `metadata` — structured data specific to the content type. For YouTube: `{ segments: Array<{ start: number; text: string }> }` (timestamp-linked transcript segments). Stored as a JSON blob in Convex storage for future use (timestamp-linked quiz cards, slide cards). Not used by the current pipeline — it's a forward-compatible hook.

Implementations:

| Class                        | Content type   | Runtime                          | Dependencies                |
| ---------------------------- | -------------- | -------------------------------- | --------------------------- |
| `MarkdownNewExtractor`       | Articles       | Convex default (no `"use node"`) | Zero — one `fetch()` call   |
| `YouTubeTranscriptExtractor` | YouTube videos | Convex default (no `"use node"`) | Zero — pure `fetch()` calls |

Future implementations (same interface, one-line swap):

- `SummarizeCoreExtractor` — wraps `@steipete/summarize-core` as a drop-in replacement if edge cases grow.
- `PodcastExtractor`, `SpotifyExtractor`, etc.

**Why a new interface instead of extending `PdfParser`:** The `PdfParser` interface models an async submit/poll pattern (submit returns a check URL, poll returns a status). URL extraction is synchronous from the caller's perspective — one call, one result. Forcing it into submit/poll adds unnecessary complexity. The two interfaces coexist in `providers/types.ts`; the pipeline router picks the right one.

### 2. Schema changes

#### 2a. `storageId` becomes optional

```ts
// schema.ts — documents table
storageId: v.optional(v.id("_storage")),  // was: v.id("_storage")
```

URL-based documents have no uploaded file. They get their markdown from an extractor, which stores the result via `storeMarkdownBlob` (same as the PDF path). After extraction, URL documents _do_ have a storage ID — it's the markdown blob — but it's set by the pipeline, not by the user at creation time.

**Blast radius audit — all `storageId` read sites:**

| File                         | Line                                                  | Current usage                                                                                        | Change needed |
| ---------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------- |
| `pipeline/index.ts:30`       | `doc.storageId` passed to `submitPdfParsingImpl`      | Add `!` assertion — only reached when `fileType === "pdf"`, which always has `storageId`             |
| `pipeline/index.ts:37`       | `doc.storageId` passed to `fetchAndParseMarkdownImpl` | Same — only reached for `"md"` and `"text"`, which always have `storageId`                           |
| `pipeline/parsing.ts:24,147` | Function parameter typed as `Id<"_storage">`          | No change — callers pass `doc.storageId!` with the type assertion                                    |
| `testing.ts:61`              | `ctx.storage.delete(doc.storageId)` in cleanup        | Guard with `if (doc.storageId)` — URL documents created before extraction completes may not have one |
| `testing.ts:102-112`         | `insertSeededData` requires `storageId` arg           | No change — seed data is file-based                                                                  |
| `documents.ts:21`            | `create` mutation requires `storageId` arg            | No change — `create` is for file uploads. URL ingestion uses a new `createFromUrl` mutation          |

**Invariant:** `storageId` is always present when `fileType` is `"pdf"`, `"md"`, or `"text"`. It is absent at creation time for `"article"` and `"youtube"`, and set later by the extraction pipeline (as the markdown blob). The type assertion `doc.storageId!` in the `"pdf"`/`"md"` branches is safe because the schema + mutation pair guarantee the invariant.

#### 2b. New `sourceUrl` field

```ts
// schema.ts — documents table
sourceUrl: v.optional(v.string()),  // new — the article/YouTube URL
```

Present for `"article"` and `"youtube"` documents. Absent for file-based types. Used by extractors and displayed in the UI as a source link.

#### 2c. New `fileType` values

```ts
// lib/validators.ts
export const fileType = v.union(
  v.literal("pdf"),
  v.literal("md"),
  v.literal("article"), // new
  v.literal("youtube"), // new
  v.literal("text"), // new
);
```

- `"article"` — any non-YouTube URL. Extracted via `MarkdownNewExtractor`.
- `"youtube"` — YouTube URLs (`youtube.com/watch`, `youtu.be`). Extracted via `YouTubeTranscriptExtractor`.
- `"text"` — raw text pasted by the user. Stored as a blob in Convex storage, enters existing `fetchAndParseMarkdownImpl` path. No extractor needed.

### 3. New mutation: `documents.createFromUrl`

```ts
createFromUrl = mutation({
  args: {
    url: v.string(),
    fileType: v.union(v.literal("article"), v.literal("youtube")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Auth
    // 2. Insert document: { sourceUrl: args.url, status: "uploaded", fileType, title (or URL as fallback), chunkCount: 0 }
    //    Note: no storageId — the extractor will produce the markdown blob
    // 3. Schedule startProcessing (same as file upload path)
  },
});
```

The existing `documents.create` mutation is unchanged — it handles file uploads with `storageId`. The two mutations have non-overlapping argument shapes, making them hard to confuse.

**Raw text** does not need a new mutation. The frontend uploads the text as a blob via the existing `generateUploadUrl` → `create` flow with `fileType: "text"`. This reuses the existing upload path and keeps raw text simple.

### 4. Pipeline routing update

Extend `pipeline/index.ts` from 2-way to 5-way dispatch:

```ts
switch (doc.fileType) {
  case "pdf":
    await submitPdfParsingImpl(ctx, documentId, doc.storageId!, evt);
    break;
  case "md":
  case "text":
    await fetchAndParseMarkdownImpl(ctx, documentId, doc.storageId!, evt);
    break;
  case "article":
    await extractArticleImpl(ctx, documentId, doc.sourceUrl!, evt);
    break;
  case "youtube":
    await extractYouTubeImpl(ctx, documentId, doc.sourceUrl!, evt);
    break;
}
```

Each `extract*Impl` function:

1. Instantiates the appropriate `ContentExtractor` implementation.
2. Calls `extractor.extract(url)`.
3. If `result.title` is present and the document title is the URL fallback, patches the document title.
4. Calls `storeMarkdownBlob(result.markdown)` to persist the markdown blob.
5. Schedules `chunkAndStore` — the same downstream path as PDF and Markdown.

**`"text"` reuses `fetchAndParseMarkdownImpl` directly** — the raw text is already a blob in storage, same as an uploaded `.md` file.

**Runtime consideration:** The current `pipeline/index.ts` uses `"use node"` because `submitPdfParsingImpl` needs `process.env` for the Datalab API key. The new extractors are pure `fetch()` and don't need Node. However, since they're called from the same action, they inherit the Node runtime. This is fine — `fetch()` works in both runtimes. If we later want to move URL extraction to the default runtime (for faster cold starts), we can split the entry point into separate actions per file type.

### 5. Article extraction: markdown.new

**Primary:** [markdown.new](https://markdown.new/) — free, no API key, 500 req/day/IP.

```ts
class MarkdownNewExtractor implements ContentExtractor {
  async extract(url: string): Promise<ExtractResult> {
    const response = await fetch("https://markdown.new/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, method: "auto" }),
    });
    if (!response.ok) {
      throw new Error(`markdown.new failed: ${response.status} ${response.statusText}`);
    }
    const markdown = await response.text();
    // Title extraction: first # heading or first line
    const title = extractTitleFromMarkdown(markdown);
    return { markdown, title };
  }
}
```

**How markdown.new works:** A 3-tier Cloudflare pipeline:

1. Requests content with `Accept: text/markdown` (for Cloudflare-enabled sites that serve markdown natively).
2. Passes HTML through Cloudflare Workers AI `toMarkdown()`.
3. Renders JS-heavy pages via Cloudflare headless Browser Rendering API.

**Characteristics:**

- One HTTP call, 0.1–0.6s response times.
- ~80% token reduction vs raw HTML.
- Returns estimated token count via `x-markdown-tokens` header.
- No API key required.
- 500 requests/day/IP limit.

**Error handling:**

| Scenario                           | Detection                                  | Response                                                                                                        |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Paywalled content                  | markdown.new returns partial/empty content | Store what we get; if empty, set document to error with "Could not extract content — the page may be paywalled" |
| JS-heavy SPA that fails rendering  | Empty or boilerplate-only markdown         | Same as paywalled                                                                                               |
| URL unreachable (404, DNS failure) | markdown.new returns error status          | Set document to error with descriptive message                                                                  |
| Rate limit (429 or 5xx)            | HTTP status code                           | Retry once with 2s delay, then error                                                                            |
| markdown.new service down          | Network error or timeout                   | Set document to error; user can retry later                                                                     |

**Future fallback:** If markdown.new proves unreliable, swap in Jina Reader API (`https://r.jina.ai/{url}`) as the implementation behind the same `ContentExtractor` interface. One-line change in the factory function.

### 6. YouTube transcript extraction: Ported from summarize project

#### Why not npm packages

| Package                     | Verdict                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `youtube-transcript`        | Abandoned (last commit Apr 2021), 20 open issues, breaks in production, no fallbacks |
| `youtube-transcript-api`    | Reverse-engineers a third-party service, abandoned since Sept 2023                   |
| `youtubei.js`               | 14.9MB package for one feature, uncertain Convex runtime compatibility               |
| `youtube-caption-extractor` | Decent but less battle-tested than the summarize approach                            |

**YouTube Data API v3 `captions.download`** was also rejected: requires OAuth 2.0 (not just an API key), can only download captions from videos the authenticated user owns, and has a 50 downloads/day quota.

#### Chosen approach: 3-level HTTP-only fallback chain

Ported from the [summarize](https://github.com/steipete/summarize) project's YouTube extraction code. All methods are pure `fetch()` — zero dependencies, runs in Convex default runtime.

**Level 1: YouTubei API**

- Fetch the YouTube watch page HTML.
- Extract the `ytInitialPlayerResponse` / `INNERTUBE_API_KEY` bootstrap config from the page.
- Call `/youtubei/v1/get_transcript` with the extracted config.
- Returns transcript segments with timestamps.

**Level 2: Caption Tracks**

- Extract `captionTracks` from the player response (available in the page HTML or via the YouTube player API).
- Fetch the caption track URL directly (returns XML with timestamped segments).
- Fallback to Android player endpoint if the web player doesn't expose caption tracks.

**Level 3: Apify (optional last resort)**

- Requires `APIFY_API_TOKEN` environment variable.
- Calls Apify's YouTube transcript actor as a final fallback.
- Only attempted if Levels 1 and 2 both fail and the token is configured.

**Transcript to markdown conversion:**

The extractor converts transcript segments into markdown with timestamp section headers:

```markdown
# Video Title

## [0:00]

Welcome to today's discussion about...

## [2:30]

The key insight here is that...

## [5:15]

Let me walk you through an example...
```

Timestamp sections are sized by natural breaks in the transcript (pauses > 2s or topic shifts), not by fixed intervals. This produces chunks that align with the speaker's structure.

**Structured metadata:** The raw transcript segments (`Array<{ start: number; text: string }>`) are stored alongside the markdown in `ExtractResult.metadata.segments`. This enables future features like timestamp-linked quiz cards ("At [2:30], the speaker says X — what does this mean?").

**Error handling:**

| Scenario                                           | Detection                      | Response                                                             |
| -------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| No transcript available (live stream, music video) | All 3 levels return empty      | Set document to error: "No transcript available for this video"      |
| Private video                                      | YouTube returns 403/login page | Set document to error: "This video is private or age-restricted"     |
| Broken bootstrap config (YouTube changed HTML)     | Level 1 parse failure          | Fall through to Level 2                                              |
| Rate limiting from YouTube                         | 429 status                     | Retry once with exponential backoff, then fall through to next level |
| Video not found                                    | 404                            | Set document to error: "Video not found"                             |

#### Source files to port

From `summarize/packages/core/src/content/transcript/providers/youtube/`:

- `api.ts` — YouTubei endpoint (Level 1)
- `captions-transcript.ts` — Caption tracks extraction (Level 2)
- `captions-player.ts` — HTML bootstrap config parsing (shared by Levels 1 and 2)
- `provider-flow.ts` — Fallback orchestration

These files are MIT-licensed, pure TypeScript with zero dependencies. The port adapts them to our `ContentExtractor` interface and error handling conventions.

### 7. Raw text input

Raw text is the simplest new input type:

1. User pastes text in a textarea on the upload page.
2. Frontend uploads the text as a blob via `generateUploadUrl` + `storage.store`.
3. Frontend calls `documents.create` with `fileType: "text"` and the `storageId`.
4. Pipeline routes to `fetchAndParseMarkdownImpl` — the existing Markdown path.

No new extractor, no new mutation, no schema change beyond adding `"text"` to the `fileType` union.

### 8. URL type detection

The frontend auto-detects the content type from the pasted URL:

```ts
function detectUrlType(url: string): "youtube" | "article" {
  const hostname = new URL(url).hostname.replace("www.", "");
  if (hostname === "youtube.com" || hostname === "youtu.be" || hostname === "m.youtube.com") {
    return "youtube";
  }
  return "article";
}
```

This runs client-side before calling `createFromUrl`. The server does not re-detect — it trusts the `fileType` argument. If we add more specialized extractors (Spotify, podcasts), we extend this function.

### 9. Error handling policy

All extractors follow the existing pipeline error convention:

1. Catch errors in the `extract*Impl` function.
2. Call `documents.updateStatus({ status: "error", errorMessage, failedAt: "parsing" })`.
3. Log via `WideEvent`.

The `retry` mutation in `documents.ts` works unchanged — retrying a URL document re-enters `startProcessing`, which re-runs the extractor. No checkpoint is needed (unlike Datalab PDF polling) because URL extraction is a single synchronous call.

The `failedAtStage` validator does not need new values. URL extraction fails at the `"parsing"` stage — it's the content extraction step, same as PDF parsing or Markdown fetching.

## Schema Change

Since we're in prototype phase, this is a clean-slate schema change — no migration needed.

**Changes to `documents` table:**

- `storageId`: `v.id("_storage")` → `v.optional(v.id("_storage"))`
- Add: `sourceUrl: v.optional(v.string())`

**Changes to `lib/validators.ts`:**

- `fileType`: add `v.literal("article")`, `v.literal("youtube")`, `v.literal("text")`

**New mutation:** `documents.createFromUrl` (for `"article"` and `"youtube"` types)

**New files:**

- `providers/markdownNew.ts` — `MarkdownNewExtractor` class
- `providers/youtube.ts` — `YouTubeTranscriptExtractor` class (ported from summarize project)
- `pipeline/extraction.ts` — `extractArticleImpl` and `extractYouTubeImpl` functions

**Modified files:**

- `providers/types.ts` — add `ContentExtractor` and `ExtractResult` interfaces
- `lib/validators.ts` — extend `fileType` union
- `schema.ts` — `storageId` optional, add `sourceUrl`
- `documents.ts` — add `createFromUrl` mutation
- `pipeline/index.ts` — extend routing switch
- `testing.ts` — guard `storageId` access with optional check

## Consequences

- **Zero impact on downstream pipeline.** Chunking, embedding, and card generation are unchanged. URL extraction produces a markdown blob — the same input format as PDF and Markdown processing.
- **No new environment variables required** for Phase 1. markdown.new is free/keyless. YouTube extraction is pure HTTP. Apify (Level 3 fallback) is optional and only attempted if `APIFY_API_TOKEN` is set.
- **`storageId` optionality is the riskiest change.** The blast radius audit (Section 2a) identifies 6 read sites. All are guarded by `fileType` dispatch or explicit optional checks. The invariant (file-based types always have `storageId`) is enforced by the mutation layer — `create` requires it, `createFromUrl` doesn't set it.
- **Rate limits.** markdown.new: 500 req/day/IP. YouTube: no formal limit, but aggressive scraping triggers CAPTCHAs. For a personal learning tool with single-digit daily ingestions per user, neither limit is a concern. If Scrollect grows to many concurrent users on a shared Convex deployment (shared IP), markdown.new's per-IP limit may become relevant — at that point, swap to Jina Reader or a self-hosted solution behind the same interface.
- **YouTube extraction fragility.** YouTube regularly changes its page structure, which can break the bootstrap config parsing. The 3-level fallback chain provides resilience — if Level 1 breaks, Levels 2 and 3 still work. When all levels break, we own the code and can fix it immediately (unlike depending on an abandoned npm package).
- **Extractor swappability.** The `ContentExtractor` interface ensures any extractor can be replaced without touching the pipeline. If `@steipete/summarize-core` or a better library emerges, it's a one-file change in `providers/`.
