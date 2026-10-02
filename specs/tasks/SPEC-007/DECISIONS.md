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
