# ADR Review Checklist

Use this after drafting an ADR. The goal: could a future agent read this and understand the decision without asking questions?

## Checks

### Content

- [ ] A newcomer can understand why this decision exists without prior context
- [ ] The trigger is clear — what changed, broke, or is about to break
- [ ] The decision is specific enough to act on (not "use a better approach" but "use X for Y")
- [ ] Non-goals or scope boundaries are stated where relevant
- [ ] Alternatives are genuine — at least two real options with honest tradeoffs
- [ ] Consequences are concrete ("feed query drops from 10 to 3 reads") not vague ("improves performance")
- [ ] No consequence is a disguised restatement of the decision

### Format

- [ ] Under 300 lines (over 300 means implementation details are leaking in)
- [ ] YAML frontmatter has `status` and `date`
- [ ] Title is a verb phrase describing the decision
- [ ] Filename follows `NNN-slug.md` convention
- [ ] No full code implementations or schema dumps (reference file paths instead)
- [ ] No future speculation sections

## Common Failure Modes

| Symptom                             | Fix                                                   |
| ----------------------------------- | ----------------------------------------------------- |
| Context reads like a solution pitch | Rewrite as the problem; move solution to Decision     |
| Only one alternative listed         | Ask: "what did you reject and why?"                   |
| All consequences are positive       | Ask: "what gets harder? what's the maintenance cost?" |
| Over 300 lines                      | Move implementation details to the issue/PR           |
| "We decided to use X" with no why   | Ask: "why X over Y?" — the "over Y" forces comparison |
