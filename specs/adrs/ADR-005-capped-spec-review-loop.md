---
id: ADR-005
title: "The spec-side review loop is capped at four rounds"
status: proposed
spec: SPEC-007
date: 2026-09-11
author: franklin
superseded_by:
---

## Context

ADR-004 capped the integration gate at three rounds after a downstream spec ran it for twenty-six
rounds across four days. The mechanism it identified was not a decreasing series of defects but a
loop generating them at roughly the rate it closed them, because every round's fixes became the next
round's review surface.

That fix was never ported one phase upstream. The spec-side loop still runs unbounded:
`skills/spec-authoring/SKILL.md:330` says "Continue looping until there are no remaining
un-overridden blockers or majors," `skills/spec-amendment/SKILL.md:323` says the same for
amendments, and the shared routing policy that backs both returns `fix_loop` on any blocker or major
with no round counter in the policy block (`skills/review-primitives.md:232-263`, checked at
`a73eeb3`).

The spec side reproduces ADR-004's failure mode with two amplifiers the PR side does not have.
Carry-forward is keyed on section text bytes (`skills/spec-reviewer/SKILL.md:26`), so fixing a
finding in a section drops carry-forward for every other finding in that same section, and a fresh
clean-context reviewer raises them again. And owner overrides bind to ordinal finding ids
(`skills/spec-schema.md:141`), which a fresh agent re-mints each round, so an override does not
survive to the round after the one that recorded it. A loop that closes findings honestly while
regenerating them has no fixed point, and the owner reports 10-15 rounds to reach a clean spec.

ADR-004 also recorded why an escape hatch keyed on a stuck finding cannot fire here: "The same
finding surviving two rounds" matches one defect the author keeps failing to close, while a loop
producing a genuinely new finding set each round keeps that trigger silent for as long as the
operator has patience. The same reasoning applies unchanged to the spec side.

An alternative was considered and rejected: fix only the amplifiers (SPEC-007 Levers 2 and 4 through
7) and leave the loop unbounded, on the theory that a loop fed better inputs converges on its own.
That theory is untestable in advance and fails open. If it is wrong, the cost is another spec ground
through 15 rounds before anyone knows. A cap fails closed, and the amplifier fixes still ship.

## Decision

**The spec-side review loop runs at most four rounds. A fifth is not run.**

Four, not ADR-004's three. The two gates grade different artifacts, and the owner set the spec-side
number directly; symmetry between them is not itself a reason to match.

Whatever blocker or major survives round 4 is disclosed instead of fixed. It goes into a
`## Disclosed, not reviewed-clean` section of the spec body, one line per finding, naming its stable
id, the round it was first raised in, its severity, the criterion it cites, the location it points
at, and why it was not closed. The owner
then signs off with the survivors named in front of them.

The round counter and the new `disclose_and_accept` action live in the shared routing policy in
`review-primitives.md`, so `spec-authoring` and `spec-amendment` inherit one rule rather than
carrying two copies. The cap exists in exactly one place, which is what lets the rollback be a single
revert.

**This decision reaches the spec side only.** `disclose_and_accept` is returned only when
`artifact == "spec"`; for a PR artifact the policy behaves exactly as it does today. ADR-004's cap of
three stays where ADR-004 put it, and SPEC-002 > Appendix B, which enumerates the PR-side return set
exhaustively as `fix_loop`, `batch_followup_and_accept`, `accept` and `escalate`, stays true. An
earlier draft of this ADR placed a PR-side constant in the shared policy, which would have
contradicted that enumeration and quietly added a site to ADR-004's documented reversal path.

The owner's sign-off authority is unchanged. This ADR bounds what the reviewer loop costs before
that sign-off; it does not move who gives it.

## Consequences

**Good.** The loop terminates. Four rounds is a bound an author can plan against and an owner can
budget. The disclosed set is a visible, gradeable artifact that travels with the spec into
decomposition and delivery, so a criterion nobody could make testable is known to the executor rather
than discovered by it. The cap also converts the review from an open-ended grind into a dated
decision, which is what makes the surviving risk assignable.

**Bad.** A spec can now reach `status: active` with a known surviving blocker. That is worse here
than at the integration gate in one respect and better in another: the error propagates further,
because every task decomposed from the spec inherits it, but the artifact is far cheaper to change,
because no code has been written against it yet. The disclosure section and `spec-amendment` are the
controls, and the guardrail in SPEC-007 > Risks & constraints arms a rollback to the unbounded loop
if the defect escape rate rises.

**Also bad.** A cap makes "the loop finished in four rounds" true by construction, which destroys
round count as evidence of quality. SPEC-007's SC-2 therefore measures first-appearance findings per
dispatched reviewer, normalized so that the two-reviewer first round cannot manufacture the decline,
and the review log introduced alongside this ADR is what makes that measurable at all.
