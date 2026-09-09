---
id: TASK-018
spec: SPEC-005
title: "Amend spec-schema.md — add optional integration_strategy field"
status: pending
agent: claude-code
depends_on: []
blocks: [TASK-019]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given spec-schema.md, when read, then the frontmatter schema declares `integration_strategy` as an optional field with allowed values `branch` and `direct` (SPEC-005 AC-001)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given a spec with `integration_strategy: branch` or `integration_strategy: direct`, when validated, then validation passes; given a spec with any other value, validation fails; given a spec without the field, validation passes (additive optional field)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-005 AC-001. Foundational schema change that TASK-019 (spec-execution skill update) depends on — the skill reads this frontmatter field to resolve the integration strategy at Phase 1.

## Requirements

Edit `/Users/franklin/_code/sdlc/spec-schema.md`:

1. **Frontmatter schema** (the YAML block near the top, around line 18-35): add `integration_strategy: branch | direct  # optional` to the example frontmatter, in alphabetical order or near related fields like `workspaces`.

2. **Field rules table:** add a row for `integration_strategy`:
   - Required: no
   - Mutable: yes
   - Notes: "Optional. When set to `branch`, spec-execution uses the feat/spec-NNN integration branch pattern. When set to `direct`, spec-execution merges task PRs directly to main. When unset, spec-execution computes the strategy from spec properties via a documented heuristic (see spec-execution skill Phase 1 resolution step). See SPEC-005 for design."

## Constraints

- Additive only — existing specs without the field must continue to validate.
- Schema validation must reject values other than `branch` or `direct` (no defaulting to a third interpretation at validation time).
- Do not duplicate the heuristic in spec-schema.md; just reference the spec-execution skill as the canonical source.

## Verification

- `grep -c "integration_strategy" spec-schema.md` returns ≥2 (one in the example block, one in the field rules table).
- All existing specs in `specs/` continue to satisfy validation (verify by reading frontmatter and checking against the updated schema mentally — no automated validator runs in CI for this repo yet).
