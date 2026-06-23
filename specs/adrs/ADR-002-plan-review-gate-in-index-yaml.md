---
id: ADR-002
title: "The plan-review gate is enforced in _index.yaml, two-stage, fail-closed"
status: proposed
spec: SPEC-006
date: 2026-06-23
author: franklin
superseded_by:
---

## Context

Plan review in the upstream engine is conversational: `spec-authoring` Step 10a runs `spec-reviewer` over
the spec, and `task-decomposition` ends with a "USER APPROVES PLAN" gate. Neither produces a durable verdict
the execution engine checks, and `execute-spec.js` has no `plan_review` reference — its only Plan-phase
precondition is `status: active`. The gate is therefore structurally skippable: a spec can be executed
whether or not its plan was ever reviewed or approved.

We want the gate enforced. The design question is *where the verdict lives and what it attests*, complicated
by a structural fact: `_index.yaml` (where the reference implementation records `plan_review`) is created by
`task-decomposition` and does not exist at `spec-authoring` time. "The plan" that `execute-spec` runs is the
spec **and** its decomposition into tasks.

Alternatives considered:

- **Authoring-time stamp in the spec frontmatter** (gate reads the spec doc): smallest change, no
  `_index.yaml` dependency — but it attests only that the *spec* was reviewed, never the decomposition. The
  engine would faithfully run whatever tasks were produced, ungated.
- **A new post-decomposition review phase** that grades spec + tasks and stamps `_index.yaml`: most faithful
  to the reference implementation's `review-spec` workflow, but adds a distinct phase rather than reusing the
  approval gate `task-decomposition` already has, and pulls toward mechanizing the loop (explicitly out of
  scope for SPEC-006).

## Decision

The plan-review verdict is a top-level **`plan_review:` block in `_index.yaml`**, produced in **two stages**
and enforced **fail-closed**:

1. **Spec stage:** `spec-authoring` Step 10a (`spec-reviewer`) — unchanged.
2. **Decomposition stage:** `task-decomposition`'s existing approval gate is hardened to stamp the block
   (`approved: false`); the **owner** sets `approved: true`. The human stays the sign-off authority; the
   verdict becomes durable and machine-readable.

`execute-spec` computes a pure verdict at the Plan phase, before spawning any executor:

```js
const planApproved = (pr) => !!pr && pr.approved === true && pr.status !== 'needs-rework'
```

A *missing* `plan_review` block is treated identically to an unapproved one — HALT. The block is additive to
the `_index.yaml` schema (files without it stay schema-valid), but the engine fails closed on it.

## Consequences

**Good.** The gate is structural and un-skippable. The verdict lives where `execute-spec` already reads,
post-decomposition, so it attests the spec *and* the plan that actually executes. Reuses the existing
approval gate — no new phase, and no commitment to mechanizing the loop. Fail-closed means a forgotten review
blocks loudly instead of passing silently.

**Bad / costs.** Existing `_index.yaml` files must be back-filled or the fail-closed gate retroactively
blocks them (handled by a back-fill AC in SPEC-006). The `approved` flag is owner-set by hand — an honest
human gate, but one more manual step, and nothing prevents an owner from rubber-stamping `approved: true`
without a real review. The verdict records *that* the plan was approved, not the review's contents (that
remains in `spec-reviewer` output / conversation until the deferred `review-spec.js` loop records it).
