# SPEC-NNN — authoring decision ledger

Written during `spec-authoring` Phase 1, as each decision is made and before the spec body exists.
`spec-authoring` Step 10a seeds this file to `spec-reviewer`, so the reviewer can see what was open,
what was decided, and what was left ambiguous on purpose, and does not reopen a settled question on
every round.

Lives at `specs/decisions/SPEC-NNN.md`. Append-only, in chronological order. One entry per question
that was open. A question with an obvious answer is not a decision and does not belong here.

**Name acceptance criteria by what they require, not by number.** This ledger is written before the
spec's AC list exists, and that list is renumbered as review rounds add and remove criteria. Write
"the criterion that `--ci` fails only active specs", not "AC-011". When you must cite a number,
re-check every such reference whenever the AC list is renumbered.

Phase 1 Step 3's research protocol writes the `## Research` section below. Keep it above the
decision entries, and add rows as research continues.

This is not `specs/tasks/SPEC-NNN/DECISIONS.md`. That file records what the executor decided while
delivering the spec. This one records what the author decided before the spec was written.

---

## Research

One row per question asked, including every search that found nothing. Name the git ref each answer
was checked against, so a reader can re-run it.

| Question | Command or path | Ref | Result |
|----------|-----------------|-----|--------|
| Which files implement the affected area? | `rg -l '<term>' src/` | `<sha>` | `src/billing/invoice.ts`, `src/billing/tax.ts` |
| Does any agent already read `<field>`? | `rg -n '<field>' agents/` | `<sha>` | 0 hits |

---

## D-001 — <the question, as a short statement of what was decided>

**Date:** YYYY-MM-DD
**Question:** what was open, and why it was not obvious.
**Decided:** what was chosen.
**Rejected:** each alternative, and the ground it was rejected on.
**Deliberately deferred:** what was left ambiguous on purpose, and who resolves it, or "Nothing."
**Raised by:** owner | author | reviewer (round N) | <role>
