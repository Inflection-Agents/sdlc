---
id: TASK-019
spec: SPEC-005
title: "Extend spec-execution skill — Phase 1 resolve step, Phase 2/3 conditional flows, telemetry event"
status: pending
agent: claude-code
depends_on: [TASK-018]
blocks: [TASK-020]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-execution/SKILL.md, when read, then Phase 1 includes a 'resolve integration strategy' step containing the `resolve_integration_strategy` and `any_cross_workspace_blocks` pseudocode from SPEC-005 Design > Strategy resolution algorithm verbatim (SPEC-005 AC-002)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given the skill, when read, then explicit-field path (frontmatter `integration_strategy` set) uses the value without invoking the heuristic; telemetry event records `source: \"explicit\"` (SPEC-005 AC-003)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given the skill, when read, then heuristic path is documented with 4+1 worked example cases enumerated (each of 4 signals independently triggering branch, plus all-false → direct) (SPEC-005 AC-004)"
    status: pending
    evidence:
  - id: AC-004
    description: "Given the skill, when read, then Phase 2 per-task lifecycle pseudocode in Appendix B uses a `target_branch` variable: `target_branch = \"feat/\" + spec.id` in branch mode; `target_branch = \"main\"` in direct mode (SPEC-005 AC-005)"
    status: pending
    evidence:
  - id: AC-005
    description: "Given the skill, when read, then Phase 3 describes both flows with explicit event anchors: branch mode opens integration PR after all tasks terminal then spec-completion; direct mode invokes spec-completion when all tasks terminal (if ≥1 done; skip if all cancelled) then archive log with sentinel comment `# spec_completed: <iso8601>`; no new event type — schema stays at 10 events (SPEC-005 AC-006)"
    status: pending
    evidence:
  - id: AC-006
    description: "Given the skill, when read, then telemetry schema includes the `integration_strategy_resolved` event with fields per SPEC-005 Design > Telemetry extension (ts, spec, event, strategy, source, signals); live worked example log fixture (.ai/skills/spec-execution/examples/example-execution.log.jsonl) gains this event at the start (SPEC-005 AC-007)"
    status: pending
    evidence:
  - id: AC-007
    description: "Given the skill, when read, then AC-009 measurement is documented: orchestrator reads sidecar `specs/tasks/SPEC-NNN/_expected_strategy` before dispatch, compares to resolved strategy, records to spec-completion deferred-verifications table per SPEC-004 Design > 3; deletes sidecar in follow-up commit after recording (SPEC-005 AC-009)"
    status: pending
    evidence:
  - id: AC-008
    description: "Given the skill, when read, then in-flight orchestrator revert semantics documented: in-flight processes unaffected (hold pre-revert skill in memory); post-revert orchestrators fail Phase 1 on specs with integration_strategy field; recovery is simultaneous spec-schema revert (SPEC-005 AC-010)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-005 AC-002 through AC-007, AC-009, AC-010. The core runtime change of SPEC-005. This task extends `.ai/skills/spec-execution/SKILL.md` (created by TASK-009 of SPEC-002, currently 625 lines, status: completed v1) with conditional integration-branch behavior. Per the "extend live artifacts; SPEC-002 stays completed" pattern.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/spec-execution/SKILL.md`:

1. **Phase 1: insert "resolve integration strategy" step** (new step, between status verification and integration-branch creation). Contains the `resolve_integration_strategy` and `any_cross_workspace_blocks` Python pseudocode verbatim from SPEC-005 Design > Strategy resolution algorithm.

2. **Phase 1: emit `integration_strategy_resolved` telemetry event** with fields per SPEC-005 Design > Telemetry extension. Event happens immediately after resolution, before any branch creation.

3. **Phase 1: 4+1 worked example cases.** Add an example block enumerating: case A (breaking tag → branch), case B (multi-workspace → branch), case C (5+ tasks → branch), case D (cross-workspace blocks → branch), case E (none of the above → direct). Each shows input spec shape + expected resolved strategy + source field.

4. **Phase 2: parameterize per-task lifecycle by `target_branch`.** Update the per-task pseudocode in the skill's Appendix B (the routing pseudocode) to use `target_branch` variable: `target_branch = "feat/" + spec.id` if strategy is branch; `target_branch = "main"` if strategy is direct. Every `merge_task_pr` call uses `target=target_branch`.

