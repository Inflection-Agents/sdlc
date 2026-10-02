# SPEC-007 — decision log

One entry per guide step, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION`
heading goes in the moment it happens, not batched at the end.

---

## EXECUTIVE DECISION — no session task-list tool

**Date:** 2026-10-02
**Question:** spec-execution asks for a visible session task list, and this session exposes no task-list tool.
**Decided:** the run's status surface is `_index.yaml`, which each step flips as it merges, together with this log and a short report as each step merges.
**Why:** it is the same substitute SPEC-009's run used, and it keeps the three status records in agreement.

---

## EXECUTIVE DECISION — guide change: S1, S2 and S8 regenerate the released-payload manifest

**Date:** 2026-10-02
**Question:** S1 and S2 edit `review-primitives.md`, and S8 edits a template. All three files ship in the payload, and `lib/released-payloads.json` records every payload byte, so CI's `--check` fails unless the same step regenerates it. None of the three steps listed the manifest in `Changes:`.
**Decided:** add `scripts/sdlc/lib/released-payloads.json` to the `Changes:` of S1, S2 and S8. No AC, scope or design changes.

---

## S1 — Cap the spec-side loop at four rounds

**Merged:** PR #78
**What changed:** The routing policy caps the spec-side loop with one constant, SPEC_REVIEW_ROUND_CAP = 4, and returns disclose_and_accept there; the PR side is unchanged. spec-schema declares ## Disclosed, not reviewed-clean and resolution: wontfix.

---

## S2 — One reviewer per round after the first

**Merged:** PR #79
**What changed:** Step 10a states the per-round reviewer count once: both variants in round 1, default alone after, both whenever the AC-010 measurement runs. spec-amendment and review-primitives cite it.

---

## S3 — validate-spec.mjs before the reviewer, and in CI

**Merged:** PR #80
**What changed:** validate-spec.mjs decides the eight mechanical checks and emits the review envelope; Step 10a runs it before every dispatch; CI runs --ci, failing only active specs. spec-schema declares depends_on. Finding ids are still ordinal; S4 makes them content-addressed.

---

## EXECUTIVE DECISION — guide change: S4 adds a shared id helper and updates every envelope-validation instruction

**Date:** 2026-10-02
**Question:** S4's `Changes:` did not list three things the step needs. Both `validate-review-envelope.mjs` and `validate-spec.mjs` compute ids, so the hash belongs in one place. `validate-spec.mjs` emits envelopes, so it must emit stamped ids. And every skill that says "validate the envelope" must now say "stamp, then validate".
**Decided:** add `scripts/sdlc/lib/finding-id.mjs` and its payload copy, `validate-spec.mjs` with its test and payload copy, and the `spec-authoring`, `spec-amendment` and `spec-execution` (skill and SOP) instructions to S4's `Changes:`. No AC, scope or design changes.

---

## S4 — Content-addressed finding ids

**Merged:** PR #81
**What changed:** Finding ids are sha256 of location_key, criterion and finding; the validator recomputes them and --stamp sets them, so every validate instruction now stamps first. Example envelopes re-stamped and grounded. Guide change: shared lib/finding-id.mjs plus the skill files carrying the validate instruction.

---

## EXECUTIVE DECISION — guide change: S5 records the policy's new ruling step in SPEC-001's Changelog

**Date:** 2026-10-02
**Question:** S5 adds a `review_log` input and a ruling step to the routing policy in `review-primitives.md`. That file states it is content-equivalent to SPEC-001 plus the extensions SPEC-001's Changelog records, so a policy change with no Changelog entry would make the statement false. S5's `Changes:` did not list SPEC-001.
**Decided:** add `specs/SPEC-001-tiered-code-review.md` (Changelog only) to S5's `Changes:` and record the step as SPEC-001 v1.6, as S1 did for v1.4 and S4 for v1.5. No AC, scope or design changes.

---

## S5 — The durable review log, projection and suppression

**Merged:** PR #82
**What changed:** review-log.mjs appends stamped rounds, records owner-only paired rulings, projects previous_output and applies rulings before routing; the policy gains the review_log step. Guide change: SPEC-001 Changelog v1.6.

---

## EXECUTIVE DECISION — a restore no longer fences the live specs directory

**Date:** 2026-10-02
**Question:** S6 found a defect in `archive-specs.mjs` > `move()`: it wrote a `*` `.ignore` fence into the destination directory of every move. On a restore that directory is `specs/` (or `specs/tasks/`), so reopening an archived spec would have hidden the whole live corpus from search. S6 routes ledger and log restores through the same function, so it had to change either way.
**Decided:** fence only a destination under `specs/archive/`, and create a live destination without a fence. The new AC-023 test asserts that a restore leaves no `specs/.ignore`. This is inside S6's `Changes:` and changes no AC, scope or design.
