---
id: ADR-003
title: 'Goal-oriented single-executor delivery: the spec-execution skill is the engine; the execute-spec Workflow is retired'
status: accepted
spec: none
date: 2026-08-14
author: franklin
superseded_by:
---

## Context

SPEC-002 (and its consumers SPEC-005, SPEC-006) made a deterministic `execute-spec` Workflow script
the canonical execution engine for the autonomous half of this framework: build a wave graph from
`depends_on`, dispatch worktree-isolated executors in parallel, gate review on a green Tier-0,
dispatch routed multi-lens reviewers, run a capped fix loop, merge each accepted task, then open one
integration PR.

The downstream implementation that actually runs this SDLC on a production codebase operated that
model for roughly five weeks, then replaced it twice. This ADR ports that result upstream. The
evidence is theirs, and it is measured rather than argued:

**Cost.** A single engine run for a ~7-task spec measured **~2.5–2.8M tokens / 50–93 min / 56–62
agents** across three live runs. The owner's summary of the experience: _"I can barely get through a
single spec over the span of a day."_ Two rounds of cost work had already landed by then (tiering
that let a low-risk narrow-touch task resolve to Express; collapsing generic lenses into one
combined reviewer) — so the engine was not treating every task identically, and the residual was
still unacceptable. The first replacement (their ADR-140, 2026-08-04) changed **who orchestrates**:
the skill became the engine, discretion above a registry floor, with a repo-side goal leash. Five
days later the report was:

> the process burns a lot of tokens for minimal value, which means that it takes 24hrs to implement
> a medium sized spec that would otherwise take 2 hours.

Their ADR-144 (2026-08-09) diagnosed why: changing the orchestrator left the two things that
actually generate agents untouched, because both were carried forward from the engine —
**per-task subagent fan-out** (a fresh context per task that must re-derive the repo's conventions,
layer rules and test commands) and **per-task review fan-out** (registry evaluation, one-to-three
reviewer contexts, and up to three fix rounds, multiplied by task count). The ceremony was
**distributed rather than concentrated**: reviewing task 3 in isolation, nine tasks before anything
integrates, buys far less than reviewing the assembled diff once, and costs far more.

**Validation the engine structurally could not run.** The Workflow runtime has no filesystem, no
clock, and no human channel. It could not run a full data-pipeline refresh, could not drive the app
in a real browser, and could not measure a performance regression — which is precisely the set of
checks that catches the defect classes that actually ship (a broken layout, an empty widget, a
query-plan cliff, a model reading the wrong layer). The engine's rigor was concentrated where it was
cheapest to apply, not where it paid.

**What the owner did instead**, repeatedly and by hand, converged on one policy: discretionary
per-task rigor, real end-to-end validation once, a hard independent review at the integration gate,
a persistence leash ("don't come back until it's done"), and the invariant restated nearly every
time — _"none of your changes make it to `main`; only to the integration branch."_ The problem was
that this lived in the owner's typing, so quality depended on remembering to ask for it.

This framework is the upstream reference. Continuing to ship a model that its own downstream
retired, on measured grounds, would be dishonest.

**On `spec: none`:** this is a process-artifact change directed as ADR-only, with no owning spec.
Attributing it to SPEC-002 would be false — SPEC-002 is the spec that produced the model this ADR
retires.

## Decision

**One executor delivers the whole spec against a stated goal. Rigor is spent once, at one
integration gate.**

1. **The `spec-execution` skill IS the engine.** It owns planning, execution, rigor routing,
   end-to-end validation and the integration gate as an operating policy an agent applies with
   judgment — not as a fixed pipeline. Policy lives in `SKILL.md`; procedures in its `SOP.md`.

2. **`.claude/workflows/execute-spec.js` is deleted, not kept as an opt-in.** A dormant second path
   drifts and rots. Git history preserves it if the deterministic approach is ever revisited.
   `Workflow({ name: 'execute-spec' })` is no longer a valid call anywhere in this framework.

3. **The agent running the skill is the executor**, not a dispatcher. It implements each task inline,
   in the context it already holds.

