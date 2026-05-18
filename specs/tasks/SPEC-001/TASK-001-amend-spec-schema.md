---
id: TASK-001
spec: SPEC-001
title: "Amend spec-schema.md for new optional sections and baselines/ subdir"
status: pending
agent: claude-code
depends_on: []
blocks: [TASK-002, TASK-008]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given the amended spec-schema.md, when a reader looks at Body structure, then spec_review_overrides is documented as an optional appended section (placed after Migration) with declared field names (finding_id, reviewer_severity, owner_severity, reason, override_date) and value types"
    status: pending
  - id: AC-002
    description: "Given the amended spec-schema.md, when a reader looks at Body structure, then spec_followups is documented as an optional appended section (placed after spec_review_overrides) with declared field names (finding_id, source_review, severity, criterion, location, finding, deferred_date, resolved, resolved_date, resolved_by) and value types"
    status: pending
  - id: AC-003
    description: "Given the amended spec-schema.md, when a reader looks at the Directory layout section, then specs/baselines/ is listed as a new top-level subdirectory under specs/ for per-spec baseline files"
    status: pending
  - id: AC-004
    description: "Given any spec that does not include the new optional sections, when validated against the amended schema, then validation passes (the amendment is purely additive — existing specs must not break)"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-001 AC-013 and the spec's migration step 1, this is the foundational schema change that all subsequent SPEC-001 tasks depend on. Without it, downstream tasks that introduce `spec_review_overrides`, `spec_followups`, or files under `specs/baselines/` will violate the schema.

## Requirements

Edit `/Users/franklin/_code/sdlc/spec-schema.md`:

1. **Body structure section** — add two new optional appended-section subsections after the existing Migration section description:
   - `spec_review_overrides` — declared optional, position constraint "appended after Migration and before any other appendix". List the YAML field names and value types per SPEC-001 Design > Owner override format. Reference SPEC-001 for the canonical example.
   - `spec_followups` — declared optional, position constraint "appended after spec_review_overrides". List the YAML field names and value types per SPEC-001 Design > Spec followups format. Reference SPEC-001 for the canonical example.
2. **Directory layout section** — add `specs/baselines/` to the listed subdirectories. Brief description: "per-spec baseline metric files for success-criteria comparison (e.g., SPEC-042.md captures pre-change metrics)."

## Constraints

- Both new sections are OPTIONAL — schema validation must continue to pass for existing specs that don't include them.
- Section order is significant: Migration → spec_review_overrides → spec_followups → any appendices.
- Do not modify the existing required-section list or any required-field rules.
- Reference SPEC-001 for canonical examples; do not duplicate the full YAML structure in the schema doc (link to the spec section).

## Verification

- Read the amended `spec-schema.md`; confirm both new subsections exist with field/type declarations.
- Read SPEC-001 and SPEC-002 (neither uses the new sections yet); confirm both still match the schema's required-section rules.
- No automated lint exists yet for the schema, so verification is by inspection.
