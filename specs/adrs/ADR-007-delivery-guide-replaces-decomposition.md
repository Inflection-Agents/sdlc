---
id: ADR-007
title: "A delivery guide, approved with the spec, replaces the task-decomposition phase"
status: proposed
spec: SPEC-008
date: 2026-09-29
author: franklin
superseded_by:
---

## Context

ADR-003 made one executor deliver the whole spec, implementing every task inline, with no per-task
reviewer (`specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:76-86`). It kept the
decomposition phase in front of delivery, so `spec-execution` still refuses a spec until its tasks
are decomposed (`skills/spec-execution/SKILL.md:28`).

Task files were designed as the full brief for a zero-context executor and reviewer
(`skills/task-decomposition/SKILL.md:23`). After ADR-003 neither reader exists. Across all six
decomposed specs, task files are as long as the specs they restate (22,013 ÷ 21,654 words = 1.02,
SPEC-008 `## Problem`). The last three framework PRs (#43, #44, #45) created no task files and ran
outside the delivery skill's guardrails.

Three options were considered:

1. **Keep decomposition and add a guide as an optional lighter path.** Seven consumers read the task
   layout (SPEC-008 Design > Alternatives considered), and each would have to handle two layouts.
   ADR-003 decision 2 rejected a dormant second path for the same reason.
2. **Drop the plan entirely and let the executor plan at run start.** This removes the owner's plan
   approval, which ADR-002 makes a fail-closed gate.
3. **Replace decomposition with a short delivery guide, written at the end of spec authoring and
   approved in the same sign-off as the spec.**

## Decision

Option 3.

1. The `task-decomposition` phase and skill are deleted. `spec-authoring` hands off to
   `spec-execution`, and so does `spec-amendment`.
2. Each spec's plan is `specs/tasks/SPEC-NNN/GUIDE.md`. It lists ordered steps, and each step names
   the spec ACs it covers, the paths it changes and the command that verifies it. The guide also
   lists owner decisions and the end-to-end validation. `_index.yaml` keeps `plan_review:` and
   `phase:`, and lists step statuses and owner-decision statuses.
3. `scripts/sdlc/validate-guide.mjs` checks the guide mechanically (every AC covered, every step
   complete, index and guide agree, guide current with the spec version). `spec-reviewer` does not
   grade the guide.
4. **ADR-002's gate mechanism is kept.** `plan-gate.mjs` still fails closed on `plan_review:`. The
   owner approves the guide in the same sign-off that makes the spec `active`.
5. **This supersedes ADR-003's precondition that tasks are decomposed, and the part of ADR-003's
   tier-resolution row that keeps `tier:` as a task input.** A step carries `Risk:` and no tier; the
   registry sets the gate's rigor. ADR-003's delivery loop,
   integration branch, end-to-end validation and capped gate (ADR-004) are unchanged, with a guide
   step as the unit of the loop.
6. The executor may reorder, split, merge, add or cancel steps, or add an owner decision, during a
   run when no AC, scope item or design decision changes. It logs each change in `DECISIONS.md` and lists it under
   `## Guide changes` in the integration PR body. The run does not pause for re-approval. Anything
   else routes to `spec-amendment`.
7. The integration PR stays blocked while an owner decision is pending, a step is unfinished
   (including a `Run by:` step a human performs), or a step is deferred without a decided owner
   decision accepting it. That keeps ADR-003's rule that a pending `human`-routed task blocks the
   gate.

## Consequences

**Good.** One sign-off and one PR between an active spec and delivery. The planning artifact drops
from about the length of the spec (1.02) to a target of 0.30 or less (SPEC-008 SC-2). The path the
team already uses gains the plan gate, the goal leash and the visible task list.

**Bad.** ADR-002's approval now attests the guide as approved, not the guide as executed. ADR-002
said the verdict covers "the plan that actually executes," and decision 6 narrows that: the owner
sees mid-run guide changes at the integration PR, after the work is done. The owner chose this over
pausing the run.

Boundary decisions that decomposition forced up front (interface names,
cross-workspace order) can now be made during the run. They are recorded in `DECISIONS.md` and
graded at the integration gate, which is later and costlier than catching them in a plan review.
Per-task Linear issues go away, so a PM tracks progress through the spec's Linear project and the
`_index.yaml` step statuses. A spec that needs more than 10 steps must be split, where before it
could be decomposed. Adopters take a major-class change, shipped as `0.3.0` under the pre-1.0 rule
(SPEC-008 AC-017). Each in-flight decomposed spec needs a guide before its next run, and each adopter
updates their own copy of the state machine.

**Reversal.** SPEC-008 Migration > Rollback plan: revert the merge commit and ship `0.4.0`. The
deleted skill, schema and template return intact.
