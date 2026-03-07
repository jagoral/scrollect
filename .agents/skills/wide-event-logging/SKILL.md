---
name: wide-event-logging
description: Structured logging using the wide event pattern for Convex backend functions. Use this skill whenever adding logging, debugging pipeline issues, instrumenting functions, adding observability, or discussing console.log practices in the backend. Also trigger when the user mentions "wide events", structured logs, or asks how to make backend functions more debuggable. This skill applies to any work in packages/backend/convex/.
---

# Wide Event Logging

This project uses a "wide event" logging pattern (inspired by [loggingsucks.com](https://loggingsucks.com)): **one structured JSON log line per function execution** that captures all relevant business context. This replaces scattered `console.log` / `console.error` calls with a single, rich event per function.

## Why wide events

Traditional logging sprinkles multiple log lines throughout a function. This makes it hard to correlate context across lines and creates noise. A wide event collects all context into one object and emits it once when the function completes. Benefits:

- **One line = one function execution** — easy to filter and search in the Convex dashboard
- **All context in one place** — no need to mentally stitch together multiple log lines
- **Duration is automatic** — every event includes `durationMs`
- **Errors are structured** — `error: true` + `errorMessage` fields, not free-form strings
- **Convex enriches automatically** — `function_path`, `request_id`, `type`, and `timestamp` are added by the platform

## The WideEvent class

Located at `packages/backend/convex/logging.ts`:

```typescript
import { WideEvent } from "./logging";
```

### API

```typescript
const evt = new WideEvent("pipeline.startProcessing"); // operation name + start timer
evt.set("documentId", id); // single key-value
evt.set({ fileType: "pdf", userId: "abc" }); // bulk set from object
evt.setError(error); // sets error=true + errorMessage
evt.emit(); // logs JSON with durationMs
```

All methods except `emit()` are chainable.

## Instrumentation pattern

Every instrumented function follows this exact structure:

```typescript
handler: async (ctx, args) => {
  const evt = new WideEvent("module.functionName");
  evt.set({
    /* args and initial context */
  });
  try {
    // ... business logic ...
    // Add context as it becomes available:
    evt.set("chunkCount", chunks.length);
  } catch (error) {
    evt.setError(error);
    throw error; // re-throw so Convex tracks the failure
  } finally {
    evt.emit(); // ALWAYS emit, success or failure
  }
};
```

Key rules:

1. **Create the event at the top** of the handler, before any async work
2. **Set args immediately** so they appear even if the function fails early
3. **`emit()` goes in `finally`** so it fires on both success and failure paths
4. **Re-throw errors** after `setError()` — the wide event captures context, but Convex still needs to see the error for its own tracking
5. **One emit per function** — never call `emit()` more than once

## Passing events to helpers

When a top-level handler delegates to a private helper function, pass the `WideEvent` instance so the helper can add its own context. The helper calls `evt.set()` and `evt.setError()` but **never** `evt.emit()` — the top-level handler is responsible for emitting.

```typescript
// Top-level handler creates and emits
handler: async (ctx, args) => {
  const evt = new WideEvent("pipeline.startProcessing");
  try {
    // ...
    await submitPdfParsingImpl(ctx, documentId, storageId, evt);
  } catch (error) {
    evt.setError(error);
    throw error;
  } finally {
    evt.emit();
  }
};

// Helper adds context but does NOT emit
async function submitPdfParsingImpl(ctx, documentId, storageId, evt: WideEvent) {
  try {
    evt.set("path", "pdf");
    // ...
  } catch (error) {
    evt.setError(error);
    // handle error (e.g., update status), but do NOT emit or re-throw
    // (the top-level handler controls the emit lifecycle)
  }
}
```

## Sub-operation timing

For functions that call external services, measure individual operations and attach them to the parent event:

```typescript
const t0 = Date.now();
const vectors = await embedder.embed(texts);
evt.set("embedDurationMs", Date.now() - t0);

const t1 = Date.now();
await vectorStore.upsert(points);
evt.set("upsertDurationMs", Date.now() - t1);
```

This reveals which external call is the bottleneck without adding extra log lines.

## What to log vs. what to skip

### Instrument these (high-value targets)

- **Actions** (`internalAction`, `action`) — these do external I/O and are the most likely to fail or be slow
- **Mutations that represent user-initiated operations** — e.g., `documents.create` (upload), `documents.retry` (retry failed processing)
- **Pipeline steps** — each stage of a multi-step pipeline should emit one wide event

### Skip these

- **High-frequency internal queries/mutations** — `getInternal`, `updateStatus`, `listByDocument`. Convex already logs their execution metadata. Adding wide events would create noise.
- **Simple queries** — `list`, `get`. Not enough business logic to justify.
- **Helpers that are always called within an instrumented parent** — they contribute to the parent's event instead.

## What NOT to do

- **No `console.log` / `console.error`** — use `WideEvent` instead. If you see an ad-hoc console call, replace it.
- **No log levels** — every wide event uses `console.log`. The `error: true` field distinguishes failures. Convex dashboard can filter on JSON field values.
- **No global state or singletons** — each function creates its own `WideEvent` instance.
- **No separate log table in Convex** — storage cost with no real benefit over structured console output.
- **No `customFunction` wrappers for logging** — too much indirection for this codebase size. Keep it explicit.

## Field naming conventions

Use camelCase for all field names. Common fields:

| Field          | Description                                                          |
| -------------- | -------------------------------------------------------------------- |
| `op`           | Operation name (set by constructor), e.g. `"pipeline.chunkAndStore"` |
| `durationMs`   | Total function duration (set by `emit()`)                            |
| `error`        | `true` when function failed (set by `setError()`)                    |
| `errorMessage` | Error description (set by `setError()`)                              |
| `documentId`   | The document being processed                                         |
| `userId`       | The user who owns the resource                                       |
| `*DurationMs`  | Sub-operation timing, e.g. `embedDurationMs`, `upsertDurationMs`     |
| `*Count`       | Counts, e.g. `chunkCount`, `validChunkCount`, `unembeddedCount`      |

## Currently instrumented functions

| Module           | Function                | Key fields                                                                                    |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `pipeline`       | `startProcessing`       | documentId, fileType, userId, path                                                            |
| `pipeline`       | `pollDatalabResult`     | documentId, attempt, elapsedMs, pollResult                                                    |
| `pipeline`       | `chunkAndStore`         | documentId, markdownLength, chunkCount, batchesStored                                         |
| `pipeline`       | `embedBatch`            | jobId, documentId, chunkCount, validChunkCount, retryCount, embedDurationMs, upsertDurationMs |
| `pipeline`       | `embedUnembeddedChunks` | documentId, unembeddedCount                                                                   |
| `pipeline`       | `resumeProcessing`      | documentId, failedAt, resumePath                                                              |
| `feedGeneration` | `generate`              | userId, readyDocuments, totalChunks, selectedChunks, postsGenerated, model                    |
| `documents`      | `create`                | documentId, fileType, userId, title                                                           |
| `documents`      | `retry`                 | documentId, previousStatus, failedAt                                                          |
