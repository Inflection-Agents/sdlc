# SPEC-008 — decision log

One entry per step, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION` heading
goes in the moment it happens. Headings follow SPEC-008 Design > `DECISIONS.md` headings from run
start (bootstrap rule 5).

---

## EXECUTIVE DECISION — delivering SPEC-008 from a guide

**Date:** 2026-09-30
**Question:** `skills/spec-execution/SKILL.md` §1 refuses a spec without decomposed tasks, and
SPEC-008 has a guide, not tasks.
**Decided:** deliver from `specs/tasks/SPEC-008/GUIDE.md`. The owner's sign-off on PR #47 ("I
approve. activate and merge it.") authorized it, per SPEC-008 Design > Delivering SPEC-008 with the
process it creates. `plan-gate.mjs specs/tasks/SPEC-008/_index.yaml` exits 0. From run start the run
uses `claude/SPEC-008-S<n>` branches, `## S<n>` headings here, guide-change logging, and reads
`Changes:` for `touches` and the step PR body for per-AC evidence.
**Why:** SPEC-008 creates the guide tooling, so it cannot wait for that tooling to exist.
**Reversal path:** none needed after S6; the new skill text makes this the normal path.

---

## EXECUTIVE DECISION — guide change: S1 registers guide-schema under exempt:

**Date:** 2026-09-30
**Question:** S1 creates `skills/guide-schema.md`, and `validate-state-machine.mjs` fails on any
skills file that no phase or `exempt:` entry names. The guide put the `exempt:` entry in S6.
**Decided:** S1 adds `guide-schema` under `exempt:` in both state machines. S1's `Changes:` gains the
two state-machine files (that entry only), and S6's note is updated. No AC, scope item or design
decision changes.
**Why:** without it the S1 PR fails CI, and every step until S6 would too.
**Reversal path:** move the entry back to S6 and land S1 and S6 together.

---

## S1 — Guide tooling

**Merged:** PR #48
**What changed:** `validate-guide.mjs` (nine rules, 16 tests), `skills/guide-schema.md`,
`templates/guide.md`, and a CI step in both workflow copies. Run on this spec's own guide:
`node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-008/GUIDE.md` printed `OK`, with
`plan_review.approved: true` and `KICKOFF.md` at 3,060 characters, so rule 9 was exercised.
**Anything a later step must match:** the kickoff limit is the exported `KICKOFF_MAX_CHARS` (3800);
`guide-schema` is already under `exempt:`.

---

## EXECUTIVE DECISION — guide change: S2 lets a gap cite a guide step

**Date:** 2026-09-30
**Question:** the GAP schema in `skills/spec-schema.md` and `templates/gap.md` accept only a task id
in `discovered_in` and `resolved_by`, and a spec delivered from a guide has no task ids.
**Decided:** S2 changes both to a guide step `S<n>` and keeps a pre-ADR-007 task id valid on
existing gaps. S2's `Changes:` gains both copies of `templates/gap.md`. No AC, scope item or design
decision changes; `skills/spec-schema.md` was already in S2.
**Why:** without it the first gap raised in a guide run has no valid value to record.
**Reversal path:** revert the two template lines and the three schema rows.

---

## S2 — Spec schema and templates

**Merged:** PR #49
**What changed:** Criterion ids are required (SC-1:, AC-001:, legacy AC-NNN em-dash accepted) and adding one is a Cosmetic id-only edit. DECISIONS.md headings are ## S<n>, the fixed guide-change form, and ## Cross-step values. GAP artifacts cite S<n>.
**Anything a later step must match:** the guide-change heading is exactly `## EXECUTIVE DECISION — guide change: <summary>`; S3's PR template and AC-014 match against it.

---

## Cross-step values

Values a later step must match rather than re-derive.

| Value | Set by | Must match in |
| --- | --- | --- |
| `KICKOFF_MAX_CHARS` = 3800 (Unicode characters) | S1 | S4 `templates/kickoff.md`, skill text |
