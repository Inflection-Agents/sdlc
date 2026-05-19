---
name: spec-execution
description: Use when an active spec needs to be executed end-to-end — drives the wave-based loop from branch creation through integration PR. Consumes SPEC-001 reviewer contracts.
---

# Spec Execution

## Overview

Execute an active spec end-to-end. Build the wave graph from task dependencies,
dispatch executors in parallel (worktree-isolated), gate review on Tier 0 green
(contents per SPEC-001), dispatch tiered reviewers per SPEC-001, route by
severity (including the `escalate` action), fix-loop with cap, then merge task
PRs per the resolved integration strategy: to an integration branch in `branch`
mode (followed by spec-completion and an integration PR to `main`), or directly
to `main` in `direct` mode (followed by spec-completion with no integration PR).

This is a rigid skill. Every step must be followed. No shortcuts.

**Announce at start:** "Using spec-execution to drive SPEC-NNN."

This skill is the operational implementation of SPEC-002. It consumes
SPEC-001's reviewer contracts (Tier 0 gates, tiered reviewer JSON envelope,
severity-spine + grounding-rules + carry-forward primitives, orchestrator
severity→action policy, Tier 2 dispatch rules table) by reference, never by
duplication. SPEC-001 is the source of truth for *what* the reviewers produce
and *how* severity routes to action; SPEC-002 (this skill) is the source of
truth for *when and where* the orchestrator dispatches reviewers, *how* waves
are built, and *how* cross-skill signals are routed.

## Hard constraints

These are non-negotiable. Violating any one of them is a SPEC-002 contract
violation and must be raised as a `blocker` finding by any reviewer of this
skill's behavior.

1. **Worktree isolation.** Any background agent that edits repo files runs
   with `isolation: "worktree"`. This rule exists to prevent a concrete
   failure mode: a background subagent operating in the foreground worktree
   can stash, reset, or overwrite the main session's uncommitted edits.
   High-gear's 2026-04-24 incident during a TASK-023 dispatch is one such
   case — a background subagent ran `git stash` to clear the working tree
   for its own work, which was recoverable via `git stash pop` but could
   have been destructive under a different failure mode (`git reset --hard`,
   force-push to a shared branch, etc.). The generic failure mode for the
   upstream framework: concurrent file mutations from a foreground session
   and a background agent in the same working tree race over the index and
   the working copy with no locking primitive between them. The fix is
   spatial isolation: each background executor gets its own worktree.

   **Exception:** tasks dispatched via the Jules CLI are exempt — Jules
   manages its own remote workspace and does not touch the local repo's
   working tree. Only `claude-code`-dispatched background agents must pass
   `isolation: "worktree"`. The dispatch wrapper checks `task.agent` and
   applies the isolation flag accordingly (see Phase 2 step 1).

2. **Tier 0 gates review.** No LLM reviewer is dispatched while Tier 0 is
   red. Tier 0 → Tier 1 → Tier 2 sequencing is mandatory and there is no
   override. This is the single largest token-cost optimization in the
   design: a PR with red CI is sent to a fix agent, not to a reviewer, until
   CI is green. Tier 0 contents (the specific mechanical gates: lint,
   typecheck, unit tests for the declared workspace, AC table present with
   `evidence:` fields populated, PR touches exactly one workspace, diff size
   logged for Tier 2 dispatch rules) are defined in SPEC-001 Design > PR
   side > Tier 0 — mechanical gates. **Do not duplicate them here.** Drift
   between this skill's Tier 0 description and SPEC-001's is a SPEC-001
   contract violation by the duplicator.

3. **Severity routing per SPEC-001.** The orchestrator does not invent
   routing. It applies SPEC-001's severity→action policy verbatim, including
   the `escalate` action. The policy lives in SPEC-001 Design > Orchestrator
   severity→action policy and is mirrored in
   `.ai/skills/review-primitives.md` for runtime load. The orchestrator
   reads the policy result and dispatches the named action; it does not
   re-grade findings, it does not invent severities, it does not collapse
   multiple actions into one. The four valid actions are `fix_loop`,
   `batch_followup_and_accept`, `accept`, and `escalate` — each is handled
   as an explicit pseudocode branch in Appendix B (no fall-through). See
   Appendix B for the per-task routing pseudocode that implements this.

4. **Fix loop cap = 3 total fix attempts per task** (Tier 0 + Tier 1
   combined). The fix counter is a single shared integer per task,
   incremented on every dispatched fix agent regardless of whether the
   fix was triggered by a Tier 0 failure or by a `fix_loop` action returned
   from the severity policy. After the counter exceeds 3, the orchestrator
   does not dispatch another fix agent — it escalates with reason
   `fix_loop_exhausted`. This cap protects against runaway loops where the
   reviewer keeps finding new issues in fixes that introduce new defects;
   after three attempts, the situation requires human design judgment, not
   another mechanical fix.

