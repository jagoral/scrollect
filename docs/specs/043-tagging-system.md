# Spec: Tagging System (#43)

**Status:** Draft
**Date:** 2026-03-12
**Author:** PM (Scrollect Team)
**Issue:** [#43 — feat: tagging system with AI auto-suggest and manual tags](https://github.com/jagoral/scrollect/issues/43)

---

## Overview

Tags are the primary organizational primitive in Scrollect. They allow users to categorize documents by topic, filter their library, and eventually personalize their feed. The system has two tag sources: **AI auto-suggest** (applied automatically after document processing) and **manual** (user-created via a combobox UI on the document detail page).

Tags are per-user (no shared/global tag namespace). A tag like "machine learning" belongs to one user and is invisible to others. This aligns with Scrollect's "personal, not social" principle.

---

## Scope Decisions

| Decision                                                  | Rationale                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tags are user-scoped, not global**                      | Scrollect is a personal tool. Users should never see or interact with other users' tags. This simplifies the data model and avoids moderation.                                                    |
| **Normalization: lowercase + trim + collapse whitespace** | Prevents near-duplicates ("ML" and "ml", " React " and "React"). Simple and predictable. Does NOT merge semantic synonyms (e.g., "ML" and "machine learning" remain separate tags).               |
| **AI tags are auto-applied, no confirmation step**        | Requiring confirmation adds friction to every upload. AI tags use `source: "ai"` so the user can always identify and remove them. The user stays in control without a gate.                       |
| **Max 20 tags per document**                              | Prevents tag spam. 3-5 AI-suggested + room for manual additions. If the limit is reached, the user sees an inline message and must remove a tag before adding another.                            |
| **No limit on total tags per user**                       | Power users may have hundreds of topics. Limiting total tags adds friction with no clear benefit. Library filtering handles discovery.                                                            |
| **Feed cards show max 3 tags**                            | More than 3 tags clutters the compact card layout. Show first 3 (alphabetical), with a "+N" overflow indicator if more exist. Tapping "+N" is a no-op in P0 (future: expand or link to document). |
| **Library cards show max 2 tags**                         | Library cards are denser (title + status + metadata). 2 tags + "+N" overflow keeps them scannable.                                                                                                |
| **Tag display order: alphabetical**                       | Consistent and predictable. No "AI first" or "recent first" — just alphabetical.                                                                                                                  |
| **No tag hierarchies or categories (P0)**                 | Flat tags are simpler to implement and understand. Hierarchies are a future consideration.                                                                                                        |
| **No synonym merging (P0)**                               | "ML" and "machine learning" are separate tags. Merging requires a complex UI and conflict resolution. Deferred.                                                                                   |

---

## UX Flows

### Flow 1: AI Auto-Suggest (Background — No User Interaction)

1. User uploads a document (any type: PDF, article, YouTube, text)
2. Document goes through the existing pipeline: parsing -> chunking -> embedding
3. When status transitions to `"ready"`, an additional pipeline step triggers: **tag suggestion**
4. System samples 3-5 chunks from the document and sends them to the LLM
5. LLM returns 3-5 suggested tag names
6. For each suggested tag name:
   - Normalize: lowercase, trim, collapse whitespace
   - Check if a tag with that normalized name already exists for this user
   - If yes, reuse the existing tag; if no, create a new tag
   - Create a `documentTags` junction record with `source: "ai"`
7. No user notification — tags simply appear on the document when the user views it

**Edge case — document already has AI tags (retry scenario):**
If the user retries a failed document and it succeeds, do NOT re-run tag suggestion if AI tags already exist for that document. Only run on the first successful processing.

---

### Flow 2: Manual Tagging (Document Detail Page)

**Entry point:** Document detail page (`/library/{documentId}`) — only visible when document status is `"ready"`.

**Layout:**

```
Tags
┌──────────────────────────────────────┐
│ [ml] [deep-learning] [+ Add tag...] │
└──────────────────────────────────────┘
```

**Elements:**

- **Tag chips:** Each tag shown as a chip/badge. AI-suggested tags have a subtle sparkle icon or "AI" indicator. Each chip has an "x" button to remove.
- **"+ Add tag" trigger:** Opens a shadcn `Command` combobox (popover).
- **Combobox contents:**
  - Text input with placeholder: "Search or create a tag..."
  - List of existing user tags (filtered by input), excluding tags already on this document
  - If the typed text doesn't match any existing tag: a "Create '{input}'" option at the bottom
  - If the user has no tags yet (empty state): only the "Create '{input}'" option appears

**Flow — Adding an Existing Tag:**

1. User clicks "+ Add tag"
2. Combobox opens, showing all user tags not yet on this document
3. User types to filter (e.g., "mac")
4. Matching tags appear (e.g., "machine learning", "macos")
5. User selects "machine learning"
6. Tag is added to the document with `source: "manual"`
7. Combobox closes, chip appears immediately

**Flow — Creating a New Tag:**

1. User clicks "+ Add tag"
2. User types "distributed systems"
3. No existing tags match
4. User sees: `Create "distributed systems"`
5. User selects it (click or Enter)
6. Tag is created (normalized) and applied to the document with `source: "manual"`
7. Chip appears immediately

**Flow — Removing a Tag:**

1. User clicks the "x" on a tag chip
2. Tag-document association is removed immediately (optimistic UI)
3. The tag itself is NOT deleted (it remains available for future use on other documents)

**Flow — Near-Duplicate on Creation:**

1. User types "Machine Learning"
2. System normalizes to "machine learning"
3. A tag named "machine learning" already exists for this user
4. Instead of creating a duplicate, the existing tag is reused and applied to the document
5. User sees the existing tag appear — no error, no warning

**Flow — Tag Limit Reached:**

1. Document already has 20 tags
2. "+ Add tag" trigger is replaced with text: "Maximum tags reached (20). Remove a tag to add more."
3. User can still remove tags

---

### Flow 3: Library Filtering by Tag

**Entry point:** Library page (`/library`) — new filter bar above the document list.

**Layout:**

```
My Library
Your uploaded documents and their processing status.       [Upload]

Tags: [All] [machine learning] [react] [distributed systems] ...
      ↑ filter chips, horizontally scrollable

┌─────────────────────────────────────┐
│ 📄 Designing Data-Intensive Apps    │
│ ✅ Ready · 42 chunks · 2 days ago  │
│ [distributed systems] [databases]   │
└─────────────────────────────────────┘
```

**Elements:**

- **Filter bar:** Horizontal row of tag chips. First chip is "All" (default, shows all documents). Remaining chips are the user's tags, sorted alphabetically.
- **Filter behavior:** Clicking a tag filters the document list to only show documents with that tag. Multiple tags can be selected (AND logic — document must have ALL selected tags). Clicking "All" clears the filter.
- **Active state:** Selected filter tags use a filled/primary style. Unselected tags use an outline style.
- **No tags yet:** If the user has no tags, the filter bar is hidden entirely.

**Tag chips on document cards:**

- Show up to 2 tags per document card, alphabetically sorted
- If more than 2: show "+N" indicator (e.g., "+3")
- Tags use a small, muted badge style (not clickable on cards — filtering is done via the filter bar)

---

### Flow 4: Tags on Feed Cards

**Display only — no interaction in P0.**

- Each feed card (post) inherits tags from its `primarySourceDocumentId`
- Show up to 3 tags, alphabetically sorted, as small muted badges below the source document title
- If more than 3: show "+N" indicator
- Tags are not clickable on feed cards in P0

---

## Acceptance Criteria

### P0 — Must Ship

| #     | Criterion                                                     | Testable Condition                                                                                                                                |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1  | `tags` and `documentTags` tables exist with proper indexes    | Tables are in the Convex schema. `tags` has indexes `by_userId` and `by_userId_name`. `documentTags` has indexes `by_documentId` and `by_tagId`.  |
| P0-2  | Tag normalization prevents duplicates                         | Creating tags "ML", " ml ", and "Ml" for the same user results in a single tag record. Attempting to create a duplicate returns the existing tag. |
| P0-3  | AI auto-suggests 3-5 tags after document processing completes | When a document transitions to `"ready"` status, an LLM call runs and creates 3-5 `documentTags` records with `source: "ai"`.                     |
| P0-4  | AI tags are not re-suggested on retry                         | If a document already has AI-sourced tags and is retried, the tag suggestion step is skipped.                                                     |
| P0-5  | Document detail page shows current tags                       | When viewing a ready document, all associated tags appear as chips. AI-suggested tags have a visual indicator (sparkle icon or "AI" label).       |
| P0-6  | User can add an existing tag via combobox                     | Clicking "+ Add tag" opens a combobox. Selecting an existing tag creates a `documentTags` record with `source: "manual"`.                         |
| P0-7  | User can create a new tag via combobox                        | Typing a new tag name and selecting "Create '{name}'" creates a new tag and applies it to the document.                                           |
| P0-8  | User can remove a tag from a document                         | Clicking "x" on a tag chip removes the `documentTags` record. The tag itself persists for reuse.                                                  |
| P0-9  | Max 20 tags per document enforced                             | When a document has 20 tags, the add UI is disabled with a message. Backend rejects additions beyond 20.                                          |
| P0-10 | Library page supports filtering by tag                        | A tag filter bar appears on the library page. Selecting one or more tags filters the document list (AND logic). "All" clears the filter.          |
| P0-11 | Library document cards show up to 2 tags                      | Each document card in the library list shows up to 2 tag badges, with a "+N" overflow indicator if more exist.                                    |
| P0-12 | Feed cards show up to 3 tags from source document             | Each feed card displays up to 3 tag badges inherited from its source document, with "+N" overflow.                                                |
| P0-13 | Tag combobox autocomplete filters as user types               | Typing in the combobox filters the tag list in real-time. Only tags not already on the document are shown.                                        |
| P0-14 | Empty state: combobox with no existing tags                   | If the user has no tags, the combobox shows only the "Create '{input}'" option after the user types.                                              |
| P0-15 | Near-duplicate tags are handled silently                      | Creating "Machine Learning" when "machine learning" exists reuses the existing tag — no error, no duplicate.                                      |

### P1 — Nice to Have (Not Blocking Ship)

| #    | Criterion                                                    | Notes                                                                            |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| P1-1 | Tag management page (view all tags, rename, delete)          | Dedicated page to manage the user's full tag library.                            |
| P1-2 | Bulk tagging (apply a tag to multiple documents at once)     | Multi-select in library + "Add tag" action.                                      |
| P1-3 | Tag counts on filter bar                                     | Show document count next to each tag in the filter bar (e.g., "react (5)").      |
| P1-4 | Feed card tag chips are clickable (link to filtered library) | Clicking a tag on a feed card navigates to `/library?tag={tagName}`.             |
| P1-5 | AI tag confidence scores                                     | Store a confidence value per AI-suggested tag. Show only tags above a threshold. |

---

## Edge Cases

| Scenario                                               | Behavior                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User creates tag with only whitespace**              | After normalization, the name is empty. Reject with validation error: "Tag name cannot be empty."                                                                         |
| **User creates tag with special characters**           | Allow most characters (letters, numbers, hyphens, spaces, periods). Strip leading/trailing whitespace. No emoji restriction in P0 (normalize but allow).                  |
| **Tag name exceeds 50 characters**                     | Reject with validation error: "Tag name must be 50 characters or fewer." Enforced both client-side and backend.                                                           |
| **AI suggests a tag that already exists for the user** | Reuse the existing tag (standard normalization path). Do not create a duplicate.                                                                                          |
| **AI suggests more than 5 tags**                       | Take the first 5 and discard the rest.                                                                                                                                    |
| **AI suggests fewer than 3 tags**                      | Accept whatever is returned (1-2 tags). Do not fail or retry for too few tags.                                                                                            |
| **Document is deleted**                                | The document's embedded `tagIds` and `tagSources` are deleted with the document. Orphaned tags (not referenced by any remaining document) persist for autocomplete reuse. |
| **Two documents share the same tag**                   | Expected behavior. The tag record is shared; each document has the tag ID in its own `tagIds` array. Removing the tag from one document does not affect the other.        |
| **User rapidly clicks add/remove**                     | Optimistic UI with server reconciliation. Canonical mutation functions check for duplicates before inserting into `tagIds` array (idempotent).                            |
| **Very long tag list on filter bar**                   | Filter bar is horizontally scrollable. No wrapping. On mobile, horizontal scroll is native.                                                                               |

---

## Data Model (Aligned with ADR-006)

See `docs/adr/006-tagging-system.md` for full rationale. Key decisions:

**`tags` table (new):**

```
{
  name: string,           // Display name — preserves user's original casing (e.g., "Machine Learning")
  normalizedName: string, // Lowercase, trimmed, whitespace-collapsed (e.g., "machine learning")
  userId: string,
  createdAt: number
}
```

Indexes: `by_userId`, `by_userId_normalizedName`

**`documents` table (modified — no junction table):**

```
{
  ...existing fields...,
  tagIds: optional(array(Id<"tags">)),                          // Tag references
  tagSources: optional(array("ai" | "manual")),                 // Positionally aligned with tagIds
}
```

No new indexes on documents — tag filtering uses existing `by_userId` with in-memory filter.

**Key design decisions:**

1. **No junction table.** Embedded `tagIds` array on documents. Convex has no JOINs, so the junction table doubles query cost for the hot path (get tags for a document). In-memory filtering for "documents by tag" is fast at personal scale (10-100 docs).
2. **`name` + `normalizedName` split.** Preserves user's display casing ("React", "GraphQL") while enabling O(1) dedup via the `by_userId_normalizedName` index.
3. **Parallel arrays for source tracking.** `tagSources[i]` corresponds to `tagIds[i]`. All mutations go through canonical `addTagToDocument` / `removeTagFromDocument` functions that maintain both arrays atomically. Length parity must be asserted.
4. **No tag denormalization on posts.** Feed cards resolve tags at render time via `primarySourceDocumentId` -> document -> `tagIds`. Avoids write amplification when tags change.
5. **Orphaned tags are kept.** Tags with no document associations remain for autocomplete reuse.

---

## Future Considerations

These are explicitly out of scope for P0 but inform the architecture:

| Feature                                             | Impact on Current Design                                                                                                                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag hierarchies / categories**                    | Would require a `parentTagId` field on `tags`. Current flat structure is forward-compatible — adding a nullable parent field later is non-breaking.                                                                                                            |
| **Tag merging**                                     | Would need a merge mutation that re-points all `documentTags` from tag A to tag B, then deletes tag A. Current junction table design supports this cleanly.                                                                                                    |
| **Synonym groups**                                  | Would require a `synonymGroupId` or a separate `tagSynonyms` table. Current normalization handles case variants but not semantic synonyms.                                                                                                                     |
| **Cross-document tag analytics**                    | "You have 12 documents tagged 'react' — here are common themes." Requires querying `documentTags.by_tagId` and aggregating chunks. Current indexes support this.                                                                                               |
| **Smart tag suggestions based on existing library** | Instead of generic LLM suggestions, use the user's existing tag vocabulary as a hint to the LLM prompt. Requires passing existing tags into the suggestion prompt.                                                                                             |
| **Tag-based feed personalization**                  | "Show me more cards from documents tagged 'distributed systems'." Requires the feed generation pipeline to accept tag filters and weight chunk sampling by tag. Current `weightedSample` in `feed/sampling.ts` could be extended with a tag-weight multiplier. |
| **Tag colors**                                      | User-assigned colors for tags. Would add an optional `color` field to `tags`. Non-breaking addition.                                                                                                                                                           |

---

## Out of Scope

- Tag sharing between users
- Global/system-level tags
- Tag-based search (full-text search across tag names — autocomplete is sufficient)
- Tag import/export
- Browser extension tag integration
