---
id: TASK-207
spec: SPEC-006
title: "Add the agent: field to review-constraints.yaml (registry-as-data)"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - .ai/skills/review-constraints.yaml
risk: low
tier: standard
verify_workspaces: [sdlc]
depends_on: []
blocks: [TASK-208]
linear_issue:
acceptance_criteria:
  - id: AC-207-1
    description: "Given .ai/skills/review-constraints.yaml, when read, then each task-scope constraint may carry an optional `agent:` field naming the specialized reviewer agentType for its lens; the illustrative constraints set agent: where a specialist is warranted (e.g. INV-DESIGN-FIDELITY -> design-fidelity-reviewer, INV-CORE-PURITY/INV-AUTHZ-FAILCLOSED -> invariants-reviewer), and integration-scope constraints carry no agent:."
    status: pending
    evidence:
  - id: AC-207-2
    description: "Given the registry header comment, when read, then it names the per-constraint `agent:` field as the single source of truth for lens->reviewer routing (read by execute-spec.js), replacing any pointer at the engine's hardcoded map; omitted agent: => generic task-reviewer; integration scope => integration-reviewer."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

Reviewer routing is being moved from engine code (`SPECIAL_REVIEWER`) into registry data (ADR-001). This task
adds the `agent:` field to the constraint registry; TASK-208 makes the engine resolve against it.

## Requirements

1. In `.ai/skills/review-constraints.yaml`, add an optional `agent:` field to each **task-scope** constraint
   that warrants a specialist, mirroring the engine's current mapping so behavior is preserved:
   - `INV-DESIGN-FIDELITY` (lens `design-fidelity`) → `agent: design-fidelity-reviewer`
   - `INV-CORE-PURITY` (lens `core-purity`) → `agent: invariants-reviewer`
   - `INV-AUTHZ-FAILCLOSED` (lens `security`) → `agent: invariants-reviewer`
   - lenses with no specialist (e.g. `a11y`, `compose-perf`) → no `agent:` (fall to `task-reviewer`)
   - `INV-CONTRACT-PARITY` (`scope: integration`) → **no** `agent:` (graded by `integration-reviewer` at the
     integration gate; the engine's resolver governs task-scope lenses only)
2. Update the registry header comment to document the `agent:` field as the single source of truth for
   lens→reviewer routing, read by `execute-spec.js`. State the defaults (omitted ⇒ `task-reviewer`;
   integration scope ⇒ `integration-reviewer`) and that adding a specialist is a one-line `agent:` edit.

## Constraints

- The constraints here are illustrative/generic (this is the engine repo); keep them so — do not invent
  app-specific reviewers. The point is the **mechanism**, proved by mirroring the existing map.
- Preserve all existing fields (`id`, `scope`, `when`, `lens`, `severity`, `check`, `cite`).
- Do not edit `execute-spec.js` (TASK-208).
- YAML must remain valid.

## Verification

- `grep -n "agent:" .ai/skills/review-constraints.yaml` shows the field on the design-fidelity and
  invariants constraints, and absent on a11y/compose-perf and the integration-scope constraint.
- Parse-check the YAML (e.g. `node -e "require('js-yaml')"` if available, or a quick yq/parse) — file is valid.
- New tests required: no (the routing test lands in TASK-208 against this data).
