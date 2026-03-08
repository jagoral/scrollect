---
name: backend-development
description: Rules and patterns for working in the Scrollect Convex backend (packages/backend/). Use this skill anytime work touches packages/backend/, including creating or editing Convex functions, modifying the schema, working with the processing pipeline, feed generation, auth, providers, logging, or testing. Also trigger when the user mentions Convex functions, backend queries/mutations/actions, document processing, embeddings, chunking, feed cards, or any file under packages/backend/convex/.
---

# Backend Development — Scrollect

Scrollect's backend is a Convex BaaS at `packages/backend/convex/`. It powers an AI-driven personal learning feed: users save content (books, articles, PDFs), which gets parsed, chunked, embedded, and turned into bite-sized learning cards.

## File Structure

```
convex/
  pipeline/           — Multi-step document processing
    index.ts            startProcessing entry point
    parsing.ts          PDF & markdown parsing, Datalab polling
    chunking.ts         chunkAndStore
    embedding.ts        fanOutEmbedding, embedBatch, checkCompletion
    resume.ts           resumeProcessing, embedUnembeddedChunks
    helpers.ts          convexIdToUuid, blob helpers, provider factories, constants
  feed/               — Learning card generation
    queries.ts          list, getLastGeneratedAt, setReaction + internal helpers
    generation.ts       generate action (OpenAI), shuffle
  lib/                — Shared utilities
    functions.ts        requireAuth(), optionalAuth() auth helpers
    validators.ts       shared validators (documentStatus, fileType, etc.)
    logging.ts          WideEvent structured logging class
  providers/          — External service abstractions
    types.ts            interfaces: PdfParser, EmbeddingProvider, VectorStore
    openai.ts, qdrant.ts, datalab.ts, convexVectors.ts
  auth.ts, bookmarks.ts, chunks.ts, documents.ts,
  processingJobs.ts, schema.ts, testing.ts, http.ts,
  healthCheck.ts, chunking.ts, testingActions.ts, privateData.ts
```

## Auth

Use `requireAuth(ctx)` for authenticated endpoints and `optionalAuth(ctx)` when auth is optional. Import from `./lib/functions` (or `../lib/functions` from subdirs). Never import `authComponent` or `GenericCtx` directly outside `auth.ts` and `lib/functions.ts`. Internal functions (`internalQuery`, `internalMutation`, `internalAction`) don't need auth.

```typescript
import { requireAuth } from "./lib/functions";

export const myQuery = query({
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    // ...
  },
});
```

## Validators

Import shared validators from `lib/validators.ts` — never duplicate inline. Available: `fileType`, `documentStatus`, `failedAtStage`, `reactionType`, `reactionInput`. When a validator is used in more than one file, add it to `lib/validators.ts`.

## Logging

Use `WideEvent` from `lib/logging.ts` for all actions and mutations with side effects. No `console.log` — use structured wide events instead.

```typescript
import { WideEvent } from "./lib/logging";

const evt = new WideEvent("module.functionName");
evt.set({ documentId, userId });
try {
  // business logic
  evt.set("resultCount", results.length);
} catch (error) {
  evt.setError(error);
  throw error;
} finally {
  evt.emit(); // always emit in finally
}
```

Operation naming: `"module.functionName"` (e.g., `"documents.create"`, `"pipeline.embedBatch"`).

## File Organization

- Keep files 50-200 lines; split at ~200.
- Create a subdirectory when a module has 3+ related files.
- Colocate internal functions with the module that calls them.
- No junk-drawer files (no `helpers.ts` at root level).
- Don't put business logic in multiple places — colocate with the domain.

## Domain Folders (pipeline/, feed/)

Functions in domain folders reference each other via internal APIs:

```typescript
// From within pipeline/
await ctx.scheduler.runAfter(0, internal.pipeline.parsing.pollDatalabResult, { ... });

// Cross-domain
await ctx.scheduler.runAfter(0, internal.pipeline.embedding.fanOutEmbedding, { ... });
```

Pattern: `internal.<domain>.<file>.<function>`

## Provider Pattern

External services use provider interfaces defined in `providers/types.ts` with implementations in `providers/<name>.ts`. Provider factories live in `pipeline/helpers.ts` (for pipeline) or locally for other modules. This allows swapping providers (e.g., Qdrant to Convex vectors) without changing business logic.

## Pipeline Pattern

The document processing pipeline uses scheduler-based resilience:

1. Each stage schedules the next via `ctx.scheduler.runAfter()`
2. Fan-out/fan-in for batch operations (see `embedding.ts`)
3. Resumability: store checkpoints so failed operations can resume (see `resume.ts`)
4. Exponential backoff for polling/retries

## Schema

- Define schema in `schema.ts` using validators from `lib/validators.ts`
- Always add proper indexes for query patterns
- After changing schema or functions: `cd packages/backend && npx convex dev --once`

## Convex Conventions

- `"use node"` directive required for files that use Node.js APIs or export actions
- Actions call external APIs; queries/mutations are for database operations
- Use `internalAction`/`internalMutation`/`internalQuery` for server-only logic
- Always validate arguments with `v.*` validators
- Use `.withIndex()` for queries — avoid `.filter()` when an index exists

## Testing

- `testing.ts` and `testingActions.ts` contain E2E test utilities
- Test data is guarded by `E2E_EMAIL_PATTERN` — production data is safe
- After backend changes, run `bun run test:e2e` to verify
- Before running E2E tests: `kill -9 $(lsof -t -i:3001)` to free port 3001

## Don'ts

- Don't import `authComponent` or `GenericCtx` outside `auth.ts` and `lib/functions.ts`
- Don't duplicate validators — check `lib/validators.ts` first
- Don't create root-level junk-drawer files
- Don't exceed ~200 lines per file
- Don't use `console.log` — use `WideEvent` for structured logging
- Don't use `.filter()` when an index exists — use `.withIndex()`
