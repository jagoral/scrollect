# ADR-002: Bookmark Lists Replace Saved Boolean

**Status:** Accepted
**Date:** 2026-03-08
**Author:** Scrollect Team

## Context

The `posts` table currently has a `saved: v.optional(v.boolean())` field and a `by_saved` index. Both are unused. The current design has several limitations:

1. **No multi-list support** — A boolean can only represent "saved or not." Users who want to organize bookmarks into lists (e.g., "Review later," "Favorites," "Topic X") would require a schema migration.
2. **No bookmark metadata** — No way to store when something was bookmarked, or attach notes.
3. **No future extensibility** — Sharing bookmarks or collaborative lists would require a full redesign.

Additionally, the `feed.list` query currently uses `.collect()`, which loads all posts into memory at once. This is unbounded and will degrade as users accumulate hundreds or thousands of posts.

## Decision

### 1. Replace `saved` boolean with `bookmarkLists` + `bookmarks` junction tables

Instead of a boolean flag on `posts`, introduce two new tables:

**`bookmarkLists`** — Represents a named collection of bookmarks per user.

```
bookmarkLists: defineTable({
  userId: v.string(),
  name: v.string(),
  isDefault: v.boolean(),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_default", ["userId", "isDefault"])
```

**`bookmarks`** — Junction table linking posts to lists.

```
bookmarks: defineTable({
  userId: v.string(),
  postId: v.id("posts"),
  listId: v.id("bookmarkLists"),
  createdAt: v.number(),
})
  .index("by_post_and_list", ["postId", "listId"])
  .index("by_list", ["listId"])
  .index("by_userId_post", ["userId", "postId"])
```

**Remove from `posts`:** The `saved` field and `by_saved` index.

### 2. Use Convex-native cursor-based pagination for feed

Replace `.collect()` with `.paginate()` using Convex's built-in `paginationOptsValidator`.

### 3. Pull-to-refresh feed generation model

Feed generation is triggered by a "Generate" button or auto-generated on feed open when stale (newest post age exceeds a threshold). Generation is NOT triggered by scrolling to the bottom.

## Rationale

### Why junction tables over a boolean

| Concern                   | Boolean `saved`                    | Junction tables                         |
| ------------------------- | ---------------------------------- | --------------------------------------- |
| Multiple lists            | Requires schema migration per list | Add rows, no migration                  |
| Bookmark metadata         | Cannot store timestamps or notes   | `createdAt` built in, extensible        |
| Shared bookmarks (future) | Not possible                       | Add `sharedWith` or access control      |
| Data normalization        | Denormalized flag on posts         | Normalized, follows relational patterns |
| Query flexibility         | Filter by single boolean           | Query by list, by user, by post         |

### Why cursor-based pagination (not offset)

- **Convex-native**: `.paginate()` with `paginationOptsValidator` is the built-in primitive. Offset-based pagination is not natively supported.
- **Efficient for real-time data**: Cursor-based pagination handles insertions and deletions gracefully — no skipped or duplicated items when the underlying data changes.
- **Consistent performance**: Cursor-based is O(1) per page regardless of how deep you are in the result set. Offset-based would be O(n) in systems that support it.

### Why pull-to-refresh (not scroll-triggered generation)

- **Prevents infinite generation loops**: If generation were triggered by reaching the bottom, the user could inadvertently trigger continuous AI generation, consuming resources and producing low-quality cards.
- **User control**: Users explicitly decide when to generate new content. This aligns with the "personal, not social" principle — the feed serves the user, not an engagement algorithm.
- **Auto-generate on stale feed**: When the feed page opens, check if the newest post is older than a configurable threshold. If so, auto-trigger generation once. This balances convenience with control.

### Future multi-list scaling

The junction table design supports multiple lists from day one. Adding a "Create List" UI only requires:

- A new mutation to insert into `bookmarkLists`
- A `listId` parameter on the `bookmarks.toggle` mutation
- UI to select which list to bookmark into

No schema changes needed.

## Contracts

### Mutations

**`bookmarks.toggle({ postId })`**

- Toggle bookmark on the user's default list.
- Auto-creates the default list if one doesn't exist for the user.
- If a bookmark exists for this post+list, delete it. Otherwise, insert one.

**`feed.setReaction({ postId, reaction: "like" | "dislike" | null })`**

- Set or clear a reaction on a post.
- `null` clears the reaction (removes the field).
- Validates the post belongs to the authenticated user.

### Queries

**`feed.list` (paginated)**

- Uses `paginationOptsValidator` for cursor-based pagination.
- Returns `{ page: PostWithMeta[], isDone, continueCursor }`.
- `PostWithMeta` shape: `{ ...post, sourceDocumentTitle: string | null, isBookmarked: boolean, reaction: "like" | "dislike" | null }`.
- `isBookmarked` is resolved by checking the `bookmarks` table for the post on the user's default list.

**`bookmarks.listSaved` (paginated)**

- Paginated query of bookmarks on the user's default list.
- Joins with `posts` and `documents` to return full card data.
- Ordered by bookmark `createdAt` descending (most recently saved first).

**`feed.getLastGeneratedAt`**

- Returns the `createdAt` timestamp of the user's newest post, or `null` if no posts exist.
- Used by the frontend to determine if auto-generation should trigger.

### Frontend Infinite Scroll Pattern

```tsx
const { results, status, loadMore } = usePaginatedQuery(api.feed.list, {}, { initialNumItems: 10 });

// IntersectionObserver on a sentinel div at the bottom of the list
// When visible && status === "CanLoadMore" -> loadMore(10)
// When status === "Exhausted" -> show "You're all caught up"
```

## Consequences

- **Migration**: Remove `saved` field and `by_saved` index from `posts`. Since both are unused, this is safe.
- **Performance**: Paginated feed queries load only 10 posts at a time instead of all posts. Bookmark lookups add one indexed query per post per page (10 extra reads per page load).
- **Complexity**: Two new tables and a junction-table pattern add moderate complexity, but this is standard for any bookmark/favorites system and pays off immediately when multi-list support is needed.
