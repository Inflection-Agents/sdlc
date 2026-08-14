---
name: spec-execution
description: Use when an active spec needs to be delivered end-to-end — "implement SPEC-NNN", "execute SPEC-NNN", "deliver SPEC-NNN", "finish SPEC-NNN", "run the spec", "dispatch the tasks". You are the executor: cut an integration branch, burn the tasks down yourself one at a time behind a visible task list, validate end-to-end once, then gate on a hard adversarial review of a single integration PR left open for the human to merge.
---

# Spec Execution

**You implement the spec yourself.** Not a dispatcher — the executor. Move fast, keep the loop
tight, and spend the rigor where it pays: once, at the integration gate.

Procedures live in **[`SOP.md`](SOP.md)** — exact commands, per-workspace verification, the
self-review checklist, the gate checklist. Read it once at the start of a run. This file is the
policy; the SOP is the how.

## The shape

```
cut feat/spec-NNN  →  task → verify → self-review → PR → merge → next task  →  validate e2e once
                          (one at a time, nothing lingers)                   →  ONE integration PR
                                                                             →  adversarial panel,
                                                                                loop till clean
                                                                             →  leave open for human
```

## 1. Check the gate, arm the goal, then start

**Refuse to start** unless the spec is `status: active`, its tasks are decomposed, and the
plan-review gate passes (ADR-002 — fail closed):

```
node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml
```

Exit `0` = approved. A missing `plan_review:` block is treated exactly like an unapproved one —
HALT and ask the owner to review and approve the plan. Missing tasks route to `task-decomposition`
rather than being invented here.

Then write `.claude/.sdlc-goal-current` (the first `Stop` renames it to
`.sdlc-goal-<session_id>`; if you know your `session_id`, write that name directly):

```json
{
    "version": 1,
    "spec": "SPEC-NNN",
    "statement": "<the user's goal, their words>",
    "exit_criteria": [
        "every task in _index.yaml is done or explicitly deferred with a reason",
        "end-to-end validation ran with evidence",
        "integration PR feat/spec-NNN -> main is open, panel-reviewed, no blockers",
        "<any extra bar the user named>"
    ],
    "status": "active",
    "reason": null,
    "armed_at": "<ISO-8601>",
    "updated": "<YYYY-MM-DD>"
}
```

`.claude/hooks/stop-handoff.mjs` blocks a premature stop while `status: active`. **`met` and
`escalated` are the only release words.** Keep `armed_at` across rewrites (it anchors the 24h
expiry); escalation reasons go in `reason`, never `status`. Never flip `met` on a run you have not
finished — the hook reads `status`, it cannot verify a criterion. Do not put "merged" in
`exit_criteria`; you do not merge to `main` (§6).

Then read — **in one batch** — the spec, `specs/tasks/SPEC-NNN/_index.yaml`, and every task file.
Surface a **≤10-line plan** (task order, which tasks need a browser or an expensive data run,
anything you expect to escalate) and **start immediately**. The goal is the authorization; there is
no second approval gate.

## 2. Keep a visible task list — always

**The run is transparent or it is not a run.** Before the first task, create a session task list
(the `TaskCreate`/`TaskUpdate` tools, or the equivalent todo surface) with **one entry per task in
`_index.yaml`**, in dependency order, plus a final entry each for **end-to-end validation** and the
**integration gate**.

- Mark an entry `in_progress` **before** you touch its files, and `completed` only when its PR is
  merged into the integration branch and its `_index.yaml` status is flipped.
- Exactly one entry is `in_progress` at a time (that is what serial burn-down means).
- A deferred, blocked or escalated task stays open with the reason written into its description —
  never silently dropped.
- New work discovered mid-run (a fix-up, a follow-up) is added as its own entry rather than folded
  invisibly into the task in flight.

Anyone reading the session must be able to see, at any moment and without asking, which task is in
flight and what is left. This list is the run's status surface — it does not replace the
`_index.yaml` status flips or the goal file, and none of the three may contradict the others.

## 3. Integration branch — always

Cut `feat/spec-NNN` from `main` before the first task. **Every change for this spec lands there,
and nothing reaches `main` except by merging that branch.** No task PR targets `main`, no direct
commits to `main`, ever.

## 4. Burn the tasks down — serially, by default

**You implement each task inline.** One at a time, in dependency order:

> branch off the current `feat/spec-NNN` tip → implement → the task's own tests green → self-review
> → PR into `feat/spec-NNN` → merge it yourself on green → delete the branch → next task

Four rules, and they are the ones that matter:

1. **Only the task's own tests (or the workspace equivalent) gate a task.** No reviewer subagent, no
   envelope, no fix-loop ceremony per task. SOP §3.
2. **You self-review before opening the task PR** and fix what it finds — acceptance criteria,
   declared `touches`, scope creep, dead code, generated-artifact diffs, the obvious failure mode.
   SOP §4.
3. **Task N merges before task N+1 starts.** Every later task branches off that tip; an unmerged
   task means the next one is built on a base missing it.
4. **Nothing lingers.** After a task: no open PR, no remote branch, no local branch, no worktree.

Sub-agents are the **exception**, reserved for a genuinely large spec with non-overlapping tasks —
SOP §5. If you use one, `isolation: "worktree"` is mandatory, and the merge discipline above is
unchanged.

## 5. Validate end-to-end — once, before the gate

Not per task. After the last task merges, run what the spec earns: the full build, the full test
suite, the real data pipeline where one exists, the app driven in a real browser to pixel-level
verification for any user-visible change, and performance where it matters. Commands: SOP §6.

Attach the output as evidence. Never claim a validation ran without it; if one is genuinely not
runnable, name it and say why.

