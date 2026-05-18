---
id: TASK-010
spec: SPEC-002
title: "Worked execution-log example in spec-execution/examples/"
status: pending
agent: jules
depends_on: [TASK-009]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-execution/examples/example-execution.log.jsonl exists, when read as JSONL, then every line is valid JSON parseable independently"
    status: pending
  - id: AC-002
    description: "Given the file, when read, then it contains events for at least 3 tasks across at least 2 waves, demonstrating dynamic unblocking (e.g., TASK-002 dispatched when TASK-001 done, TASK-003 dispatched when both TASK-001 and TASK-002 done)"
    status: pending
  - id: AC-003
    description: "Given the file, when read, then at least one task demonstrates a fix-loop iteration (event 'fix_loop_iteration' with trigger='tier_0' or 'review', followed by a successful re-review)"
    status: pending
  - id: AC-004
    description: "Given the file, when read, then at least one task demonstrates a Tier 2 specialist dispatch (event 'tier_2' with a specialist name like 'cross_spec' or 'domain:dbt')"
    status: pending
  - id: AC-005
    description: "Given the file, when read, then the per-spec 'spec_amendment_dispatched' event appears at least once with an amendment_count value"
    status: pending
  - id: AC-006
    description: "Given the file, when read, then at least one task reaches a terminal 'merged' event with a populated total_wall_ms field, and at least one task reaches an 'escalated' event with a populated reason"
    status: pending
  - id: AC-007
    description: "Given the file, when read, then every event includes the required fields per SPEC-002 Telemetry schema for that event type"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-002 AC-007, a worked example execution log is required to make the telemetry schema concrete. Without it, a downstream consumer reading the schema has no anchor for what a real log looks like — event ordering, realistic timestamps, fingerprints, fix-loop progressions. This file serves as both documentation and the fixture for any future log-parsing tooling.

## Requirements

Create `/Users/franklin/_code/sdlc/.ai/skills/spec-execution/examples/example-execution.log.jsonl`.

Construct a plausible fictional execution log for a fictional SPEC-099 with 4 tasks (TASK-201, TASK-202, TASK-203, TASK-204):

- TASK-201, TASK-202: independent (wave=0), parallel dispatch
- TASK-203: depends_on [TASK-201] (wave=1)
- TASK-204: depends_on [TASK-201, TASK-202] (wave=2)

Demonstrate in the log:

1. **Initial parallel dispatch** of TASK-201 and TASK-202 at wave=0.
2. **TASK-201 lifecycle:** dispatched → tier_0 fail (fingerprint A) → fix_loop_iteration #1 (trigger=tier_0) → dispatched-fix → tier_0 pass → tier_1 (1 nit) → routed=batch_followup_and_accept → merged.
3. **TASK-202 lifecycle:** dispatched → tier_0 pass → tier_1 (0 findings, but tier_2_recommended=["cross_spec"] because diff touches `shared/`) → tier_2 cross_spec (1 major) → routed=fix_loop → fix_loop_iteration #1 (trigger=review) → tier_0 pass → tier_1 (clean) → routed=accept → merged.
4. **TASK-203 lifecycle:** dispatched (wave=1, after TASK-201.merged) → tier_0 pass → tier_1 (1 blocker with criterion="spec:contradictory-ac") → spec_amendment_dispatched (amendment_count=1) → escalated with reason="cross_skill_handoff_spec_amendment" (orchestrator pauses TASK-203 pending amendment).
5. **TASK-204 lifecycle:** dispatched (wave=2, after BOTH TASK-201 and TASK-202 merged) → tier_0 fail (fingerprint B) → fix_loop_iteration #1 → tier_0 fail (fingerprint B again) → fix_loop_iteration #2 → tier_0 fail (fingerprint B THIRD time) → escalated with reason="tier_0_same_fingerprint_3x".

Total events: roughly 25-30 lines, each on its own line, each independently valid JSON.

## Constraints

- The file is JSONL — one JSON object per line, no array wrapper, no trailing comma. Each line must parse independently.
- Timestamps must be in ISO 8601 format and monotonically increasing across the file (events later in time appear later in the file).
- Every event must include the fields listed in SPEC-002 Design > Telemetry schema for its event type. Optional fields (e.g., `worktree` for Jules tasks) may be omitted or null per the schema; for this example, all executor dispatches are claude-code with a worktree path.
- `agent: "claude-code"` for all dispatched events in this example (omits the jules case for simplicity; that's fine).
- The `wave` integer in dispatched events must follow the formula in SPEC-002 Phase 1 step 3 (TASK-201=0, TASK-202=0, TASK-203=1, TASK-204=2).
- All `fingerprint` values for tier_0 events are realistic hash-looking strings (e.g., "sha256:a1b2c3d4...").
- All `pr` numbers are plausible integers; all `total_wall_ms` values are plausible (5-90 minutes per task).

## Verification

- Run `python3 -c "import json; [json.loads(line) for line in open('/Users/franklin/_code/sdlc/.ai/skills/spec-execution/examples/example-execution.log.jsonl')]"` — must succeed with no errors.
- Visually confirm event ordering matches the task lifecycles described in Requirements.
- Verify each of the 7 ACs by inspection.
- Cross-reference event field names against SPEC-002 Design > Telemetry schema — must match exactly.
