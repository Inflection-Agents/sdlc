---
id: TASK-023
spec: SPEC-004
title: "templates/gap.md + spec-schema.md gaps/ directory + GAP CI validation"
status: pending
agent: claude-code
depends_on: []
blocks: [TASK-027, TASK-028, TASK-030]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given templates/gap.md, when read, then it contains the GAP frontmatter shape (all 11 fields: id, spec, title, status, owner, created, discovered_in, resolution, resolved_date, resolved_by, back_ported_to) per SPEC-004 Design > 2 and body sections (`## Gap`, `## Resolution`, `## Impact`) (SPEC-004 AC-009)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given spec-schema.md Directory layout, when read, then `specs/gaps/` is listed as a new top-level subdirectory under `specs/`. The schema describes the GAP frontmatter shape with all 11 fields and their types. (SPEC-004 AC-008)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given spec-schema.md, when read, then GAP frontmatter participates in `spec-index.json` under a new `gaps:` array per spec entry (chosen over a sibling gap-index.json for single-index simplicity). The existing spec-schema validation script (or its named successor) is documented as extended to run on PRs touching `specs/gaps/` and fail closed on frontmatter shape violations. (SPEC-004 AC-008)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-008 + AC-009. Creates the GAP artifact infrastructure: template, schema declaration, indexing, validation. Foundational for TASK-027 (spec-amendment gap-or-amendment decision) and TASK-028 (spec-execution gap-capture handler).

## Requirements

1. **Create `/Users/franklin/_code/sdlc/templates/gap.md`:**

```markdown
---
id: GAP-NNN
spec: SPEC-NNN
title: "<one-line gap description>"
status: open | resolved | wontfix
owner: <github-handle>
created: YYYY-MM-DD
discovered_in: TASK-NNN | PR-NNN | review:<spec-reviewer-run-id>
resolution: clarification | workaround | deferred
resolved_date: YYYY-MM-DD | null
resolved_by: <commit-SHA> | TASK-NNN | null
back_ported_to: SPEC-NNN-vN | SPEC-NNN-v1.1 | null
---

## Gap

(What was unclear, missing, or wrong. Reference the spec section if applicable.)

## Resolution

(How the gap was handled. If `clarification`: paragraph to back-port to the spec or a future amendment. If `workaround`: what was done and why acceptable. If `deferred`: capture as an intent for later.)

## Impact

(What downstream tasks or specs are affected, if any.)
```

2. **Edit `/Users/franklin/_code/sdlc/spec-schema.md`:**

   a. **Directory layout section:** add `gaps/` to the `specs/` subdirectories list (between `baselines/` and `bugs/`).
   
   b. **Add a new section "GAP schema"** (or extend an existing schema section) declaring the GAP frontmatter:
      - All 11 fields with types per the template above.
      - `id` immutable, format `GAP-NNN`.
      - `status` enum: `open | resolved | wontfix`.
      - `resolution` enum: `clarification | workaround | deferred`.
      - `discovered_in` typed union: matches one of `TASK-NNN`, `PR-NNN`, or `review:<id>` patterns.
      - `back_ported_to` typed union: matches `SPEC-NNN-vN` (amendable parent specs), `SPEC-NNN-v1.1` (Changelog-annotated completed parent specs), or `null`.
   
   c. **`spec-index.json` schema:** declare that the per-spec entry gains a `gaps: []` array. Each gap entry has at minimum `id`, `status`, `resolution`, `created` (mirror the spec-index entry shape for specs).
   
   d. **CI validation:** add a note that the existing spec-schema validation script (or its named successor) is extended to validate GAP frontmatter on any PR touching `specs/gaps/`. Validation fails closed on shape violations (missing required field, invalid enum value, malformed `discovered_in` or `back_ported_to`).

## Constraints

- `templates/gap.md` must be valid markdown with a YAML frontmatter block. The placeholder values are illustrative; an implementation that copies this template fills in real values.
- Schema additions are additive. Existing specs/tasks/baselines validation is unchanged.
- The CI validator extension is a documented requirement here; the actual validator script update lives in a follow-up infrastructure task (out of scope — SPEC-004 only declares the contract).
- The `gaps:` array in spec-index.json is per-spec (mirrors the spec's own entry); not a separate `gap-index.json` file.

## Verification

- `[ -f /Users/franklin/_code/sdlc/templates/gap.md ]` returns 0.
- `grep -c "gaps/" /Users/franklin/_code/sdlc/spec-schema.md` returns ≥1.
- `grep -c "GAP schema" /Users/franklin/_code/sdlc/spec-schema.md` returns ≥1 (or equivalent section heading).
- The template's frontmatter parses as valid YAML.
- All 11 fields documented in the schema match the template.
