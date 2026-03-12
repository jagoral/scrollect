# Spec: URL Content Ingestion UX (#42)

**Status:** Draft
**Date:** 2026-03-12
**Author:** PM (Scrollect Team)
**Issue:** [#42 — feat: URL content ingestion (articles, YouTube, raw text)](https://github.com/jagoral/scrollect/issues/42)

---

## Overview

The upload page today only accepts file uploads (PDF, Markdown via drag-and-drop). This is the biggest friction barrier in the product — users must already have a file on disk. The product vision explicitly calls out "paste a URL" as a low-friction input method.

This spec defines the UX for a tabbed upload page that adds two new input methods: **Paste URL** (articles and YouTube) and **Paste Text** (raw text). The goal is to reduce the time from "I found something interesting" to "it's in my Scrollect" to under 10 seconds.

---

## Scope Decisions

| Decision                                    | Rationale                                                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------- |
| **Three tabs, not a unified input**         | A single smart input field adds detection ambiguity (is a pasted block of text a URL or raw text?). Tabs are explicit and predictable. Users always know what mode they're in.                                                                                       |
| **Auto-detect YouTube vs article from URL** | No dropdown for content type. The system inspects the URL domain. YouTube domains (`youtube.com`, `youtu.be`, `m.youtube.com`) route to the YouTube extractor; everything else routes to the article extractor. Users should not need to classify their own content. |
| **No title input for URLs**                 | Title is auto-extracted from the source. Adding a title field adds friction and implies the user _should_ customize it. They can rename in the library later if needed.                                                                                              |
| **Title required for raw text**             | Raw text has no source to extract a title from. A title field is required so the content is identifiable in the library.                                                                                                                                             |
| **No batch URL input (P1/future)**          | MVP is one URL at a time. Batch paste (multiple URLs separated by newlines) is a future enhancement.                                                                                                                                                                 |
| **Default tab is Upload File**              | Existing users expect the current behavior. New tab ordering: Upload File                                                                                                                                                                                            | Paste URL | Paste Text. |

---

## UX Flows

### Tab Structure

The upload page uses a `Tabs` component (shadcn) with three tabs:

```
[ Upload File ]  [ Paste URL ]  [ Paste Text ]
```

- Tabs appear at the top of the upload area, replacing the current page subtitle ("Add PDF or Markdown files to your library").
- Page title stays: **"Upload Content"**
- Subtitle updates per tab (see below).

---

### Tab 1: Upload File (existing behavior, minor updates)

**Subtitle:** "Add PDF or Markdown files to your library."

No functional changes to the existing drag-and-drop upload. The current `upload-content.tsx` component becomes the content of this tab.

**One visual change:** The accepted formats hint at the bottom of the drop zone should read: "Accepts .pdf and .md files" (unchanged).

---

### Tab 2: Paste URL

**Subtitle:** "Add an article or YouTube video to your library."

**Layout:**

```
+------------------------------------------+
|  [URL input field]            [Add button]|
|                                           |
|  Supported: articles, blog posts,         |
|  YouTube videos                           |
+------------------------------------------+
```

**Elements:**

- **URL input field**: Full-width text input with placeholder text: `https://example.com/article or YouTube URL`
- **"Add" button**: Primary button, right-aligned next to the input (or below on mobile). Disabled until a valid URL is entered.
- **Helper text**: Below the input: "Supported: articles, blog posts, YouTube videos"

**Flow — Happy Path:**

1. User switches to "Paste URL" tab
2. User pastes or types a URL into the input field
3. System validates URL format client-side (basic URL pattern match)
4. User clicks "Add" (or presses Enter)
5. Button changes to loading state (spinner + "Processing...")
6. Input field becomes disabled during processing
7. System auto-detects content type from URL domain:
   - YouTube domains -> `fileType: "youtube"`
   - Everything else -> `fileType: "article"`
8. Backend creates document, starts extraction pipeline
9. On success:
   - Toast notification: "Added **{extracted title}**. [View in library](/library)" (same pattern as file upload)
   - Input field clears and re-enables
   - Button returns to default state
10. User can immediately paste another URL

**Flow — Validation Error (client-side):**

1. User types something that isn't a URL (no protocol, no domain)
2. On blur or on submit attempt, inline validation message appears below the input:
   - **Copy:** "Please enter a valid URL starting with https://"
3. "Add" button stays disabled
4. No toast — inline feedback only for validation errors

**Flow — Extraction Failure (server-side):**

See Error States section below.

---

### Tab 3: Paste Text

**Subtitle:** "Paste any text to add it to your library."

**Layout:**

```
+------------------------------------------+
|  Title: [_______________________________] |
|                                           |
|  +--------------------------------------+|
|  |                                      ||
|  |  [Textarea - paste your text here]   ||
|  |                                      ||
|  |                                      ||
|  +--------------------------------------+|
|                                           |
|                     [Add to Library]      |
+------------------------------------------+
```

**Elements:**

- **Title input**: Required text input. Label: "Title". Placeholder: `e.g., Meeting notes, Research summary`
- **Textarea**: Large textarea (min 6 rows, resizable). Placeholder: `Paste your text, notes, or any content here...`
- **"Add to Library" button**: Primary button, right-aligned. Disabled until both title and text body are non-empty.
- **Character count** (P1): Optional, below the textarea. Shows current character count. No hard limit in P0 but display the count for user awareness.

**Flow — Happy Path:**

1. User switches to "Paste Text" tab
2. User types or pastes a title
3. User pastes text content into the textarea
4. "Add to Library" button becomes enabled
5. User clicks "Add to Library"
6. Button changes to loading state (spinner + "Processing...")
7. Both fields become disabled during processing
8. System uploads text as a blob to Convex storage, creates document with `fileType: "text"`
9. On success:
   - Toast notification: "Added **{title}**. [View in library](/library)"
   - Both fields clear and re-enable
   - Button returns to default state

**Flow — Empty Fields:**

1. User clicks "Add to Library" with empty title or empty text
2. Button is disabled (never clickable in this state)
3. If title is empty and user tries to submit: focus moves to the title field
4. Inline validation on blur: "Title is required" / "Text content is required"

---

## Error States

### URL Tab Errors

| Scenario                                    | When detected               | User-facing message (toast)                                                                                       | Toast type   |
| ------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| **Invalid URL format**                      | Client-side, on blur/submit | Inline below input: "Please enter a valid URL starting with https://"                                             | N/A (inline) |
| **Article extraction failed**               | Server-side, after submit   | "We couldn't extract content from this URL. The page may be paywalled, require login, or block automated access." | Error toast  |
| **YouTube — no transcript available**       | Server-side, after submit   | "This YouTube video doesn't have a transcript available. Try a video with captions enabled."                      | Error toast  |
| **YouTube — private/unavailable video**     | Server-side, after submit   | "This video is private or unavailable. Please check the URL and try again."                                       | Error toast  |
| **YouTube — age-restricted video**          | Server-side, after submit   | "This video is age-restricted and can't be processed. Try a different video."                                     | Error toast  |
| **Network/timeout error**                   | Server-side, after submit   | "Something went wrong while processing this URL. Please try again."                                               | Error toast  |
| **Unsupported URL scheme** (e.g., `ftp://`) | Client-side, on submit      | Inline below input: "Please enter a valid URL starting with https://"                                             | N/A (inline) |
| **Empty URL submitted**                     | Client-side, on submit      | Inline below input: "Please enter a URL"                                                                          | N/A (inline) |

**After any server-side error:**

- Input field re-enables with the URL still filled in (so the user can retry or edit)
- "Add" button returns to default state

### Text Tab Errors

| Scenario                   | When detected               | User-facing message                                                     | Type        |
| -------------------------- | --------------------------- | ----------------------------------------------------------------------- | ----------- |
| **Empty title**            | Client-side, on blur/submit | Inline below title: "Title is required"                                 | Inline      |
| **Empty text body**        | Client-side, on blur/submit | Inline below textarea: "Text content is required"                       | Inline      |
| **Upload/storage failure** | Server-side, after submit   | Toast: "Something went wrong while saving your text. Please try again." | Error toast |

**After server-side error:**

- Both fields re-enable with content preserved (user can retry)

### File Tab Errors

No changes to existing error handling.

---

## Acceptance Criteria

### P0 — Must ship

| #     | Criterion                                                               | Testable condition                                                                                                                                                             |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-1  | Upload page has three tabs: Upload File, Paste URL, Paste Text          | Tabs are visible and switchable. Upload File is selected by default.                                                                                                           |
| P0-2  | Paste URL: user can submit an article URL and it creates a document     | Given a valid article URL, when user clicks Add, then a document with `fileType: "article"` and `sourceUrl` set appears in the library.                                        |
| P0-3  | Paste URL: user can submit a YouTube URL and it creates a document      | Given a valid YouTube URL (youtube.com, youtu.be, m.youtube.com), when user clicks Add, then a document with `fileType: "youtube"` and `sourceUrl` set appears in the library. |
| P0-4  | Paste URL: YouTube auto-detection works for all YouTube URL formats     | URLs matching `youtube.com/watch?v=`, `youtu.be/`, `m.youtube.com/watch?v=`, `youtube.com/shorts/` are all detected as YouTube.                                                |
| P0-5  | Paste URL: article extraction produces learning cards                   | Given a successfully extracted article, the processing pipeline runs and generates cards visible in the feed.                                                                  |
| P0-6  | Paste URL: YouTube transcript extraction produces learning cards        | Given a YouTube video with captions, the processing pipeline runs and generates cards visible in the feed.                                                                     |
| P0-7  | Paste URL: client-side URL validation prevents malformed input          | Non-URL text or URLs without https:// show inline validation error. The Add button is disabled for empty input.                                                                |
| P0-8  | Paste URL: server-side extraction failure shows clear error toast       | When extraction fails (paywalled, no transcript, private video), user sees a specific error message and the input re-enables with URL preserved.                               |
| P0-9  | Paste Text: user can submit text with a title and it creates a document | Given non-empty title and text, when user clicks Add to Library, a document with `fileType: "text"` appears in the library.                                                    |
| P0-10 | Paste Text: title is required                                           | Submitting with an empty title shows inline validation. Button is disabled when title or text is empty.                                                                        |
| P0-11 | Paste Text: pasted text produces learning cards                         | Given successfully stored text, the processing pipeline runs and generates cards visible in the feed.                                                                          |
| P0-12 | Upload File tab preserves existing behavior                             | Drag-and-drop, file picker, and PDF/Markdown upload all work exactly as before.                                                                                                |
| P0-13 | Loading states during processing                                        | URL tab: button shows spinner + "Processing...", input disables. Text tab: button shows spinner, both fields disable. State reverts on success or error.                       |
| P0-14 | Success toast with library link                                         | After successful add (any tab), toast shows extracted/entered title with a link to the library page.                                                                           |
| P0-15 | All existing `storageId` reads handle the optional case                 | URL-based documents have no `storageId`. No runtime errors when viewing or processing URL-sourced documents.                                                                   |

### P1 — Nice to have (not blocking ship)

| #    | Criterion                                                              | Notes                                                                                                      |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P1-1 | Paste URL: link preview (title + favicon) appears after URL validation | Shows a preview card below the input after the URL is validated. Requires an additional lightweight fetch. |
| P1-2 | Paste Text: character count display                                    | Shows character count below the textarea. No hard limit enforced.                                          |
| P1-3 | Paste URL: batch URL input                                             | Support pasting multiple URLs (one per line) and processing them sequentially.                             |
| P1-4 | Keyboard shortcut to switch tabs                                       | Ctrl+1/2/3 or similar to switch between tabs without clicking.                                             |
| P1-5 | Paste URL: duplicate URL detection                                     | Warn user if the same URL has already been added to their library.                                         |

---

## Technical Notes for SWE

### Component structure

Per AGENTS.md ("Split large components"), the tabbed upload page should be structured as:

```
apps/web/src/app/upload/
  page.tsx                  -- server component (auth guard, renders UploadContent)
  upload-content.tsx        -- client component with Tabs wrapper
  components/
    file-upload-tab.tsx     -- extracted from current upload-content.tsx
    url-tab.tsx             -- new: URL input + submit logic
    text-tab.tsx            -- new: title + textarea + submit logic
  hooks/
    use-url-submit.ts       -- new: URL validation + createFromUrl mutation
    use-text-submit.ts      -- new: text validation + blob upload + createDocument mutation
```

### shadcn components needed

- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — for the tab structure
- `Input` — already available, for URL and title inputs
- `Textarea` — needs to be added via shadcn if not present
- `Button` — already available
- `Label` — already available

### URL validation (client-side)

```ts
function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isYouTubeUrl(url: string): boolean {
  const parsed = new URL(url);
  const host = parsed.hostname.replace("www.", "");
  return ["youtube.com", "youtu.be", "m.youtube.com"].includes(host);
}
```

### Mutations

- **URL submission**: calls new `documents.createFromUrl` mutation (backend provides this)
- **Text submission**: uploads text as blob via `generateUploadUrl` (existing), then calls existing `documents.create` with `fileType: "text"`

### Tab state

- Default active tab: "file" (preserves existing UX for returning users)
- Tab state is local (React state), not persisted to URL params

---

## Out of Scope

- Browser extension ("Send to Scrollect") — separate issue
- EPUB support — separate issue
- Podcast/Spotify URL support — future content types
- Rich text editor for the text tab — plain textarea is sufficient for MVP
- URL deduplication warning (P1-5) — nice to have, not blocking
