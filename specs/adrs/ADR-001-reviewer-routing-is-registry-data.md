---
id: ADR-001
title: "Reviewer routing is registry data, not engine code"
status: proposed
spec: SPEC-006
date: 2026-06-23
author: franklin
superseded_by:
---

## Context

`execute-spec.js` resolves a review lens to its specialized reviewer agent through a hardcoded
`SPECIAL_REVIEWER` map plus a `lensToAgent` lookup (lines ~63–70). The lens registry,
`review-constraints.yaml`, already owns the *other* half of the policy — which lens fires for a given
task's `touches` — but it cannot say which agent grades that lens. So the binding lives in two conceptual
places (registry decides the lens, engine decides the grader), and adding or re-routing a specialist means
editing the engine.

The reference implementation (sqillpad-platform) hit exactly this. It kept two copies of the lens→agent map
(one in its execution workflow, one in its plan-review workflow), they drifted, and a registered lens
(`a11y-touch-target`) ended up with no specialist behind it in either path. Its SPEC-004 fixed this by
moving the binding into the registry as a per-constraint `agent:` field read by both workflows.

Alternatives considered:

- **Keep the hardcoded map** — simplest, but it is the status quo that drifted downstream and couples a data
  decision (who reviews what) to engine code.
- **A separate lens→agent config file** — removes the engine coupling but splits one policy ("this
  constraint governs this lens, graded by this agent") across two files that can disagree.

## Decision

The lens→reviewer binding is **data on the constraint that already owns the lens**. Each
`review-constraints.yaml` constraint gains an optional `agent:` field naming the reviewer `agentType`.
`execute-spec.js` resolves it generically:

```js
const agentForLens = (constraints, lens) =>
    ((constraints || []).find((c) => c.lens === lens && c.agent) || {}).agent || 'task-reviewer'
```

A constraint with no `agent:` is graded by the generic `task-reviewer`; integration-scope constraints are
graded by `integration-reviewer` at the integration gate and carry no `agent:`. The hardcoded
`SPECIAL_REVIEWER`/`lensToAgent` is deleted.

## Consequences

**Good.** Adding or re-routing a specialist is a one-line registry edit, no engine change. Lens firing and
lens grading live on one record, so they cannot disagree. The engine carries mechanism, not policy. Aligns
the upstream engine with the reference implementation that proved the pattern.

**Bad / costs.** The registry's constraints reference reviewer `agentType` strings that this repo does not
define as committed files (they are runtime-provided) — a typo'd `agent:` resolves to a missing agent at
run time rather than being caught statically. The unit test asserts resolution behavior but cannot verify a
named agent actually exists in the runtime.
