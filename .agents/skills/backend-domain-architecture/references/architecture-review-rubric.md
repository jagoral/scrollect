# Architecture Review Rubric

Use this reference when reviewing or critiquing Scrollect backend architecture. Score each dimension
0-2, then sum to a 0-10 architecture health score.

## Scoring Table

| Dimension              | 0                                                             | 1                                        | 2                                                            |
| ---------------------- | ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Domain language        | Generic technical names hide intent                           | Some domain names, some placeholders     | Scrollect concepts are explicit and consistent               |
| Boundary placement     | Convex, domain, and provider code are mixed                   | Boundaries mostly hold with some leakage | Convex edge, pure logic, and providers are clearly separated |
| Dependency direction   | Domain logic imports frameworks, SDKs, env, or Convex runtime | Mostly clean with isolated leaks         | Dependencies point inward toward domain decisions            |
| Abstraction discipline | Speculative or generic abstractions appear                    | Some abstractions have unclear payoff    | Abstractions have current callers and testable value         |
| Testability            | Behavior requires full runtime to test                        | Some logic is unit-testable              | Risky domain behavior is covered by focused tests or mocks   |

## Report Template

Use this shape for architecture review responses:

```markdown
Architecture Health: X/10

Findings

- [P1] Finding title
  Why it matters:
  Repair:

What Works

- Specific strength worth preserving.

To Reach 10/10

- Highest-impact change.
- Next-highest-impact change.
```

## Priority Guide

- `P0`: Data loss, security breach, or impossible-to-recover pipeline failure.
- `P1`: Boundary violation likely to cause bugs, retries failing, auth mistakes, or hard-to-test
  core logic.
- `P2`: Maintainability issue that will make the next backend change harder or risk duplication.
- `P3`: Naming, organization, or clarity issue that is small but worth fixing while nearby.

## Red Flags

- `src/` imports from `convex/_generated`, `convex/values`, or Convex server helpers.
- A Convex action contains scoring, planning, ranking, prompt assembly, or provider-independent
  business rules that could be unit tested.
- A domain helper accepts `ctx` when it only needs plain data.
- A new provider is instantiated inside pure logic.
- A new service context has one caller and no testing benefit.
- A helper name is generic because the domain concept was not understood.
- A schema/index/provider/export is added for a future use case that is not part of the current
  task.
- A refactor moves exported Convex function names without a clear migration reason.

## Positive Signals

- The code reads in Scrollect language.
- Provider ports are small and capability-focused.
- Convex handlers own the runtime boundary and little else.
- Pure logic returns records, plans, metrics, or decisions for the edge to persist.
- Tests can exercise the important behavior without Convex or network services.
- Duplication was removed because it represented the same domain decision, not just similar syntax.
