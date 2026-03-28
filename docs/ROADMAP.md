# Scrollect Roadmap

**Last reviewed:** 2026-03-26

This document outlines the planned features, improvements, and strategic opportunities for Scrollect, organized by theme for future reference and prioritization.

## MVP Launch Readiness

Items required before sharing with real users. Grouped by urgency.

### Legal & Compliance (must-have before any public access)
- [x] **Privacy policy page + Terms of service** (Promoted to #89)
- [x] **Terms of service** (Promoted to #89)
- [x] **Cookie / data consent banner** (Promoted to #90)
- [ ] **Data export (GDPR portability)** - users can download their uploaded documents + generated cards as a ZIP/JSON
- [x] **Data deletion (GDPR right to erasure)** (Promoted to #91)
- [x] **AI disclosure** (Included in #89 privacy policy)

### Payments & Monetization
- [ ] **Polar.sh integration** - Polar acts as Merchant of Record, handling VAT, invoicing, and tax compliance. No need for separate invoicing tools or VAT OSS registration. JDG receives clean payouts
- [ ] **Pricing page** - clear free tier limits vs paid tiers. Define what's metered (uploads? AI calls? storage?)
- [ ] **Usage limits for free tier** - enforce caps on uploads, storage, and AI generation per billing period. Prevent runaway costs
- [ ] **Polar webhook handler** - subscription lifecycle events (created, updated, canceled, payment failed)
- [ ] **Entitlement checks** - gate features/limits based on Polar subscription status
- [ ] **Grace period** - handle expired subscriptions gracefully (read-only mode, not instant deletion)

### Landing Page & Marketing Site
- [x] **Landing page redesign** (Promoted to #112)
- [x] **Open Graph / social meta tags** (Promoted to #119)
- [x] **SEO fundamentals** (Promoted to #118)
- [x] **Demo / screenshots** (Promoted to #112)
- [ ] **Testimonial / early user quotes** - even 2-3 quotes from alpha testers add credibility. Deferred until real users exist
- [ ] **Structured data (JSON-LD) for rich search results** - (Demoted from #120). Premature until product quality is solid enough for organic search traffic

### Onboarding & First-Run Experience
- [ ] **Onboarding flow** - guide new users through first upload and feed generation
- [ ] **Welcome email** - transactional email after signup with quick-start tips
- [ ] **Empty state improvements** - library and feed empty states should guide action, not just say "nothing here"
- [ ] **Processing status communication** - after first upload, clearly show progress toward first cards
- [ ] **Sample content option** - offer a pre-loaded sample document so users can see the feed immediately without uploading anything

### Trust & Safety
- [x] **Abuse prevention** (Promoted to #92)
- [x] **Content size guardrails** (Promoted to #93)
- [x] **Error pages** (Promoted to #94)
- [ ] **Uptime monitoring** - basic health check endpoint + external ping (UptimeRobot, Checkly, or similar)

### Production Infrastructure
- [x] **Custom domain with SSL** (Promoted to #95)
- [x] **Environment separation** (Promoted to #95)
- [ ] **Backup strategy** - Convex handles persistence, but understand their backup/export story. Document the recovery plan
- [ ] **Transactional email infrastructure** - Resend, Postmark, or similar for welcome emails, processing complete notifications, password reset

---

## Content Ingestion

Integrations bring content from where it already lives into the Scrollect learning feed. Architecture is tracked in #83 (connector ADR). Connector patterns are defined in the taxonomy below.

### Connector Pattern Taxonomy

| Pattern | Auth model | Data flow | Examples |
|---|---|---|---|
| **File-import** | None (user uploads) | User provides export file | Pocketbook (shipped), Kindle, Obsidian, browser bookmark export |
| **API-pull** | API token or OAuth | Scrollect fetches on demand | Readwise, Pocket, Instapaper, GitHub stars |
| **OAuth-social** | OAuth 2.0 (3-legged) | Scrollect fetches bookmarks/saves | X/Twitter bookmarks |
| **Browser-push** | Session token | Extension pushes URLs to Scrollect | Chrome/Firefox extension |
| **Open-protocol** | None / API key | External tools push or user imports via standard format | Scrollect Import Format, webhook receiver |

### Tier 1 - High reach, high impact
- [x] **Readwise highlight sync** - API-pull connector with token auth. The canonical tool for readers who highlight.
- [ ] **Browser extension ("Send to Scrollect")** - Browser-push connector. Chrome/Firefox extension captures current page URL, sends to Scrollect HTTP endpoint.
- [ ] **YouTube playlists import** - API-pull connector (OAuth 2.0). Import Watch Later / playlists via YouTube Data API and feed URLs into the existing pipeline.

### Tier 2 - Medium reach, strong niche fit
- [ ] **Kindle highlights import** - File-import connector. Parse My Clippings.txt client-side.
- [ ] **Pocket / Instapaper sync** - API-pull connector (OAuth). High alignment with "rescue your bookmarks" value proposition.
- [ ] **GitHub stars import** - API-pull connector (token auth). Stars could generate cards about libraries, patterns, or project architectures.
- [ ] **X/Twitter bookmarks import** - OAuth-social connector. Requires Twitter API v2 with OAuth 2.0 User Context. (Note: Viability concern due to API access costs and aggressive rate limits).

### Tier 3 - Defer implementation
- [ ] **Obsidian vault import** - File-import connector. Markdown parsing with wikilinks and frontmatter.
- [ ] **RSS feeds** - API-pull connector (no auth). Power user feature requiring periodic polling.
- [ ] **Podcast notes / transcription** - Requires transcription pipeline. Large effort, different content modality.

### Open Protocol - User-owned integrations
Enables the long tail of tools Scrollect will never build first-party connectors for (Logseq, Supernotes, Raindrop, corporate wikis, personal scripts).
- [ ] **Scrollect Import Format (v1)** - A documented JSON/JSONL schema any tool can export to.
- [ ] **Webhook receiver endpoint** - `POST /api/ingest` with API key header and JSON body conforming to the Scrollect Import Format. Enables Zapier/Make/n8n automation.

### Other Ingestion Ideas
- [ ] **Conference talk deep processing** - Multimodal AI to process video slides, code examples, diagrams alongside transcripts. Timestamp alignment for "which part of the video."

---

## Feed Intelligence

- [ ] **Adaptive feed algorithm** - Replace random chunk selection with scoring based on liked/saved post embeddings, tag affinity, recency, and diversity.
- [ ] **User signal-driven chunk weighting** - Extend chunk sampling with concrete engagement signals: reaction data, time-on-card dwell time, quiz performance, and document coverage balance.
- [ ] **Spaced-repetition scheduling** - Embed SM-2 algorithm into feed. Quiz cards resurface at optimal intervals.
- [x] **Cross-source connections** (SHIPPED in #73/#81)
- [ ] **Relax connection card constraint** - Allow connections across sections within the same document, not just across documents.
- [ ] **"Challenge Mode" cards** - Cards presenting opposing viewpoints from user's library ("Author A says X, but Author B says Y").
- [x] **Active learning card types** (Card quality pipeline fixes take priority)
- [ ] **Difficulty calibration** - Track quiz accuracy per user. If >90% correct, shift toward harder synthesis cards. If <50%, shift toward foundational.
- [x] **Feed interleaving rules** (SHIPPED in #72/#79)
- [ ] **Weekly "What Did I Learn?" digest** - AI-generated summary of learning activity, retention, and fading knowledge.
- [ ] **Feed filtering** - Filter feed by document, tag, or card type.
- [ ] **Daily digest notifications** - "3 new cards from your recent uploads"
- [ ] **AI prompt-driven feed generation** - Allow users to write a natural language prompt to generate a targeted feed from their library.

---

## Knowledge Exploration

- [x] **Ask Document (RAG)** (Promoted to #86)
- [ ] **Knowledge graph visualization** - Visual map of knowledge organized by AI-suggested tags.
- [ ] **Expandable "dig deeper" posts** - Click to get a more detailed AI explanation of a card's topic, grounded in surrounding chunks.
- [ ] **Document summary page** - Auto-generated overview of key themes per document.

---

## UX Polish

- [ ] **Mobile-optimized PWA** - Responsive design + PWA setup + offline caching.
- [ ] **Card animations and transitions** - Smooth scroll, card entry/exit animations.
- [x] **Freshness mechanics** (SHIPPED in #74/#78)
- [x] **"Why this card" transparency** (Promoted to #85)
- [ ] **Dark mode refinements**
- [ ] **Keyboard shortcuts** - Card interactions via keyboard for power users.
- [ ] **Auth guard deduplication** - Extract UnauthenticatedRedirect into a shared layout guard.
- [ ] **StatusBadge component extraction** - statusConfig and StatusBadge duplicated between library pages.

---

## Engagement Metrics Framework

| Metric | Definition | Target |
|---|---|---|
| **Cards per session** | Avg cards viewed before closing the app | > 8 |
| **Type engagement ratio** | Reaction rate per card type | Identify which types users love/ignore |
| **Return rate** | % of users who open the feed again within 48h | > 40% |
| **Quiz attempt rate** | % of quiz cards where user taps to reveal/answer | > 60% |
| **Upload-to-card latency** | Time from document upload to first card in feed | < 5 min perceived |
| **Dedup effectiveness** | % of users reporting "I've seen this before" | < 10% |

---

## Infrastructure & Technical Debt

- [ ] **Background/scheduled feed generation** - Cron job for daily batch generation instead of on-demand only.
- [x] **Rate limiting** (Promoted to #92)
- [ ] **Cost controls / token tracking** - Per-user budget limits for LLM calls.
- [x] **File size validation** (Promoted to #93)
- [x] **Vector lifecycle management** (SHIPPED as part of #71/#76)
- [x] **Document deletion** (SHIPPED in #71/#76)
- [ ] **Processing job cleanup** - Completed processingJobs remain in DB forever.
- [ ] **Error monitoring** - Beyond console.log, need Sentry or similar.
- [ ] **Token estimation** - Current Math.ceil(text.length / 4) heuristic should use tiktoken for production quality.
- [x] **ConvexVectorStore cleanup** (SHIPPED in commit ebc424b)
- [x] **Analytics (PostHog)** (Promoted to #88)

---

## Growth & Distribution

- [ ] **"Show HN" launch** - "Bookmark graveyard" pain point resonates.
- [ ] **Obsidian community plugin** - Built-in distribution channel.
- [ ] **"Knowledge profile" sharing** - Opt-in public page showing "top insights this month."
- [ ] **Content-led SEO** - Publish AI-generated connection maps for popular technical books.
- [ ] **"Rescue your bookmarks" campaign** - Import Pocket/Instapaper/browser bookmarks.
- [ ] **Dev community partnerships** - Companion tool for courses.
- [ ] **Open-source components** - Open-source the extraction pipeline or card generation templates for GitHub discovery.
- [ ] **Workplace/team tier** - Shared learning feed for engineering team onboarding.
- [ ] **Content marketing surface** - Revisit when real users exist to generate marketing-worthy content.

---

## Ideas from Summarize Project Research

### Content Ingestion
- **Podcast transcription -> audio-aware learning cards** - Cards generated from podcast segments could include audioTimestamp fields for seek-to-moment UX.
- **YouTube slide extraction -> visual learning cards** - Extracts slides via ffmpeg scene detection + optional OCR. Note: requires system binaries so cannot run in Convex.
- **@steipete/summarize-core as drop-in extraction upgrade** - Pure JS/TS core to replace purpose-built extractors later.

### Feed Intelligence
- **Content-aware type suppression** - Classify documents by content style during ingestion. Pass style to generation prompt. Eliminates the "AI slop" feeling.
- **Adaptive card ordering via hook scores** - Assign a deterministic hookScore to each card type based on engagement potential.

### UX / Transparency
- **Generation cost transparency** - Surface a subtle "This batch cost ~$0.003" in the feed generation UI.

### Architecture Patterns
- **Fallback chains with diagnostics** - Add provenance to card metadata: "Generated from: YouTube published captions".
- **TTL-based negative caching** - Cache extraction failures for a bounded period to prevent retry storms.
- **WXT framework for browser extension** - Worth evaluating for Scrollect's future extension.
