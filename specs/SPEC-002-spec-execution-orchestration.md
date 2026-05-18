---
id: SPEC-002
title: Spec execution orchestration — wave-based loop with tiered review
status: active
version: 1
supersedes:
initiative: INI-001
owner: franklin
created: 2026-05-18
updated: 2026-05-18
tags: [orchestration, spec-execution, waves, reviewer-router, worktrees]
linear_project:
depends_on: [SPEC-001]
---

## Problem

The upstream SDLC framework describes the artifacts (specs, tasks, ADRs, skills) and the per-skill behaviors (authoring, decomposition, review, completion) but **does not define the execution loop that drives them**. The framework documents say "decompose the spec, dispatch the tasks, review the PRs" but there is no skill that codifies *how* — how waves are constructed from the task dependency graph, how background executors are isolated, when the tester gate fires relative to reviewers, how the fix loop terminates, how the integration PR is assembled, when failure escalates.

High-gear has lived without that gap: it built `spec-execution` as a 23KB skill with a rigid multi-phase loop, and SPEC-042 (23 tasks across 11 waves) proved out the pattern. But the high-gear version was written before SPEC-001 introduced graded review. It bakes in a 4-reviewer always-on fan-out and binary verdict routing, which SPEC-001 now supersedes.

Two motivations, then:

1. **Port the execution loop upstream.** Without it, the upstream framework is incomplete — every consumer would have to invent it again. The high-gear loop has been battle-tested; codifying it upstream is overdue.
2. **Adapt it to consume SPEC-001's graded-review contract.** The orchestrator's job becomes smaller and cleaner: dispatch executor, run Tier 0 in CI, fire Tier 1 reviewer, dispatch Tier 2 specialists per Tier 1's recommendation, apply the shared severity policy. The reviewer skills do the grading and the dispatch-rule evaluation; the orchestrator does the routing only.

## Success criteria

- [ ] A new `spec-execution` skill exists in upstream sdlc. It encodes the wave-based loop end-to-end: branch creation, parallel executor dispatch, Tier 0 gating, Tier 1 review, Tier 2 specialist dispatch, severity-driven routing, fix loop with iteration cap, task PR merge to integration branch, integration PR to main, spec-completion trigger.
- [ ] The skill enforces the worktree-isolation rule: any background agent that edits repo files runs in an isolated worktree.
- [ ] The skill enforces the Tier 0 → Tier 1 → Tier 2 sequencing: no LLM reviewer is dispatched if CI is red. This is the single largest token-cost optimization in the design.
- [ ] The skill consumes SPEC-001's severity policy verbatim — including the `escalate` return path. No bespoke routing logic.
- [ ] Per-task telemetry is logged (wave assignment, executor duration, Tier 0 outcome, Tier 1 severity distribution, Tier 2 specialists dispatched, fix-loop iterations, final outcome, total wall time). This is the data needed to measure SPEC-001's success metrics.
- [ ] All failure escalation triggers are detected — some inside the per-task routing loop, others outside it (wave-graph builder, dispatch-time, watchdog, per-spec amendment counter). Each trigger's detection point is anchored to a concrete Phase / step in the spec.
- [ ] On the next active spec in high-gear, the new orchestrator replaces the existing one after baseline capture per SPEC-001 AC-011.

## Scope

### In scope

- New skill `.ai/skills/spec-execution/SKILL.md` in upstream sdlc.
- Wave construction algorithm (topological sort over `depends_on`/`blocks` from task frontmatter), with the wave-integer semantics defined for both static and dynamic-unblocking cases.
- Per-task lifecycle inside a wave (executor → Tier 0 → Tier 1 → Tier 2 → policy → fix_loop or accept or escalate).
- Worktree-isolation enforcement for file-editing background agents.
- Integration-branch convention (`feat/spec-NNN`) and integration PR pattern.
- Severity-routing inheritance from SPEC-001 — referenced, not redefined. Including the `escalate` action.
- Tier 0 gate inheritance from SPEC-001 — referenced, not redefined.
- Telemetry schema (what fields are logged per task; where they live).
- Failure escalation triggers — enumerated, each anchored to a concrete Phase / step. The per-spec amendment counter and its check point are defined explicitly in Phase 1.
- Coordination with `task-decomposition` (re-plan signal from Tier 1 or Tier 2) and `spec-amendment` (spec-is-wrong signal) using the citation prefixes defined in SPEC-001 Design > Grounding rules.
- Agent-routing-awareness (jules-labeled tasks dispatch via Jules CLI if available; otherwise fall back to local Claude Code per the existing CLAUDE.md fallback rule).
- Schema validation of reviewer output before routing — guards against malformed JSON / contract violations. Validation applies to Tier 1 and every Tier 2 specialist output.