4. **Serial task burn-down.** One task at a time, in dependency order: branch off the current
   `feat/spec-NNN` tip → implement → the task's own tests green → self-review → PR into
   `feat/spec-NNN` → merge it → delete the branch → next task.

5. **A task is gated by its own tests plus an executor self-review.** No per-task reviewer subagent,
   no per-task envelope, no per-task fix-loop ceremony. The self-review is a real pass over the diff
   — acceptance criteria, declared `touches`, constraints, scope creep, dead code, generated-artifact
   diffs, the obvious failure mode — not a formality.

6. **The integration branch is mandatory and exclusive.** Every spec cuts `feat/spec-NNN` from
   `main`, and nothing for that spec reaches `main` except by merging that branch. This supersedes
   SPEC-005's conditional `integration_strategy: branch | direct` heuristic: `direct` mode is
   removed. The branch is cheap; the invariant it protects is not.

7. **Nothing lingers.** After a task completes there is no open PR, no remote branch, no local
   branch, no worktree. Task N merges before task N+1 starts.

8. **Sub-agent fan-out is the exception**, reserved for a large spec with genuinely non-overlapping
   tasks. `isolation: "worktree"` remains mandatory when used, and the merge discipline is unchanged
   — each task merges as it is accepted, never batched to the end.

9. **End-to-end validation runs once**, before the gate: full build, full test suite, the real
   pipeline where one exists, the app driven in a real browser to pixel-level verification for
   user-visible change, and performance where it matters. Evidence is attached, never asserted.

10. **The integration gate carries the full rigor.** One PR, a full multi-lens adversarial panel —
    independently dispatched, clean contexts, every envelope validated — with the constraints
    registry evaluated **in full across the whole diff**, looped until no blocker or major survives.

11. **The integration PR is left open for the human.** The agent never merges or pushes to `main`,
    and never self-approves. There is no phrasing in a user message that creates an exception.

12. **The delivery run is transparent.** It keeps a visible session task list — one entry per task in
    `_index.yaml`, plus end-to-end validation and the integration gate — marked `in_progress` before
    the work starts and `completed` only when the task's PR is merged and its `_index.yaml` status is
    flipped. Exactly one entry is in flight at a time; deferred, blocked and escalated tasks stay
    open with their reason. A run whose progress cannot be followed in-session is not acceptable,
    however good its output: this is the counterweight to an autonomous loop that a human is no
    longer reviewing per task.

13. **The persistence leash is repo-side, in the Stop hook.** `.claude/hooks/stop-handoff.mjs` reads
    the session's goal file (`.claude/.sdlc-goal-<session_id>`, armed by the skill as
    `.sdlc-goal-current` and claimed on the first `Stop`) and blocks a premature stop while
    `status: active`, feeding back the exit criteria. Design properties, all deliberate:
    - It does **not** bail on `stop_hook_active` — a leash that releases after one block is not a
      leash, unlike the phase-exit handoff, which is a one-shot nudge.
    - It fires on **`Stop` only**. The same script is wired to `SubagentStop`; leashing a subagent
      would trap read-only reviewers (they cannot flip `status`) and spend the parent's budget.
    - The counter is **hook-owned** (`.sdlc-goalblocks-<session_id>`), not the agent-written
      `blocks_used`, because the goal template carries no counter and every rewrite would otherwise
      reset the cap. `max_blocks` may only **lower** the bound, never raise it.
    - It **fails open** whenever the bound cannot be enforced: past the cap, on malformed / array /
      scalar JSON, when neither the counter nor the goal file can be written, and 24h after
      `armed_at` (not mtime — the hook rewrites the file on every block, so an mtime horizon could
      never expire an actively-blocking leash).
    - **Session keying is a security boundary.** An unkeyed, world-readable goal file is an
      unauthenticated directive channel into an autonomous loop. `.sdlc-goal-current` is a one-shot
      arming name the first real `Stop` claims by renaming; echoed goal text is length-clamped,
      labeled untrusted, and never interpolated into the trusted-looking label.
    - `met` and `escalated` are the **only** release words, kept in sync with the skill.