5. **Merge target is determined by the resolved integration strategy.** In
   `branch` mode: task PRs merge to `feat/spec-NNN`; the integration PR
   (`feat/spec-NNN` → `main`) is opened once in Phase 3 after
   `spec-completion` has run. In `direct` mode: task PRs merge to `main`
   directly and no integration PR is created. Unauthorized target deviations
   — a task PR targeting `main` in `branch` mode, or targeting a feature
   branch in `direct` mode — are refused by the orchestrator (the strategy
   is resolved in Phase 1 step 1a before any executor is dispatched, so the
   rule is always known at merge time). The resolved `integration_strategy`
   (Phase 1 step 1a) determines which rule applies.

6. **Reviewer output schema validation.** Before routing on any reviewer
   output, validate the output against the SPEC-001 contract. Validation
   applies to **Tier 1 (`pr-reviewer`) AND every Tier 2 specialist output**
   — there are no exceptions. The validation checks:
   - **Envelope shape** per the JSON output schema in
     `.ai/skills/review-primitives.md` (and SPEC-001 Design > Output
     schema): correct top-level fields, correct types, populated
     `verification` for PR-side outputs, `tier: 1` or `tier: 2` per the
     reviewer role.
   - **Citation prefixes:** every finding's `criterion` field starts with
     a prefix allowed by SPEC-001 Design > Grounding rules for that
     reviewer role. Tier 2 specialists inherit the `pr-reviewer` prefixes
     verbatim per the Grounding rules table; Tier 2 may not invent new
     prefixes.
   - **Severity values:** every finding's `severity` is one of
     `blocker | major | nit | suggestion` — the four ladder values
     defined in SPEC-001 Design > Shared primitives > Severity spine
     (mirrored in `review-primitives.md`).

   Malformed output (any of the three checks fails) → escalate with
   reason `reviewer_contract_violation`. Do not route on malformed output;
   the per-task routing loop returns immediately.

7. **Per-spec amendment cap = 2.** The orchestrator caps the number of
   times `spec-amendment` is invoked for a single spec at 2. The counter
   is **materialized from the execution log** on every orchestrator entry
   (fresh start OR resume after restart) — it is not stored in a
   frontmatter field or sidecar file. The counter is reconstructed as
   `count of "spec_amendment_dispatched" events in
   specs/tasks/SPEC-NNN/_execution.log.jsonl`. This makes the counter
   restart-safe by construction. The cap is checked at the entry of the
   spec-amendment hand-off in Phase 2 (cross-skill signal handler);
   "incrementing" the counter means logging a new
   `spec_amendment_dispatched` event. If the next count would exceed 2,
   the orchestrator escalates with reason `spec_amendment_cycle_exhausted`
   **before** logging or invoking `spec-amendment` — so an escalated
   attempt is not counted, which would otherwise inflate the log-derived
   counter on restart. See Appendix B for the check-then-increment
   pseudocode.

## Process

### Phase 1 — Initialize

Phase 1 runs once per spec execution. The eight steps must run in order.

1. **Verify spec is `status: active`.** Read the spec frontmatter; refuse
   to start if `status != "active"`. A spec in `draft` is not ready for
   decomposition; a spec in `done` does not need re-execution; a spec in
   `archived` is closed. Only `active` specs are dispatchable.