## 6. The integration gate — where the rigor lives

Open `feat/spec-NNN -> main` carrying the evidence and every spec success criterion mapped to how it
was verified. Then dispatch a **full multi-lens adversarial panel** — concurrently, one message,
clean contexts, no `Edit`/`Write` — and **loop until no blocker or major survives**, re-dispatching
the panel each round rather than spot-checking the fix. Panel composition, lens routing and the
exit codes are in SOP §7.

This is the one place `review-constraints.yaml` is evaluated **in full, across the whole diff**
(not per task, where a narrowly-declared `touches` set makes matching unreliable). Lens → reviewer
routing is registry data (ADR-001): `node scripts/sdlc/reviewer-routing.mjs <lens>`.

Two rules that are not negotiable:

- **Independence is structural here.** Every verdict comes from a separately dispatched reviewer,
  and every envelope is validated (`node scripts/sdlc/validate-review-envelope.mjs <file>`).
  Task-level self-review (§4, rule 2) is the deliberate exception, bought back in full at this gate.
  A malformed, ungrounded or absent envelope is never a clean review.
- **Leave the PR open.** The human reviews and merges it. You never merge to `main`, never push to
  `main`, never self-approve.

## 7. Exit

When every exit criterion holds — verified, not assumed:

1. Set the goal file `status: met`.
2. Delete **your own** goal file and counter by exact path (`.claude/.sdlc-goal-<session_id>`, named
   in the block reason, plus `.sdlc-goalblocks-<session_id>`). Never `rm .claude/.sdlc-goal-*` —
   that disarms every concurrent run.
3. Close out the task list: every entry `completed` or explicitly deferred with a reason.
4. Write the `phase:` block to `_index.yaml` (below).
5. Hand off to `spec-completion`, stating what satisfied each criterion — that summary is the only
   external check on `status`, since nothing verifies it mechanically.

## 8. Escalate instead of spinning

Set `status: escalated`, put why in `reason`, surface it, stop. Escalate on: security, data-loss or
payment risk (hard stop); a decision that is the owner's; the same integration finding surviving two
panel rounds; the amendment cap (`spec.version − 1 ≥ 3`); a task that cannot land and cannot be
fixed at the root.

Two signals route to a judgment phase rather than halting the run: a `task:scope` blocker goes to
`task-decomposition` for a re-plan, and a `spec:*` blocker goes to `spec-amendment`. A `spec:gap`
finding is captured as a gap against the spec and does **not** license widening the current task.

## Token discipline

Read the spec, the task index and each task **once**, batched — never re-read what you have read.
Read the SOP once per run. No per-task status essays and no restating the plan: the task list is the
status report. Report when a task merges and at the gate.

## Phase memory

`specs/tasks/SPEC-NNN/_index.yaml` may carry a spec-level `phase:` block (see `spec-schema.md`).

**On entry:** confirm `phase.current` is `task-decomposition` (handing off here) or `spec-execution`
(resuming). A later phase means reconcile first; a missing block is valid.

**On exit** (integration PR open, panel-clean, awaiting human merge):

```yaml
phase:
    current: spec-execution
    next_action: spec-completion
    next_trigger: 'close out SPEC-NNN'
    exit_condition_met: true
    handoff_surfaced: true
    updated: <YYYY-MM-DD>
```

Set `handoff_surfaced: true` **after** you surface the handoff (the hook reads it, never writes it —
without it, it re-blocks every turn). Take `next_action`/`next_trigger` from
`specs/sdlc-state-machine.yaml`; never restate the transition table here.

<!-- sdlc:handoff:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-execution** in the SDLC state machine (`specs/sdlc-state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- execute this spec
- execute SPEC-NNN
- implement SPEC-NNN
- deliver SPEC-NNN
- finish SPEC-NNN
- run the spec
- start the execution loop
- dispatch the tasks

**Preconditions:**

- spec has status active and decomposed tasks with a dependency graph exist
- the plan-review gate passes (ADR-002, fail-closed): the _index.yaml plan_review block is present, approved, and not needs-rework — verify with scripts/sdlc/plan-gate.mjs

**Exit condition:** single-executor delivery (ADR-003): the owner skill armed a session goal leash (.claude/.sdlc-goal-<session_id>, enforced by the Stop hook), kept a visible task list covering every task plus end-to-end validation and the integration gate, cut the integration branch feat/spec-NNN off main, and burned the tasks down ITSELF one at a time — each task gated by its own tests (or the workspace equivalent) plus an executor self-review, landed via a short-lived PR into feat/spec-NNN that is merged and deleted before the next task starts, with no PR, branch or worktree left lingering; sub-agent fan-out is the exception, for large specs with genuinely non-overlapping tasks only, and carries the same merge discipline. End-to-end validation ran ONCE before the gate with attached evidence. Exit (success) = the goal file is status:met and ONE integration PR (feat/spec-NNN -> main) is open, carrying every spec success criterion mapped to its evidence, having survived a full multi-lens adversarial review panel — independently dispatched, every envelope validated with scripts/sdlc/validate-review-envelope.mjs, the constraints registry evaluated in full across the whole diff — looped until no blocker or major survives, and LEFT OPEN for the human to review and merge. Nothing for a spec reaches main except by merging that branch; the agent never merges or pushes to main. A HALT is goal file status:escalated with a surfaced reason — security/data-loss/payment risk, an owner decision, the same integration finding surviving two panel rounds, the amendment cap (spec.version reaching 4), or a task that cannot land and cannot be fixed at the root

**Next step:** `spec-completion` — trigger: "close out SPEC-NNN"
<!-- sdlc:handoff:end -->
