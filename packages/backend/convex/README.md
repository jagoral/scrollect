# Convex functions directory

This directory contains **only** Convex functions (queries, mutations, actions), schema, config, and Convex-specific helpers.

## What belongs here

- Files that export Convex functions (`query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`)
- `schema.ts`, `auth.ts`, `auth.config.ts`, `convex.config.ts`, `http.ts`
- `lib/` - Convex-specific helpers (auth wrappers, validators, rate limiting, logging)
- `pipeline/` - Action wrappers and bridge code (services.ts, helpers.ts) that use `ActionCtx` or `_generated/api`

## What does NOT belong here

- Pure business logic - goes in `../src/`
- External service providers (AI, Qdrant, analytics) - goes in `../src/providers/`
- Test files - go in `../tests/`

## Import convention

Convex files import pure logic and providers from `../../src/` using relative paths. The Convex bundler (esbuild) follows these imports at build time and bundles them into the deployment. Files in `src/` must never import from `_generated/` or use Convex runtime APIs (`ctx`, `v`, etc.) - they stay framework-agnostic so they remain testable with plain vitest.

See https://docs.convex.dev/functions for Convex function documentation.
