---
id: TASK-025
spec: SPEC-004
title: "Update task-decomposition skill — evidence field guidance"
status: pending
agent: jules
depends_on: [TASK-021]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/task-decomposition/SKILL.md Step 6 (Create task files), when read, then it includes a sentence noting that the `evidence:` field on each AC is left empty (or omitted) by the decomposing agent and is the implementing agent's responsibility to populate before PR review (SPEC-004 AC-007)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-007. Small update to clarify the workflow for the new `evidence:` field: decomposer creates empty, implementer populates. Depends on TASK-021 for the field existing in task-schema and template.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/task-decomposition/SKILL.md`:

1. In Step 6 (Create task files), within the YAML example showing task frontmatter, add a comment line near the `acceptance_criteria` block:

```yaml
acceptance_criteria:
  - id: AC-NNN
    description: "Given X, when Y, then Z"
    status: pending
    evidence:    # left empty by decomposer; populated by implementing agent before PR review (per SPEC-004)
```

2. Add a sentence in the surrounding prose: "The `evidence:` field is created empty (or omitted) at decomposition time — the decomposing agent doesn't know the proof yet. It is the implementing agent's responsibility to populate before opening the PR for review. Tier 0 CI gates on presence; Tier 1 review grades quality. See SPEC-004."

## Constraints

- Single-skill surgical edit. Don't restructure Step 6 or any other step.
- Reference SPEC-004 — don't restate the Tier 0/Tier 1 split details (they live in `review-primitives.md` and `sdlc-code-review/SKILL.md`).

## Verification

- `grep -c "evidence:" .ai/skills/task-decomposition/SKILL.md` returns ≥1 (in the Step 6 YAML example).
- A sentence about decomposer-creates-empty / implementer-populates is present.
