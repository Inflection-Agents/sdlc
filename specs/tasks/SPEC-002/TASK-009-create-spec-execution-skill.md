---
id: TASK-009
spec: SPEC-002
title: "Create .ai/skills/spec-execution/SKILL.md (drives full orchestration loop)"
status: pending
agent: claude-code
depends_on: [TASK-002, TASK-003]
blocks: [TASK-010]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-execution/SKILL.md exists, when read, then it documents Phases 1, 2, 3 with the per-task lifecycle per SPEC-002 Design"
    status: pending
  - id: AC-002
    description: "Given the file, when read, then it specifies the worktree-isolation constraint as a hard rule, citing the 2026-04-24 incident OR a generic justification of the failure mode for the upstream version"
    status: pending
  - id: AC-003
    description: "Given the file, when read, then it explicitly states 'no LLM reviewer is dispatched while Tier 0 is red', and Tier 0 contents are inherited by reference from SPEC-001 Design > PR side > Tier 0 (not duplicated)"
    status: pending
  - id: AC-004
    description: "Given the file, when read, then severity routing is by inclusion reference to review-primitives.md / SPEC-001 (not duplicated). The escalate action is handled. Cross-skill signal detection uses the citation prefixes verbatim from SPEC-001 Grounding rules (task:scope, spec:ambiguous-ac, spec:contradictory-ac, spec:wrong-design, spec:missing-section)"
    status: pending
  - id: AC-005
    description: "Given the file, when read, then the fix-loop cap is documented as 3 total fix attempts per task across Tier 0 and Tier 1 combined (shared counter)"
    status: pending
  - id: AC-006
    description: "Given the file, when read, then all 8 failure escalation triggers from SPEC-002 Design > Failure escalation triggers are documented with their detection points (per-task loop vs. wave-graph build vs. dispatch wrapper vs. watchdog vs. cross-skill signal handler)"
    status: pending
  - id: AC-007
    description: "Given the file, when read, then the telemetry schema is documented with all 8+1 event types (dispatched, tier_0, tier_1, tier_2, fix_loop_iteration, routed, merged, escalated, spec_amendment_dispatched) and the log file path specs/tasks/SPEC-NNN/_execution.log.jsonl"
    status: pending
  - id: AC-008
    description: "Given the file, when read, then cross-skill signals are detected on the AGGREGATED Tier 1 + Tier 2 finding set (not Tier 1 alone), with explicit note that SPEC-001's grant of pr-reviewer prefixes to Tier 2 specialists is the enabling condition"
    status: pending
  - id: AC-009
    description: "Given the file, when read, then agent routing is documented: jules-labeled tasks dispatch via Jules CLI when available; otherwise fall back to local Claude Code per existing CLAUDE.md convention"
    status: pending
  - id: AC-010
    description: "Given the file, when read, then the integration branch (feat/spec-NNN) and integration PR (to main on spec completion) are documented as the ONLY merge pattern; direct task PRs to main are forbidden"
    status: pending
  - id: AC-011
    description: "Given the file, when read, then reviewer output schema validation is documented as mandatory before routing (Tier 1 AND every Tier 2 specialist); validation failure escalates"
    status: pending
  - id: AC-012
    description: "Given the file, when read, then Tier 2 dispatch is documented as iterating tier1.tier_2_dispatch_recommended only — the orchestrator does NOT re-evaluate file globs (file glob evaluation is the reviewer's responsibility per SPEC-001)"
    status: pending
  - id: AC-013
    description: "Given the file, when read, then the orchestrator handles the escalate action as an explicit pseudocode branch (not a fall-through), with detection point in the per-task routing loop"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

This task creates the orchestration skill that executes any active spec end-to-end. It consumes SPEC-001's reviewer contracts (pr-reviewer, severity policy, grounding rules) and replaces high-gear's hard-coded 4-reviewer always-on fan-out with a tiered, graded, contract-driven model. The skill is the runtime that turns specs into shipped code.

## Requirements

