---
name: spec-execution
description: Use when an active, decomposed spec needs to be executed end-to-end — drives the deterministic wave-based loop from branch creation through the integration PR. The autonomous half of the SDLC.
---

# Spec Execution

## Overview

Execute an active spec end-to-end, **deterministically and autonomously**. This is the back half
of the SDLC — once the judgment phases (intent-triage → spec-authoring → task-decomposition) have
produced a signed-off spec and an AI-coherent task graph, execution requires no further human
attention until the final integration PR.

The loop: build the wave graph from task dependencies → dispatch executors in parallel
(worktree-isolated) → gate review on a green Tier-0 → dispatch routed multi-lens reviewers →
fix-loop with a hard cap → merge each accepted task into the integration branch → run the expensive
integration verification (captured as EVIDENCE) → open the integration PR. **A human merges to
main; the engine never does.**

**This is a rigid skill.** Every step must be followed. No shortcuts.

**Announce at start:** "Using spec-execution to drive SPEC-NNN."

### Reference implementation: the deterministic Workflow script

This skill is operationally implemented by a **reference Workflow script** at
`.claude/workflows/execute-spec.js`. On the Claude Code runtime, run it directly:

```
Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })
```

On any other runtime, follow the algorithm below by hand — the logic is identical. The script is the
canonical encoding; this document is the canonical explanation. On any discrepancy, the script's
pure-core functions win for *routing/verdict/branch/wave* logic; this document wins for *intent*.

### Determinism principles (why this is a script, not a vibe)

1. **Pure-core / effects-at-the-edges.** Routing (`routingOf`), tier resolution (`tier`), lens
   selection (`lensesFor`), verdict folding (`gate`), branch naming (`branchFor`), and wave
   planning (`buildWaves`) are **total functions** — no agents, no I/O, unit-testable. Only the
   thin `agent()` wrappers touch the model. This is what makes the run reproducible and auditable.
2. **Idempotent, id-derived branches.** A task's branch is a pure function of its id
   (`claude/SPEC-NNN-TASK-NNN`). A re-run reuses the SAME branch and PR — it updates, never
   duplicates. The integration branch is `feat/SPEC-NNN`.
3. **Wave-level resume.** A task is `done` once its branch is merged into the integration branch
   and its `_index.yaml` status is committed (together, per branch). A stopped run resumes by
   re-invoking with the same `spec`: `done` tasks are skipped, unfinished tasks reuse their
   deterministic branch. Merge + status + push happen per-branch so a crash leaves a consistent
   index a restart can reconcile.
4. **Typed contracts at every handoff.** Every `agent()` call that returns data validates against a
   schema (EXEC_RESULT, ENVELOPE, EVIDENCE, PLAN, MERGE_RESULT). A malformed contract escalates;
   it never routes on garbage.

## Hard constraints

Non-negotiable. Violating any one is a contract violation and must be raised as a `blocker` by any
reviewer of this skill's behavior.

1. **Worktree isolation.** Every background executor runs with `isolation: "worktree"`. Concurrent
   file mutations from a foreground session and a background agent in one working tree race over the
   index and working copy with no locking primitive. The fix is spatial isolation: each background
   executor gets its own worktree. There is one local executor and worktree isolation applies to all
   executors — no exceptions.

