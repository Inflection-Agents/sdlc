---
name: spec-execution
description: Use when an active spec needs to be delivered end-to-end — "implement SPEC-NNN", "execute SPEC-NNN", "deliver SPEC-NNN", "finish SPEC-NNN", "run the spec". You are the executor: cut an integration branch, burn the delivery guide's steps down yourself one at a time behind a visible task list, validate end-to-end once, then gate on a hard adversarial review of a single integration PR left open for the human to merge.
---

# Spec Execution

**You implement the spec yourself.** Not a dispatcher — the executor. Move fast, keep the loop
tight, and spend the rigor where it pays: once, at the integration gate.

Procedures live in **[`SOP.md`](SOP.md)** — exact commands, per-workspace verification, the
self-review checklist, the gate checklist. Read it once at the start of a run. This file is the
policy; the SOP is the how. The plan you execute is the spec's **delivery guide**
(`specs/tasks/SPEC-NNN/GUIDE.md`, schema in [`../guide-schema.md`](../guide-schema.md), ADR-007).

## The shape

```
cut feat/spec-NNN  →  step → verify → self-review → PR → merge → next step  →  validate e2e once
                          (one at a time, nothing lingers)                   →  simplify pass (SOP Section 6.1)
                                                                             →  ONE integration PR
                                                                             →  adversarial panel,
                                                                                loop till clean
                                                                             →  leave open for human
```

## 1. Check the gate, arm the goal, then start