Create `/Users/franklin/_code/sdlc/.ai/skills/spec-execution/SKILL.md`.

Structure (following SPEC-002 Appendix A skill skeleton):

1. **Frontmatter:**
   ```yaml
   ---
   name: spec-execution
   description: Use when an active spec needs to be executed end-to-end — drives the wave-based loop from branch creation through integration PR. Consumes SPEC-001 reviewer contracts.
   ---
   ```

2. **Overview paragraph** — one paragraph per SPEC-002 Appendix A skeleton.

3. **Hard constraints section** — all 7 from SPEC-002 Appendix A:
   - Worktree isolation (with incident note)
   - Tier 0 gates review (contents per SPEC-001)
   - Severity routing per SPEC-001 (including escalate)
   - Fix loop cap = 3 per task TOTAL
   - Integration branch only
   - Reviewer output schema validation
   - Per-spec amendment cap = 2

4. **Process section** — Phases 1, 2, 3:
   - Phase 1 — Initialize: all 7 steps from SPEC-002 Design > Phase 1 (verify status, create branch, build wave graph with wave-integer formula, cycle detection, init telemetry log, start watchdog, init log-derived amendment counter).
   - Phase 2 — Wave loop: dispatch executor (worktree-isolated), per-task routing loop. Include the ASCII flow diagram and a prose summary; cite Appendix B (in the SKILL.md, not SPEC-002) for the authoritative pseudocode.
   - Phase 3 — Integration: integration PR, spec-completion invocation, archive log.

5. **Cross-skill signals section** — per SPEC-002 Design > Cross-skill signals. Both re-plan (`task:scope`) and spec-amendment (`spec:*`) signals; both detected on aggregated set; both with explicit prefix lists.

6. **Failure escalation section** — the full 8-row table from SPEC-002 Design > Failure escalation triggers, including the "Detected where" column.

7. **Telemetry section** — the full event schema from SPEC-002 Design > Telemetry schema, including the per-spec `spec_amendment_dispatched` event.

8. **Appendix B (in the SKILL.md) — Per-task routing pseudocode** — verbatim from SPEC-002 Appendix B. This is the load-bearing implementation reference; the orchestrator's decision logic is defined here.

9. **Reference to SPEC-001** — explicit cross-reference for Tier 0 contents (Design > PR side > Tier 0), severity policy (Design > Orchestrator severity→action policy), grounding rules (Design > Grounding rules including the Tier 2 specialists row), and Tier 2 dispatch rules table (Appendix B).

## Constraints

- **This file is necessarily large.** SPEC-002 is substantive; the skill that implements it will be 500-800 lines. Splitting it would create awkward merge conflicts because it's one cohesive workflow. Accept the size; do not split.
- Do NOT duplicate the Tier 0 description, severity policy pseudocode, severity ladder, or Tier 2 dispatch rules table — reference SPEC-001 (the source of truth). Duplication creates drift; the iter-1 → iter-6 review loop on SPEC-001/SPEC-002 demonstrated exactly this failure mode.
- The per-task amendment counter is materialized from the execution log (per Phase 1 step 7) — do NOT define a frontmatter field or sidecar for it.
- The pseudocode in Appendix B of the SKILL.md must match SPEC-002 Appendix B byte-for-byte (check-then-increment for the amendment counter; explicit escalate branch; Tier 0 fix resets last_reviewer_output).
- Worktree isolation rule is MANDATORY for any background agent that edits repo files. Jules-dispatched tasks are exempt because Jules manages its own workspace; document this exception.

## Verification

- Read the file end to end; verify each of the 13 ACs by inspection.
- Cross-reference against SPEC-002 (Design + Appendices A and B) — the prose and pseudocode must match.
- Cross-reference against SPEC-001 Design (severity policy, Tier 0, grounding rules, Tier 2 specialists row) — the references must be accurate.
- Run `wc -l` on the file; record the line count for the PR description (expected 500-800 lines).
- No automated test exists for skill content; verification is by inspection.
