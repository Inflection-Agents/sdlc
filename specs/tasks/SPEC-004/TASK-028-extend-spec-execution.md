---
id: TASK-028
spec: SPEC-004
title: "Extend spec-execution skill — gap-capture handler, rate-limit, gap_dispatched/gap_resolved events"
status: pending
agent: claude-code
depends_on: [TASK-022, TASK-023]
blocks: [TASK-030]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-execution/SKILL.md Phase 2 cross-skill signal handler, when read, then it routes `criterion == \"spec:gap\"` blocker findings to a new gap-capture handler: creates a GAP-NNN-*.md file from templates/gap.md, populates frontmatter, does NOT increment the per-spec amendment counter, does NOT escalate (SPEC-004 AC-011)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given the skill, when read, then it documents a per-spec rate-limit: max 5 open gaps per spec at any time (open = status: open). When the limit is exceeded, the orchestrator's gap-capture handler rewrites the finding's `criterion` to `spec:wrong-design` (an existing allowed prefix per SPEC-002) at handoff time and routes through the amendment counter natively — no new prefix introduced (SPEC-004 AC-011)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given the skill, when read, then the telemetry schema gains two new event types: `gap_dispatched` (emitted at gap-capture handoff with fields: ts, spec, event, gap_id, open_count, originating_finding_id) and `gap_resolved` (emitted when a GAP file transitions to status: resolved or wontfix; same shape minus originating_finding_id). The live schema grows to 12 event types (10 pre-SPEC-004 + 2 here). Open gap count is derived as count(gap_dispatched for spec) - count(gap_resolved for spec) (SPEC-004 AC-011 + AC-013)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-011. The runtime change in spec-execution that makes gap-capture work. Depends on TASK-022 (`spec:gap` prefix being in `review-primitives.md`) and TASK-023 (`templates/gap.md` existing for the handler to copy from). Pre-condition: this assumes the live `spec-execution/SKILL.md` schema is at 10 events after SPEC-005's `integration_strategy_resolved` lands; if SPEC-005 has not landed yet, the count adjusts accordingly.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/spec-execution/SKILL.md`:

1. **Phase 2 cross-skill signal handler extension:**
   - Add a branch: `if any(f.criterion == "spec:gap" for f in all_findings if f.severity == "blocker"): invoke_gap_capture(spec, finding)`.
   - The branch fires BEFORE the existing `spec:*` startswith branch (so `spec:gap` is intercepted before falling through to spec-amendment).
   - `invoke_gap_capture` semantics: count open gaps for spec; if `open_count < 5`, create a GAP-NNN-*.md file under `specs/gaps/` from `templates/gap.md`, populate frontmatter (id auto-incremented, spec, title from finding text, status: open, owner: orchestrator's owner field, created: today, discovered_in: TASK-NNN or PR-NNN from current context, resolution: clarification (default; the resolver may change it), the rest null), log `gap_dispatched` event with `open_count` post-increment, and continue execution (return; the task PR is not blocked by this finding, but the next task may resume freshly).
   - If `open_count >= 5`: the orchestrator REWRITES the finding's criterion from `spec:gap` to `spec:wrong-design` at handoff time, and falls through to the existing `spec:*` branch (which routes through the amendment counter natively). No new prefix introduced.

2. **Telemetry schema extension:**
   - Add `gap_dispatched` event: `{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "gap_dispatched", "gap_id": "GAP-NNN", "open_count": <int>, "originating_finding_id": "F-NNN"}`.
   - Add `gap_resolved` event: `{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "gap_resolved", "gap_id": "GAP-NNN", "open_count": <int>}` (open_count is post-resolution, so decremented). Emitted on GAP file status flip — the orchestrator monitors `specs/gaps/` for status changes and emits the event (the actual GAP file update is human or another skill's responsibility).
   - Update the telemetry schema list count: 10 → 12 event types. Document both events with their field shapes.

3. **Open gap count derivation:**
   - Documented formula: `open_count(spec) = count(gap_dispatched events for spec) - count(gap_resolved events for spec)`. The orchestrator derives this from the execution log at handoff time (same log-derived pattern as the per-spec amendment counter per SPEC-002 Phase 1 step 7).

4. **Update the Appendix B pseudocode** to include the gap-capture branch and the rewrite-on-exceed logic.

## Constraints

- The rewrite-on-exceed is at orchestrator handoff time — the reviewer's emitted `criterion` is unchanged in the log; the orchestrator's routing decision is what differs. Document this clearly.
- gap_dispatched and gap_resolved are per-spec events (not per-task), like `spec_amendment_dispatched` and `integration_strategy_resolved`.
- The skill is the canonical source of telemetry schema. SPEC-002's body documents the original 9 events; this skill grows to 12 after this task lands (assuming SPEC-005's `integration_strategy_resolved` is also live).
- Reference `templates/gap.md` (created by TASK-023) for the frontmatter shape; do not duplicate.

## Verification

- `grep -c "gap_dispatched" .ai/skills/spec-execution/SKILL.md` returns ≥3 (event definition, dispatch in handler, derivation formula).
- `grep -c "gap_resolved" .ai/skills/spec-execution/SKILL.md` returns ≥2.
- `grep -c "spec:gap" .ai/skills/spec-execution/SKILL.md` returns ≥2 (handler branch + rewrite-on-exceed reference).
- Appendix B pseudocode includes the new branch BEFORE the existing `spec:*` branch.
- Telemetry schema list shows 12 event types (or correct count if SPEC-005 hasn't landed yet).
