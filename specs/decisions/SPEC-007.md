# SPEC-007 — authoring decision ledger

Written during `spec-authoring` Phase 1, before the spec body existed. Seeded to `spec-reviewer` as
an input so the reviewer can see what was genuinely open, what was decided, and what was left
ambiguous on purpose — rather than re-deriving all three on every round.

Append-only, chronological. One entry per decision that was actually open. A question with an
obvious answer is not a decision and does not belong here.

This file is itself the first instance of the format SPEC-007 > Design > Lever 6 specifies. It was
moved from `specs/SPEC-007.decisions.md` to this path during round 1 of the spec review; see D-010.

---

## D-001 — All seven levers ship as one spec, not two

**Date:** 2026-09-11
**Question:** The authoring session's initial recommendation was two specs: the round cap and the
mechanical validator first, everything else once three capped rounds showed what survives.
**Decided:** One spec covering all seven levers.
**Rejected:** The two-spec split. The owner's ground: the levers interlock. A cap without stable
finding identity truncates the loop without making the survivors traceable, and a validator without
the research protocol still leaves the reviewer re-deriving repo state each round.
**Deliberately deferred:** Nothing. The sequencing survives as milestone ordering inside
`## Migration`, not as a spec boundary.
**Raised by:** owner

---

## D-002 — Spec size is not a lever in this spec

**Date:** 2026-09-11
**Question:** Findings-per-round scales with surface area, and the live corpus runs 174-470 lines
per spec (`wc -l specs/SPEC-*.md` at `a73eeb3`: SPEC-003 174, SPEC-004 247, SPEC-006 355, SPEC-002
465, SPEC-001 470). Cutting spec size was proposed as lever 5.
**Decided:** Out of scope. Specs stay whatever length they need to be.
**Rejected:** A size budget or a split-at-N-lines rule. The owner's ground: not an option for now.
**Deliberately deferred:** Whether size becomes a lever later, once the capped loop shows whether
large specs still dominate the survivor set. Nothing in this spec forecloses it.
**Raised by:** owner

---

## D-003 — The spec-side cap is 4 rounds, not 3

**Date:** 2026-09-11
**Question:** ADR-004 caps the integration gate at 3. Should the spec-side port match it?
**Decided:** 4.
**Rejected:** Matching ADR-004's 3 for symmetry. The owner set 4 directly. Symmetry between two
gates grading different artifacts is not itself a reason.
**Deliberately deferred:** Nothing. Both numbers are policy and both are revisable by amendment;
neither is load-bearing on any other part of the design.
**Raised by:** owner

---

## D-004 — Content-addressed finding IDs apply to both reviewers

**Date:** 2026-09-11
**Question:** Finding `id` lives in `skills/review-envelope.schema.json`, shared by the spec-side
and PR-side reviewers. Change one side or both?
**Decided:** Both. One envelope shape.
**Rejected:** Spec-side only. It would have kept the working delivery path untouched, at the cost
of a conditional in `.sdlc/scripts/validate-review-envelope.mjs` and two envelope shapes that drift.
The PR side also gains: ADR-004's `## Disclosed, not fixed` block becomes traceable across rounds.
**Deliberately deferred:** Nothing.
**Raised by:** author, decided by owner

---

## D-005 — The authoring decision ledger is a sidecar file

**Date:** 2026-09-11
**Question:** Where the Phase 1 ledger lives, given D-002 rules out shrinking spec bodies.
**Decided:** `specs/SPEC-NNN.decisions.md`, a sidecar, seeded to `spec-reviewer` as a new input.
**Rejected:** A `## Decisions` section in the spec body (grows an artifact the owner declined to
shrink, and puts rejected alternatives inside what the reviewer grades) and folding rationale into
the existing Design section (no durable home for deferred-on-purpose decisions).
**Deliberately deferred:** Nothing.
**Raised by:** author, decided by owner

---

## D-006 — Convergence is measured by findings-per-round, not by round count

**Date:** 2026-09-11
**Question:** A cap makes "≤4 rounds" true by construction, so it cannot serve as evidence the loop
converged rather than merely stopped.
**Decided:** Success criteria measure the shape of the decline (findings raised per round) and the
character of the survivors (owner-judgment calls, not mechanical defects), with round count recorded
but never treated as evidence on its own.
**Rejected:** Rounds-to-clean as the headline metric. It is the metric the cap invalidates.
**Deliberately deferred:** The numeric threshold for "small survivor set." SPEC-007 has no
instrumented baseline to set one against (see D-007), so SC-2 fixes the measurement protocol against
the review log and the measurement window in `## Risks & constraints` sets the comparison.
**Raised by:** author

---

## D-007 — No instrumented baseline exists, and this spec creates the first one

