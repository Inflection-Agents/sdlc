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
**What changed:** Criterion ids are required (SC-1:, AC-001:, legacy AC-NNN em-dash accepted) and adding one is a Cosmetic id-only edit. DECISIONS.md headings are ## S<n>, the fixed guide-change form, and `## Cross-step values`. GAP artifacts cite S<n>.
**Anything a later step must match:** the guide-change heading is exactly `## EXECUTIVE DECISION — guide change: <summary>`; S3's PR template and AC-014 match against it.

---

## S3 — Delivery and completion skills

**Merged:** PR #50
**What changed:** spec-execution and its SOP run on guide steps: validate-guide.mjs plus plan-gate.mjs gate the start, steps land on claude/SPEC-NNN-S<n>, the guide is re-planned in place with a ## Guide changes disclosure, and §6 blocks the integration PR on open decisions and unaccepted steps. spec-completion reads steps: and decisions:.
**Anything a later step must match:** S6 must rename spec-completion's state-machine entry trigger 'all tasks are merged' to 'all steps are merged' (the skill description already says so) and reword its precondition from tasks to guide steps.

---

## S4 — Authoring and amendment skills

**Merged:** PR #51
**What changed:** spec-authoring Step 10b writes the guide, index, phase block and KICKOFF.md (at most 3,800 characters) for one owner sign-off, and runs alone for an active spec with no guide. spec-amendment cascades into the guide and rewrites KICKOFF.md at re-approval. templates/kickoff.md added in both copies.
**Anything a later step must match:** S6's state machine gives spec-authoring the entry trigger 'write the guide for' and its exit condition names the guide, plan_review and KICKOFF.md.

---

## S5 — Review rules

**Merged:** PR #52
**What changed:** The task: and monorepo: review prefixes keep their names and ground on guide fields (Changes:, the step PR body, Notes:, Workspace:, Verify:). Reviewer skills, the pr-reviewer agent, create-domain-skill and the registry headers follow.

---

## EXECUTIVE DECISION — guide change: S6 regenerates the generated region of .ai/sdlc.md

**Date:** 2026-09-30
**Question:** `gen-handoffs.mjs` writes the phase narrative in `.ai/sdlc.md` as well as the skill
footers, and CI runs `gen-handoffs.mjs --check`. The guide put `.ai/*.md` in S8.
**Decided:** S6 commits the regenerated region of `.ai/sdlc.md` with the state machine that
produced it. S6's `Changes:` names it (generated region only); S8 still owns the hand-written text.
No AC, scope item or design decision changes.
**Why:** a state machine without its regenerated consumers fails CI on the S6 PR.
**Reversal path:** none needed; the region is generated.

---

## S6 — State machine and phase memory

**Merged:** PR #53
**What changed:** Both state machines drop the task-decomposition phase; spec-authoring and spec-amendment hand off to spec-execution; retired_phases: keeps old _index.yaml files valid with a warning; skills/task-decomposition/ deleted in the same commit; footers and .ai/sdlc.md regenerated.
**Anything a later step must match:** S7 removes task-schema from exempt: in both state machines when skills/task-schema.md goes.

---

## EXECUTIVE DECISION — guide change: S7 rewords the CI plan-review step

**Date:** 2026-09-30
**Question:** both copies of `sdlc-validate.yml` name the plan-review presence step "Every
decomposed spec carries a plan-review block" and explain it with "a spec mid-decomposition", which
is false once decomposition is gone. The guide did not list the workflows in S7.
**Decided:** S7 rewords that step's name and comment in both copies to match `plan-gate.mjs`'s new
message. S7's `Changes:` gains the two workflow files (that step only). No AC, scope item or design
decision changes.
**Why:** the step name is what a reader sees in CI; it should describe the gate that runs.
**Reversal path:** restore the two lines.

---

## S7 — Deletions and plan-gate wording

**Merged:** PR #54
**What changed:** skills/task-schema.md, both copies of templates/task.md and the unused evidence fixture are deleted; task-schema leaves exempt:; plan-gate.mjs and the CI plan-review step are reworded.

---

## EXECUTIVE DECISION — guide change: S8 fixes the intro sentence of guide-schema.md

**Date:** 2026-09-30
**Question:** `skills/guide-schema.md` (landed in S1) opens by naming the retired phase, which the
AC-011 search forbids. The guide did not list the file in S8.
**Decided:** S8 rewords that one sentence. S8's `Changes:` names the file (that sentence only). No
AC, scope item or design decision changes.
**Why:** AC-011 cannot pass otherwise.
**Reversal path:** none needed.

---

## S8 — Docs

**Merged:** PR #55
**What changed:** Every doc describes the spec-plus-guide process; sync.md tracks one Linear project per spec; .ai/AGENTS.md briefs an executor on one guide step. The AC-011 search prints nothing.

---

## S9 — Release and ADR pointers

**Merged:** PR #56
**What changed:** plugin 0.3.0; both manifest descriptions drop tasks; RELEASING.md gains the pre-1.0 rule and the 0.3.0 row with four adopter actions; ADR-002 and ADR-003 point to ADR-007.

---

## Cross-step values

Values a later step must match rather than re-derive.

| Value | Set by | Must match in |
| --- | --- | --- |
| `KICKOFF_MAX_CHARS` = 3800 (Unicode characters) | S1 | S4 `templates/kickoff.md`, skill text |
