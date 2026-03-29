---
status: proposed
date: 2026-03-27
---

# ADR-017: Self-hosted Marker on RunPod Serverless for document parsing

## Context

The previous hosted Marker API costs ~$1.50 per large document (700 pages). At projected 100 docs/month, that is ~$150/mo - making document processing the dominant cost driver. With a $7.99/mo user subscription, a heavy user could generate $75/mo in processing costs alone. Self-hosting Marker on GPU serverless infrastructure brings this down to ~$3-5/mo at the same volume.

The previous integration used a submit/poll pattern with exponential backoff (5s to 40s, capped at 5 minutes). Each document consumed ~8 Convex action invocations for polling. A webhook-based approach reduces this to 2 interactions: one submit call and one webhook callback.

This ADR replaces the previous hosted API entirely. The `DocumentParser` interface (submit/poll) and all polling logic are removed.

## Decision

### 1. RunPod Serverless as the GPU compute layer

Deploy a Docker container running Marker on RunPod Serverless with T4 GPUs (~$0.50/hr, 16GB VRAM). RunPod Serverless scales to zero - no charge when idle. The Python handler is minimal (~15 lines): download the file from a pre-signed URL, run Marker, return the markdown output. All orchestration, error handling, and retry logic remains in TypeScript/Convex.

RunPod was chosen over alternatives because it provides built-in webhook delivery (no custom pub/sub layer), Docker-based workers (portable, not locked to a Python-specific platform), and true pay-per-use billing with no idle cost.

### 2. Webhook-based communication (replaces polling)

The entire submit/poll pattern is removed. The new flow:

1. Convex action calls RunPod's `/run` endpoint with the file URL and a webhook URL pointing back to Convex
2. RunPod executes the Marker handler and delivers the result to the webhook URL
3. A new Convex HTTP endpoint at `POST /api/marker-webhook` receives the result, validates it, stores the markdown blob, and schedules `chunking.chunkAndStore`
4. A scheduled timeout action fires after 10 minutes - if the document is still in `parsing` status, it transitions to `error` with `failedAt: "parsing"`

The webhook endpoint validates incoming requests using a shared `MARKER_WEBHOOK_SECRET` query parameter.

### 3. Full removal of hosted API integration

Removed:

- `src/providers/types.ts` - `DocumentParser` and `PollResult` interfaces
- `src/pipeline/logic/parsing.ts` - `submitForParsing` and `interpretPollResult`
- `convex/pipeline/parsing.ts` - polling action and submit implementation
- `convex/pipeline/services.ts` - `createParsingServiceContext`
- `convex/pipeline/helpers.ts` - `createDocumentParser` factory
- Schema field for polling URL on documents table

Added:

- `src/providers/marker.ts` - `MarkerClient` class (RunPod API client)
- `convex/pipeline/markerWebhook.ts` - webhook HTTP endpoint
- `convex/pipeline/parsing.ts` - `submitMarkerParsing` and `checkParsingTimeout`
- `convex/pipeline/helpers.ts` - `createMarkerClient` factory
- Schema field `runpodJobId` on documents table

### 4. PDF and EPUB support

The Docker image installs `marker-pdf[full]` (not just `marker-pdf`) to include EPUB support via `ebooklib` and `weasyprint`. Marker auto-detects file format from binary content (magic bytes), so both PDFs and EPUBs work with the same `marker_single` CLI command. No routing or format-specific logic needed.

### 5. Resume logic

Simplified: when `failedAt === "parsing"`, the resume handler re-submits the document to RunPod as a new job. There is no polling to resume - Marker processing is stateless and idempotent.

### 6. Minimal Python surface

The RunPod handler is a single Python file (~15 lines) that downloads the file, runs `marker_single`, and returns the markdown. The Docker image pins a specific Marker version and bundles CUDA dependencies. All error handling, status transitions, analytics events, and pipeline orchestration remain in the Convex backend.

### Alternatives considered

- **Keep hosted API, negotiate volume pricing** - Even with volume discounts, hosted Marker is 10-50x more expensive than self-hosting. The cost gap is structural, not negotiable.
- **Gradual migration with config switch** - Adds complexity (two code paths, env-var routing) for a safety net we don't need. The hosted API and self-hosted Marker produce equivalent output (same engine). Clean cut is simpler.
- **Modal** - No built-in webhook delivery, requires polling or a custom callback layer. Python-only platform increases the Python surface area beyond the minimal handler.
- **Fly.io GPU Machines** - Not true serverless. Auto-stop saves compute but still charges for idle GPU reservation. L40S GPUs are overkill for Marker's 4-6GB VRAM usage.
- **Always-on GPU instance (Hetzner/AWS)** - $300+/mo for a dedicated T4. Traffic is bursty. Pay-per-use is 60-100x cheaper at this volume.
- **Synchronous Convex action call** - Risks Convex action timeout (10 minute limit) on large documents plus RunPod cold starts. Webhook decouples execution time from Convex action lifecycle.
- **Node.js wrapper around Marker CLI** - Adds a two-runtime container (Python + Node), complicates debugging, and still requires Python + CUDA in the image. No benefit over a pure Python handler.
- **CPU-only Marker for EPUBs, GPU for PDFs** - Adds routing complexity for modest savings. EPUBs are fast even on GPU. Revisit if EPUB volume exceeds 50%.

## Consequences

- Processing cost drops from ~$150/mo to ~$3-5/mo at 100 docs/month (97% reduction)
- Polling overhead eliminated: 2 interactions per document (submit + webhook) vs ~8 (submit + 7 polls)
- `DocumentParser` interface removed - if a new parser backend is needed later, design a new interface from scratch rather than resurrecting the submit/poll pattern
- New HTTP endpoint (`POST /api/marker-webhook`) adds a public-facing surface secured with webhook secret validation
- New infrastructure dependency: RunPod account, Docker image registry, GPU availability. Mitigated by T4 high availability and the ability to add A10G as fallback
- Marker output quality is equivalent to the previous hosted API (same engine). Side-by-side testing on representative documents before deploying to production.
- Marker version upgrades could break output format - pinned in Docker image, upgraded intentionally with re-testing
- Cold starts of 30-60s on first request after idle - acceptable since the pipeline is already async

## More Information

- ADR-001 established the original `DocumentParser` interface (now superseded by this ADR)
- `convex/pipeline/parsing.ts` is the primary file modified - submit/poll replaced with Marker submit + webhook
- `convex/http.ts` is where the new webhook endpoint is registered
- RunPod Serverless docs: https://docs.runpod.io/serverless