**Date:** 2026-09-11
**Question:** What the "10-15 rounds" figure rests on.
**Decided:** Record it as the owner's estimate, explicitly not a measurement, and treat the review
log from Lever 5 as the instrument that produces the first real baseline.
**Rejected:** Reconstructing a baseline from the existing corpus. There is nothing to reconstruct
from: `specs/gaps/` does not exist, no review log exists (`ls specs/*.json` at `a73eeb3` matches
nothing), and only two specs carry a `## spec_followups` section. The spec-review process leaves no
trace today.
**Deliberately deferred:** Nothing. The absence is stated in `## Risks & constraints` rather than
papered over.
**Raised by:** author

---

## D-008 — Lever 1 is spec-side only; Lever 4 stays both-sides with a line-independent key

**Date:** 2026-09-11
**Question:** Round 1 of the spec review raised two blockers, both from this spec reaching into the
PR-side path: Lever 1 put a PR-side cap constant into the shared routing policy, contradicting
SPEC-002 > Appendix B's exhaustive action set, and Lever 4 hashed `location`, which is `file:line`
PR-side, so any line shift would mint a new id for an unchanged defect.
**Decided:** Split them. Lever 1's `disclose_and_accept` is returned only for `artifact: "spec"`, so
no PR-side contract moves and no `depends_on: SPEC-002` edge is needed. Lever 4 keeps D-004's
both-sides scope but hashes a line-independent `location_key`: the section heading spec-side, the
file path with any `:line` stripped PR-side.
**Rejected:** Narrowing everything to the spec side, which would have dissolved both blockers but
reversed D-004 and left two envelope shapes to drift. Also rejected: paying the full contract cost
for a normative PR-side cap (a `depends_on: SPEC-002` edge plus Changelog annotations on two
completed specs), which buys nothing this spec's problem statement asked for.
**Deliberately deferred:** Nothing. The PR-side cap stays exactly where ADR-004 put it.
**Raised by:** spec-reviewer round 1 (both variants), decided by owner

---

## D-009 — `previous_output` is retained and projected from the review log, not replaced

**Date:** 2026-09-11
**Question:** The first draft of Lever 5 replaced `previous_output` with the review log. Round 1
graded that a blocker: SPEC-001's second success criterion requires both reviewers to consume the
same `previous_output` carry-forward contract and SPEC-001 AC-008 pins that contract's two
definitions,
and SPEC-001 is `status: completed`, so the extension pattern that was cited covers additions
"without modifying this spec's contracts" and does not reach a removal.
**Decided:** Keep `previous_output` as the transport and the section-text-identical carry-forward
rule exactly as SPEC-001 defines it. The log becomes the durable record that `previous_output` is
projected from, plus a new deterministic suppression step in the routing policy for `overridden` and
`wontfix` findings. All additive.
**Rejected:** Recording the supersession as a contract change against a completed SPEC-001. It would
have reopened a closed spec to buy something the additive design gets for free.
**Deliberately deferred:** Whether the byte-keyed carry-forward rule should eventually be replaced.
It is a real amplifier (SPEC-007 > Problem, defect 2) and this spec no longer touches it; the stable
ids from Lever 4 plus log-based suppression reduce its cost without changing the rule.
**Raised by:** spec-reviewer round 1 (default variant), decided by author

---

## D-010 — The ledger lives in `specs/decisions/`, not at the top level of `specs/`

**Date:** 2026-09-11
**Question:** D-005 chose a sidecar at `specs/SPEC-NNN.decisions.md`. Round 1 found that
`archive-specs.mjs:40` (`:48` at `db3675b`) filters the live corpus with `SPEC_FILE = /^spec-\d+.*\.md$/i`,
which that path matches, so the archiver would have treated the ledger as a spec with no frontmatter.
**Decided:** `specs/decisions/SPEC-NNN.md`. The scan at `archive-specs.mjs:171` is non-recursive, so
a subdirectory keeps the sidecar out of the spec enumeration entirely. The review log gets the
matching treatment at `specs/review-logs/SPEC-NNN.json`.
**Rejected:** Keeping the top-level path and adding an exclusion rule to the archiver, the index
generator and the CI boundary check. Three exclusions that must stay in sync beat one directory only
if the directory costs something, and it does not.
**Deliberately deferred:** Nothing. Archiving the sidecars alongside their spec is still explicit
work, covered by AC-023.
**Raised by:** spec-reviewer round 1 (adversarial variant), decided by author

---

## D-011 — `wontfix` is owner-only and is disclosed, not silent

