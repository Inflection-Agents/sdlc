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