14. **Capability disposition — every capability the deleted engine owned.** Retiring an execution
    artifact without this table is how losses go unrecorded:

    | Engine capability | Disposition | Where it lives now / why it went |
    | --- | --- | --- |
    | Wave-graph construction from `depends_on` | **KEEP as judgment** (skill §4) | A topological read of `_index.yaml` was never the expensive part; delivery is serial, so the graph is an ordering, not a schedule. |
    | Worktree-isolated parallel executor dispatch | **KEEP, demoted to the exception** (skill §4, SOP §5) | `isolation: "worktree"` stays mandatory for any file-writing subagent. |
    | Constraints-registry reviewer fan-out | **KEEP, moved to the gate** (skill §6) | Evaluated in full across the whole diff, once, instead of per task against a declared `touches` set that matches unreliably in both directions. |
    | Lens → reviewer resolution (`agentForLens`, ADR-001) | **PORT** → `scripts/sdlc/reviewer-routing.mjs` | Now importable and unit-tested, invoked by the agent dispatching the panel. The registry is still the single source of truth. |
    | Plan-review gate (`planApproved`, ADR-002) | **PORT** → `scripts/sdlc/plan-gate.mjs` | Fail-closed, checked by the skill before a run starts and runnable in CI. The verdict still lives in `_index.yaml`. |
    | Reviewer-envelope schema validation | **PORT** → `scripts/sdlc/validate-review-envelope.mjs` | Unowned, a malformed envelope folds to zero findings and reads as a clean accept — the silent-accept path. Exit 0 valid / 2 abstained / 3 malformed-or-ungrounded. |
    | `ALLOWED_PREFIX` grounding check | **PORT** → the same validator (`PR_SIDE_PREFIXES`) | A blocking finding with an ungrounded citation is a contract violation. `prefix-parity.test.mjs` re-anchors to validator ↔ `review-primitives.md` ↔ schema. |
    | Severity→action routing policy | **KEEP** (`review-primitives.md`) | The policy was never in the engine; only its invoker was. The invoker is now the dispatching agent. |
    | Capped fix loop (≤3) | **KEEP per task, judgment at the gate** | Per-task fix loops are gone with per-task review. At the gate there is no round cap: the same finding surviving two rounds escalates. |
    | Mandatory Tier-0 `tester` gate | **DROP** (accepted loss) | Verification folds into the executor. There is no automatic pre-review gate, because there is no per-task review to gate. |
    | `validateContract` as an executing gate | **DROP as an executing gate** | Decomposition-time validation is unaffected — a task with no `touches` is a decomposition defect, caught there, not discovered mid-run. |
    | `integration_strategy: direct` (SPEC-005) | **DROP** (decision 6) | The integration branch is now unconditional. |
    | Wave-level resume from committed status | **KEEP, weaker** | Branches remain id-derived (`claude/SPEC-NNN-TASK-NNN`), so a resumed run reuses them; resume is now per task, by reading `_index.yaml` status. |
    | `_execution.log.jsonl` telemetry | **KEEP as optional** (SOP §9) | Recommended, never a gate. See the Negative section: a delivery run is otherwise uninstrumented. |
    | Branch-always / amendment cap / author≠reviewer independence | **KEEP, with one carve-out** | These governed the human loop, not the engine. Independence now binds at the gate. The carve-out is mechanical: `pre-tool-use-review-identity.mjs` classifies any `gh pr merge` as an author self-accept, which would deny the task merges §4 now *requires* — so it learned the base-branch distinction (a merge into `feat/spec-*` is exempt; a merge into `main` is not, and an unresolvable base is not). |
    | Tier resolution (`tier()`, blocker/major veto) | **KEEP as judgment at the gate** | No code resolves a tier any more. `tier:` and `risk:` stay task inputs, and the registry can still only raise the review intensity a change earns — but that is now the panel-composing agent's reading, not a function. A declared `tier: express` never shrinks the gate panel. |
    | `spec:gap` → gap-capture routing | **KEEP as an escalation** (skill §8) | The signal survives as one of the escalation routes; there is no separate mechanical gap-capture handler in this framework, and none is implied. |
    | Per-task `_index.yaml` status commit + resume | **KEEP, simplified** | Status is flipped as each task merges, so a resumed run reads `_index.yaml` and continues at the first unfinished task. |

