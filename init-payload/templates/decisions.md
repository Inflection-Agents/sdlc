# SPEC-NNN — decision log

One entry per task, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION`
heading goes in the moment it happens, not batched at the end.

This log is what makes the narrow escalation bar safe. `spec-execution` escalates on four
checkable triggers and decides everything else; without a written record that trade is
invisible, and a reader cannot reconstruct why a run diverged. Entries are append-only and
in chronological order.

---

## TASK-NNN — <title>

**Merged:** PR #N
**What changed:** one or two sentences. What a reader needs to know, not a diff summary.
**Anything a later task must match:** values, names or shapes another task cannot re-derive.
Omit the line if there are none.

---

## EXECUTIVE DECISION — <one-line summary>

**Date:** YYYY-MM-DD
**Question:** what was genuinely open. If it was not open, this is not an executive decision.
**Decided:** what was chosen.
**Why:** the reasoning, including what was rejected and on what grounds.
**Reversal path:** what to change to undo it.

---

## SPEC DEVIATION — <one-line summary>

**Date:** YYYY-MM-DD
**Spec says:** quote it.
**Built instead:** what shipped.
**Why the spec was wrong:** the implementation-level mismatch that forced it.

A deviation may fix an implementation-level mismatch. It may **never** narrow or reinterpret a
stated success criterion — that changes what "done" means, and goes to `spec-amendment` as a
version bump, not into this log.

---

## Cross-task values

Values a later task must match rather than re-derive. Fill as they are set, not at the end.

| Value | Set by | Must match in |
| --- | --- | --- |
