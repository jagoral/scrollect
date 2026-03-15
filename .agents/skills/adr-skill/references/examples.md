# ADR Example

A filled-out example following Scrollect conventions. Use as reference — never leave placeholder text in a real ADR.

```markdown
---
status: accepted
date: 2026-03-08
---

# ADR-002: Replace saved boolean with bookmark lists

## Context

The `posts` table has an unused `saved: v.optional(v.boolean())` field and `by_saved` index. A boolean can only represent "saved or not" — no multi-list support, no bookmark metadata, no extensibility toward shared lists. Issue #31 requests organizing bookmarks into named lists.

Additionally, `feed.list` uses `.collect()`, loading all posts into memory at once — unbounded and will degrade at hundreds of posts.

## Decision

### 1. Junction tables for bookmarks

Introduce `bookmarkLists` (named collections per user) and `bookmarks` (junction linking posts to lists) tables. Remove the `saved` field and `by_saved` index from `posts`.

A junction table over a boolean because: multiple lists without migration, bookmark metadata (`createdAt`), and future extensibility (shared lists) — all for the cost of one extra table and slightly more complex mutations.

### 2. Cursor-based pagination for feed

Replace `.collect()` with Convex-native `.paginate()` using `paginationOptsValidator`. Cursor-based handles real-time insertions/deletions gracefully and is O(1) per page.

### 3. Pull-to-refresh generation model

Feed generation triggers on explicit "Generate" button or auto-generates when the feed is stale (newest post exceeds age threshold). NOT triggered by scroll — prevents infinite generation loops and keeps the user in control.

### Alternatives considered

- **Keep boolean, add lists later** — Defers the migration but every future feature (lists, metadata, sharing) requires it. Better to do it now while `saved` is unused.
- **Offset-based pagination** — Not natively supported by Convex. Cursor-based is the built-in primitive.
- **Scroll-triggered generation** — Risk of infinite generation loops, high AI cost, user loses control.

## Consequences

- **Migration**: Remove unused `saved` field and `by_saved` index — safe since both are unused
- **Performance**: Feed loads 10 posts per page instead of all. Bookmark lookups add one indexed query per post per page (10 extra reads)
- **Complexity**: Two new tables add moderate complexity, but the junction pattern pays off immediately when multi-list support ships
- **Follow-up**: Issue #32 for frontend infinite scroll, Issue #33 for bookmark list UI
```
