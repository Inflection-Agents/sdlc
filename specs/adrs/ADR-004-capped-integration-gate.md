---
id: ADR-004
title: "The integration gate is capped at three rounds"
status: accepted
spec: none
date: 2026-09-09
author: franklin
superseded_by:
---

## Context

ADR-003 removed per-task review and concentrated every bit of review rigor at one integration gate.
Its capability-disposition table considered a round cap at that gate and rejected it: the
`Capped fix loop (≤3)` row keeps the cap per task and says of the gate "there is no round cap: the
same finding surviving two rounds escalates."

That row was written on 2026-08-14 with no data on how gate rounds actually behave, because no spec
had yet run the gate at length. Downstream evidence has since arrived. One spec ran the integration
gate for twenty-six rounds across four days, and the round headings its own operator wrote record
the shape of the failure:

- Round 11: "the round-10 fixes contradicted themselves"
- Round 15: "round 14 broke three things while fixing nine"
- Round 25: "round 24 fixed two real holes and pinned neither"

The loop was not finding a decreasing series of defects; it generated them at roughly the rate it
closed them. Every round's fixes became the next round's review surface.

The escape hatch ADR-003 chose never fired, and could not have fired. "The same finding surviving
two rounds" matches a STUCK finding: one defect the executor keeps failing to close. A loop that
closes findings honestly while creating new ones produces a genuinely new finding set each round, so
no single finding ever survives twice and the trigger stays silent for as long as the operator has
patience. The trigger was aimed at the wrong failure mode.

## Decision

**The gate runs at most three rounds. A fourth round is not run.**

Whatever blocker or major survives round 3 is disclosed instead of fixed. It goes into a
`## Disclosed, not fixed` section of the integration PR body, one line per finding, naming the
criterion or constraint it grades, the location it cites, and why it was not closed. The PR is still
left open for the human, exactly as ADR-003 requires. What changes is that the human decides with the
survivors named in front of them, at a bounded cost, on a known date.

This supersedes two sites in ADR-003: the `Capped fix loop (≤3)` row of its capability table and the closing clause of Decision item 10, which states the same uncapped loop as body prose, `Capped fix loop (≤3)`, and with it
the "same integration finding surviving two panel rounds" halt trigger that row justified. Every
other row stands: single-executor delivery, the multi-lens gate panel, the constraints-registry
fan-out and the branch discipline are all unaffected. ADR-003's `superseded_by:` frontmatter stays
empty on purpose, because stamping the whole ADR dead over one row would be false. The reversal is
recorded inline at both sites instead, and named here.

## Consequences

**Good.** The gate terminates. Three rounds is a bound an executor can plan against and an owner can
budget. The disclosed set is a visible, gradeable artifact: the human reads the PR body and sees what
the panel could not close, and the residual-risk decision lands with the person who merges it.

**Bad.** The phase can now exit with a known surviving blocker. ADR-003 accepted the loss of the
mandatory Tier-0 `tester` gate and of per-task review specifically because the integration gate
looped to clean, so capping that loop removes part of the compensating control those losses were
traded against. A spec that genuinely needed a fourth round now stops at three.

**Mitigation.** Disclosure is mandatory and lives in the PR body, on the artifact the human already
has open, not in a decision log nobody reads. A disclosed blocker is a blocker seen before the merge
button.

**Reversal path.** Delete the cap and the disclosure clause from the `spec-execution`
`exit_condition` in `specs/sdlc-state-machine.yaml`, run `node scripts/sdlc/gen-handoffs.mjs` to
regenerate `.ai/sdlc.md` and the `spec-execution` handoff region, and restore the escalation trigger
in the five hand-edited sites: `.ai/skills/spec-execution/SOP.md` §7.3 and §8,
`.ai/skills/spec-execution/SKILL.md` §8 prose, `agent-orchestration.md`, and
`.claude/hooks/stop-handoff.mjs`.