**Date:** 2026-09-11
**Question:** Round 2 found that the `wontfix` resolution introduced in round 1 was a stronger
suppression authority than anything the corpus has. `spec-schema.md:149` (at `db3675b`; `:143` at `a73eeb3`) lets an override only
downgrade severity, and `skills/spec-reviewer/SKILL.md:17` states overrides "are visible in the spec,
never silenced." A `wontfix` dropped a finding outright, with no named actor and no place a reader
would see it, and a `wontfix` blocker would escape SC-1 entirely: not carried to another round, and
not in `## Disclosed, not reviewed-clean`, which lists only findings that survive to the cap.
**Decided:** Keep `wontfix` but constrain it three ways. Owner-only, never the author or a reviewer.
Each entry requires a paired `spec_review_overrides` entry carrying the reason, so the judgment is
visible in the spec body. And a `wontfix` on a `blocker` or `major` is listed in
`## Disclosed, not reviewed-clean` alongside the cap's survivors.
**Rejected:** Restricting `wontfix` to `nit` and `suggestion`, matching the `spec_followups`
precedent. It is the tidier rule, but it removes the owner's ability to close out a finding they
judge simply wrong, leaving only a downgrade that keeps re-appearing in every later round's envelope.
The disclosure requirement buys back the visibility without removing the capability.
**Deliberately deferred:** Nothing.
**Raised by:** spec-reviewer round 2, decided by author

---

## D-012 — SC-3 is measured from the review log, because the command version could not fail

**Date:** 2026-09-11
**Question:** Round 1 rewrote SC-3 to be checkable by re-running `validate-spec.mjs` against the
round-1 draft. Round 2 found that unfalsifiable: the dispatch-gating AC blocks the reviewer
dispatch until that
script exits `0`, so the draft the reviewer saw has already passed it and the re-run passes by
construction, on every spec, regardless of how the review went.
**Decided:** Count from `specs/review-logs/SPEC-NNN.json` instead: zero round-1 findings whose
`location` and `criterion` name a defect Lever 2 lists among the validator's checks.
**Rejected:** Adding a `gap_category` field to the envelope so the count could be mechanical. It
changes what the reviewer emits, which `## Scope` > Out of scope rules out, to buy precision the log
already supports.
**Deliberately deferred:** Nothing. The adjudication is the owner's at `spec-completion`, same as
SC-2's.
**Raised by:** spec-reviewer round 2, decided by author

---

## D-013 — An override's severity lives on the review-log entry

**Date:** 2026-10-02
**Question:** Round 4 left a major open (F-001). AC-018 has the routing policy apply the owner's
severity to an `overridden` finding, but nothing put that severity in the review log, so the only copy
was the spec body's `spec_review_overrides` section. The two options were a field on the log entry,
or a stated join from the log to the spec body by `finding_id`.
**Decided:** the log entry carries `owner_severity`. The routing policy reads one file. The spec body's
`spec_review_overrides` entry stays as the visible record `spec-schema.md` requires, written in the
same edit.
**Rejected:** the join. One copy of the severity, but the policy would read two files, and a join on
an id is exactly the binding this spec exists to make reliable.
**Deliberately deferred:** Nothing.
**Raised by:** spec-reviewer round 4, decided by owner

---

## D-014 — `validate-spec.mjs --ci` fails only an `active` spec

**Date:** 2026-10-02
**Question:** The draft failed CI for any non-draft spec. At `db3675b` every spec but this one is at a
terminal status, and a terminal spec is closed to editing, so a failing closed spec would have turned
CI red with no legal edit to fix it.
**Decided:** `--ci` fails a `status: active` spec and warns for every other status. A closed record is
fixed only if `spec-amendment` reopens it, which makes it `active` again and so graded.
**Rejected:** failing every non-draft spec; carving terminal specs out silently.
**Deliberately deferred:** Nothing.
**Raised by:** author, during the 2026-10-02 revision

---

## D-015 — SC-4 holds for findings the later round reproduces

**Date:** 2026-10-02
**Question:** Round 4 left a major open (F-002). ADR-006 records that a reviewer that rephrases a
defect mints a new id, so the override does not follow it, yet SC-4 claimed the override held in every
later round.
**Decided:** SC-4 is scoped to rounds that reproduce the finding's `location`, `criterion` and
`finding` text, and the rephrasing risk is listed in `## Risks & constraints`.
**Rejected:** keeping SC-4 absolute by also matching on `location` and `criterion` alone. Two distinct
defects often share both, so the fallback would bind an override to a finding the owner never ruled on,
and it would change ADR-006's design.
**Deliberately deferred:** a fuzzier identity, if the review log shows rephrasing is common.
**Raised by:** spec-reviewer round 4, decided by owner

---

## D-016 — The draft is revised onto delivery guides and layout 2, with one verify round

**Date:** 2026-10-02
**Question:** SPEC-007 was drafted before SPEC-008 replaced task decomposition with delivery guides and
before SPEC-009 moved the framework's files under `.sdlc/`. Its milestones assumed tasks, and its
paths assumed the old layout.
**Decided:** the milestones become delivery-guide steps, every path uses the layout-2 form, and every
citation is re-checked at `db3675b`. The two round-4 majors close by D-013 and D-015, and the three
round-4 nits close in the same revision. One `spec-reviewer` round grades the revision before
sign-off.
**Rejected:** signing off with no further review; a full new four-round cycle.
**Deliberately deferred:** Nothing.
**Raised by:** owner
