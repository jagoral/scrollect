---
status: proposed
date: 2026-03-07
---

# ADR-001: Move all document processing into Convex

## Context

Scrollect's document processing pipeline is currently split across two deployments:

1. **Convex backend** (`packages/backend/convex/`) — state management, scheduling, some embedding logic
2. **Hono/Vercel app** (`apps/processing/`) — PDF parsing, chunking, embedding orchestration

This split introduces several problems:

| Problem                          | Detail                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----- | ---------------------------------------------------------------------------- |
| **Split deployment**             | Two services to deploy, monitor, and keep in sync                                                                                                         |
| **Duplicated logic**             | `chunkContent()` and `chunkMarkdown()` exist in both `packages/backend/convex/chunking.ts` and `apps/processing/api/process.ts`                           |
| **Fragile completion detection** | The processing app fires embedding batches as fire-and-forget `fetch()` calls. If any batch fails silently, the document is stuck in `processing` forever |
| **No resumability**              | If any step fails (Datalab timeout, OpenAI rate limit, Qdrant downtime), the entire document is stuck. The user must re-upload                            |
| **No progress tracking**         | Users see `pending                                                                                                                                        | processing | ready | error` with no granularity — no way to know if a document is 10% or 90% done |
| **Tight coupling via HTTP**      | Convex calls the processing app via `fetch()`, which calls Convex back via HTTP routes with a shared `PROCESSING_SECRET`                                  |
| **Duplicated credentials**       | `OPENAI_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY` are configured in both services                                                                      |

## Decision

### 1. Consolidate all processing into Convex; delete `apps/processing/`

Move all document processing — PDF parsing orchestration, markdown fetching, chunking, and embedding — into Convex actions and internal functions. Delete the `apps/processing/` Hono/Vercel app entirely.

Convex actions provide sufficient compute for every stage of the pipeline. By leveraging Convex's built-in scheduler, internal functions, and action retries, we eliminate the bidirectional HTTP coupling, duplicated logic, and fragile completion detection. Breaking changes are acceptable — no migration from the current schema is needed.

### 2. Six-state document state machine with `failedAt` for resumability

Documents progress through a 6-state pipeline:

| State       | Description                                                                       |
| ----------- | --------------------------------------------------------------------------------- |
| `uploaded`  | File stored in Convex, no processing started                                      |
| `parsing`   | PDF submitted to Datalab or markdown being fetched                                |
| `chunking`  | Content is being split into chunks and stored                                     |
| `embedding` | Chunks are being embedded in batches                                              |
| `ready`     | All chunks embedded, document is searchable                                       |
| `error`     | Processing failed; `errorMessage` and `failedAt` record what went wrong and where |

The `error` state records both `errorMessage` (what went wrong) and `failedAt` (which stage: `"parsing"`, `"chunking"`, or `"embedding"`). This enables **stage-level resumability**: when a user retries a failed document, `pipeline.resumeProcessing` reads `failedAt` to re-enter at the correct stage — it never re-does work that already succeeded.

- `failedAt = "parsing"` → re-submit to Datalab
- `failedAt = "chunking"` → re-chunk (skip existing chunks if any)
- `failedAt = "embedding"` → re-embed only unembedded chunks (using the `embedded: boolean` flag on each chunk)

A `datalabCheckUrl` field on documents persists the Datalab polling URL so parsing can resume even after a Convex action crash — the poll URL is saved before the first poll attempt.

### 3. Provider interfaces behind factory functions

Three interfaces in `providers/types.ts`:

- **`PdfParser`** — Async submit/poll pattern for Datalab. `submit(fileUrl)` returns a check URL; `poll(checkUrl)` returns pending/complete/error with optional markdown.
- **`EmbeddingProvider`** — Batch text → vectors. `embed(texts)` returns one vector per input. Exposes `dimensions` for vector store configuration.
- **`VectorStore`** — `ensureCollection()`, `upsert(points)`, `search(vector, filter, topK)`, `delete(ids)`. Abstracts the backing store.

Each interface has concrete implementations (DatalabParser, OpenAIEmbeddings, QdrantVectorStore) swappable via factory functions in `pipeline/helpers.ts`. This enables:

- Swapping Qdrant for Convex native vector search (or vice versa) without touching pipeline code
- Replacing Datalab with another PDF parser
- Injecting stubs for testing (see ADR-005)

