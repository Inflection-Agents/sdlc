# Enforcement tiers and review-loop convergence

Design doc. Status: approved for planning, 2026-09-09.
Source: port-back analysis of `high-gear` @ `597a180a7`, graded by a three-lens
adversarial panel (port fidelity, empirical feasibility, doctrine conflict).

## Problem

The framework ships six enforcement tiers and only three are at parity with the
repo that uses it hardest. Commit-time and merge-time are absent. The write-time
tier blocks but never informs. Every CI check grades changed files, so a defect in
a file nobody touches is invisible.

The measured cost sits in two places. Across 163 session transcripts downstream,
221 of 398 blocker and major findings (55.5%) cited rules that already existed and
were not found, and 242 of 398 were decidable before a line was written. Separately
the integration-gate panel does not converge: one spec ran 26 rounds, and round 15's
own heading reads "round 14 broke three things while fixing nine."

## What the panel changed

The first draft of this design had nine blockers across three lenses. Three findings
were reproduced by experiment rather than argued. The corrections that reshaped it:

1. Archiving from `pre-commit` corrupts the index on a pathspec commit. Git runs
   hooks against a temp index, so the `git mv` commits while the real index stages a
   rename back to paths that no longer exist. Reproduced. Upstream removed this in
   `597a180a7` with a written postmortem, one commit after the commit this design
   originally quoted as doctrine.
2. A gate round cap reverses `ADR-003:277` by name. That row considered a cap and
   chose "the same finding surviving two rounds escalates" instead.
3. Four of the review-loop text edits land in regions generated from
   `specs/sdlc-state-machine.yaml`. `sdlc-validate.yml:33` already runs
   `gen-handoffs.mjs --check`, so hand-editing them reddens CI immediately.
4. `altitude` routing semantics already ship in `review-envelope.schema.json:48-51`.
   The defect is that `review-primitives.md` omits a field its own schema defines.
5. Archiving moves five specs, not two, and `rg -g '*.md'` defeats the `.ignore`
   fence. That is the form the agent's Grep tool emits.
6. The upstream completion workflow ends at `gh pr create`. A second auto-merge
   workflow lands it, and `.ai/CLAUDE.md:73` says this framework does not ship that.

## Decisions

**D1. The cap is adopted, via ADR-004 superseding ADR-003 row 277 only.** The
evidence that changed since 2026-08-14 is the 26-round run. The state machine's
`exit_condition` changes with it, since a capped run can exit with a disclosed
surviving finding.

**D2. Scoped rounds 2-3 are rejected.** `ADR-003:173-174` mandates full re-dispatch
twice, and the ADR's own worked example has round 3 finding a blocker in a file no
round-2 finding named. Not reversed on downstream evidence alone.

**D3. The lens fold is expressed as registry data.** One dispatch per distinct
resolved agent, resolved through `reviewer-routing.mjs`. No reviewer is named in SOP
prose, so ADR-001 survives intact.

**D4. The commit-time tier is not built.** Its only two candidate jobs are archiving,
which is unsafe there, and staged-spec schema validation, which has no validator in
this repo.

**D5. Archiving arms with a two-clause denylist.** A spec is exempt if a live skill
or contract file names it as spec of record, or if it is the `spec:` binding of a
non-archived ADR. That protects SPEC-001 (`review-primitives.md:5`), SPEC-002, and
SPEC-006 (bound by ADR-001 and ADR-002). Day-one archive set: SPEC-004, SPEC-005.

**D6. Merge-time ships its grading half only.** The check comments unchecked success
criteria back to the merged PR. It does not flip status, move files, or regenerate
indexes, because none of that machinery exists here and the merge half is not shipped.

## Milestones

### M0 - corpus hygiene

Prerequisite for every corpus-wide gate. `specs/_index.md:20-21` lists SPEC-004 and
SPEC-005 as active while their frontmatter says `completed`; SPEC-006 has no row at
all. `ADR-001` and `ADR-002` are `status: proposed` while the spec they describe is
`completed`.

### M1 - review-loop convergence

- `ADR-004`, superseding `ADR-003:277` only.
- Edit `specs/sdlc-state-machine.yaml:111`, then run `gen-handoffs.mjs` to refresh
  `.ai/sdlc.md:238` and `spec-execution/SKILL.md:229`.
- Hand-edit the four non-generated sites: `SOP.md:245`, `SOP.md:261`,
  `SKILL.md:169-170`, `agent-orchestration.md:274`, and the live hook branch at
  `stop-handoff.mjs:421-422`.
- Reconcile `review-primitives.md` with the shipped `altitude` semantics, plus a
  Changelog v1.2 annotation on SPEC-001 following the extension pattern at
  `SPEC-001:332-338`.
- Express the fold at `SOP.md:220-232` as one dispatch per distinct resolved agent.
- `DECISIONS.md` template, plus a `spec-schema.md` entry declaring it.

Done when `gen-handoffs.mjs --check` and `prefix-parity.test.mjs` are green and no
copy of the deleted escalation trigger survives.

### M2 - write-time constraint injection

Import `loadConstraints` from `reviewer-routing.mjs:109`; it is already backed by a
dependency-free inlined YAML reader (`scripts/sdlc/README.md:8`). Add
`applicableConstraints` and `globToRe` to that module rather than forking a second
reader, which is the drift ADR-001's Context section is a case study in.

`allow()` takes an optional context argument. `SDLC_GUARD_MODE=off` stays a bare exit
and the header documents that `off` disables injection too.

Honest scope note: `pre-tool-use-edit-write.mjs:20-22` exempts `specs/**`, `.ai/**`,
`.claude/**` and `docs/**` before matching runs, and this repo is nearly all process
artifacts. Injection fires on `scripts/` and `bootstrap.sh` here. Its value is in
consuming repos, and a CI canary asserting injection fires for a known-matching path
is what stops it degrading into a silent no-op.

### M3 - archiving

`archive-specs.mjs` (move, `--check`, `--dry-run`), `resolve.mjs`, and the denylist
from D5. Archived specs nest one level deeper at `specs/archive/specs/` so the
pruned-directory rule covers them and the `-g '*.md'` leak closes.

Arming is one commit and carries its collateral with it: rewrite the nine relative
links in `specs/_index.md` and `specs/intents.md`, extend the two workflow globs at
`sdlc-validate.yml:38,47` to cover the archive root, and reference `resolve.mjs` from
`spec-schema.md`, `README.md` and `.ai/CLAUDE.md`. An addressing scheme nothing points
at is not an addressing scheme.

### M4 - corpus-wide gates and merge-time grading

- `check-stale-citations.mjs`, warn-only, following `sdlc-validate.yml:52-58`. It is
  vacuously green in a 3-ADR repo and cannot go red until an ADR is superseded.
- `archive-specs.mjs --check`, enforcing, landed with or after M3's arming commit so
  the reference is never red on its own gate.
- `complete-spec.mjs` grading half plus a workflow that comments unchecked criteria
  back to the merged PR. No pnpm, no index regeneration, no bot commit.

## Sequencing

M0 gates M3 and M4. M1 is independent and ships first for payoff. M3 gates M4's
`--check` step. M2 is independent throughout.

## Rejected

Commit-time tier (D4). Scoped review rounds (D2). Porting the full upstream
constraints module: 13 transitive functions dominated by glob-overlap machinery, and
its `lensesForTier` chain has no consumer in this repo. Porting the merge half of
completion automation (D6).