### Out of scope

- `pr-reviewer` and `spec-reviewer` themselves — SPEC-001.
- The severity spine, consequence catalogs, grounding rules (including Tier 2 specialists' inheritance of `pr-reviewer` prefixes), JSON output schema, carry-forward contract, Tier 2 dispatch rules table — SPEC-001 owns all of these.
- The CI infrastructure for Tier 0.
- Auto-merge bookkeeping workflows.
- Agent Teams adoption.
- `spec-reviewer` invocation (lives in `spec-authoring` and `spec-amendment` per SPEC-001).
- Domain-skill content. Specialists referenced by Tier 2 dispatch consume domain skills from the consumer.

## Design

### Inputs

- An active spec (`status: active`) with decomposed tasks in `specs/tasks/SPEC-NNN/`.
- A task index (`specs/tasks/SPEC-NNN/_index.yaml`) with each task's frontmatter loaded.
- The SPEC-001 contracts (Tier 0 gates, severity policy including `escalate`, grounding rules for all three reviewer roles, Tier 2 dispatch rules table in SPEC-001 Appendix B).

### Phase 1 — Initialize

1. Verify spec is `status: active`. Refuse to start otherwise.
2. Create integration branch: `feat/spec-NNN` off `main`.
3. Build the wave graph: topological sort of tasks by `depends_on`/`blocks`. Assign each task a **wave integer**: `wave(task) = max(wave(d) for d in task.depends_on) + 1`, or `0` for tasks with no dependencies. This integer is stable across the run and is the value logged in the `dispatched` telemetry event.
4. Detect cycles → escalate immediately. **Detection point: wave-graph build, out of per-task loop.**
5. Initialize telemetry log at `specs/tasks/SPEC-NNN/_execution.log.jsonl`.
6. Start the wall-clock watchdog: a separate thread/process polling per-task wall-time and escalating any task exceeding 4 hours. **Detection point: watchdog, out of per-task loop.**
7. Initialize the **per-spec amendment counter** `spec_amendment_count = 0`. **Persistence:** the counter is materialized from the execution log — on every orchestrator entry (fresh start OR resume after restart), it is reconstructed as `count of "spec_amendment_dispatched" events in specs/tasks/SPEC-NNN/_execution.log.jsonl`. This makes the counter restart-safe without requiring a new frontmatter field or sidecar file. Incremented at the cross-skill spec-amendment hand-off in Phase 2 (step 2) — incrementing means logging a new `spec_amendment_dispatched` event. Checked against the cap (>2) at the entry of the amendment hand-off; if exceeded, escalate before invoking `spec-amendment`. **Detection point: cross-skill signal handler in Phase 2, with state derived from the telemetry log.**

### Phase 2 — Wave loop

For each task whose `depends_on` are all `done` (dynamic — re-evaluated on every task completion, not stepped by wave integer):

1. **Dispatch executor.**
   - If `task.agent == "jules"` and Jules CLI is available → dispatch via Jules CLI.
   - Else → dispatch as a background Claude Code subagent **with `isolation: "worktree"` (mandatory)**.
   - Each executor receives: task file path, spec file path, applicable ADR paths, applicable domain skill names, the integration branch name to PR against.
   - Log dispatch (event = `dispatched`, with the static `wave` integer from Phase 1 step 3).
   - On dispatch failure (worktree creation fails, executor crashes before opening a PR), escalate. **Detection point: dispatch wrapper, out of per-task routing loop.**

2. **Per-task routing loop** (runs concurrently per task; see Appendix B for authoritative pseudocode):

   ```
   executor produces PR against feat/spec-NNN
        ↓
   Tier 0 (per SPEC-001 Design > PR side > Tier 0 — mechanical gates)
        ↓
        ├─ red → dispatch fix agent → loop; increment shared fix counter
        │        (also resets last_reviewer_output — Tier 0 fix invalidates
        │         prior Tier 1 carry-forward)
        │
        └─ green → Tier 1 (pr-reviewer, per SPEC-001 contract)
                       ↓
                   schema-validate Tier 1 output (envelope + citation prefixes
                   per SPEC-001 grounding rules); malformed → escalate
                       ↓
                   dispatch Tier 2 specialists from
                   tier1.tier_2_dispatch_recommended (parallel)
                       ↓
                   schema-validate each Tier 2 output; malformed → escalate
                       ↓
                   aggregate Tier 1 + Tier 2 findings
                       ↓
                   detect cross-skill signals on the AGGREGATED set:
                     - any blocker with criterion == "task:scope"
                       → task-decomposition re-plan (return)
                     - any blocker with criterion starting "spec:"
                       → check log-derived spec_amendment_count; if next count
                         > 2, escalate; else log spec_amendment_dispatched and
                         invoke spec-amendment (return)
                       ↓
                   apply SPEC-001 severity policy on remaining findings;
                   action ∈ {fix_loop, batch_followup_and_accept, accept,
                   escalate}
                       ↓
                       ├─ fix_loop → dispatch fix agent with previous_output
                       │             increment fix counter; check cap
                       ├─ batch_followup_and_accept → create grooming task;
                       │                              merge task PR
                       ├─ accept → merge task PR
                       └─ escalate → escalate(task, "policy_escalate")
   ```

3. **Mark task `done`.** Update `_index.yaml`. Re-evaluate eligible tasks; any task whose `depends_on` are now all `done` becomes eligible for immediate dispatch.

4. **Continue until all tasks are `done` or `cancelled`.**

### Phase 3 — Integration

1. When all tasks are terminal, open integration PR: `feat/spec-NNN → main`.
2. Invoke `spec-completion` skill.
3. On integration PR merge, archive the execution log alongside the spec.

### Cross-skill signals

Both signal types are detected on the **aggregated** finding set (Tier 1 + all Tier 2 specialists), not just Tier 1, so a specialist that surfaces the signal first still triggers correctly. SPEC-001's Grounding rules table explicitly grants Tier 2 specialists the `pr-reviewer` prefixes, including `task:scope` and `spec:*`.

- **Re-plan signal.** Any aggregated finding with `severity: blocker` and `criterion: "task:scope"`. Orchestrator pauses the task, invokes `task-decomposition` in re-plan mode, then resumes.
- **Spec-amendment signal.** Any aggregated finding with `severity: blocker` and `criterion` starting with `"spec:"` (one of `spec:ambiguous-ac`, `spec:contradictory-ac`, `spec:wrong-design`, `spec:missing-section`). Orchestrator derives the current `spec_amendment_count` from the execution log (per Phase 1 step 7), checks `(current + 1) > 2` against the cap; if exceeded, escalates without logging or invoking. Otherwise it logs a new `spec_amendment_dispatched` event (which is what "incrementing" means here) and invokes `spec-amendment`, which re-invokes `spec-reviewer` per SPEC-001. Execution resumes after amendment is approved.

The orchestrator routes signals; it doesn't decide policy.

### Failure escalation triggers

| Trigger | Detected where | Notes |
|---|---|---|
| Fix-loop counter > 3 for any task | Per-task routing loop (Appendix B) | Per-task TOTAL — Tier 0 and Tier 1 fixes share the counter |
| Tier 0 fails 3 times with the same error fingerprint | Per-task routing loop (Appendix B) | Fingerprint = hash of first 500 chars of failure output |
| Tier 1 or Tier 2 returns malformed JSON or ungrounded findings | Per-task routing loop, schema-validation step | SPEC-001 contract violation |
| Severity policy returns `escalate` (unrecognized criterion prefix at routing time) | Per-task routing loop (Appendix B) | Per SPEC-001 Orchestrator policy; pseudocode handles the action explicitly |
| Task dispatch fails (worktree creation, executor crash before PR) | Dispatch wrapper, Phase 2 step 1 | Infra problem; escalates on first failure |
| Dependency cycle detected at wave-graph build | Wave-graph builder, Phase 1 step 4 | `task-decomposition` defect |
| Spec amendment cycle (counter > 2) | Cross-skill signal handler, Phase 2 step 2; counter initialized Phase 1 step 7 | Spec is unstable; needs human design pass |
| Wall-clock per task > 4 hours | Watchdog, Phase 1 step 6 | Likely stuck |

Each escalation writes a structured entry to the execution log and notifies the owner.

### Telemetry schema

Per-task events appended to `specs/tasks/SPEC-NNN/_execution.log.jsonl`:

```json
{"ts": "<iso8601>", "task": "TASK-NNN", "wave": <int>, "event": "dispatched", "agent": "claude-code|jules", "worktree": "<path>|null"}  // worktree omitted/null when agent=jules (Jules manages its own workspace)
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_0", "outcome": "pass|fail", "commands": [...], "duration_ms": <int>, "fingerprint": "<hash>"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_1", "blockers": <int>, "majors": <int>, "nits": <int>, "suggestions": <int>, "tier_2_recommended": [...], "duration_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_2", "specialist": "cross_spec|...", "blockers": <int>, "majors": <int>, "nits": <int>, "duration_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "fix_loop_iteration", "iteration": <int>, "trigger": "tier_0|review"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "routed", "action": "fix_loop|batch_followup_and_accept|accept|escalate"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "merged", "pr": <int>, "total_wall_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "escalated", "reason": "<trigger>"}
{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "spec_amendment_dispatched", "amendment_count": <int>}
```

The last event is per-spec, not per-task — it records the amendment-counter state for the cap check.

### Worked example sketch

5-task spec where TASK-1, TASK-2 are independent, TASK-3 depends on TASK-1, TASK-4 depends on TASK-2, TASK-5 depends on both. Wave integers: TASK-1=0, TASK-2=0, TASK-3=1, TASK-4=1, TASK-5=2.

```
TASK-1, TASK-2 dispatched (wave=0, parallel)
        TASK-1 → Tier 0 green → Tier 1 (0 blockers, 1 nit, tier_2_recommended=[])
                 → batch_followup_and_accept → merged
        TASK-2 → Tier 0 green → Tier 1 (1 blocker, tier_2_recommended=[])
                 → schema-validate OK → cross-skill check: no
                 → policy → fix_loop iter 1 → Tier 1 (clean) → accept → merged

TASK-3 dispatched on TASK-1.done (wave=1)
        TASK-3 → Tier 0 red → fix iter 1 (last_reviewer_output reset)
              → Tier 0 green
              → Tier 1 (0 blockers, 0 majors, tier_2_recommended=["cross_spec"])
                 — Tier 1 evaluated SPEC-001 Appendix B rule "diff touches
                 packages/" against the diff and recommended cross_spec
              → Tier 2 cross_spec returns 1 major
              → aggregated: 1 major → fix iter 2 → Tier 1+2 (clean)
              → accept → merged

TASK-4 dispatched on TASK-2.done (wave=1, concurrent with TASK-3)
TASK-5 dispatched on TASK-3.done AND TASK-4.done (wave=2)

All tasks done → spec-completion → integration PR feat/spec-NNN → main
```

## Acceptance criteria

- [ ] AC-001 — `.ai/skills/spec-execution/SKILL.md` exists and documents Phases 1, 2, 3 with the per-task lifecycle.
- [ ] AC-002 — The skill specifies the worktree-isolation constraint as a hard rule, citing a concrete originating incident (the high-gear stash incident on 2026-04-24 if available in the consumer's incident log; otherwise a generic justification of the failure mode is acceptable for the upstream framework version).
- [ ] AC-003 — The skill explicitly states: "no LLM reviewer is dispatched while Tier 0 is red." Tier 0 → Tier 1 → Tier 2 sequencing is mandatory. Tier 0 contents are inherited by reference from SPEC-001 Design > PR side > Tier 0 (not duplicated).
- [ ] AC-004 — Severity routing references SPEC-001's policy by inclusion (not duplication), including the `escalate` action. Cross-skill signal detection uses the citation prefixes defined in SPEC-001 Design > Grounding rules verbatim. Tier 2 specialists are explicitly authorized by SPEC-001 to use the `pr-reviewer` prefixes (including the cross-skill-signal prefixes); SPEC-002 relies on this authorization for aggregated-set signal detection.
- [ ] AC-005 — The fix loop has a hard cap of 3 total fix attempts per task across Tier 0 and Tier 1 combined. The skill documents the cap, the shared counter, and the escalation it triggers.
- [ ] AC-006 — Every failure escalation trigger in the Design > Failure escalation triggers table is detected. The detection point column anchors each trigger to a concrete Phase / step. Triggers fired inside the per-task routing loop are visible in Appendix B pseudocode; triggers fired elsewhere reference the Phase / step where they fire (including the per-spec amendment counter initialized in Phase 1 step 7 and checked in Phase 2 step 2).
- [ ] AC-007 — Telemetry schema is documented; the skill specifies the log file path and the event types, including the per-spec `spec_amendment_dispatched` event.
- [ ] AC-008 — Cross-skill signals are detected on the **aggregated** Tier 1 + Tier 2 finding set. The pseudocode reflects this. The skill notes SPEC-001's grant of `pr-reviewer` prefixes to Tier 2 specialists is the enabling condition.
- [ ] AC-009 — Agent routing is documented: `jules`-labeled tasks dispatch via Jules CLI when available; otherwise fall back to local Claude Code per existing CLAUDE.md convention.
- [ ] AC-010 — Integration branch (`feat/spec-NNN`) and integration PR (to `main`, on spec completion) are documented as the only merge pattern. Direct task PRs to `main` are forbidden.
- [ ] AC-011 — Reviewer output is schema-validated before routing (Tier 1 AND every Tier 2 specialist). Validation checks: envelope shape per SPEC-001 output schema; every finding's `criterion` matches an allowed prefix per SPEC-001 grounding rules (including the Tier 2 inheritance row); `severity` is one of the four ladder values. Validation failure escalates per the failure-trigger table.
- [ ] AC-012 — Tier 2 dispatch in the pseudocode iterates `tier1.tier_2_dispatch_recommended` only — the orchestrator does not re-evaluate file globs (SPEC-001 Appendix B is the reviewer's responsibility to evaluate per SPEC-001 Design > Tier 2 specialists > Dispatch ownership).
- [ ] AC-013 — The orchestrator handles the `escalate` action returned by SPEC-001's severity policy as an explicit pseudocode branch (Appendix B), not as a fall-through. Detection point is in the per-task routing loop.

## Risks & constraints

- **Token cost of wide waves.** A wave with 8 tasks dispatches 8 concurrent executors plus reviewers. Mitigation: telemetry exposes wall-clock; the owner can intervene.
- **Worktree disk/IO cost.** N parallel executors → N worktrees. Mitigation: post-merge cleanup is automatic per existing worktree skill conventions.
- **Fix loop runaway with N tasks × 3 iterations.** Worst case: 5 tasks × 3 fix iterations = 15 fix invocations. Mitigation: the iteration cap is per-task TOTAL (Tier 0 + Tier 1 combined).
- **Cross-skill signal abuse.** A reviewer that raises `task:scope` or `spec:*` findings too liberally would derail execution. Mitigation: these signals must be `blocker`-severity and grounded per SPEC-001. Rate-limiting: no more than one re-plan per task; per-spec amendment counter caps amendments at 2 before escalation.
- **Tier 0 vs Tier 1 race.** If the executor pushes again before Tier 0 finishes, the reviewer might grade a stale state. Mitigation: the orchestrator gates Tier 1 dispatch on a specific commit SHA from Tier 0; if the SHA changes mid-flight, Tier 1 is re-dispatched.
- **Reviewer output failure modes.** Tier 1 or Tier 2 crashes, returns malformed JSON, exceeds context, or returns ungrounded `criterion` values. Mitigation: schema-validation step before routing detects these; failure escalates per the trigger table.
- **Carry-forward invalidation across fix triggers.** A Tier 0 fix substantively changes the diff; the prior Tier 1 review is stale. The pseudocode resets `last_reviewer_output` on Tier 0 fixes for this reason.
- **High-gear has live waves in flight (SPEC-042).** Cut over only on the next spec.
- **Telemetry log as load-bearing.** SPEC-001's success criteria depend on this log being written reliably. Mitigation: append-only JSONL; failures logged separately to stderr but never block the loop.
- **Background agent failure modes.** Executors can crash, hang, or produce no PR. Mitigation: 4-hour wall-clock escalation catches hangs; crashes generate dispatch-failure escalations.

## Migration

### Current state

- Upstream sdlc: no `spec-execution` skill.
- High-gear: 23KB `spec-execution` skill with hard-coded 4-reviewer always-on fan-out and binary verdict routing. Currently driving SPEC-042.

### Target state

- Upstream sdlc has `spec-execution` consuming SPEC-001 contracts (including the `escalate` action and Tier 2 grounding-rules inheritance).
- High-gear adopts the upstream version after baseline capture (per SPEC-001 AC-011); its 4-reviewer fan-out is retired after the side-by-side comparison run from SPEC-001's migration step 6.

### Migration strategy

1. Land SPEC-001 (including its `spec-schema.md` amendment per SPEC-001 AC-013) and its reviewer skills first.
2. Land SPEC-002 (this spec) and the new `spec-execution` skill upstream.
3. In high-gear, do **not** swap mid-flight on SPEC-042. Wait for SPEC-042 to complete under the existing orchestrator.
4. Capture the SPEC-042 baseline (per SPEC-001 AC-011) into `specs/baselines/SPEC-042.md`.
5. On the next active spec in high-gear, dispatch via the new upstream `spec-execution`. Keep the high-gear-local version intact as `spec-execution-legacy/` for one spec so a regression can be diagnosed (this is the side-by-side comparison run from SPEC-001's migration step 6).
6. After two full specs ship under the new orchestrator, delete `spec-execution-legacy/`.
7. Measure SPEC-001 success criteria from the telemetry logs.

### Rollback plan

- The two orchestrators are separate skills in separate paths during the transition. Reverting is a one-line change in the consumer's invocation.
- The telemetry log format is the same shape (the upstream version is a superset), so historical analysis survives the rollback.
- The new orchestrator merges task PRs into `feat/spec-NNN` (same convention as the legacy one), so partial-progress specs are not stranded.

---

## Appendix A — Skill skeleton (draft)

```
---
name: spec-execution
description: Use when an active spec needs to be executed end-to-end — drives the wave-based loop from branch creation through integration PR. Consumes SPEC-001 reviewer contracts.
---

# Spec Execution

## Overview

Execute an active spec end-to-end. Build the wave graph from task dependencies,
dispatch executors in parallel (worktree-isolated), gate review on Tier 0 green
(contents per SPEC-001), dispatch tiered reviewers per SPEC-001, route by
severity (including the escalate action), fix-loop with cap, merge task PRs to
integration branch, invoke spec-completion, open integration PR to main.

This is a rigid skill. Every step must be followed. No shortcuts.

**Announce at start:** "Using spec-execution to drive SPEC-NNN."

## Hard constraints

1. **Worktree isolation.** Any background agent that edits repo files runs with
   isolation: "worktree". This rule exists to prevent a concrete failure mode:
   a background subagent operating in the foreground worktree can stash or
   overwrite uncommitted edits. (High-gear's incident on 2026-04-24 during a
   TASK-023 dispatch is one such case.)

2. **Tier 0 gates review.** No LLM reviewer is dispatched while Tier 0 is red.
   Tier 0 contents are defined in SPEC-001 Design > PR side > Tier 0;
   do not duplicate here.

3. **Severity routing per SPEC-001.** The orchestrator does not invent routing.
   It applies SPEC-001's policy verbatim, including the escalate action.

4. **Fix loop cap = 3 total fix attempts per task** (Tier 0 + Tier 1 combined).
   After exhaustion, escalate.

5. **Integration branch is the only merge target.** Task PRs merge to
   feat/spec-NNN. Direct task PRs to main are forbidden.

6. **Reviewer output schema validation.** Before routing, validate Tier 1 AND
   every Tier 2 specialist output against SPEC-001 grounding rules (including
   the Tier 2 inheritance row). Malformed → escalate, do not route.

7. **Per-spec amendment cap = 2.** The orchestrator persists a per-spec
   amendment counter, increments on spec-amendment hand-off, and escalates
   if exceeded before invoking spec-amendment again.

## Process

### Phase 1 — Initialize
[see SPEC-002 Design > Phase 1]

### Phase 2 — Wave loop
[see SPEC-002 Design > Phase 2 and Appendix B pseudocode]

### Phase 3 — Integration
[see SPEC-002 Design > Phase 3]

## Cross-skill signals
[see SPEC-002 Design > Cross-skill signals]

## Failure escalation
[see SPEC-002 Design > Failure escalation triggers]

## Telemetry
[see SPEC-002 Design > Telemetry schema]
```

## Appendix B — Per-task routing pseudocode

Authoritative orchestrator decision logic for the per-task routing loop. In-loop triggers are visible here; out-of-loop triggers fire in Phase 1 (cycle detection, watchdog, amendment counter init), the dispatch wrapper (Phase 2 step 1), or the cross-skill signal handler (Phase 2 step 2).

```python
def route_task(task, pr, spec):
    fix_count = 0                       # per-task TOTAL across Tier 0 + Tier 1
    last_reviewer_output = None         # carry-forward state
    tier_0_fingerprints = []

    while True:
        tier0 = run_ci(pr, task.workspace)   # contents per SPEC-001 Tier 0
        log("tier_0", outcome=tier0.outcome, duration_ms=tier0.elapsed,
            fingerprint=tier0.fingerprint)

        if not tier0.passed:
            tier_0_fingerprints.append(tier0.fingerprint)
            if tier_0_fingerprints.count(tier0.fingerprint) >= 3:
                escalate(task, "tier_0_same_fingerprint_3x"); return
            fix_count += 1
            if fix_count > 3:
                escalate(task, "fix_loop_exhausted"); return
            log("fix_loop_iteration", iteration=fix_count, trigger="tier_0")
            last_reviewer_output = None  # Tier 0 fix invalidates prior carry-forward
            dispatch_fix_agent(task, pr, tier0_output=tier0.output)
            continue

        tier1 = dispatch_pr_reviewer(task, pr, previous_output=last_reviewer_output)
        log("tier_1", **severity_counts(tier1),
            tier_2_recommended=tier1.tier_2_dispatch_recommended,
            duration_ms=tier1.elapsed)

        if not schema_validate(tier1):  # envelope + citation prefixes per SPEC-001
            escalate(task, "reviewer_contract_violation"); return

        tier2_outputs = []
        for specialist in tier1.tier_2_dispatch_recommended:
            t2 = dispatch_specialist(specialist, task, pr, tier1_output=tier1)
            log("tier_2", specialist=specialist, **severity_counts(t2),
                duration_ms=t2.elapsed)
            if not schema_validate(t2):
                escalate(task, "reviewer_contract_violation"); return
            tier2_outputs.append(t2)

        all_findings = tier1.findings + [f for t2 in tier2_outputs for f in t2.findings]

        # Cross-skill signals on the AGGREGATED set
        # (Tier 2 specialists are authorized to raise these per SPEC-001
        # Grounding rules > Tier 2 PR specialists row)
        if any(f.criterion == "task:scope" for f in all_findings
               if f.severity == "blocker"):
            invoke_task_decomposition_replan(task, findings=all_findings)
            return

        if any(f.criterion.startswith("spec:") for f in all_findings
               if f.severity == "blocker"):
            # Check cap BEFORE incrementing/logging, so an escalated attempt
            # is not counted (which would inflate the log-derived counter on
            # restart). Counter is materialized from the execution log per
            # Phase 1 step 7.
            current = count_log_events(spec, "spec_amendment_dispatched")
            next_count = current + 1
            if next_count > 2:
                escalate(spec, "spec_amendment_cycle_exhausted"); return
            log("spec_amendment_dispatched", amendment_count=next_count)
            invoke_spec_amendment(spec, findings=all_findings)
            return

        action = apply_spec_001_policy(all_findings)
        log("routed", action=action)

        if action == "fix_loop":
            fix_count += 1
            if fix_count > 3:
                escalate(task, "fix_loop_exhausted"); return
            log("fix_loop_iteration", iteration=fix_count, trigger="review")
            last_reviewer_output = tier1  # carry-forward valid; same diff family
            dispatch_fix_agent(task, pr, findings=all_findings, previous_review=tier1)
            continue

        if action == "batch_followup_and_accept":
            append_to_grooming(spec,
                               [f for f in all_findings if f.severity == "nit"])
            merge_task_pr(pr, target=f"feat/{spec.id}")
            log("merged", pr=pr.number); return

        if action == "accept":
            merge_task_pr(pr, target=f"feat/{spec.id}")
            log("merged", pr=pr.number); return

        if action == "escalate":
            # Returned by apply_spec_001_policy when an ungrounded criterion
            # prefix appears at routing time, per SPEC-001 Orchestrator policy
            escalate(task, "policy_escalate"); return
```

The pseudocode is illustrative — the real implementation uses whatever the consumer's runtime supports; the logic is the same.
