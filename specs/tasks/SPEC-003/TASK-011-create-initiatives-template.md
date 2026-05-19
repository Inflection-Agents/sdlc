---
id: TASK-011
spec: SPEC-003
title: "Create templates/initiatives.md"
status: pending
agent: jules
depends_on: []
blocks: [TASK-012]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given templates/initiatives.md exists, when read, then it contains the template structure shown in SPEC-003 Design > templates/initiatives.md (intro paragraph, table with ID/Slug/Description columns, single template-entry row, footer note about adding new initiatives via specs)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-006. Foundational artifact that TASK-012 (bootstrap.sh rewrite) copies into new repos as `specs/initiatives.md`. No template exists today; the upstream `specs/initiatives.md` was created by hand during the SPEC-001/002 bootstrap.

## Requirements

Create `/Users/franklin/_code/sdlc/templates/initiatives.md` matching SPEC-003 Design > `templates/initiatives.md` exactly:

```markdown
# Initiatives

Initiatives group related specs under a shared goal. Every spec's `initiative:` field references an entry here.

| ID | Slug | Description |
|---|---|---|
| INI-001 | <slug> | <one-line description> |

New initiatives are added by editing this file as part of the spec that introduces them.
```

## Constraints

- Match SPEC-003 Design verbatim — the template is small enough that the exact wording matters for bootstrap.sh's copy step to produce predictable output.
- File lives at `templates/initiatives.md`, NOT `specs/initiatives.md` (the latter is the per-repo instance; the former is the source the bootstrap copies).

## Verification

- `[ -f /Users/franklin/_code/sdlc/templates/initiatives.md ]` returns 0.
- File content matches the SPEC-003 Design specification byte-for-byte after trimming trailing whitespace.