2. **Tier-0 gates review.** No LLM reviewer is dispatched while Tier-0 (the cheap, attributable
   per-task gate: lint, typecheck, unit tests for the task's workspace) is red. A red PR is sent to
   a fix agent, not a reviewer, until Tier-0 is green. This is the single largest token-cost
   optimization in the design. Tier-0 commands are workspace data (`WORKSPACES[ws].tier0`).

3. **Bounded `touches`.** A task with no declared `touches` fails the typed-contract gate and is
   refused before any agent runs. A merge conflict when folding a task branch into the integration
   branch means the decomposition's `touches` scoping was wrong → escalate to `task-decomposition`
   re-plan; never hand-resolve.

4. **Fix-loop cap = 3 per task.** A single shared counter per task across Tier-0 fixes and
   review-driven fixes. After 3 attempts, escalate (`fix_loop_exhausted`) — the situation needs
   human judgment, not another mechanical fix.

5. **Routed review by lens.** Review lenses are selected, not invented:
   `lenses = baseLenses(workspace) ∪ {lens of each constraint in review-constraints.yaml whose
   `when` matches the task's `touches`}`. The tier resolves from constraint severity (a matched
   blocker → `fortified`). Generic lenses fold into one `task-reviewer`; each specialist lens gets
   its own reviewer. See `review-constraints.yaml` and `review-primitives.md`.

6. **Reviewer output schema validation.** Before routing on any reviewer output, validate it against
   `review-envelope.schema.json` (envelope shape, grounded `criterion` prefixes per the Grounding
   rules in `review-primitives.md`, severity ∈ {blocker, major, nit, suggestion}). A malformed or
   ungrounded envelope, or an `abstained` reviewer, **escalates** — it never accepts.

7. **The engine never merges to main.** Task branches merge into `feat/SPEC-NNN`. The integration PR
   (`feat/SPEC-NNN → main`) is opened for a human to merge. (For a small, low-risk spec the owner
   may choose `direct` integration — task PRs to `main` — via the spec's `integration_strategy`
   field; see Integration strategy below. Even then, a human merges the PRs.)

## Process

### Phase 1 — Plan (initialize)

1. **Verify the spec is `status: active`.** Refuse to start otherwise.
2. **Resolve the integration strategy** (see Integration strategy below) → `branch` or `direct`.
3. **Read the plan.** Read `specs/tasks/SPEC-NNN/_index.yaml`, every `TASK-*.md`, and
   `.ai/skills/review-constraints.yaml`. Build the in-memory task map (id → {workspace, touches,
   tier, risk, routing, depends_on, status, acceptance_criteria}), the constraints list, and the
   baseLenses map.
4. **Validate contracts.** Every executable task must have non-empty `touches` and a valid
   routing/tier/risk. Malformed → fail that task with a contract error (do not run it).
5. **Build the wave graph.** Topologically sort by `depends_on`; assign each task a wave integer
   (`wave = max(wave(deps)) + 1`, or 0). A cycle → escalate (`task_graph_cycle`). Dispatch is
   dynamic (any task whose deps are all accepted is eligible); the wave integer is informational.
6. **Create the integration branch** (`branch` mode): `feat/SPEC-NNN` off `main`, pushed so task
   PRs can target it. (`direct` mode: skip — task PRs target `main`.)

### Phase 2 — Build (the wave loop)

For each wave, run its eligible tasks **in parallel**, each through the per-task pipeline. Fold the
wave's accepted branches into the integration branch **before** the next wave starts, so a dependent
task branches off a tip that already carries its dependencies.

**Per-task pipeline** (`buildTask`):

```
skip if done/cancelled · skip if routing=human (deferred, surfaced for a human)
   ↓
validate typed contract (touches/routing/tier/risk) — invalid → fail
   ↓
executor (worktree-isolated, branch claude/SPEC-NNN-TASK-NNN off the integration tip)
   → opens/updates a PR targeting the integration branch; populates each AC's evidence:
   ↓
reviewAndFix:
   Tier-0 gate (cheap: lint/typecheck/test for the workspace)
     red  → fix agent (++fix_count; drop carry-forward); cap 3 → escalate
     green↓
   routed multi-lens review (tier express/standard/fortified; lenses from registry ∩ touches)
     ↓ validate each envelope (schema + grounding) — malformed/abstained → escalate
     ↓ apply severity → action policy (review-primitives.md):
        task:scope blocker     → escalate to task-decomposition re-plan
        spec:* blocker         → escalate to spec-amendment
        design-altitude blocker→ escalate to replan
        any blocker/major      → fix agent (++fix_count; cap 3 → escalate)
        only nits/suggestions  → batch as follow-ups, accept
        clean                  → accept
   ↓
accept → merge the task branch into the integration branch (id order), set status:done in
         _index.yaml + the task file IN THE SAME COMMIT, push per-branch. A merge conflict →
         escalate (decomposition touches were wrong).
```

A crash in one task degrades it to `failed` (escalation) — it never sinks the wave.

**Cross-skill signals** (detected on the aggregated finding set): a `blocker` citing `task:scope`
routes to `task-decomposition` re-plan; a `blocker` citing `spec:*` routes to `spec-amendment`
(subject to a per-spec amendment cap of 2); a `design`-altitude blocker routes to replan. These are
escalations out of the autonomous loop back into a judgment phase — the only way the deterministic
engine asks for human help.

### Phase 3 — Integrate

When no executable task remains (a pending `human` task blocks integration):

- **Run the expensive verification** for the affected workspaces (`WORKSPACES[ws].expensiveVerify`):
  build, full tests, any end-to-end run, capturing **EVIDENCE** (real command output + artifacts
  like screenshots/reports). If EVIDENCE is not green → HALT and escalate. Evidence asserted without
  captured output is a blocker.
- **`branch` mode:** open the integration PR `feat/SPEC-NNN → main` with the spec link, per-task
  verdicts, and a Testing Evidence section. Run an independent `integration-reviewer` against the
  spec's **success criteria** (not just per-task ACs) plus any integration-scope constraints. If it
  passes → mark READY FOR HUMAN MERGE. Then hand off to `spec-completion`.
- **`direct` mode:** task PRs already merged to `main`; no integration PR. Hand off to
  `spec-completion` against `main` HEAD.

A human merges the integration PR. Then `spec-completion` verifies success criteria end-to-end and
moves the spec to a terminal state.

## Integration strategy

The merge target is resolved once in Phase 1, before any executor runs:

- **Explicit:** the spec's `integration_strategy` frontmatter field (`branch` | `direct`) wins. An
  unrecognized value escalates (`invalid_frontmatter_field`).
- **Heuristic** (when the field is absent): use `branch` if any of — `breaking` in tags, more than
  one workspace, ≥5 tasks, or a cross-workspace `blocks` edge — else `direct`. Rationale: a feature
  branch's bookkeeping amortizes when there are many PRs or a coordinated multi-workspace landing is
  needed; a small single-workspace change merges directly.

`branch` → task PRs target `feat/SPEC-NNN`, then one integration PR to `main`. `direct` → task PRs
target `main`, no integration PR. The strategy is known at every merge point.

## Failure escalation

Every escalation notifies the spec owner and halts the affected task (not the whole run unless the
graph is unsatisfiable). Triggers:

| Trigger | Where |
|---|---|
| `task_graph_cycle` — dependency cycle | wave-graph build |
| `invalid_frontmatter_field` — bad `integration_strategy` | Phase 1 strategy resolution |
| contract invalid — missing `touches` / bad routing/tier/risk | typed-contract gate |
| `dispatch_failed` — worktree creation or executor crash before a PR | dispatch wrapper |
| Tier-0 red after the fix cap, or same failure fingerprint 3× | per-task loop |
| `reviewer_contract_violation` — malformed/ungrounded/abstained envelope | schema-validation step |
| `fix_loop_exhausted` — fix counter > 3 | per-task loop |
| `task:scope` blocker → re-plan · `spec:*` blocker → amendment · design-altitude → replan | cross-skill signals |
| merge conflict into the integration branch | per-wave merge |
| integration EVIDENCE not green | Phase 3 |
| wall-clock per task exceeds the budget (recommend 4h) | watchdog |

## Telemetry (optional, recommended)

Where the runtime has a filesystem, append per-task events to
`specs/tasks/SPEC-NNN/_execution.log.jsonl` (JSONL, append-only, restart-safe): `dispatched`,
`tier_0`, `tier_1`, `tier_2`, `fix_loop_iteration`, `routed`, `merged`, `escalated`, plus per-spec
`integration_strategy_resolved`. This makes a run auditable and lets you reconstruct counters
(amendment count, gap count) from the log on resume. (The Workflow runtime has no filesystem, so the
reference script emits `log()` lines instead; finer-grained, fix-round-level resume is a planned
hardening.)

## References (runtime contracts — change them there, not here)

- `review-primitives.md` — severity spine, output schema, grounding rules, carry-forward,
  severity→action policy. The single runtime source of truth for *what reviewers produce and how
  severity routes to action*.
- `review-constraints.yaml` — the lens/constraint registry keyed on `touches`; `baseLenses` per
  workspace.
- `review-envelope.schema.json` — the one reviewer-output schema.
- `.claude/workflows/execute-spec.js` — the reference engine (pure-core + effects + `run()`).
- `specs/sdlc-state-machine.yaml` — phase definitions; this skill owns the `spec-execution` phase.

On exit (integration PR open in `branch` mode, or all task PRs merged in `direct` mode), set the
`_index.yaml` `phase:` block to `{ current: spec-execution, next_action: code-review,
next_trigger: "review the PRs for SPEC-NNN", exit_condition_met: true }` before handing off (the
canonical handoff fields are in the generated `## Handoff` footer below).

<!-- sdlc:handoff:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-execution** in the SDLC state machine (`specs/sdlc-state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- execute this spec
- execute SPEC-NNN
- run the spec
- start the execution loop
- dispatch the tasks

**Preconditions:**

- spec has status active and decomposed tasks with a dependency graph exist

**Exit condition:** all tasks merged into the integration branch and the integration PR (feat/spec-NNN -> main) is open

**Next step:** `code-review` — trigger: "review the PRs for SPEC-NNN"
<!-- sdlc:handoff:end -->
