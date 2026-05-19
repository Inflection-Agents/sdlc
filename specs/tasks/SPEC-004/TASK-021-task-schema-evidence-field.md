---
id: TASK-021
spec: SPEC-004
title: "task-schema.md + templates/task.md — add evidence: field per AC"
status: pending
agent: claude-code
depends_on: []
blocks: [TASK-025, TASK-031]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given task-schema.md, when read, then it declares `evidence:` as a per-AC field on the acceptance_criteria list with semantics: optional at task creation; required to be populated before PR review (presence required at Tier 0 per SPEC-001/SPEC-004 amendment; content quality graded at Tier 1) (SPEC-004 AC-001)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given templates/task.md, when read, then at least one AC example shows the `evidence:` field with realistic populated content (e.g., test command output excerpt, not 'TODO') (SPEC-004 AC-002)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-001 and AC-002. Foundational schema change for the evidence field that downstream skill updates (TASK-024 sdlc-code-review enforcement, TASK-025 task-decomposition guidance, TASK-029 Tier 0 synthetic test) depend on.

## Requirements

Edit `/Users/franklin/_code/sdlc/task-schema.md`:

1. **Frontmatter shape (acceptance_criteria block)** — add `evidence: <multiline string>` as a per-entry field. Update the YAML example to show:

```yaml
acceptance_criteria:
  - id: AC-001
    description: "Given X, when Y, then Z"
    status: pending | pass | fail
    evidence: |
      The implementing agent populates this with concrete proof. Examples:
      dbt task → relevant `dbt run` output; code task → test command output;
      manual verification → describe what was checked and how.
```

2. **Field rules** — add a "Per-AC fields" subsection (or extend the existing rules) explaining:
   - `evidence:` is optional at task creation (decomposing agent omits or leaves empty — they don't know the proof yet).
   - `evidence:` MUST be populated before PR review enters. Presence is checked at Tier 0 (per SPEC-001's Tier 0 extension landing via SPEC-004 TASK-022); content quality is graded at Tier 1 (`pr-reviewer` raises `task:evidence-missing` major if content is insufficient).
   - Empty string or missing field = "not populated" for Tier 0's purposes.

Edit `/Users/franklin/_code/sdlc/templates/task.md`:

1. Update the template's `acceptance_criteria` example to show at least one AC with a realistic populated `evidence:` field. Use a plausible example (e.g., "npm test output: 47 passed, 0 failed" or similar).

## Constraints

- Additive only — existing task files without `evidence:` continue to validate. Only NEW tasks must populate.
- Do not duplicate the Tier 0/Tier 1 enforcement description from SPEC-001/SPEC-004 — reference them from the schema.
- The template's example evidence content should be realistic and helpful, not "TBD" or "TODO" placeholder.

## Verification

- `grep -A 3 "evidence:" task-schema.md | head -10` shows the field declaration with rules.
- `grep -A 3 "evidence:" templates/task.md` shows the example with realistic content.
- Existing tasks in `specs/tasks/SPEC-*/` are not affected (they lack the field but remain valid).
