# ADR Conventions

## Directory

ADRs live in `docs/adr/`.

Detection order (used by scripts): `docs/adr/`, `contributing/decisions/`, `docs/decisions/`, `adr/`, `docs/adrs/`, `decisions/`.

## Filename Convention

Pattern: `NNN-title-with-dashes.md`

- `NNN` is a zero-padded sequential number (001, 002, ..., 010, ...)
- Title uses lowercase dashes, present-tense imperative verb phrase
- Examples: `007-choose-auth-provider.md`, `012-adopt-cursor-pagination.md`

The `new_adr.js` script auto-detects the numbering strategy from existing files and assigns the next number.

## Metadata

YAML frontmatter with two required fields:

```yaml
---
status: proposed
date: 2026-03-15
---
```

## Status Values

| Status                  | Meaning                                                  |
| ----------------------- | -------------------------------------------------------- |
| `proposed`              | Under discussion, not yet decided                        |
| `accepted`              | Decision is active and should be followed                |
| `rejected`              | Considered but explicitly not adopted                    |
| `deprecated`            | Was accepted but no longer applies — explain replacement |
| `superseded by ADR-NNN` | Replaced by a newer ADR — link both ways                 |

## Sections

Every ADR must have:

1. **Context** — why the decision exists now, constraints, triggers
2. **Decision** — what is chosen, concisely
3. **Alternatives considered** — what was rejected and why
4. **Consequences** — what gets easier, harder, riskier

Optional: **More Information** — related ADRs, revisit triggers.

## Mutability

- Status changes and after-action notes are fine to edit in-place
- If a decision is replaced, create a new ADR and supersede the old one
- Append to "More Information" with date stamps rather than rewriting