15. **The state machine keeps the phase id `spec-execution`; the `code-review` phase is removed.**
    Review happens in-run — self-review per task, adversarial panel at the gate — so there is no
    separate post-execution phase to own. `spec-execution` hands off directly to `spec-completion`,
    and `pr-reviewer` becomes an exempt reviewer-knowledge skill (still the entry point for an ad-hoc
    PR review outside a delivery run). Only `entry_triggers` and `exit_condition` change on
    `spec-execution`; the phase id is load-bearing for the hooks and in-flight `phase:` blocks.

## Consequences

**Positive**

- Agent count per spec drops from roughly `tasks × (1 executor + 1–3 reviewers + fix rounds)` to
  roughly `1 + the integration panel`.
- The executor keeps its context across tasks, so conventions, boundaries and test commands are
  learned once per spec instead of once per task.
- Review quality at the gate goes **up**, not down: a panel grading the assembled diff sees
  cross-task interactions that per-task review structurally cannot, and the registry is evaluated
  against the whole change.
- Real end-to-end validation — a full pipeline run, a real browser, measured performance — becomes a
  first-class delivery step. It was structurally impossible in the Workflow runtime.
- The policy lives in the repo instead of the owner's typing, and the run self-arms its own leash.
- One execution path. No dormant second engine to drift.
- Merging is unambiguous: the human merges one PR, always.

**Guarantees that moved from mechanical to prose.** The engine enforced these in code;
nothing enforces them now except an agent following the skill. They are listed here
because a guarantee that silently changes kind is the most expensive thing an ADR can
omit — and because each is a candidate for a real gate later:

| Guarantee | Was | Is now | Bounded by |
| --- | --- | --- | --- |
| The plan-review gate runs before any work | Engine HALT before dispatch | The skill's §1 step, plus the CI job | `scripts/sdlc/plan-gate.mjs` in CI — but a run that skips §1 is not stopped, and under `claude -p` the leash is inert too |
| `isolation: "worktree"` on every file-writing subagent | Passed in code on every dispatch | Prose in four documents | Nothing. The failure is destructive and was observed live (a non-isolated subagent stashed a foreground session's uncommitted edits). With fan-out now rare, it is also the rule least likely to be remembered |
| Every reviewer envelope is validated | Engine validated before routing | The skill runs `validate-review-envelope.mjs` | The validator exists and is tested; invoking it is discretionary |
| The constraints registry is evaluated | Engine computed `lensesFor(touches)` | An agent reads the YAML at the gate | `check-review-constraint-globs.mjs` proves the rows are *resolvable*, not that they were *consulted* |
| A task's `touches` is non-empty | Engine refused to run the task | A decomposition-time rule | `task-decomposition` self-review; nothing at delivery time |

**Negative / accepted**

- **A defect is found later.** A correctness or security problem in task 2 now surfaces at the gate,
  after ten tasks were built on top of it, and the unwind is larger. This was raised explicitly
  downstream and accepted, choosing "unit tests only — no per-task reviewers" over a
  blocker-severity carve-out, with the compensating requirement that implementing agents self-review
  and address what they find. If a defect class starts escaping to the gate, the cheapest partial
  revert is reinstating **only** blocker-severity lenses (e.g. auth/permissions, architectural
  layer laws) per task.
- **No independent grading before the gate.** Structural author≠reviewer independence now binds at
  the integration gate only; task-level self-review is a deliberate, documented exception where the
  author does grade their own work.
- **Determinism is traded for judgment.** Two runs of the same spec may make different rigor choices.
  The registry, the plan gate, and the envelope validator bound how wrong a judgment call can be.
- **Less parallelism.** Serial burn-down makes wall-clock the sum of tasks, not the slowest. The
  measured complaint was driven by agent-spawn overhead and re-derived context rather than task
  execution, so the trade is expected to be strongly net-positive — but a genuinely wide, independent
  spec will be slower, which is why decision 8 keeps the exception.
- **A self-armed Stop hook is a new hazard class, and the dangerous direction is not wedging.**
  Fail-open covers wedging. The real risk is that the agent arms, statuses and disarms the leash it
  is bound by: it writes its own `exit_criteria` and can set `status: met`, and the hook only reads
  `status` — it cannot verify a criterion. The defense is prose plus visibility: the exit criteria
  and their evidence are surfaced in the integration PR body, the task list, and the final handoff,
  and a human still merges. Mechanically it is bounded by 14 fixture tests
  (`.claude/hooks/__tests__/stop-handoff-goal-leash.test.mjs`).
- **Under `claude -p` the leash is inert** — Stop hooks do not fire in non-interactive mode, so the
  exit criteria bind by prose only there.
- **A delivery run is uninstrumented by default**, so this ADR's cost claim cannot be re-measured
  in-framework: the Workflow run record is gone and the JSONL log is optional. Countervailing and
  unanalyzed: the leash keeps one session alive for a whole spec, so orchestrator context accumulates
  across the run where the Workflow kept each context small.
- **The framework now uses a route its own schema barely admits.** This change is an
  ADR-only process-artifact change: no spec, no decomposed tasks, no plan-review gate,
  and it was merged by the agent that authored it on the owner's explicit instruction.
  `spec-schema.md` documents that route (an ADR may carry `spec: none`), but the state
  machine has no phase that produces a spec-less ADR, so the process for changing the
  process is thinner than the process it defines. Accepted for now; a `process-change`
  route is the honest follow-up.
- **Removing the `code-review` phase also removed its entry triggers**, so prompts like
  "review this PR" no longer match any phase in the `UserPromptSubmit` classifier.
  `pr-reviewer` remains reachable by its skill description, but the deterministic
  routing nudge for an ad-hoc PR review is gone.
- **Historical specs describe the engine as canonical.** SPEC-002, SPEC-005 and SPEC-006 are records
  of past decisions and are left intact; this ADR is the reconciliation. ADR-001 and ADR-002 stand —
  their decisions were about where policy lives, not about the engine — and each carries a re-homing
  note pointing at its new enforcement point.

**Alternatives considered**

- **Keep `execute-spec.js` as an opt-in for large mechanical specs.** Rejected per decision 2: a
  dormant second path drifts, and the framework should ship one superseding approach.
- **Keep the engine and fix its cost model a third time.** Rejected on the second failure mode, not
  the first: no amount of tiering gives a no-filesystem, no-clock, no-human-channel runtime a
  pipeline run, a browser, or a performance measurement.
- **Keep per-task review at blocker severity only.** Not adopted now, but recorded as the
  recommended partial revert if defects start escaping to the gate.
- **Leave the leash to the harness's own `/goal`.** Rejected: it puts the leash outside the repo and
  the arming outside the agent, which is half the problem. The harness command still composes fine
  for ad-hoc goals that are not spec deliveries.

## References

- `.ai/skills/spec-execution/SKILL.md` (the engine, rewritten in place) + `SOP.md` (the procedures).
- `.claude/hooks/stop-handoff.mjs` + `.claude/hooks/__tests__/stop-handoff-goal-leash.test.mjs` (the leash).
- `scripts/sdlc/plan-gate.mjs` (ADR-002 re-homed), `scripts/sdlc/reviewer-routing.mjs` (ADR-001 re-homed),
  `scripts/sdlc/validate-review-envelope.mjs` (envelope + grounding validation),
  `scripts/sdlc/check-review-constraint-globs.mjs` (registry rows must resolve).
- `specs/sdlc-state-machine.yaml` — `spec-execution` triggers + exit condition; `code-review` phase removed.
- Deleted: `.claude/workflows/execute-spec.js`.
- Superseded in part: SPEC-002 (the wave engine), SPEC-005 (`integration_strategy: direct`).