1a. **Resolve integration strategy.** Immediately after verifying the spec
    is active, determine whether this execution uses a `branch` or `direct`
    integration strategy. This step produces the `integration_strategy` and
    `integration_strategy_source` values that govern Phase 2 target routing
    and Phase 3 flow selection.

    **AC-009 sidecar check (before resolution).** Before invoking the
    resolver, check for a sidecar file at
    `specs/tasks/SPEC-NNN/_expected_strategy`. If the file exists, read its
    single-line content, strip leading/trailing whitespace (including
    trailing newlines from editor-created files), and store as
    `expected_strategy` (`branch` or `direct`). Do NOT delete the sidecar
    yet — deletion happens after the comparison is recorded (see below).

    **Resolution algorithm (canonical source):**

    ```python
    def resolve_integration_strategy(spec):
        # 0. Guard: reject unrecognized values before they silently fall to heuristic.
        raw = spec.frontmatter.get("integration_strategy")
        if raw is not None and raw not in ("branch", "direct"):
            escalate(spec, "invalid_frontmatter_field")
            return  # execution halts; no telemetry event emitted

        # 1. Explicit field wins.
        if raw in ("branch", "direct"):
            return raw, "explicit"

        # 2. Heuristic fallback.
        task_count = len(spec.tasks)
        workspaces = spec.frontmatter.get("workspaces") or []
        tags = spec.frontmatter.get("tags") or []
        cross_workspace_blocks = any_cross_workspace_blocks(spec.tasks)

        if ("breaking" in tags
            or len(workspaces) > 1
            or task_count >= 5
            or cross_workspace_blocks):
            return "branch", "heuristic"
        return "direct", "heuristic"

    def any_cross_workspace_blocks(tasks):
        """True iff some task T has a non-empty blocks entry pointing at task U
        such that T.workspace != U.workspace AND both fields are non-empty.
        If either workspace is missing on T or U, that pair does NOT count."""
        by_id = {t.id: t for t in tasks}
        for t in tasks:
            if not t.workspace:
                continue
            for u_id in (t.blocks or []):
                u = by_id.get(u_id)
                if u and u.workspace and u.workspace != t.workspace:
                    return True
        return False
    ```

    **Why these signals:**
    - `breaking` tag → explicit author signal that partial deploy would harm
      consumers.
    - `len(workspaces) > 1` → multi-workspace spec needs coordinated landing.
    - `task_count >= 5` → bookkeeping overhead of a feature branch amortizes
      when there are ≥5 PRs.
    - `cross_workspace_blocks` → producer-consumer contract crosses workspaces;
      verify the contract in one place before merging to main.

    **Worked examples (4+1 cases):**

    - **Case A — `breaking` tag → `branch` (heuristic).**
      Spec: `tags: [breaking, auth-refactor]`, 3 tasks, 1 workspace, no
      cross-workspace blocks. Signal: `"breaking" in tags`. Resolved:
      `strategy="branch"`, `source="heuristic"`.

    - **Case B — multi-workspace → `branch` (heuristic).**
      Spec: `tags: []`, 2 tasks, `workspaces: [api, web]`, no cross-workspace
      blocks. Signal: `len(workspaces) > 1`. Resolved:
      `strategy="branch"`, `source="heuristic"`.

    - **Case C — 5+ tasks → `branch` (heuristic).**
      Spec: `tags: []`, 6 tasks, 1 workspace, no cross-workspace blocks.
      Signal: `task_count >= 5`. Resolved:
      `strategy="branch"`, `source="heuristic"`.

    - **Case D — cross-workspace blocks → `branch` (heuristic).**
      Spec: `tags: []`, 4 tasks, 2 workspaces. TASK-A (`workspace: api`)
      blocks TASK-B (`workspace: web`). Signal: `cross_workspace_blocks=True`.
      Resolved: `strategy="branch"`, `source="heuristic"`.

    - **Case E — none of the above → `direct` (heuristic).**
      Spec: `tags: [docs-update]`, 2 tasks, 1 workspace, no cross-workspace
      blocks. All four signals false. Resolved:
      `strategy="direct"`, `source="heuristic"`.

    **Emit `integration_strategy_resolved` telemetry event** immediately after
    resolution, before any branch creation (see Telemetry below for the
    full field schema).

    **AC-009 sidecar comparison (after resolution).** If `expected_strategy`
    was read from the sidecar: compare it to the resolved `strategy`. Record
    the result (match/mismatch + both values) to the spec-completion
    deferred-verifications table per SPEC-004 Design > 3, with:
    - Owner: spec owner
    - Trigger: first spec executed under updated orchestrator
    - Method: read sidecar → read `integration_strategy_resolved.strategy`
      from `_execution.log.jsonl` → compare

    After recording the comparison, delete the sidecar in a follow-up commit
    on the spec's integration branch (or `main` in direct mode). The sidecar
    is outside `spec-schema.md`'s frontmatter validation surface and requires
    no schema change.

2. **Create integration branch (branch mode only).** If
   `integration_strategy == "branch"`: create `feat/spec-NNN` off `main`
   and push the branch to the remote so task PRs can target it.
   If `integration_strategy == "direct"`: skip this step — no integration
   branch is created; task PRs target `main` directly.

3. **Build the wave graph.** Topologically sort tasks by their
   `depends_on` / `blocks` frontmatter. Assign each task a **wave integer**
   per the formula:

   ```
   wave(task) = max(wave(d) for d in task.depends_on) + 1,
                or 0 for tasks with no depends_on.
   ```

   This integer is stable across the entire run and is the value logged
   in the `dispatched` telemetry event (see Telemetry below). The wave
   integer is informational — task dispatch is **dynamic**, driven by
   `depends_on` satisfaction (Phase 2), not stepped by wave integer. The
   wave integer enables retrospective analysis (which tasks ran in the
   same logical wave) without constraining runtime.

