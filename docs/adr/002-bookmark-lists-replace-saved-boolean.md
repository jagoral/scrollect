---
status: accepted
date: 2026-03-08
---

# ADR-002: Replace saved boolean with bookmark lists

## Context

The `posts` table currently has a `saved: v.optional(v.boolean())` field and a `by_saved` index. Both are unused. The current design has several limitations:

1. **No multi-list support** — A boolean can only represent "saved or not." Users who want to organize bookmarks into lists (e.g., "Review later," "Favorites," "Topic X") would require a schema migration.
2. **No bookmark metadata** — No way to store when something was bookmarked, or attach notes.
3. **No future extensibility** — Sharing bookmarks or collaborative lists would require a full redesign.

Additionally, the `feed.list` query currently uses `.collect()`, which loads all posts into memory at once. This is unbounded and will degrade as users accumulate hundreds or thousands of posts.

Issue #31 requests organizing bookmarks into named lists.

## Decision

### 1. Replace `saved` boolean with `bookmarkLists` + `bookmarks` junction tables

Instead of a boolean flag on `posts`, introduce two new tables:

- **`bookmarkLists`** — Named collections per user, with `userId`, `name`, `isDefault`, and `createdAt`. Indexed by `userId` and `userId + isDefault`.
- **`bookmarks`** — Junction table linking posts to lists, with `userId`, `postId`, `listId`, and `createdAt`. Indexed by `postId + listId`, `listId`, and `userId + postId`.

Remove the `saved` field and `by_saved` index from `posts`.

**Why junction tables over a boolean:**

| Concern                   | Boolean `saved`                    | Junction tables                         |
| ------------------------- | ---------------------------------- | --------------------------------------- |
| Multiple lists            | Requires schema migration per list | Add rows, no migration                  |
| Bookmark metadata         | Cannot store timestamps or notes   | `createdAt` built in, extensible        |
| Shared bookmarks (future) | Not possible                       | Add `sharedWith` or access control      |
| Data normalization        | Denormalized flag on posts         | Normalized, follows relational patterns |
| Query flexibility         | Filter by single boolean           | Query by list, by user, by post         |

The junction table design supports multiple lists from day one. Adding a "Create List" UI only requires a new mutation to insert into `bookmarkLists`, a `listId` parameter on `bookmarks.toggle`, and UI to select which list. No schema changes needed.

**Key mutations:**

- `bookmarks.toggle({ postId })` — Toggle bookmark on the user's default list. Auto-creates the default list if one doesn't exist.
- `feed.setReaction({ postId, reaction })` — Set or clear a reaction ("like" | "dislike" | null).

### 2. Cursor-based pagination for feed

Replace `.collect()` with Convex-native `.paginate()` using `paginationOptsValidator`.

- **Convex-native**: `.paginate()` is the built-in primitive. Offset-based pagination is not natively supported.
- **Efficient for real-time data**: Cursor-based handles insertions and deletions gracefully — no skipped or duplicated items when the underlying data changes.
- **Consistent performance**: O(1) per page regardless of how deep you are in the result set.

The paginated `feed.list` query returns `{ page: PostWithMeta[], isDone, continueCursor }`. Each `PostWithMeta` includes the post, source document title, `isBookmarked` (resolved by checking the `bookmarks` table for the post on the user's default list), and the current reaction.

### 3. Pull-to-refresh generation model

Feed generation is triggered by:

- A "Generate" button — explicit user action.
- Auto-generation on feed open when stale — when the newest post's age exceeds a configurable threshold.

Generation is NOT triggered by scrolling to the bottom. This prevents infinite generation loops (user inadvertently triggers continuous AI generation), keeps the user in control, and aligns with the "personal, not social" principle — the feed serves the user, not an engagement algorithm.

### Alternatives considered

- **Keep boolean, add lists later** — Defers the migration but every future feature (lists, metadata, sharing) requires it. Better to do it now while `saved` is unused.
- **Offset-based pagination** — Not natively supported by Convex. Cursor-based is the built-in primitive. Offset would also be O(n) at depth.
- **Scroll-triggered generation** — Risk of infinite generation loops, high AI cost, user loses control of when new content appears.

## Consequences

- **Migration**: Remove `saved` field and `by_saved` index from `posts`. Since both are unused, this is safe — no data to migrate.
- **Performance**: Paginated feed queries load only 10 posts at a time instead of all posts. Bookmark lookups add one indexed query per post per page (10 extra reads per page load).
- **Complexity**: Two new tables and a junction-table pattern add moderate complexity, but this is standard for any bookmark/favorites system and pays off immediately when multi-list support is needed.
- **Follow-up**: Issue #32 for frontend infinite scroll with IntersectionObserver sentinel pattern, Issue #33 for bookmark list UI.
