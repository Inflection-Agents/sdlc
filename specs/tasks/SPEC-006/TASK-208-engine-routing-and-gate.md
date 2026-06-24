---
id: TASK-208
spec: SPEC-006
title: "Engine — agentForLens routing + fail-closed plan_review gate + pure-function tests"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - .claude/workflows/execute-spec.js
  - scripts/sdlc/reviewer-routing.test.mjs
  - scripts/sdlc/plan-gate.test.mjs
risk: high
tier: fortified
verify_workspaces: [sdlc]
depends_on: [TASK-206, TASK-207]
blocks: [TASK-210, TASK-211]
linear_issue:
acceptance_criteria:
  - id: AC-208-1
    description: "Given execute-spec.js, when inspected, then it contains no SPECIAL_REVIEWER and no lensToAgent; reviewer resolution goes through a pure agentForLens(constraints, lens) that returns the constraint's agent: for the lens or 'task-reviewer' when none; node --check passes."
    status: pending
    evidence:
  - id: AC-208-2
    description: "Given scripts/sdlc/reviewer-routing.test.mjs, when run with node --test, then it asserts a mapped lens resolves to its agent:, an unmapped lens resolves to task-reviewer, and adding an agent: line to a fixture constraint reroutes the lens with no change to execute-spec.js."
    status: pending
    evidence:
  - id: AC-208-3
    description: "Given execute-spec.js, when the Plan phase parses _index.yaml, then the PLAN schema and the plan-agent prompt surface the top-level plan_review block (so it reaches run()); and a pure planApproved(plan.plan_review) gate runs BEFORE any executor spawns: it HALTs (with a remediation message) unless approved===true && status!=='needs-rework', treating an absent plan_review block identically to unapproved (fail-closed), and proceeds to buildWaves only when approved."
    status: pending
    evidence:
  - id: AC-208-4
    description: "Given scripts/sdlc/plan-gate.test.mjs, when run with node --test, then planApproved returns false for absent / approved:false / status:needs-rework inputs and true only for approved-and-not-needs-rework."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

The engine half of SPEC-006: make reviewer routing resolve from the registry (ADR-001) and enforce the
plan-review gate (ADR-002). Both are localized, pure-function-testable edits to `execute-spec.js`. Bundled as
one task because both edit the same file and are one coherent "make the engine registry-driven + gated" change.

Depends on TASK-207 (the `agent:` field must exist in the registry to resolve against) and TASK-206 (the
`plan_review` block shape the gate reads).

## Requirements

1. **agentForLens resolver.** Delete `SPECIAL_REVIEWER` and `lensToAgent` (lines ~63–70). Add:
   ```js
   const agentForLens = (constraints, lens) =>
       ((constraints || []).find((c) => c.lens === lens && c.agent) || {}).agent || 'task-reviewer'
   ```
   Update `reviewPass` to group via `agentForLens(constraints, l)` (the `constraints` are already parsed and
   in scope there) instead of `lensToAgent(l)`. The PLAN schema's `constraints` items must permit an `agent`
   property (keep `additionalProperties: true` or add it explicitly) so the parsed YAML carries `agent:`
   through.
2. **Surface `plan_review` into `run()` (REQUIRED for the gate to work).** The Plan-phase agent prompt and
   the `PLAN` schema (lines ~273–281) currently return only `tasks`/`constraints`/`baseLenses` — the
   `plan_review` block from `_index.yaml` never reaches `run()`. Extend BOTH: add `plan_review` to the PLAN
   schema (or set `additionalProperties: true`) AND amend the plan-agent prompt to return the top-level
   `plan_review` block verbatim from `_index.yaml`. Without this the gate below reads `undefined` and would
   HALT every spec. (Both plan-review lenses flagged this as a blocker — do not skip it.)
3. **plan_review gate.** Add a pure helper:
   ```js
   const planApproved = (pr) => !!pr && pr.approved === true && pr.status !== 'needs-rework'
   ```
   In `run()` at the Plan phase, after the PLAN is parsed (now carrying `plan_review`) and BEFORE any executor
   is dispatched (before `buildWaves`/`ensureIntegrationBranch` spawn work), read `plan.plan_review` and, if
   `!planApproved(plan.plan_review)`, HALT with a message: "SPEC-NNN plan review not approved — run plan review
   and set plan_review.approved: true in specs/tasks/SPEC-NNN/_index.yaml (status must not be needs-rework)."
   Absent block ⇒ `planApproved(undefined)` ⇒ false ⇒ HALT (fail-closed).
4. **Tests** (`node --test`, no deps — pure functions):
   - `scripts/sdlc/reviewer-routing.test.mjs` — export/import or inline-copy the `agentForLens` logic against a
     fixture constraints array; assert mapped→agent, unmapped→task-reviewer, and add-agent-reroutes.
   - `scripts/sdlc/plan-gate.test.mjs` — assert `planApproved` truth table (absent / false / needs-rework →
     false; approved+ok → true).

## Constraints

- `execute-spec.js` is the engine and runs in the Workflow runtime (no module imports) — the engine cannot
  `import` a shared helper, and the test cannot `import` the engine (it has top-level `return await run()` and
  uses runtime globals like `agent`/`parallel`). So each test file defines the pure function under test
  (`agentForLens`, `planApproved`) as a copy of the engine's, with a header comment noting it MUST stay
  byte-identical to the engine's definition, and asserts its behavior. This is the no-import test pattern (the
  same approach the reference implementation uses for its engine smoke test). Keep the engine helpers pure and
  inline so the copy is trivial.
- Preserve all other engine behavior (tier resolution, fix loop, severity→action, integration gate).
- Per `sdlc-code-standards`: no dead code (remove the old map entirely), `node --check` clean.

## Verification

- `node --check .claude/workflows/execute-spec.js`
- `node --test scripts/sdlc/reviewer-routing.test.mjs scripts/sdlc/plan-gate.test.mjs`
- `grep -n "SPECIAL_REVIEWER\|lensToAgent" .claude/workflows/execute-spec.js` → no matches.
- `grep -n "planApproved\|agentForLens" .claude/workflows/execute-spec.js` → both present.
- New tests required: yes (the two files above).