The vector store decision specifically: Qdrant is mature and feature-rich (payload filtering, sharding), but adds operational overhead (separate service). Convex native vector search is zero-ops (schema-only setup, included in pricing), but has limited filtering (`filterFields` only). Starting with Qdrant for its flexibility, but the `VectorStore` interface makes the swap trivial if we want to simplify ops later.

### 4. Fan-out/fan-in embedding with counter-based completion

After chunking, the pipeline creates a `processingJobs` record tracking `totalBatches`, `completedBatches`, and `failedBatches`. It then fans out one `embedBatch` action per 100-chunk batch.

**Fan-out:** `chunkAndStore` stores chunks in batches of 50 per mutation (keeping payloads small), then schedules one `embedBatch` action per 100-chunk batch.

**Execute:** Each `embedBatch` independently generates OpenAI embeddings and upserts to the vector store.

**Fan-in:** Each `embedBatch` atomically increments `processingJob.completedBatches` (or `failedBatches`). When `completedBatches + failedBatches === totalBatches`, the last batch to finish marks the document as `ready` (or `error` if any batch failed).

**Retry logic:** Each `embedBatch` retries up to 3 times with exponential backoff (1s, 2s, 4s) before marking its batch as failed. This provides per-batch granularity — if batch 3 of 5 fails, only batch 3 retries, not the entire embedding stage.

This replaces the old fire-and-forget approach where completion was racily determined by "whichever batch finishes last" — atomic counters make the determination deterministic.

**Datalab polling** uses exponential backoff (5s → 10s → 20s → 40s cap, 5 minute total timeout) instead of the current fixed 5s interval. For a typical 2-minute parse, this reduces action invocations from ~24 to ~8.

### Alternatives considered

- **Keep the split architecture, fix completion detection** — Addresses one symptom but leaves duplicated logic, duplicated credentials, and bidirectional HTTP coupling. Every future pipeline feature would need to be implemented in both codebases.
- **Move processing to a dedicated queue service (e.g., BullMQ)** — Adds operational complexity (Redis dependency, separate monitoring). Convex's built-in scheduler and actions provide the same fan-out/retry semantics without another service.
- **Use Convex's built-in action retries instead of manual retry logic** — Convex action retries are all-or-nothing at the action level. We need per-batch granularity: if batch 3 of 5 fails, only batch 3 should retry, not the entire embedding action.
- **Convex native vector search instead of Qdrant** — Simpler (zero-ops, schema-only setup, included in pricing), but limited to declared `filterFields`. Qdrant offers richer payload filtering. The `VectorStore` interface lets us swap later.

## Consequences

- **`apps/processing/` is deleted**: One deployment to manage instead of two. All pipeline logic lives in `packages/backend/convex/`
- **Credentials consolidated**: `OPENAI_API_KEY`, `QDRANT_URL`, and `QDRANT_API_KEY` configured in one place (Convex environment variables). `PROCESSING_SECRET` eliminated entirely
- **Resumability**: Users can retry failed documents without re-uploading. The pipeline resumes from the last successful stage — parsing failures don't re-chunk, embedding failures don't re-parse
- **Progress visibility**: Six granular states replace the old `pending | processing | ready | error`. The frontend can show which stage a document is in and what failed
- **Completion detection is deterministic**: Atomic counters on `processingJobs` replace the race-prone "last batch wins" approach. A document reaches `ready` if and only if all batches succeed
- **Increased Convex compute usage**: All processing runs as Convex actions, counting against the plan's action compute budget. For a personal learning tool with single-digit daily ingestions, this is well within limits
- **Provider lock-in risk**: The `VectorStore` and `EmbeddingProvider` interfaces mitigate this — swapping providers is a one-file change behind a factory function
- **Memory consideration**: Chunking runs inside a Convex action, processing the full markdown in memory. For most documents this is fine; very large PDFs (100MB+ with dense text) could approach action memory limits. Batched chunk storage (50 per mutation) keeps individual write payloads small

## More Information

- ADR-004 extends the pipeline with URL-based content extraction (articles, YouTube).
- ADR-005 covers E2E testing strategy including provider stubs for test isolation.
- See `providers/types.ts` for the `PdfParser`, `EmbeddingProvider`, and `VectorStore` interface definitions.