**Refuse to start** unless the spec is `status: active` and both checks exit `0` (ADR-002 and
ADR-007 — fail closed):

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide specs/tasks/SPEC-NNN/GUIDE.md
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs plan-gate specs/tasks/SPEC-NNN/_index.yaml
```

A missing guide is not something to invent here: route to `spec-authoring` with "write the guide for
SPEC-NNN". A failing guide goes back to its author. A missing or unapproved `plan_review:` block HALTs
and asks the owner to approve the plan.

Then write `.claude/.sdlc-goal-current` (the first `Stop` renames it to
`.sdlc-goal-<session_id>`; if you know your `session_id`, write that name directly):

```json
{
    "version": 1,
    "spec": "SPEC-NNN",
    "statement": "<the user's goal, their words>",
    "exit_criteria": [
        "every step in _index.yaml is done, cancelled with a reason, or deferred with a reason naming a decided owner decision",
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

The `stop-handoff` hook blocks a premature stop while `status: active`. (It ships with the plugin, so do not assume a repo-relative path to it.) **`met` and
`escalated` are the only release words.** Keep `armed_at` across rewrites (it anchors the 24h
expiry); escalation reasons go in `reason`, never `status`. Never flip `met` on a run you have not
finished — the hook reads `status`, it cannot verify a criterion. Do not put "merged" in
`exit_criteria`; you do not merge to `main` (§6).

Then read — **in one batch** — the spec, `GUIDE.md` and `_index.yaml`. Surface a **≤10-line plan**
(step order, which steps need a browser, an expensive data run or a human `Run by:`, anything you
expect to escalate) and **start immediately**. The goal is the authorization; there is no second
approval gate.

## 2. Keep a visible task list — always

**The run is transparent or it is not a run.** Before the first step, create a session task list
(the `TaskCreate`/`TaskUpdate` tools, or the equivalent todo surface) with **one entry per guide
step**, in guide order, plus a final entry each for **end-to-end validation** and the **integration
gate**.

- Mark an entry `in_progress` **before** you touch its files, and `completed` only when its PR is
  merged into the integration branch and its `_index.yaml` status is flipped.
- Exactly one entry is `in_progress` at a time (that is what serial burn-down means).
- A deferred, blocked or escalated step stays open with the reason written into its description —
  never silently dropped.
- New work discovered mid-run (a fix-up, a follow-up) is added as its own entry rather than folded
  invisibly into the step in flight.

Anyone reading the session must be able to see, at any moment and without asking, which step is in
flight and what is left. This list is the run's status surface — it does not replace the
`_index.yaml` status flips or the goal file, and none of the three may contradict the others.

## 3. Integration branch — always

Cut `feat/spec-NNN` from `main` before the first step. **Every change for this spec lands there,
and nothing reaches `main` except by merging that branch.** No step PR targets `main`, no direct
commits to `main`, ever.

Alongside it, create `specs/tasks/SPEC-NNN/DECISIONS.md` from `.sdlc/templates/decisions.md`. This is not
optional bookkeeping: §8's narrow escalation bar is only safe because almost every judgment call
gets decided and logged rather than asked, and this log is what makes that reviewable after the fact
instead of invisible. One `## S<n>` entry per step appended after it merges; an `EXECUTIVE DECISION`
or `SPEC DEVIATION` heading the moment either happens, not batched at the end.

## 4. Burn the steps down — serially, by default

**You implement each step inline.** One at a time, in guide order:

> branch `claude/SPEC-NNN-S<n>` off the current `feat/spec-NNN` tip → implement → the step's
> `Verify:` commands green → self-review → PR into `feat/spec-NNN` → merge it yourself on green →
> delete the branch → next step

Four rules, and they are the ones that matter:

1. **Only the step's own `Verify:` commands gate a step.** No reviewer subagent, no envelope, no
   fix-loop ceremony per step. SOP §3.
2. **You self-review before opening the step PR** and fix what it finds — every AC in the step's
   `Covers:` satisfied with evidence in the PR body, the diff inside `Changes:`, scope creep, dead
   code, generated-artifact diffs, the obvious failure mode. SOP §4.
3. **Step N merges before step N+1 starts.** Every later step branches off that tip; an unmerged
   step means the next one is built on a base missing it.
4. **Nothing lingers.** After a step: no open PR, no remote branch, no local branch, no worktree.

A step with **`Run by: <role>`** is work only a human can perform. Do not run it: surface it, leave it
`pending`, and keep burning down the steps that do not depend on it.

Sub-agents are the **exception**, reserved for a genuinely large spec with steps whose `After:`
closures and `Changes:` do not overlap — SOP §5. If you use one, `isolation: "worktree"` is
mandatory, and the merge discipline above is unchanged.

### Changing the guide during a run

You may reorder, split, merge, add or cancel steps, or add an owner decision, **when no spec AC,
scope item or design decision changes**. Edit `GUIDE.md` and `_index.yaml` in one commit, re-run
`validate-guide.mjs`, and log it under the fixed heading
`## EXECUTIVE DECISION — guide change: <summary>`. The run does not pause for re-approval: the
integration PR's `## Guide changes` section lists every such entry, one for one, so the owner reviews
them with the PR (ADR-007 records this narrowing of what the plan approval attests). A cancelled
step's ACs must be re-covered by another step, which the validator enforces.

A new owner decision starts `pending`: surface it at once and keep burning down the steps that do not
depend on it. It escalates under §8 only when every remaining step depends on it.

Any change to an AC, the scope or the design is not a guide change. It routes to `spec-amendment`.

## 5. Validate end-to-end — once, before the gate

Not per step. After the last step merges, run the guide's `## End-to-end validation` and what the
spec earns: the full build, the full test suite, the real data pipeline where one exists, the app
driven in a real browser to pixel-level verification for any user-visible change, and performance
where it matters. Commands: SOP §6.

Attach the output as evidence. Never claim a validation ran without it; if one is genuinely not
runnable, name it and say why.

## 6. The integration gate — where the rigor lives

**Refuse to open the integration PR while any of these holds:** a `decisions:` entry is `pending`; a
step is `pending`, `in_progress` or `blocked` (including a `Run by:` step the human has not reported
done); or a step is `deferred` and its `reason:` does not name a `decided` owner decision (`D<n>`)
accepting the deferral. Surface what is open and stop, or get the owner's decision first.

Open `feat/spec-NNN -> main` carrying the evidence, every spec success criterion (`SC-N`) mapped to
how it was verified, and a `## Guide changes` section (or "none"). Then dispatch a **full multi-lens
adversarial panel** — concurrently, one message, clean contexts, no `Edit`/`Write` — and **loop until
no blocker or major survives, to a maximum of three rounds (ADR-004)**, re-dispatching the panel each
round rather than spot-checking the fix. Panel composition, lens routing and the exit codes are in
SOP §7.

This is the one place `review-constraints.yaml` is evaluated **in full, across the whole diff**
(not per step, where a narrowly-declared `Changes:` set makes matching unreliable). Lens → reviewer
routing is registry data (ADR-001): `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs reviewer-routing <lens>`.

Two rules that are not negotiable:

- **Independence is structural here.** Every verdict comes from a separately dispatched reviewer,
  and every envelope is validated (`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-review-envelope <file>`).
  Step-level self-review (§4, rule 2) is the deliberate exception, bought back in full at this gate.
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
payment risk (hard stop); a decision that is the owner's and that every remaining step depends on;
the amendment cap (`spec.version − 1 ≥ 3`); a step that cannot land and cannot be fixed at the root.
The gate itself is capped at three rounds (ADR-004) and survivors are disclosed, not escalated.

Two signals route elsewhere rather than halting the run. A `task:scope` blocker means a step's diff
left its `Changes:`: re-plan the guide in place under §4 > Changing the guide during a run. A
re-plan during the gate does not reset ADR-004's round count. A `spec:*` blocker goes to
`spec-amendment`. A `spec:gap` finding is captured as a gap against the spec and does **not** license
widening the current step.

## Token discipline

Read the spec, the guide and the index **once**, batched — never re-read what you have read. Read
the SOP once per run. No per-step status essays and no restating the plan: the task list is the
status report. Report when a step merges and at the gate.

## Phase memory

`specs/tasks/SPEC-NNN/_index.yaml` may carry a spec-level `phase:` block (see `skills/guide-schema.md`).

**On entry:** confirm `phase.current` is `spec-authoring` or `spec-amendment` (handing off here) or
`spec-execution` (resuming). A later phase means reconcile first; a missing block is valid. A retired
id (listed under `retired_phases:` in the state machine) means the spec predates the guide: route to
"write the guide for SPEC-NNN".

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
`.sdlc/state-machine.yaml`; never restate the transition table here.

<!-- sdlc:handoff:start -->
<!-- GENERATED from .sdlc/state-machine.yaml by ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-execution** in the SDLC state machine (`.sdlc/state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- execute this spec
- execute SPEC-NNN
- implement SPEC-NNN
- deliver SPEC-NNN
- finish SPEC-NNN
- run the spec
- start the execution loop

**Preconditions:**

- spec has status active and specs/tasks/SPEC-NNN/GUIDE.md passes .sdlc/scripts/validate-guide.mjs (ADR-007)
- the plan-review gate passes (ADR-002, fail-closed): the _index.yaml plan_review block is present, approved, and not needs-rework — verify with .sdlc/scripts/plan-gate.mjs

**Exit condition:** single-executor delivery (ADR-003): the owner skill armed a session goal leash (.claude/.sdlc-goal-<session_id>, enforced by the Stop hook), kept a visible task list covering every guide step plus end-to-end validation and the integration gate, cut the integration branch feat/spec-NNN off main, and burned the guide's steps down ITSELF one at a time — each step gated by its own Verify: commands plus an executor self-review, landed via a short-lived PR into feat/spec-NNN that is merged and deleted before the next step starts, with no PR, branch or worktree left lingering; guide changes mid-run are logged in DECISIONS.md and listed under "## Guide changes" in the integration PR; sub-agent fan-out is the exception, for large specs with steps whose After: closures and Changes: do not overlap, and carries the same merge discipline. End-to-end validation ran ONCE before the gate with attached evidence. Exit (success) = the goal file is status:met and ONE integration PR (feat/spec-NNN -> main) is open, carrying every spec success criterion mapped to its evidence, having survived a full multi-lens adversarial review panel — independently dispatched, every envelope validated with .sdlc/scripts/validate-review-envelope.mjs, the constraints registry evaluated in full across the whole diff — looped until no blocker or major survives OR the three-round cap (ADR-004) is reached with every survivor named in a "## Disclosed, not fixed" section of the PR body, and LEFT OPEN for the human to review and merge. Nothing for a spec reaches main except by merging that branch; the agent never merges or pushes to main. A HALT is goal file status:escalated with a surfaced reason — security/data-loss/payment risk, an owner decision, the amendment cap (spec.version reaching 4), or a step that cannot land and cannot be fixed at the root

**Next step:** `spec-completion` — trigger: "close out SPEC-NNN"
<!-- sdlc:handoff:end -->
