---
id: TASK-206
spec: SPEC-006
title: "Schema + stamping for the plan_review block (task-schema, spec-schema, task-decomposition)"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - task-schema.md
  - spec-schema.md
  - .ai/skills/task-decomposition/SKILL.md
risk: low
tier: standard
verify_workspaces: [sdlc]
depends_on: []
blocks: [TASK-208, TASK-211]
linear_issue:
acceptance_criteria:
  - id: AC-206-1
    description: "Given task-schema.md, when read, then the Index-file section documents a top-level _index.yaml `plan_review:` block with status (approve-ready|approve-after-fixes|needs-rework), approved (boolean), and reviewed (ISO date), beside the existing phase: and tasks: blocks, and states it is additive (files without it stay schema-valid)."
    status: pending
    evidence:
  - id: AC-206-2
    description: "Given spec-schema.md, when read, then it references the _index.yaml plan_review block (pointing at task-schema.md as the owning schema) so the spec side is aware of the gate artifact."
    status: pending
    evidence:
  - id: AC-206-3
    description: "Given .ai/skills/task-decomposition/SKILL.md, when read, then its plan-approval gate (Step 9 / exit) is hardened to stamp the plan_review: block into _index.yaml on owner approval (approved: false until the owner sets it true), documented as the second stage of the two-stage plan-review gate."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

The enforced plan-review gate (SPEC-006 Design B, ADR-002) records its verdict in a `plan_review:` block in
`_index.yaml`. This task defines that block in the schema and makes `task-decomposition` stamp it — the
decomposition-stage half of the two-stage gate. The engine that *reads* the block is TASK-208.

## Requirements

1. **task-schema.md** — in "Index file: the dependency graph", document a top-level `plan_review:` block
   (beside `phase:` and `tasks:`):
   ```yaml
   plan_review:
     status: approve-ready        # approve-ready | approve-after-fixes | needs-rework
     approved: true               # OWNER sign-off — execute-spec gates on this
     reviewed: 2026-06-23         # ISO date the plan review was recorded
   ```
   State it is additive (files without it remain schema-valid) but `execute-spec` fails closed on it
   (absent ≡ unapproved). Reference SPEC-006 / ADR-002.
2. **spec-schema.md** — add a one-line reference under the body/section notes pointing at the `_index.yaml`
   `plan_review` block (owned by `task-schema.md`) as the plan-review verdict artifact the execution gate reads.
3. **.ai/skills/task-decomposition/SKILL.md** — harden the approval gate: on owner approval of the
   decomposition, the skill writes/updates the `plan_review:` block in `_index.yaml` (`status` from the
   plan-review outcome, `approved: false`); document that the owner sets `approved: true`, and that
   `execute-spec` refuses to run without it (forward-reference to TASK-208 / the spec-execution skill).

## Constraints

- Do not change the `phase:` block semantics or the existing schema fields.
- Keep terminology consistent with SPEC-006: this is **plan review** (not "spec review").
- Do not edit `execute-spec.js` (TASK-208) or do terminology renames in other skills (TASK-209).
- No placeholders; show the real YAML block shape.

## Verification

- `grep -n "plan_review" task-schema.md spec-schema.md .ai/skills/task-decomposition/SKILL.md` shows the
  block documented in all three.
- Re-read each edit: block shape matches `_index.yaml` usage; stamping described at the approval gate.
- New tests required: no (doc/skill change).