4. **Detect cycles.** If the topological sort encounters a cycle in the
   task graph, escalate immediately with reason `task_graph_cycle`. A
   cycle is a `task-decomposition` defect — the orchestrator cannot
   recover. **Detection point: wave-graph builder, out of the per-task
   routing loop.**

5. **Initialize telemetry log.** Create
   `specs/tasks/SPEC-NNN/_execution.log.jsonl` (touch the file if
   absent; do not truncate if it exists — appends only, JSONL is
   restart-safe by construction). All subsequent telemetry events append
   to this file. See Telemetry below for the event schema.

6. **Start the wall-clock watchdog.** Spawn a separate thread or process
   that polls every running task's wall-clock and escalates any task
   exceeding **4 hours** of wall-time. The watchdog runs independently of
   the per-task routing loop and writes an `escalated` event with reason
   `wall_clock_4h` when it fires. **Detection point: watchdog, out of the
   per-task routing loop.** Hangs (executor not making progress; reviewer
   not returning) are the failure mode the watchdog catches that the
   per-task loop cannot.

7. **Initialize the per-spec amendment counter.** Set
   `spec_amendment_count = count_log_events(spec, "spec_amendment_dispatched")`.
   On a fresh start this is `0`; on a resume after restart this is the
   number of `spec_amendment_dispatched` events already in the execution
   log. The counter is **log-derived**, not stored in a frontmatter field
   or sidecar — this makes it restart-safe without requiring a new schema
   field. The counter is checked against the cap (>2) at the entry of the
   spec-amendment hand-off in Phase 2 (step 2). Incrementing the counter
   means logging a new `spec_amendment_dispatched` event; the log is the
   counter's only source of truth. **Detection point: cross-skill signal
   handler in Phase 2, with state derived from the telemetry log.**

### Phase 2 — Wave loop

Phase 2 runs until all tasks are terminal (`done` or `cancelled`). Tasks
are dispatched dynamically: any task whose `depends_on` are all `done` is
eligible for immediate dispatch. The wave integer from Phase 1 step 3 is
recorded but does not gate dispatch.

**`target_branch` variable.** The resolved integration strategy from Phase
1 step 1a determines where task PRs are merged:

```python
if integration_strategy == "branch":
    target_branch = "feat/" + spec.id   # e.g. "feat/SPEC-099"
else:  # integration_strategy == "direct"
    target_branch = "main"
```

Every `merge_task_pr` call in the per-task routing loop uses
`target=target_branch` (see Appendix B). This is the canonical identifier —
prose and pseudocode use this name; there is no synonym.

For each eligible task:

#### 1. Dispatch executor

- **Agent routing.** Read `task.agent`. Two cases:
  - **`task.agent == "jules"`** AND Jules CLI is available
    (`command -v jules` succeeds OR `JULES_API_KEY` is set per
    `.ai/CLAUDE.md`) → dispatch via Jules CLI (or the REST API
    fallback documented in `.ai/CLAUDE.md` > Jules orchestration).
    Jules manages its own remote workspace; the
    `isolation: "worktree"` flag is NOT passed (Jules does not touch
    the local working tree). The `worktree` field in the `dispatched`
    telemetry event is `null` for Jules dispatches.
  - **`task.agent == "claude-code"`** OR Jules is unavailable → dispatch
    as a background Claude Code subagent. **`isolation: "worktree"`
    is MANDATORY** per Hard constraint 1. The `worktree` field in the
    `dispatched` telemetry event is the worktree path returned by the
    Agent tool. This is the fallback path also when a `jules`-labeled
    task lands but Jules is unavailable, per the existing CLAUDE.md
    fallback rule.