5. **Phase 3: conditional flows:**
   - Branch mode (existing): integration PR `feat/spec-NNN → main` after all tasks terminal → spec-completion if at least one task merged.
   - Direct mode (new): when all tasks reach terminal state, if ≥1 task done → invoke spec-completion against main HEAD; if all cancelled → skip spec-completion (mirroring branch mode all-cancelled behavior); archive log by appending `# spec_completed: <iso8601>` as a JSONL comment line.

6. **Telemetry schema extension:** add `integration_strategy_resolved` to the documented event list (becomes the 10th event type). Document the shape per Design. NOTE: no `spec_completed` event — the archive sentinel is a comment, not an event.

7. **Worked example log fixture update:** edit `.ai/skills/spec-execution/examples/example-execution.log.jsonl` to add an `integration_strategy_resolved` event at the start (before any `dispatched` events). Use plausible values for the example SPEC-099.

8. **AC-009 sidecar mechanism:** document that the orchestrator reads `specs/tasks/SPEC-NNN/_expected_strategy` (sidecar file, single line `branch` or `direct`) before Phase 1 if present, compares to resolved strategy after Phase 1, records the result to spec-completion deferred-verifications table per SPEC-004 Design > 3, then deletes the sidecar in a follow-up commit.

9. **Rollback semantics (AC-010):** add a paragraph (in the skill or a dedicated "Rollback" subsection): in-flight orchestrator processes are unaffected by reverts (they hold pre-revert skill in memory); post-revert orchestrators fail Phase 1 on specs with `integration_strategy:` field; recovery is a simultaneous `spec-schema.md` revert.

## Constraints

- The skill is the canonical source of the resolution algorithm. SPEC-005 design text references this skill once it's updated. Do not duplicate the heuristic in spec-schema or anywhere else.
- The Appendix B pseudocode update must be byte-consistent with the prose in Phase 2 — same drift class the SPEC-001/002 review loop caught.
- The integration_strategy_resolved event is per-spec (not per-task) — fired once at Phase 1.

## Followups (batch_followup_and_accept — 2026-05-19, integration PR #24 review)

Deferred nits from the PR #24 Tier 1 / Tier 2 review cycles:

- **F-001 (nit):** `specs/SPEC-005-conditional-integration-branch.md` Design > Changelog annotation template still carries placeholder date `2026-05-XX` on the `v1.1` heading. The live `SPEC-002` Changelog correctly reads `2026-05-19`. Update the design template on a follow-up pass to match.
- **F-002 (nit):** `specs/SPEC-002-spec-execution-orchestration.md` Appendix B header still reads "Authoritative orchestrator decision logic" and hardcodes `target=f"feat/{spec.id}"` without the `target_branch` variable. Since SKILL.md Appendix B is now canonical, the "Authoritative" label in the historical spec body is misleading. A clarifying parenthetical in the SPEC-002 Changelog (e.g., "SKILL.md Appendix B is now the live-canonical pseudocode") would resolve this without touching the spec body.
- **F-003 (nit):** SKILL.md HC5 runs on without a line break after the branch-mode clause (`...in order). In direct mode...`), creating visual density. No behavioral impact; cosmetic break would improve readability.
- **F-004 (suggestion):** SKILL.md Phase 3 Branch mode step 2 does not explicitly call out the all-cancelled skip (only prose says "at least one task is done"). Making the all-cancelled case explicit with a parenthetical — mirroring the direct-mode step — would improve symmetry.
- Sidecar files (`_expected_strategy`) are outside spec-schema's frontmatter validation surface — no schema change for them.
- All edits are additive to the existing skill — Phase 1/2/3 keep their existing content; this task ADDS to them.

## Verification

- `grep -c "integration_strategy" .ai/skills/spec-execution/SKILL.md` returns ≥5 (resolve step, telemetry, conditionals, fixture reference, sidecar).
- `grep -c "target_branch" .ai/skills/spec-execution/SKILL.md` returns ≥3 (definition + Appendix B uses).
- Read the updated worked example fixture: `python3 -c "import json; [json.loads(l) for l in open('.ai/skills/spec-execution/examples/example-execution.log.jsonl') if l.strip() and not l.startswith('#')]"` succeeds.
- The fixture's first event line is `integration_strategy_resolved`.
- 4+1 worked example cases visible in the Phase 1 section.
