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

---

## S6 — The authoring decision ledger

**Merged:** PR #83
**What changed:** authoring-decisions.md template; Phase 1 writes specs/decisions/SPEC-NNN.md and Step 10a seeds it; the archiver moves the ledger and review log with their spec and no longer fences live directories on restore.

---

## EXECUTIVE DECISION — guide change: S7 corrects spec-completion's index instruction

**Date:** 2026-10-02
**Question:** `spec-completion` Step 9 said to update `spec-index.json` "or let CI regenerate it". S7 makes CI check the index instead of regenerating it, so a completion that followed that line would turn CI red. And because archiving changes a spec's `path`, the index must be regenerated after the archive move.
**Decided:** add `skills/spec-completion/SKILL.md` to S7's `Changes:` and make Step 9 regenerate the index after the archive move, in the same commit. No AC, scope or design changes.

---

## S7 — The spec index

**Merged:** PR #84
**What changed:** gen-spec-index.mjs writes specs/spec-index.json (documented shape plus owner, workspaces, depends_on; archived records at their archive path); CI runs --check in both workflows. Guide change: spec-completion regenerates the index after archiving.

---

## S8 — Reviewer inputs that resolve, and the research protocol

**Merged:** PR #85
**What changed:** Step 10a and Step 6c mark every input that can be absent as optional and say how to report it; Step 3 gains the five-question research protocol writing to the ledger's ## Research table, negative results included.

---

## Simplify pass, and a defect it found

**Merged:** ec59439 (fast-forwarded onto `feat/spec-007`, per SOP §6.1), then a fix PR.
**What changed:** The simplify pass removed duplication in the six new or changed scripts, with no behaviour change: 417 of 417 tests passed before and after. It also reported a defect in S6's archiver code. `main()` called `scanArchived()` three times, and each call builds new objects, so `toRestore.includes(s)` was always false. A spec being restored therefore counted as both archived and live, and a ledger or review log it already had in the live corpus was moved into the archive while the spec moved out. The fix scans the archive once. A regression test reproduces the defect before the fix and passes after it.

---

## Gate round 1 — 4 reviewers, 8 distinct majors fixed at the root

**Panel:** `integration-reviewer`, `task-reviewer` (conventions, SDLC-GATE-TESTED), `security-reviewer`, `pr-reviewer` (adversarial). All four envelopes validated with `--stamp`; the integration reviewer re-emitted once to fix an out-of-enum severity.
**Fixed:**
- A ruling now records `ruled_severity` and covers only that severity. A finding raised higher routes as raised, and its log entry reopens with the old ruling kept under `superseded_ruling`. This was raised by three reviewers.
- `check` now applies every rule `resolve` enforces, through one shared `rulingProblems`, so a hand-written log is held to the same rules.
- Amendment rounds: `append --review v<N>-amendment` restarts the policy round at 1, while the log numbers rounds globally. Raised by two reviewers.
- `findById` no longer returns a spec's ledger or review log, so `check` and the `depends_on` check read the spec itself. Raised by two reviewers.
- Companions no longer put one id on both sides of the archive boundary, which had made the sidecars move back and forth.
- The ledger is the author's record, so `spec-reviewer` still raises a blocker or major it touches, citing the entry.
- `stamp-envelope.mjs` is a new name, so `run.mjs` runs the plugin's copy in a repo synced before ids existed, where the old validator reads `--stamp` as a path.
- The nits are fixed too, each with a test: CRLF frontmatter, block-style lists, double-backtick spans, fenced-only sections, placeholder locations, `file:line:col`, NUL in hashed fields, `artifact_id` checks, a symlinked log, usage exit codes, the untracked-sidecar precheck, archive summary counts, the payload workflow's `review-log check`, the `cli-invocation` rows, AGENTS.md marked optional in `spec-reviewer`, and the README, `complete-spec` and RELEASING notes.

**Accepted, not fixed:**
- No idempotency guard on `append`. Two clean round-1 variants have identical (empty) id sets and the same `reviewed_by`, so a guard would refuse a legitimate second envelope.
- `fixed` is recorded for a finding a later round did not re-raise. AC-019 fixes the resolution set at `fixed | overridden | wontfix | open`, so renaming the state is a spec change, not a gate fix.
