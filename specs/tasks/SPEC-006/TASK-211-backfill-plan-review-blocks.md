---
id: TASK-211
spec: SPEC-006
title: "Back-fill plan_review blocks into existing SPEC-001..005 _index.yaml files"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - specs/tasks/SPEC-001/_index.yaml
  - specs/tasks/SPEC-002/_index.yaml
  - specs/tasks/SPEC-003/_index.yaml
  - specs/tasks/SPEC-004/_index.yaml
  - specs/tasks/SPEC-005/_index.yaml
risk: low
tier: express
verify_workspaces: [sdlc]
depends_on: [TASK-206, TASK-208]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-211-1
    description: "Given each existing _index.yaml under specs/tasks/SPEC-001..005, when this task lands, then each carries a top-level plan_review block with status, approved: true, and a reviewed date, so the now-enforced fail-closed gate (TASK-208) does not retroactively block these already-decomposed specs."
    status: pending
    evidence:
  - id: AC-211-2
    description: "Given the back-filled blocks, when execute-spec's planApproved gate (TASK-208) is applied to each, then it returns true (approved && not needs-rework) — verified by inspection against the gate's truth table."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

TASK-208 makes `execute-spec` fail closed on a missing/unapproved `plan_review` block. The five existing
decomposed specs (SPEC-001..005) predate the block and would be retroactively blocked. This task back-fills
them so the gate does not break already-shipped specs. Mechanical data edit; depends on TASK-206 (block shape)
and TASK-208 (the gate that gives it meaning).

## Requirements

1. Add a top-level `plan_review:` block (beside `phase:`/`tasks:`) to each of:
   `specs/tasks/SPEC-001/_index.yaml`, `.../SPEC-002/_index.yaml`, `.../SPEC-003/_index.yaml`,
   `.../SPEC-004/_index.yaml`, `.../SPEC-005/_index.yaml`:
   ```yaml
   plan_review:
     status: approve-ready
     approved: true
     reviewed: 2026-06-23   # back-filled: these specs were reviewed/executed before the gate existed
   ```
   Use `approved: true` because these specs were already reviewed and (mostly) executed under the prior
   conversational gate; the block records that retroactively so the new gate passes.
2. Preserve all existing content in each file (do not reorder or alter `phase:`/`tasks:`).

## Constraints

- Only the five files in `touches`. Do NOT add a block to SPEC-006's own `_index.yaml` (its block is stamped
  at the task-decomposition plan-review gate, not back-filled here).
- YAML must remain valid; place the block consistently (e.g. directly after the header `updated:` line).
- Per `sdlc-code-standards`: a back-fill comment notes WHY `approved: true` is set (auditability).

## Verification

- `grep -rl "plan_review" specs/tasks/SPEC-00*/_index.yaml` lists all five.
- Each file parses as valid YAML and retains its original `tasks:`/`phase:` content.
- Apply the planApproved truth table by inspection: each block → true.
- New tests required: no.
