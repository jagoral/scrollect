# Architecture Decision Records (ADR)

An Architecture Decision Record (ADR) captures an important architecture decision along with its context and consequences.

## Conventions

- Directory: `docs/adr/`
- Naming: numbered slug, `NNN-short-slug.md` (e.g. `018-best-cards-first-serving.md`)
- Status values: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`
- Template: `.agents/skills/adr-skill/assets/templates/adr-simple.md`

## Workflow

- Create a new ADR as `proposed`.
- Discuss and iterate.
- When the team commits: mark it `accepted` (or `rejected`).
- If replaced later: create a new ADR and mark the old one `superseded` with a link.

## ADRs

- [ADR-001: All-in Convex processing](001-all-in-convex-processing.md)
- [ADR-002: Bookmark lists replace saved boolean](002-bookmark-lists-replace-saved-boolean.md)
- [ADR-003: Multi-type card generation](003-multi-type-card-generation.md)
- [ADR-004: URL content ingestion](004-url-content-ingestion.md)
- [ADR-005: E2E testing strategy](005-e2e-testing-strategy.md)
- [ADR-006: Tagging system](006-tagging-system.md)
- [ADR-007: Freshness mechanics](007-freshness-mechanics.md)
- [ADR-008: Connection discovery](008-connection-discovery.md)
- [ADR-009: GDPR cookie consent](009-gdpr-cookie-consent.md)
- [ADR-010: Deployment pipeline](010-deployment-pipeline.md)
- [ADR-011: User highlights and notes](011-user-highlights-and-notes.md)
- [ADR-012: Service layer dependency injection](012-service-layer-dependency-injection.md)
- [ADR-013: Draft generation pipeline](013-draft-generation-pipeline.md)
- [ADR-014: Connection discovery pipeline](014-connection-discovery-pipeline.md)
- [ADR-015: Highlight-triggered draft generation](015-highlight-triggered-draft-generation.md)
- [ADR-016: Feed v2 ranking and serving](016-feed-v2-ranking-serving.md)
- [ADR-017: Self-hosted Marker on RunPod](017-self-hosted-marker-runpod.md)
- [ADR-018: Best-cards-first serving after quality-first generation](018-best-cards-first-serving.md)