- **Inputs to the executor.** Every executor receives:
  - Task file path (`specs/tasks/SPEC-NNN/TASK-NNN-*.md`)
  - Spec file path (`specs/SPEC-NNN-*.md`)
  - Applicable ADR paths (read from the spec's `Design > Inputs` section
    and the task's `depends_on:` references)
  - Applicable domain skill names (read from `.ai/project.md` per the
    workspace declared in the task's frontmatter)
  - Target branch (`target_branch` from Phase 2 preamble above) — task
    PRs MUST target this branch. In `branch` mode this is `feat/spec-NNN`;
    in `direct` mode this is `main`.

- **Log the dispatch.** Append a `dispatched` telemetry event including
  the static `wave` integer from Phase 1 step 3, the `agent` value, and
  the worktree path (or `null` for Jules).

- **On dispatch failure** — worktree creation fails, executor crashes
  before opening a PR, Jules dispatch returns an error before producing
  a session — **escalate with reason `dispatch_failed`** on the first
  failure. **Detection point: dispatch wrapper, out of the per-task
  routing loop.** This is an infrastructure problem; re-dispatching
  without intervention will fail again.

#### 2. Per-task routing loop

The per-task routing loop runs concurrently per dispatched task. The
loop's authoritative implementation is in **Appendix B (per-task routing
pseudocode)** below — every decision, every counter, every escalation
branch is defined there. The prose below is a summary; on any
discrepancy, **Appendix B is canonical**.

ASCII flow:

```
executor produces PR against target_branch (feat/spec-NNN in branch mode; main in direct mode)
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

Prose summary of the per-task lifecycle:

- The executor produces a PR against `target_branch` (`feat/spec-NNN` in
  `branch` mode; `main` in `direct` mode). The orchestrator watches for
  the PR open event (or polls the executor's status until a PR exists).
- **Tier 0 runs first** — CI mechanical gates per SPEC-001. On red, a
  fix agent is dispatched, the **shared** fix counter (across Tier 0
  and Tier 1) is incremented, and `last_reviewer_output` is reset to
  `None` because a Tier 0 fix substantively changes the diff and any
  prior Tier 1 review is stale (carry-forward is no longer safe). The
  loop restarts at Tier 0. If the same Tier 0 failure fingerprint
  (hash of the first 500 characters of the failure output) appears
  three times consecutively, escalate with reason
  `tier_0_same_fingerprint_3x`.
- **On Tier 0 green**, dispatch Tier 1 (`pr-reviewer`) with
  `previous_output=last_reviewer_output`. Schema-validate the output
  per Hard constraint 6. On malformed output, escalate with reason
  `reviewer_contract_violation`.
- **Dispatch Tier 2 specialists.** The orchestrator iterates
  `tier1.tier_2_dispatch_recommended` **only** — the orchestrator does
  not re-evaluate file globs. File-glob evaluation is the reviewer's
  responsibility per SPEC-001 Design > Tier 2 specialists > Dispatch
  ownership; SPEC-001 Appendix B (the Tier 2 dispatch rules table) is
  the source of truth for *which* specialist matches *which* condition,
  and only the `pr-reviewer` skill evaluates that table. The
  orchestrator dispatches the named specialists in parallel and
  schema-validates each one's output (per Hard constraint 6).
- **Aggregate** Tier 1 + Tier 2 findings into one list.
- **Detect cross-skill signals on the aggregated set** (see Cross-skill
  signals below). Both signal types are detected on the aggregated
  finding set (not Tier 1 alone), so a Tier 2 specialist that surfaces
  the signal first still triggers the hand-off. SPEC-001 Design >
  Grounding rules > Tier 2 PR specialists row explicitly grants Tier 2
  specialists the `pr-reviewer` citation prefixes (including
  `task:scope` and the `spec:*` prefixes); this grant is the
  **enabling condition** for aggregated-set signal detection.
- **Apply the SPEC-001 severity policy** on the remaining findings
  (those not consumed by cross-skill hand-offs). The policy returns one
  of `fix_loop | batch_followup_and_accept | accept | escalate`. The
  policy is defined in SPEC-001 Design > Orchestrator severity→action
  policy and mirrored in `.ai/skills/review-primitives.md` (Orchestrator
  severity→action policy section). **Do not duplicate the policy
  pseudocode here.** The orchestrator dispatches the named action; each
  action is an explicit pseudocode branch in Appendix B below (no
  fall-through).

#### 3. Mark task `done`

When a task PR merges to `target_branch` via the `accept` or
`batch_followup_and_accept` action, the task is marked `done` in
`specs/tasks/SPEC-NNN/_index.yaml`. Re-evaluate eligible tasks; any task
whose `depends_on` are now all `done` becomes eligible for immediate
dispatch.

#### 4. Continue

Loop until all tasks are terminal (`done` or `cancelled`). Then proceed
to Phase 3.

### Phase 3 — Integration

Phase 3 behavior is conditional on the `integration_strategy` resolved in
Phase 1 step 1a. The trigger ("all tasks terminal") is the same in both
modes; only the post-trigger actions differ.

#### Branch mode (existing behavior)

1. **Open integration PR.** When all tasks are terminal, open the
   integration PR: `feat/spec-NNN → main`. The PR description summarizes
   the spec, lists the merged task PRs in dependency order, and links
   the execution log.

2. **Invoke `spec-completion`.** Hand off to the `spec-completion` skill,
   which verifies the spec's acceptance criteria are met end-to-end and
   moves the spec to `status: done` (or back to `active` with follow-up
   tasks if completion verification fails). `spec-completion` runs only if
   at least one task is `done`; if all tasks are `cancelled`, skip
   `spec-completion` and proceed directly to archiving.

3. **Archive the execution log.** On integration PR merge, archive
   `specs/tasks/SPEC-NNN/_execution.log.jsonl` alongside the spec for
   later metric extraction (per SPEC-001 success criteria measurement).

#### Direct mode (new behavior)

1. **Detect all-tasks-terminal.** When all tasks reach a terminal state
   (`done` or `cancelled`) — the same trigger Phase 2 step 4 already
   defines — the orchestrator enters the direct-mode completion flow.

2. **Conditional `spec-completion`.** Check task outcomes:
   - If **at least one task is `done`**: invoke `spec-completion` against
     the current `main` HEAD as the comparison baseline (no integration PR
     exists). `spec-completion` verifies the spec's acceptance criteria
     end-to-end and returns `accept` or re-opens with follow-up tasks.
   - If **all tasks are `cancelled`**: skip `spec-completion` entirely,
     mirroring `branch` mode's all-cancelled behavior — no integration PR
     to open, no completion verification to run.

3. **Archive the execution log.** After `spec-completion` returns `accept`
   (or owner sign-off) — or after skipping in the all-cancelled case —
   append a sentinel comment line to `specs/tasks/SPEC-NNN/_execution.log.jsonl`:

   ```
   # spec_completed: <iso8601>
   ```

   Lines starting with `#` are JSONL convention for human-readable markers;
   JSONL parsers ignore them. This sentinel is NOT a new telemetry event —
   the live telemetry schema stays at 10 event types. No integration PR
   merge event is available in direct mode; the sentinel comment is the
   archive trigger.

#### Rollback semantics

In-flight orchestrator processes (those dispatched before a revert of this
skill to its pre-SPEC-005 state) are **unaffected by the revert** — they
hold the pre-revert skill version in memory and continue under it until
their wave loop terminates naturally. The revert only affects orchestrator
processes started after the revert lands.

For in-flight specs executing in `direct` mode at revert time: their task
PRs continue merging to `main` until all tasks reach terminal state under
the pre-revert behavior they were dispatched with.

Newly-started orchestrator processes (post-revert) that encounter a spec
with `integration_strategy: direct` in frontmatter will fail at Phase 1
step 1a with an unrecognized-field error — because the reverted skill does
not recognize the `integration_strategy` frontmatter field. The recovery
path requires two actions:

1. Simultaneously revert `spec-schema.md` to strip the field declaration,
   so future spec drafts do not include it.
2. For each existing spec file that already carries `integration_strategy:`
   in its frontmatter, remove that field in a follow-up commit before
   starting a new orchestrator for that spec. Locate affected specs with:
   `grep -rl "^integration_strategy:" specs/`

The worked example log fixture
(`.ai/skills/spec-execution/examples/example-execution.log.jsonl`) is also
reverted (the `integration_strategy_resolved` event removed) so it stays
consistent with the reverted schema.

## Cross-skill signals

The orchestrator routes signals; it does not decide policy. Two signal
types are recognized, both detected on the **aggregated** Tier 1 + Tier 2
finding set (not Tier 1 alone). SPEC-001 Design > Grounding rules > Tier 2
PR specialists row grants Tier 2 specialists the `pr-reviewer` citation
prefixes verbatim — this grant is the enabling condition that lets a Tier
2 specialist surface a `task:scope` or `spec:*` blocker and have the
orchestrator route it the same way it would route the same finding from
Tier 1. Without that authorization, the aggregated-set detection would be
unsound (a specialist's `task:scope` finding would not be a contract-valid
citation).

- **Re-plan signal.** Any aggregated finding with `severity: blocker` AND
  `criterion == "task:scope"`. The orchestrator pauses the task, invokes
  `task-decomposition` in re-plan mode (passing the aggregated findings
  as context), and returns from the per-task routing loop. After
  `task-decomposition` produces revised task files, the orchestrator
  resumes — the revised task is re-dispatched as a fresh executor run.

- **Spec-amendment signal.** Any aggregated finding with
  `severity: blocker` AND `criterion` starting with `"spec:"` — one of:
  - `spec:ambiguous-ac`
  - `spec:contradictory-ac`
  - `spec:wrong-design`
  - `spec:missing-section`

  These four prefixes are taken verbatim from SPEC-001 Design > Grounding
  rules (the `pr-reviewer` row) and the `pr-reviewer` skill's prompt. Any
  prefix outside this set that starts with `spec:` is a contract
  violation and routes to `escalate` via the severity policy guard, not
  via this branch.

  On detection, the orchestrator derives the current
  `spec_amendment_count` from the execution log (per Phase 1 step 7),
  checks `(current + 1) > 2` against the cap; if exceeded, escalates
  **without logging or invoking** `spec-amendment`. Otherwise it logs a
  new `spec_amendment_dispatched` event (which is what "incrementing"
  means here — there is no in-memory counter to update) and invokes
  `spec-amendment`, which re-invokes `spec-reviewer` per SPEC-001.
  Execution resumes after the amendment is approved. Returns from the
  per-task routing loop.

## Failure escalation

Every escalation writes a structured `escalated` telemetry event to the
execution log and notifies the spec owner. The nine triggers below
cover the full envelope of orchestrator failure modes:

| Trigger | Detected where | Notes |
|---|---|---|
| `integration_strategy` frontmatter field present with unrecognized value (not `branch`, `direct`, or absent) | Phase 1 step 1a, before heuristic fallback | Prevents silent degradation to heuristic when author typos a value |
| Fix-loop counter > 3 for any task | Per-task routing loop (Appendix B) | Per-task TOTAL — Tier 0 and Tier 1 fixes share the counter |
| Tier 0 fails 3 times with the same error fingerprint | Per-task routing loop (Appendix B) | Fingerprint = hash of first 500 chars of failure output |
| Tier 1 or Tier 2 returns malformed JSON or ungrounded findings | Per-task routing loop, schema-validation step | SPEC-001 contract violation |
| Severity policy returns `escalate` (unrecognized criterion prefix at routing time) | Per-task routing loop (Appendix B) | Per SPEC-001 Orchestrator policy; pseudocode handles the action explicitly |
| Task dispatch fails (worktree creation, executor crash before PR) | Dispatch wrapper, Phase 2 step 1 | Infra problem; escalates on first failure |
| Dependency cycle detected at wave-graph build | Wave-graph builder, Phase 1 step 4 | `task-decomposition` defect |
| Spec amendment cycle (counter > 2) | Cross-skill signal handler, Phase 2 step 2; counter initialized Phase 1 step 7 | Spec is unstable; needs human design pass |
| Wall-clock per task > 4 hours | Watchdog, Phase 1 step 6 | Likely stuck |

The "Detected where" column anchors each trigger to a concrete Phase /
step. Triggers fired inside the per-task routing loop are visible in
Appendix B pseudocode. Triggers fired outside that loop (wave-graph
build, dispatch wrapper, cross-skill signal handler, watchdog) fire at
the Phase / step named in the column.

## Telemetry

Per-task events are appended to
`specs/tasks/SPEC-NNN/_execution.log.jsonl`. The file is JSONL — one
event per line, append-only, restart-safe by construction. Two events are
**per-spec** (not per-task): `integration_strategy_resolved` (fired once
at Phase 1 step 1a, before any task dispatch) and
`spec_amendment_dispatched` (fired at the amendment hand-off).

The live telemetry schema has **10 event types** (SPEC-002's body documents
9; SPEC-005 added the 10th via the "extend live artifacts" pattern):

```json
{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "integration_strategy_resolved", "strategy": "branch|direct", "source": "explicit|heuristic", "signals": {"breaking_tag": <bool>, "workspace_count": <int>, "task_count": <int>, "cross_workspace_blocks": <bool>}}
{"ts": "<iso8601>", "task": "TASK-NNN", "wave": <int>, "event": "dispatched", "agent": "claude-code|jules", "worktree": "<path>|null"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_0", "outcome": "pass|fail", "commands": [...], "duration_ms": <int>, "fingerprint": "<hash>"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_1", "blockers": <int>, "majors": <int>, "nits": <int>, "suggestions": <int>, "tier_2_recommended": [...], "duration_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "tier_2", "specialist": "cross_spec|...", "blockers": <int>, "majors": <int>, "nits": <int>, "duration_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "fix_loop_iteration", "iteration": <int>, "trigger": "tier_0|review"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "routed", "action": "fix_loop|batch_followup_and_accept|accept|escalate"}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "merged", "pr": <int>, "total_wall_ms": <int>}
{"ts": "<iso8601>", "task": "TASK-NNN", "event": "escalated", "reason": "<trigger>"}
{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "spec_amendment_dispatched", "amendment_count": <int>}
```

Note: there is no `spec_completed` event. In `direct` mode, the archive
sentinel is a JSONL comment line (`# spec_completed: <iso8601>`) appended
to the log, not a structured event. This keeps the live schema at exactly
10 event types.

Field notes:

- `worktree` is the worktree path returned by the Agent tool for
  Claude Code dispatches; it is `null` (or omitted) when `agent: jules`
  because Jules manages its own workspace.
- `fingerprint` (Tier 0) is the hash of the first 500 characters of the
  failure output; used by the per-task loop to detect the
  same-fingerprint-3x escalation.
- `tier_2_recommended` (Tier 1) is the list of specialist names the
  reviewer returned in `tier_2_dispatch_recommended`. The orchestrator
  iterates this list (per AC-012 / Hard constraint and Appendix B); the
  list is the source of truth, not a re-evaluation of file globs.
- `trigger` (fix_loop_iteration) is `"tier_0"` when the fix was
  triggered by a Tier 0 failure and `"review"` when the fix was
  triggered by a `fix_loop` action from the severity policy. Both share
  the same counter (Hard constraint 4); the field distinguishes the
  cause for retrospective analysis.
- `amendment_count` (spec_amendment_dispatched) is the
  post-increment value — i.e., the count that will be visible to a
  subsequent log re-derivation. The counter is materialized from the
  log on every orchestrator entry per Phase 1 step 7, so this field's
  value is also the count of `spec_amendment_dispatched` events in the
  log after this event is appended.
- `strategy` (integration_strategy_resolved) is `"branch"` or `"direct"` —
  the resolved strategy that governs Phase 2 and Phase 3 behavior.
- `source` (integration_strategy_resolved) is `"explicit"` when the
  `integration_strategy` frontmatter field was set, or `"heuristic"` when
  the resolver fell through to the heuristic.
- `signals` (integration_strategy_resolved) records the four heuristic
  signal inputs evaluated during resolution — useful for auditing why the
  heuristic chose as it did. `breaking_tag` and `cross_workspace_blocks`
  are booleans; `workspace_count` and `task_count` are integers
  representing raw counts that the heuristic threshold-tests. `workspace_count`
  is `len(spec.frontmatter.get("workspaces") or [])` — the count of workspace
  names in the spec-level frontmatter array, not the count of unique workspace
  values across task files. All four are populated regardless of `source`;
  in the `explicit` path they describe the spec's state even though they
  did not drive the decision.

## References to SPEC-001

The following contracts are inherited from SPEC-001 by reference — they
are NOT duplicated here, and any change to them is made on SPEC-001 via
`spec-amendment`, not here:

- **Tier 0 contents** (the specific mechanical gates) — SPEC-001 Design
  > PR side > Tier 0 — mechanical gates. This skill cites Tier 0 by
  inclusion; do not duplicate the gate list.
- **Severity spine and consequence catalogs** (PR-side and spec-side)
  — SPEC-001 Design > Shared primitives > Severity spine, PR-side
  consequence catalog, Spec-side consequence catalog. Mirrored at
  runtime in `.ai/skills/review-primitives.md`.
- **Grounding rules** (allowed citation prefixes per reviewer role,
  including the Tier 2 PR specialists' inheritance of `pr-reviewer`
  prefixes) — SPEC-001 Design > Grounding rules. Mirrored at runtime
  in `.ai/skills/review-primitives.md`. The Tier 2 inheritance row is
  the enabling condition for the cross-skill signal detection on the
  aggregated finding set (Cross-skill signals section above).
- **Output schema** (the shared JSON envelope) — SPEC-001 Design >
  Output schema. Mirrored at runtime in `.ai/skills/review-primitives.md`.
- **Carry-forward contract** — SPEC-001 Design > Carry-forward across
  iterations. Mirrored at runtime in `.ai/skills/review-primitives.md`.
- **Severity→action policy** (including the `escalate` action) —
  SPEC-001 Design > Orchestrator severity→action policy. Mirrored at
  runtime in `.ai/skills/review-primitives.md`. The orchestrator reads
  the policy result and dispatches the named action; Appendix B below
  handles each action as an explicit pseudocode branch (no fall-through),
  including `escalate`.
- **Tier 2 dispatch rules table** — SPEC-001 Appendix B (and the
  `pr-reviewer/SKILL.md` mirror at runtime). The orchestrator does NOT
  evaluate this table — the `pr-reviewer` skill evaluates it against
  the task file and the diff and populates
  `tier_2_dispatch_recommended`; the orchestrator iterates that list
  only.

## Appendix B — Per-task routing pseudocode

Authoritative orchestrator decision logic for the per-task routing loop.
In-loop triggers are visible here; out-of-loop triggers fire in Phase 1
(cycle detection, watchdog, amendment counter init), the dispatch wrapper
(Phase 2 step 1), or the cross-skill signal handler (Phase 2 step 2).

```python
def route_task(task, pr, spec, target_branch):
    # target_branch is resolved in Phase 2 preamble:
    #   "feat/" + spec.id  (branch mode)  OR  "main"  (direct mode)
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
            merge_task_pr(pr, target=target_branch)
            log("merged", pr=pr.number); return

        if action == "accept":
            merge_task_pr(pr, target=target_branch)
            log("merged", pr=pr.number); return

        if action == "escalate":
            # Returned by apply_spec_001_policy when an ungrounded criterion
            # prefix appears at routing time, per SPEC-001 Orchestrator policy
            escalate(task, "policy_escalate"); return
```

The pseudocode is illustrative — the real implementation uses whatever
the consumer's runtime supports; the logic is the same.
