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

## Cross-step values

Values a later step must match rather than re-derive.

| Value | Set by | Must match in |
| --- | --- | --- |
