# Enforcement Tiers and Review-Loop Convergence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the three missing enforcement tiers in the SDLC reference framework and make the integration-gate review loop converge, without breaking a standing ADR or the generated-artifact contracts.

**Architecture:** Five milestones on one branch. M0 reconciles the corpus so corpus-wide gates can arm. M1 changes review-loop doctrine at its source (`specs/sdlc-state-machine.yaml`) and regenerates every derived artifact, fronted by a superseding ADR. M2 extends the existing `reviewer-routing.mjs` registry reader rather than forking a second one, and wires it into the write-time hook. M3 ships archiving behind a denylist. M4 adds corpus-wide gates and the grading half of merge-time completion.

**Tech Stack:** Node built-ins only. No `package.json`, no npm dependencies. Tests are `node:test` + `node:assert/strict`, colocated as `scripts/sdlc/*.test.mjs` and `.claude/hooks/__tests__/*.test.mjs`. CI is `.github/workflows/sdlc-validate.yml`.

**Design doc:** `docs/plans/2026-09-09-enforcement-tiers-design.md`
**Branch:** `sdlc/enforcement-tiers-design` (already created)

---

## Before you start

Read these three files once, in this order. Four of the blockers this plan exists to avoid came from not knowing what is in them.

1. `docs/plans/2026-09-09-enforcement-tiers-design.md` — the six decisions and why each alternative was rejected.
2. `specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md` — especially the capability-disposition table around line 277. M1 supersedes exactly one row of it.
3. `scripts/sdlc/gen-handoffs.mjs` header (lines 1-35) — which regions of which files are generated.

**The single most important rule in this plan:** `specs/sdlc-state-machine.yaml` is the source of truth for phase text. `.ai/sdlc.md` and the `<!-- sdlc:handoff:start -->` regions of every `.ai/skills/*/SKILL.md` are GENERATED from it. Never hand-edit a generated region. Edit the YAML, then run `node scripts/sdlc/gen-handoffs.mjs` (no flag) to write. CI runs `--check` and will go red if you get this wrong.

**Run the full suite any time you want a checkpoint:**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

**Commit trailer for every commit in this plan:**

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

# M0 — Corpus hygiene

Prerequisite for M3 and M4. The corpus currently disagrees with itself, and a corpus-wide gate landed on top of that would go red on unrelated PRs.

## Task 1: Reconcile `specs/_index.md` with spec frontmatter

**Files:**
- Modify: `specs/_index.md:19-21`

**Step 1: Confirm the drift**

```bash
grep -H "^status:" specs/SPEC-00[1-6]*.md
sed -n '16,22p' specs/_index.md
```

Expected: SPEC-004 and SPEC-005 frontmatter says `completed`; the index table says `active`. SPEC-006 has no row at all.

**Step 2: Fix the two status cells**

Edit the SPEC-004 and SPEC-005 rows by hand. The only change is the third column: `active` becomes `completed`. Change nothing else on those rows.

**Step 3: Add the missing SPEC-006 row**

Append after the SPEC-005 row, matching the existing column format exactly:

```markdown
| [SPEC-006](SPEC-006-plan-review-gate-and-reviewer-routing.md) | Plan-review gate and reviewer routing | completed | INI-001 | SPEC-002 |
```

**Step 4: Verify nothing regressed**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: PASS.

**Step 5: Commit**

```bash
git add specs/_index.md
git commit -m "sdlc: reconcile the spec index with spec frontmatter

SPEC-004 and SPEC-005 read completed in their own frontmatter and active in
the index; SPEC-006 had no row. Corpus-wide gates cannot arm on a corpus that
disagrees with itself.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 2: Mark ADR-001 and ADR-002 accepted

**Files:**
- Modify: `specs/adrs/ADR-001-reviewer-routing-is-registry-data.md:4`
- Modify: `specs/adrs/ADR-002-plan-review-gate-in-index-yaml.md:4`

**Context:** Both ADRs are `status: proposed` while SPEC-006, the spec they describe, is `completed` and their mechanisms are in production (`scripts/sdlc/reviewer-routing.mjs`, `scripts/sdlc/plan-gate.mjs`). This is the same defect class the downstream audit counted ten instances of.

**Step 1: Confirm both are shipped, not proposed**

```bash
grep -Hn "^status:\|^spec:" specs/adrs/ADR-00[12]*.md
ls scripts/sdlc/reviewer-routing.mjs scripts/sdlc/plan-gate.mjs
grep -n "ADR-001" scripts/sdlc/reviewer-routing.mjs | head -3
```

Expected: both `status: proposed`, both `spec: SPEC-006`, both implementations present and citing their ADR.

**Step 2: Flip both**

```bash
sed -i '' '4s/^status: proposed$/status: accepted/' specs/adrs/ADR-001-reviewer-routing-is-registry-data.md
sed -i '' '4s/^status: proposed$/status: accepted/' specs/adrs/ADR-002-plan-review-gate-in-index-yaml.md
grep -Hn "^status:" specs/adrs/ADR-00[123]*.md
```

Expected: all three ADRs now `accepted`.

**Step 3: Commit**

```bash
git add specs/adrs/ADR-001-reviewer-routing-is-registry-data.md specs/adrs/ADR-002-plan-review-gate-in-index-yaml.md
git commit -m "sdlc: ADR-001 and ADR-002 are accepted, not proposed

Both describe mechanisms shipped in scripts/sdlc/ under SPEC-006, which is
completed. A proposed ADR describing production code is a stale record.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# M1 — Review-loop convergence

Six tasks. Task 3 is the artifact that authorizes the rest; do not reorder it.

## Task 3: Write ADR-004 superseding one row of ADR-003

**Files:**
- Create: `specs/adrs/ADR-004-capped-integration-gate.md`
- Modify: `specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:277`

**Context you need.** `ADR-003:277` is the capability-disposition row for a capped fix loop. It says the per-task cap is kept, and that at the gate there is no round cap because the same finding surviving two rounds escalates. That row considered a gate cap by name and rejected it. This task reverses that one row and nothing else. ADR-003 remains the foundation of single-executor delivery.

**Judgment call already made — do not change it silently.** ADR-003's frontmatter `superseded_by:` stays EMPTY. Setting it would read as the whole ADR being dead, which is false. The supersession is recorded two ways: ADR-004 names the row it supersedes, and the row itself gets an inline pointer.

**Step 1: Create the ADR**

Create `specs/adrs/ADR-004-capped-integration-gate.md` with frontmatter matching `templates/adr.md`: `id: ADR-004`, `title: "The integration gate is capped at three rounds"`, `status: accepted`, `spec: none`, `date: 2026-09-09`, `author: franklin`, empty `superseded_by`.

Body sections:

- **Context.** ADR-003 built single-executor delivery and concentrated all review rigor at one integration gate. Its capability table considered a round cap there and rejected it, choosing "the same finding surviving two rounds escalates" instead. That decision was made 2026-08-14 with no data on how gate rounds behave, because no spec had yet run one at length. Downstream evidence has since arrived: one spec ran the gate twenty-six rounds across four days, and its own round headings record the shape of the failure — round 11 "the round-10 fixes contradicted themselves", round 15 "round 14 broke three things while fixing nine", round 25 "round 24 fixed two real holes and pinned neither". The loop was not finding a decreasing series of defects; it generated them at roughly the rate it closed them. The escape hatch ADR-003 chose does not fire on this, because "the same finding surviving two rounds" matches a stuck finding and not a loop that closes findings while creating new ones.

- **Decision.** The gate runs at most three rounds. A fourth is not run. Any blocker or major surviving round 3 is disclosed rather than fixed: it goes into a `## Disclosed, not fixed` section of the integration PR body, one line per finding naming its criterion, its location, and why it was not closed. The PR is still left open for the human, who now decides with the survivors visible. This supersedes ADR-003's "Capped fix loop" row and its "surviving two rounds" trigger. Every other row of ADR-003 stands, and ADR-003's `superseded_by` is deliberately left empty because only one row is affected.

- **Consequences.** Good: the gate terminates, and the disclosed set is a visible gradeable artifact that puts the residual-risk decision with the human who merges. Bad: the phase can now exit with a known surviving blocker, and ADR-003 accepted the loss of per-task review specifically because the gate looped to clean, so this removes part of that compensating control. The mitigation is that disclosure is mandatory and lives in the PR body, not in a decision log. Reversal path: delete the cap from `specs/sdlc-state-machine.yaml`, regenerate, and restore the trigger in the five hand-edited sites listed in Task 5.

**Step 2: Annotate the superseded row in ADR-003**

Keep the row's existing text and append a pointer to its last cell, so the historical record stays readable:

```
**ADR-004 (2026-09-09) reverses this row only: the gate is capped at three rounds and survivors are disclosed.**
```

Also change that row's middle cell to read `**SUPERSEDED by ADR-004 at the gate**`.

**Step 3: Verify both ADRs parse and nothing else changed**

```bash
grep -Hn "^id:\|^status:\|^superseded_by:" specs/adrs/ADR-003*.md specs/adrs/ADR-004*.md
git diff --stat
```

Expected: ADR-003 `superseded_by:` still empty, ADR-004 `status: accepted`, exactly two files changed.

**Step 4: Commit**

```bash
git add specs/adrs/ADR-004-capped-integration-gate.md specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md
git commit -m "sdlc: ADR-004 - cap the integration gate at three rounds

Supersedes exactly one row of ADR-003's capability table. That row rejected a
gate cap on 2026-08-14 with no gate-round data; a downstream spec has since run
the gate 26 rounds, with round 15's own heading reading 'round 14 broke three
things while fixing nine'.

ADR-003's superseded_by stays empty on purpose: one row is reversed, not the
decision. Survivors are disclosed in the PR body rather than ground on.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 4: Change the exit condition at its source and regenerate

**Files:**
- Modify: `specs/sdlc-state-machine.yaml:111`
- Regenerated (do not hand-edit): `.ai/sdlc.md`, `.ai/skills/spec-execution/SKILL.md`

**Step 1: See the drift check pass before you start**

```bash
node scripts/sdlc/gen-handoffs.mjs --check
```

Expected: exit 0, no drift. If this is already red, stop and fix that first.

**Step 2: Edit the exit_condition string**

In `specs/sdlc-state-machine.yaml:111`, make exactly two substitutions inside the single-quoted `exit_condition` value.

Find: `looped until no blocker or major survives, and LEFT OPEN`
Replace: `looped until no blocker or major survives OR the three-round cap (ADR-004) is reached with every survivor named in a "## Disclosed, not fixed" section of the PR body, and LEFT OPEN`

Find: `an owner decision, the same integration finding surviving two panel rounds, the amendment cap`
Replace: `an owner decision, the amendment cap`

**Step 3: Verify the YAML still parses**

```bash
node scripts/sdlc/validate-state-machine.mjs
```

Expected: exit 0. A broken quote in that long single-quoted scalar is the likely failure; if it fails, check you did not introduce an apostrophe.

**Step 4: Regenerate the derived artifacts**

```bash
node scripts/sdlc/gen-handoffs.mjs
git diff --stat
```

Expected: `.ai/sdlc.md` and `.ai/skills/spec-execution/SKILL.md` both modified, plus the YAML. If `SKILL.md` did not change, you edited the wrong phase block.

**Step 5: Confirm the check now passes against the new source**

```bash
node scripts/sdlc/gen-handoffs.mjs --check
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: both exit 0.

**Step 6: Commit**

```bash
git add specs/sdlc-state-machine.yaml .ai/sdlc.md .ai/skills/spec-execution/SKILL.md
git commit -m "sdlc: cap the gate in the state machine, regenerate the derived text

The exit condition is the source; .ai/sdlc.md and the SKILL.md handoff region
are generated from it. Adds the ADR-004 cap and the disclosure requirement, and
drops the superseded 'surviving two panel rounds' halt trigger.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 5: Hand-edit the five non-generated sites

**Files:**
- Modify: `.ai/skills/spec-execution/SOP.md` (section 7.3, and the section 8 bullet at :261)
- Modify: `.ai/skills/spec-execution/SKILL.md:169-170`
- Modify: `agent-orchestration.md:274`
- Modify: `.claude/hooks/stop-handoff.mjs:421-422`

**Context:** the trigger text lives in eight places. Two were regenerated by Task 4. One is the ADR record, annotated in Task 3 and otherwise immutable. These five are hand-written.

The hook splits the phrase across two template-literal lines, so a grep for the whole phrase misses it. That is why this task lists it explicitly. Find the rest with:

```bash
grep -rn "surviving two\|surviving " . 2>/dev/null | grep -v "^./.git/" | grep -v "^./docs/plans"
```

**Step 1: Replace SOP section 7.3 wholesale**

Replace the section beginning `### 7.3 Loop until merge-ready` through the paragraph ending `escalate instead of grinding.` with:

```markdown
### 7.3 Loop until merge-ready — at most three rounds

Fix blockers and majors at the root, then **re-dispatch the panel** — not a spot-check of the fix.
Repeat until no blocker or major survives, or until round 3 completes.

**The cap is three rounds (ADR-004).** A fourth round is not run. Whatever blocker or major
survives round 3 goes into a `## Disclosed, not fixed` section of the integration PR body: one
line per finding, naming its criterion, its location, and why it was not closed. The PR is still
left open for the human, who now decides with the survivors visible rather than after an
unbounded grind.

If a round reveals the spec itself is wrong, that is a `spec:*` finding and routes to
`spec-amendment`, not to another round.

Nits and suggestions can be recorded in the PR body and accepted.
```

**Step 2: Delete the superseded bullet at SOP :261**

Remove the line `- The same integration finding surviving two full panel rounds.` entirely from the escalation list.

**Step 3: Fix `SKILL.md:169-170`**

That sentence lists escalation triggers separated by semicolons. Remove the `the same integration finding surviving two panel rounds;` clause, leaving the sentence grammatical.

**Step 4: Fix `agent-orchestration.md:274`**

Remove the bullet naming the two-round trigger, and add in its place:

```markdown
- **Round 3 completes with a blocker or major still open** → disclose it in the PR body (ADR-004), do not run a fourth round
```

**Step 5: Fix the hook's continuation text**

In `.claude/hooks/stop-handoff.mjs` around line 421, the block reason lists escalation causes. Remove the `the same finding surviving two panel rounds,` clause. Keep the string-concatenation shape intact; only the words change.

**Step 6: Verify no copy survives**

```bash
grep -rn "surviving two" . 2>/dev/null | grep -v "^./.git/" | grep -v "^./docs/plans" | grep -v "^./specs/adrs/ADR-003"
```

Expected: no output. The only permitted remaining copy is inside ADR-003's superseded row, which is a historical record.

**Step 7: Run the suite**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/gen-handoffs.mjs --check
```

Expected: both pass. The hook tests exercise the goal-leash reason text, so a broken string concatenation shows up here.

**Step 8: Commit**

```bash
git add .ai/skills/spec-execution/SOP.md .ai/skills/spec-execution/SKILL.md agent-orchestration.md .claude/hooks/stop-handoff.mjs
git commit -m "sdlc: retire the superseded escalation trigger from its five hand-written sites

The trigger lived in eight places: two regenerated from the state machine, one
in the ADR record, and these five. The hook's copy is split across two
template-literal lines, so a grep for the whole phrase does not find it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 6: Reconcile `review-primitives.md` with the shipped `altitude` field

**Files:**
- Modify: `.ai/skills/review-primitives.md` (after the Output schema section, before Carry-forward)
- Modify: `specs/SPEC-001-tiered-code-review.md` (Changelog, append v1.3)

**Context — read before writing anything.** The `altitude` field and its full routing semantics ALREADY ship in `.ai/skills/review-envelope.schema.json:48-51`, including the enum, the meaning of each value, and the absent-implies-`implementation` default. This task is a RECONCILIATION, not an addition. `review-primitives.md:3` calls itself the single source of truth for the output schema while omitting a field the schema defines. Transcribe the shipped semantics; do not invent new ones.

**Step 1: Confirm the gap**

```bash
grep -n "altitude" .ai/skills/review-envelope.schema.json
grep -c "altitude" .ai/skills/review-primitives.md
```

Expected: the schema has it; `review-primitives.md` returns `0`.

**Step 2: Add the section**

Insert after the Output schema section:

```markdown
### Lens and altitude attribution

Both are **transport-only** fields. They do not change how a finding is graded — the severity
spine and the consequence catalogs remain the sole grading inputs. They tell the orchestrator how
to *route* a finding, not how severe it is.

- **`lens`** — when one reviewer applies several lenses in a single pass, every finding MUST name
  the lens it came from. A finding without its lens cannot be scoped on a fix round, so the
  orchestrator re-reviews the whole panel instead of just the flagging lens.
- **`altitude`** — every finding declares whether the code or the spec is wrong:
    - `implementation` — a code edit can satisfy it. Routed into the bounded fix loop.
    - `design` — no code edit can satisfy it; the spec or plan itself is wrong. Routed to
      `spec-amendment` or a replan, skipping the fix loop.
    - **Absent implies `implementation`** (conservative default): an omitted altitude keeps the
      existing fix loop and never spuriously escalates to a replan.

These definitions are transcribed from `review-envelope.schema.json`, which is the machine source
of truth. If the two ever disagree, the schema wins and this file is the defect.
```

**Step 3: Add the SPEC-001 changelog annotation**

`review-primitives.md:41` authorizes exactly two routes for changing this contract. SPEC-001 is `completed`, so `spec-amendment` is unavailable and the extension pattern is the only legal route. The changelog is currently at v1.2; append v1.3 following the v1.1 and v1.2 entries' format. It must record: that SPEC-007 adds the attribution section transcribing already-shipped schema semantics, that this is a reconciliation and not a new contract, that a `design`-altitude finding routes to `spec-amendment` or a replan rather than the fix loop, that severity grading is untouched, and that ADR-004's three-round cap bounds the fix loop this field routes into.

**Step 4: Verify the parity test still passes**

```bash
node --test scripts/sdlc/prefix-parity.test.mjs
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: PASS. This test pins `review-primitives.md` against the validator and the schema, so it is the mechanical check that the transcription did not drift.

**Step 5: Commit**

```bash
git add .ai/skills/review-primitives.md specs/SPEC-001-tiered-code-review.md
git commit -m "sdlc: reconcile review-primitives.md with the shipped altitude field

The field, its enum and its routing meaning already ship in
review-envelope.schema.json. review-primitives.md calls itself the source of
truth for the output schema and omitted it, so a design-altitude finding had no
documented route out of the fix loop.

SPEC-001 is completed and therefore closed to amendment, so this lands as a v1.3
Changelog annotation under the extension pattern review-primitives.md:41
authorizes.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 7: Express the lens fold as registry data

**Files:**
- Modify: `.ai/skills/spec-execution/SOP.md:220-232` (section 7.2)

**Context.** ADR-001 deleted a hardcoded lens-to-reviewer map because two copies drifted and a registered lens ended up with no specialist behind it. Naming `security-reviewer` and `design-fidelity-reviewer` in this file as the exempt specialists would rebuild that map in prose. Express the fold as a property of the routing instead.

**Step 1: Read what routing actually returns**

```bash
node scripts/sdlc/reviewer-routing.mjs --list
sed -n '25,40p' scripts/sdlc/reviewer-routing.mjs
```

Expected: lenses with an `agent:` in the registry resolve to that agent; lenses without one resolve to the generic reviewer. That default is what makes the fold expressible without naming anyone.

**Step 2: Replace section 7.2**

```markdown
### 7.2 Dispatch the adversarial panel

Collect every lens that fires across the whole diff — this is the one place
`review-constraints.yaml` is evaluated in full — and resolve each to its reviewer with
`node scripts/sdlc/reviewer-routing.mjs <lens>` (ADR-001: routing is registry data).

**Dispatch one reviewer per DISTINCT resolved agent, not one per lens.** Lenses that resolve to
the same agent fold into that agent's single pass: it reads the diff once and grades each of its
lenses in sequence, and every finding names its `lens` so a later round can be scoped. Lenses that
resolve to their own specialist keep their own dispatch, because a specialist's tools and reading
depth differ. Which lenses fold is therefore registry data — a one-line `agent:` edit in
`review-constraints.yaml`, never a list in this file.

Always in the panel regardless of which lenses fire:

- `integration-reviewer` — the spec's holistic success criteria and every `scope: integration`
  constraint in the registry.
- At least one **adversarial** pass over the whole diff.

Dispatch concurrently, in one message, each with a clean context and no `Edit`/`Write`.
```

**Step 3: Verify no reviewer name was hardcoded back in**

```bash
sed -n '/### 7.2/,/### 7.3/p' .ai/skills/spec-execution/SOP.md | grep -n "security-reviewer\|design-fidelity-reviewer"
```

Expected: no output. Any hit means the fold was written as a list again.

**Step 4: Commit**

```bash
git add .ai/skills/spec-execution/SOP.md
git commit -m "sdlc: fold the panel by resolved agent, not by a list of lens names

One dispatch per distinct resolved agent. Which lenses fold is a property of the
registry's agent: field, so adding or exempting a specialist stays the one-line
registry edit ADR-001 made it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 8: Add the `DECISIONS.md` template and declare it in the schema

**Files:**
- Create: `templates/decisions.md`
- Modify: `spec-schema.md` (artifact declarations section)
- Modify: `.ai/skills/spec-execution/SKILL.md` (section 3, the integration-branch step)
- Modify: `bootstrap.sh` (template copy block)

**Step 1: Create the template**

`templates/decisions.md` carries a header explaining the log's purpose, then three entry shapes and a table:

- Header: one entry per task appended after it merges; an `EXECUTIVE DECISION` or `SPEC DEVIATION` heading goes in the moment it happens, not batched at the end. This log is what makes the narrowed escalation bar safe, because almost every judgment call is decided and recorded here instead of stopping the run to ask.
- `## TASK-NNN — <title>` with **Merged** (PR number), **What changed**, and **Anything a later task must match**.
- `## EXECUTIVE DECISION — <summary>` with **Date**, **Question**, **Decided**, **Why** (including what was rejected), and **Reversal path**.
- `## SPEC DEVIATION — <summary>` with **Date**, **Spec says** (quoted), **Built instead**, and **Why the spec was wrong**. Include the standing rule: a deviation may fix an implementation-level mismatch but may never narrow or reinterpret a stated success criterion, which changes what "done" means and goes to `spec-amendment` as a version bump.
- `## Cross-task values` — a table of Value / Set by / Must match in.

**Step 2: Declare it in `spec-schema.md`**

Find the section declaring artifacts under `specs/tasks/SPEC-NNN/` and add a `DECISIONS.md` entry: the filename, one per spec run, the three heading forms, and that entries are append-only in chronological order. Match the surrounding entries' formatting.

**Step 3: Require it in `spec-execution`**

In `.ai/skills/spec-execution/SKILL.md` section 3, after the branch-cutting instruction, add:

```markdown
Alongside it, create `specs/tasks/SPEC-NNN/DECISIONS.md` from `templates/decisions.md`. This is
not optional bookkeeping: section 8's narrow escalation bar is only safe because almost every
judgment call gets decided and logged rather than asked, and this log is what makes that
reviewable after the fact instead of invisible.
```

**Step 4: Wire the template into bootstrap**

```bash
grep -n "templates" bootstrap.sh | head
```

If the copy block enumerates template files, add `decisions.md`. If it copies the directory, nothing to change.

**Step 5: Verify**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/gen-handoffs.mjs --check
bash -n bootstrap.sh
```

Expected: all three pass. `bash -n` is a syntax check only; it does not run bootstrap.

**Step 6: Commit**

```bash
git add templates/decisions.md spec-schema.md .ai/skills/spec-execution/SKILL.md bootstrap.sh
git commit -m "sdlc: per-run decision log - template, schema entry, and the skill that requires it

The narrowed escalation bar trades asking for deciding-and-logging. Without the
log that trade is invisible, so the log is the half that makes it reviewable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# M2 — Write-time constraint injection

The write-time hook currently only blocks. This makes it inform. Advisory throughout: it never blocks, never alters an edit, and returns nothing on any failure.

**Read before starting.** `scripts/sdlc/reviewer-routing.mjs:109` already exports `loadConstraints`, backed by a dependency-free inlined YAML subset reader documented at `scripts/sdlc/README.md:8`. Do NOT create a second reader or a second `loadConstraints`. ADR-001's Context is a case study in exactly that drift.

## Task 9: Add `globToRe` and `applicableConstraints` to the existing module

**Files:**
- Modify: `scripts/sdlc/reviewer-routing.mjs`
- Test: `scripts/sdlc/reviewer-routing.test.mjs`

**Step 1: Write the failing tests**

Append to `scripts/sdlc/reviewer-routing.test.mjs`, extending the existing import from `./reviewer-routing.mjs` to include the two new names:

```javascript
test('globToRe: ** crosses path separators, * does not', () => {
    assert.ok(globToRe('packages/**/core.ts').test('packages/a/b/core.ts'))
    assert.ok(globToRe('src/*.ts').test('src/a.ts'))
    assert.equal(globToRe('src/*.ts').test('src/a/b.ts'), false)
})

test('globToRe: a literal dot is not a wildcard', () => {
    assert.equal(globToRe('src/a.ts').test('src/axts'), false)
})

test('applicableConstraints: returns task-scope rows whose touches match', () => {
    const rows = [
        { id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', severity: 'major' },
        { id: 'B', scope: 'task', when: { touches: ['apps/**'] }, check: 'b', severity: 'major' }
    ]
    assert.deepEqual(applicableConstraints(rows, 'scripts/sdlc/x.mjs').map((c) => c.id), ['A'])
})

test('applicableConstraints: integration-scope rows never match a single edit', () => {
    const rows = [{ id: 'I', scope: 'integration', when: { touches: ['**'] }, check: 'i' }]
    assert.deepEqual(applicableConstraints(rows, 'anything.ts'), [])
})

test('applicableConstraints: a row with no when.touches is skipped, not thrown on', () => {
    const rows = [{ id: 'W', scope: 'task', when: { workspace: ['app'] }, check: 'w' }]
    assert.deepEqual(applicableConstraints(rows, 'anything.ts'), [])
})
```

**Step 2: Run to verify they fail**

```bash
node --test scripts/sdlc/reviewer-routing.test.mjs
```

Expected: FAIL — `globToRe is not a function`. The exports do not exist yet.

**Step 3: Implement**

Add to `scripts/sdlc/reviewer-routing.mjs`, near the existing registry helpers:

```javascript
/**
 * Glob to RegExp. `**` crosses path separators, `*` does not, and every other
 * regex metacharacter is escaped so a literal dot cannot act as a wildcard.
 *
 * One pass, because the alternation tries `**` before `*`. Do NOT rewrite this as
 * three chained .replace() calls with a placeholder character between the `**` and
 * `*` passes: the placeholder has to be a byte no glob can contain, and every such
 * byte is a control character that corrupts the file it is written into.
 */
export const globToRe = (g) =>
    new RegExp(
        '^' +
            g.replace(/\*\*|\*|[.+^${}()|[\]\\?]/g, (m) =>
                m === '**' ? '.*' : m === '*' ? '[^/]*' : '\\' + m
            ) +
            '$'
    )

/**
 * The task-scope constraints registered against one file path.
 *
 * `scope: integration` rows grade a whole spec diff at the gate and are excluded
 * here: a single edit is not the artifact they grade. A row with no
 * `when.touches` (workspace- or task_has-gated) cannot be matched against a bare
 * path and is skipped rather than treated as a match.
 */
export const applicableConstraints = (rows, relPath) =>
    (Array.isArray(rows) ? rows : []).filter((c) => {
        if ((c?.scope ?? 'task') !== 'task') return false
        const globs = c?.when?.touches
        return Array.isArray(globs) && globs.some((g) => globToRe(g).test(relPath))
    })
```

**Step 4: Run to verify they pass**

```bash
node --test scripts/sdlc/reviewer-routing.test.mjs
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: PASS, and no existing test regressed.

**Step 5: Commit**

```bash
git add scripts/sdlc/reviewer-routing.mjs scripts/sdlc/reviewer-routing.test.mjs
git commit -m "sdlc: path matching for the constraints registry, in the module that already reads it

globToRe and applicableConstraints join the existing dependency-free registry
reader rather than forking a second one. Integration-scope rows are excluded: a
single edit is not the artifact they grade.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 10: Wire injection into the write-time hook

**Files:**
- Modify: `.claude/hooks/pre-tool-use-edit-write.mjs`
- Test: `.claude/hooks/__tests__/edit-write-constraint-injection.test.mjs` (create)

**Context.** The hook's allow paths are bare `process.exit(ALLOW)` calls. Returning `additionalContext` requires printing a JSON object on stdout first. Two rules that are not negotiable:

- `SDLC_GUARD_MODE=off` stays a bare exit with no I/O. It is an emergency kill-switch and its header contract says it does no I/O. Document that `off` disables injection too.
- Any failure to load or match returns nothing and exits 0. A hook that breaks edits when its optional input is malformed is worse than no hook.

**Honest scope note for the commit message:** `pre-tool-use-edit-write.mjs:20-22` exempts `specs/**`, `.ai/**`, `.claude/**` and `docs/**` as process artifacts before matching runs, and this repo is nearly all process artifacts. Injection fires here on `scripts/` and `bootstrap.sh` and little else. Its value is in consuming repos. That is why Task 11 exists.

**Step 1: Write the failing test**

Create `.claude/hooks/__tests__/edit-write-constraint-injection.test.mjs`. It spawns the hook with `execFileSync`, feeding a JSON payload on stdin and setting `CLAUDE_PROJECT_DIR` to the repo root. Three cases:

- A path with registered constraints yields stdout parsing to `{hookSpecificOutput: {hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: <string containing "cite:">}}`.
- `SDLC_GUARD_MODE=off` yields empty stdout.
- A malformed stdin payload (`'not json'`) exits 0 with empty stdout.

```bash
node --test .claude/hooks/__tests__/edit-write-constraint-injection.test.mjs
```

Expected: the first test FAILS (no stdout yet); the other two pass already.

**Step 2: Give `allow()` an optional context argument**

```javascript
function allow(guidance) {
    if (guidance) {
        process.stdout.write(
            JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'allow',
                    additionalContext: guidance
                }
            })
        )
    }
    process.exit(ALLOW)
}
```

Every existing bare `process.exit(ALLOW)` on an allow path becomes `allow()`. The `SDLC_GUARD_MODE === 'off'` branch keeps its bare `process.exit(ALLOW)`.

**Step 3: Add the constraint lookup**

```javascript
/**
 * The laws registered against this path, handed to the AUTHOR at write time.
 *
 * The registry is consulted today only by reviewers, after the code exists.
 * Downstream measurement across 163 session transcripts: 221 of 398 blocker and
 * major findings cited invariants, ADRs or conventions that already existed and
 * were not found, and 242 of 398 were decidable before a line was written. The
 * registry is not missing content; it arrives too late to prevent the rework it
 * describes.
 *
 * Advisory by construction. It never blocks and never changes the edit, because
 * the gates in this file are correctness laws and this is a reminder. Any failure
 * to load or parse returns null.
 */
async function constraintGuidance(rel, root) {
    try {
        const { loadConstraints, applicableConstraints } = await import(
            pathToFileURL(join(root, 'scripts/sdlc/reviewer-routing.mjs')).href
        )
        const hits = applicableConstraints(loadConstraints(), rel)
        if (!hits.length) return null
        const lines = hits.map(
            (c) => `- ${c.id} (${c.severity ?? 'major'}): ${c.check}\n    cite: ${c.cite ?? c.id}`
        )
        return (
            `Constraints registered against \`${rel}\`. A reviewer will grade this edit against ` +
            `them and cite the id verbatim, so satisfy them now rather than in a fix round:\n` +
            lines.join('\n')
        )
    } catch {
        return null
    }
}
```

Call it on the allow path, after the guard decisions and before exiting: `allow(await constraintGuidance(rel, root))`. Confirm `pathToFileURL` is imported from `node:url`.

**Step 4: Update the header contract**

The header's `SDLC_GUARD_MODE` block documents `off` as a no-op. Add that `off` also disables constraint injection and is the only mode that emits nothing at all. Extend the "What it does" section to name the second, advisory job.

**Step 5: Run**

```bash
node --test .claude/hooks/__tests__/edit-write-constraint-injection.test.mjs
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: PASS. If existing hook tests fail, an allow path that should have stayed bare now prints JSON.

**Step 6: Commit**

```bash
git add .claude/hooks/pre-tool-use-edit-write.mjs .claude/hooks/__tests__/edit-write-constraint-injection.test.mjs
git commit -m "sdlc: the write-time hook hands the author the laws for the path being edited

Advisory: never blocks, never alters the edit, returns nothing on any failure.
SDLC_GUARD_MODE=off remains the one mode that emits nothing at all.

Scope note: this repo is nearly all process artifacts, which the hook exempts
before matching runs, so injection fires here on scripts/ and bootstrap.sh and
little else. The value is in consuming repos, which is why the next commit adds
a canary rather than trusting it silently.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 11: CI canary so injection cannot degrade to a silent no-op

**Files:**
- Create: `scripts/sdlc/__fixtures__/canary-constraints.yaml`
- Modify: `.claude/hooks/__tests__/edit-write-constraint-injection.test.mjs`

**Context.** This is the highest-value test in M2. The feature is advisory and swallows its own errors, so without a canary a broken import, a moved path, or a registry rename turns it off permanently with no signal.

**Step 1: Write the fixture**

Create `scripts/sdlc/__fixtures__/canary-constraints.yaml` with one row that must match a real repo path: `id: CANARY-INJECTION`, `scope: task`, `when: { touches: ["scripts/**"] }`, `lens: conventions`, `severity: major`, a `check` explaining that if this does not reach the author injection is broken, and `cite: "canary:CANARY-INJECTION"`. Match the shipped registry's YAML shape exactly, or the inlined reader will not parse it.

**Step 2: Add the canary test**

Append to the hook test file, importing `loadConstraints` and `applicableConstraints` from `scripts/sdlc/reviewer-routing.mjs`:

```javascript
test('CANARY: the registry reader and matcher agree on a real repo path', () => {
    const fixture = join(ROOT, 'scripts', 'sdlc', '__fixtures__', 'canary-constraints.yaml')
    const hits = applicableConstraints(loadConstraints(fixture), 'scripts/sdlc/reviewer-routing.mjs')
    assert.equal(hits.length, 1, 'the canary row must match - injection is wired wrong if not')
    assert.equal(hits[0].id, 'CANARY-INJECTION')
    assert.equal(hits[0].cite, 'canary:CANARY-INJECTION')
})
```

**Step 3: Run, then prove the canary bites**

```bash
node --test .claude/hooks/__tests__/edit-write-constraint-injection.test.mjs
```

Expected: PASS. Now temporarily change the fixture's glob to `nonexistent/**`, re-run, confirm FAIL, then restore it. A canary that cannot fail is not a canary.

**Step 4: Confirm CI already picks it up**

```bash
grep -n "node --test" .github/workflows/sdlc-validate.yml
```

Expected: the existing glob `scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs` already covers this file. No workflow edit needed.

**Step 5: Commit**

```bash
git add scripts/sdlc/__fixtures__/canary-constraints.yaml .claude/hooks/__tests__/edit-write-constraint-injection.test.mjs
git commit -m "sdlc: canary so constraint injection cannot fail silently

The feature is advisory and swallows its own errors, so a moved module or a
renamed registry key would disable it permanently with no signal. The canary
asserts a known row reaches a known path.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# M3 — Archiving

Three tasks of code and one arming task. Read the design doc's D5 before starting: the denylist has two clauses and both are load-bearing.

## Task 12: `archive-specs.mjs` with the two-clause denylist

**Files:**
- Create: `scripts/sdlc/archive-specs.mjs`
- Test: `scripts/sdlc/archive-specs.test.mjs`

**The denylist rule.** A spec is exempt from archiving if EITHER:

1. A live skill or contract file names it as spec of record. `.ai/skills/review-primitives.md:5` names SPEC-001; `pr-reviewer/SKILL.md` and `sdlc-code-review/SKILL.md` route to SPEC-001 and SPEC-002 by name.
2. It is the `spec:` binding of an ADR that is not itself archived. `ADR-001` and `ADR-002` both carry `spec: SPEC-006`.

Applied to today's corpus that protects SPEC-001, SPEC-002, and SPEC-006, leaving SPEC-004 and SPEC-005 as the day-one archive set. Derive the sets at runtime; do not hardcode those five ids.

**Step 1: Write the failing tests**

Create `scripts/sdlc/archive-specs.test.mjs` importing `archivable` and `LIVE_STATUSES`. `archivable(specs, {citedIds, adrBoundIds})` must be pure so the tests need no filesystem. Six cases:

- `draft` and `active` are never archivable, and both are in `LIVE_STATUSES`.
- A `completed` spec with no protection is archivable.
- Clause 1: a spec in `citedIds` is exempt even when `completed`.
- Clause 2: a spec in `adrBoundIds` is exempt even when `completed`.
- `superseded` and `cancelled` are archivable, because replaced is not protected.
- A null or unreadable status is treated as live, not archived.

```bash
node --test scripts/sdlc/archive-specs.test.mjs
```

Expected: FAIL, module not found.

**Step 2: Implement the pure core first**

Export `LIVE_STATUSES`, `archivable(specs, protections)`, plus `collectCitedIds(root)` and `collectAdrBoundIds(root)` that build the two protection sets by reading `.ai/skills/**` and `specs/adrs/*.md`.

Modes: default moves with `git mv` (which stages the rename itself), `--check` exits 1 listing misplaced specs, `--dry-run` prints the plan. Archived specs go to `specs/archive/specs/` and task trees to `specs/archive/tasks/SPEC-NNN/`. The extra `specs/` level is deliberate: it makes the pruned-directory rule cover archived spec bodies so a `rg -g '*.md'` override cannot surface them.

**Step 3: Run**

```bash
node --test scripts/sdlc/archive-specs.test.mjs
```

Expected: PASS.

**Step 4: Dry-run against the real corpus and check the number**

```bash
node scripts/sdlc/archive-specs.mjs --dry-run
```

Expected: exactly SPEC-004 and SPEC-005. If it lists SPEC-001, SPEC-002, or SPEC-006, a denylist clause is not wired to the real files. Do not proceed until this output is right.

**Step 5: Commit**

```bash
git add scripts/sdlc/archive-specs.mjs scripts/sdlc/archive-specs.test.mjs
git commit -m "sdlc: archive-specs with a two-clause denylist

A spec is exempt if a live skill names it as spec of record, or if it is the
spec: binding of a non-archived ADR. On today's corpus that protects SPEC-001,
SPEC-002 and SPEC-006, and the ids are derived at runtime rather than listed.

Archived specs nest at specs/archive/specs/ so the pruned-directory rule covers
them; a flat layout leaks to rg -g '*.md'.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 13: `resolve.mjs` — keep the archive addressable

**Files:**
- Create: `scripts/sdlc/resolve.mjs`
- Test: `scripts/sdlc/resolve.test.mjs`

**Why this is not optional.** The fence hides archived material from search. That is only a net win if the archive stays addressable, and ids are how the corpus refers to itself. Shipping the fence without the resolver ships a trap.

**Step 1: Write the failing tests**

Create `scripts/sdlc/resolve.test.mjs` importing `rootsFor` and `matchesId`. Three cases:

- Each id kind searches both its live and archived roots: `rootsFor('SPEC-004')` and `rootsFor('TASK-100')` each include an archive path, and `rootsFor('ADR-001')` is non-empty.
- Id matching anchors at the start and requires a separator: `SPEC-004` matches `SPEC-004-artifact-completeness-ports.md`, does not match `SPEC-0041-other.md`, and `SPEC-4` does not match `SPEC-004-x.md`.
- Matching is case-insensitive on the prefix: `spec-004` matches `SPEC-004-x.md`.

```bash
node --test scripts/sdlc/resolve.test.mjs
```

Expected: FAIL, module not found.

**Step 2: Implement**

Export `rootsFor(id)` and `matchesId(id, filename)` as pure functions, plus a `main` that prints the resolved path, the spec's status, and whether it is archived. Support `--print` to dump contents. Read the filesystem directly with `readdirSync` so the ripgrep fence does not apply.

**Step 3: Run and check against the real corpus**

```bash
node --test scripts/sdlc/resolve.test.mjs
node scripts/sdlc/resolve.mjs SPEC-003
node scripts/sdlc/resolve.mjs ADR-004
```

Expected: tests pass; both ids resolve to real paths.

**Step 4: Commit**

```bash
git add scripts/sdlc/resolve.mjs scripts/sdlc/resolve.test.mjs
git commit -m "sdlc: resolve an id to its file, live or archived

The fence only pays if the archive stays addressable, and ids are how the corpus
refers to itself. Reads the filesystem directly, so ripgrep's ignore rules do not
apply.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 14: Arm it, and carry the collateral in the same commit

**Files:**
- Create: `.ignore`, `specs/archive/.ignore`, `specs/archive/specs/.ignore`, `specs/archive/tasks/.ignore`
- Move: SPEC-004, SPEC-005 and their task trees
- Modify: `specs/_index.md`, `specs/intents.md` (link targets)
- Modify: `.github/workflows/sdlc-validate.yml:38,47` (globs)

**This is the highest-risk task in the plan.** Four things break at once if any part is skipped: nine relative links, two CI gates silently dropping from six graded files to one, the reading order in `_index.md`, and search reachability. Do all of it in one commit so the repo is never in a half-armed state.

**Step 1: Record the before state**

```bash
git status --porcelain
node scripts/sdlc/archive-specs.mjs --dry-run
node scripts/sdlc/plan-gate.mjs --presence-only specs/tasks/*/_index.yaml
node scripts/sdlc/validate-phase-memory.mjs specs/tasks/*/_index.yaml
```

Write down how many `_index.yaml` files each of the last two commands grades. After archiving they must grade the same number.

**Step 2: Write the fences**

Each fenced directory carries its OWN `.ignore` containing `*`. A repo-root pattern alone leaks whenever ripgrep gets several path arguments and the walk root shifts.

```bash
mkdir -p specs/archive/specs specs/archive/tasks
printf '*\n' > specs/archive/.ignore
printf '*\n' > specs/archive/specs/.ignore
printf '*\n' > specs/archive/tasks/.ignore
```

Then create the root `.ignore` documenting: that these paths are hidden from ripgrep but fully tracked in git; why position beats a status label (every spec already carries a status, and a model shown a labelled-stale document overrides its own correct prior more than half the time); the three escape hatches (`node scripts/sdlc/resolve.mjs SPEC-NNN`, `rg --no-ignore pattern specs/archive/`, and `cat` on a known path); why each directory carries its own `.ignore`; and why archived specs nest one level down, namely that a flat layout is still reachable via `rg -g '*.md'`, which is the form the agent's Grep tool emits. End the file with the pattern `specs/archive/`.

**Step 3: Move**

```bash
node scripts/sdlc/archive-specs.mjs
git status --porcelain | head -20
```

Expected: renames staged for SPEC-004, SPEC-005 and their two task trees. Nothing else.

**Step 4: Verify the fence holds, including the glob-override form**

```bash
rg -n "artifact completeness" ; echo "bare rg exit=$?"
rg -n "artifact completeness" --type md ; echo "--type exit=$?"
rg -n "artifact completeness" -g '*.md' ; echo "-g exit=$?"
```

All three must miss the archived copy. If the `-g` form finds it, the nesting is wrong; fix the layout before continuing.

**Step 5: Fix the links**

```bash
grep -n "SPEC-004\|SPEC-005" specs/_index.md specs/intents.md
```

Rewrite each relative link target to `archive/specs/SPEC-00N-*.md`. In `specs/_index.md`, also check the "Reading order for a fresh contributor" section: if it points at an archived spec, either repoint it or note the `resolve.mjs` command.

**Step 6: Extend the CI globs**

In `.github/workflows/sdlc-validate.yml`, change lines 38 and 47 from `specs/tasks/*/_index.yaml` to `specs/tasks/*/_index.yaml specs/archive/tasks/*/_index.yaml`.

**Step 7: Prove coverage did not shrink**

```bash
node scripts/sdlc/plan-gate.mjs --presence-only specs/tasks/*/_index.yaml specs/archive/tasks/*/_index.yaml
node scripts/sdlc/validate-phase-memory.mjs specs/tasks/*/_index.yaml specs/archive/tasks/*/_index.yaml
```

Expected: the same count as Step 1. Both scripts pass on an empty glob by design, so a shrunken input set produces no error. Comparing the counts by hand is the only signal.

**Step 8: Check every link resolves**

```bash
for f in specs/_index.md specs/intents.md; do
  grep -oE '\]\([^)]+\.md\)' "$f" | sed 's/^](//; s/)$//' | while read -r link; do
    case "$link" in http*) continue;; esac
    [ -f "specs/$link" ] || echo "BROKEN in $f: $link"
  done
done
```

Expected: no output.

**Step 9: Full suite**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/archive-specs.mjs --check
```

Expected: tests pass; `--check` exits 0 now that the corpus is arranged.

**Step 10: Commit**

```bash
git add -A specs .ignore .github/workflows/sdlc-validate.yml
git commit -m "sdlc: arm archiving - SPEC-004 and SPEC-005 out of the default search path

Nothing is deleted; git mv preserves history and resolve.mjs addresses it by id.
SPEC-001, SPEC-002 and SPEC-006 are held back by the denylist: two are named as
spec of record by live skills, one is the spec: binding of ADR-001 and ADR-002.

Carries its own collateral so the repo is never half-armed: nine relative links
rewritten, and the two workflow globs extended to the archive root. Both gates
pass on an unmatched glob by design, so a shrunken input set would have produced
no CI signal at all.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 15: Point readers at the resolver

**Files:**
- Modify: `spec-schema.md`
- Modify: `README.md`
- Modify: `.ai/CLAUDE.md`
- Modify: `scripts/sdlc/README.md`

**Context.** `spec-schema.md` sends readers to a spec for "the canonical YAML example". If that spec is ever archived, the pointer dangles for anyone using search. An addressing scheme nothing references is not an addressing scheme.

**Step 1: Find every id-style pointer**

```bash
grep -rn "SPEC-00[1-6]" spec-schema.md README.md .ai/CLAUDE.md | head -20
```

**Step 2: Add the resolver note**

In each file, next to the first id-style reference, add one line:

```markdown
> Archived specs stay tracked in git but are hidden from default search. Resolve any id with
> `node scripts/sdlc/resolve.mjs SPEC-NNN`, or search with `rg --no-ignore`.
```

**Step 3: Document the two scripts**

Add `archive-specs.mjs` and `resolve.mjs` to `scripts/sdlc/README.md` in the existing format: what it does, its modes, and when CI runs it.

**Step 4: Verify**

```bash
node scripts/sdlc/resolve.mjs SPEC-004
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: SPEC-004 resolves to its archived path and reports that it is archived.

**Step 5: Commit**

```bash
git add spec-schema.md README.md .ai/CLAUDE.md scripts/sdlc/README.md
git commit -m "sdlc: document the resolver everywhere the corpus points at an id

An addressing scheme nothing references is not an addressing scheme.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# M4 — Corpus-wide gates and merge-time grading

## Task 16: `check-stale-citations.mjs`, warn-only

**Files:**
- Create: `scripts/sdlc/check-stale-citations.mjs`
- Test: `scripts/sdlc/check-stale-citations.test.mjs`

**Context.** Scoped by blast radius, not by document. A superseded ADR cited as current in an always-loaded path is a hard failure; the same citation in a spec body or a test name is reported and passes, because tests and comments legitimately name retired ADRs as historical labels, and a gate that cries wolf gets deleted.

**Honest status:** in a 3-ADR repo with nothing superseded, this gate is vacuously green and cannot go red until someone supersedes an ADR. It ships warn-only for that reason, following the precedent already at `sdlc-validate.yml:52-58`. It becomes meaningful in a consuming repo.

**Step 1: Write the failing tests**

Create `scripts/sdlc/check-stale-citations.test.mjs` importing `blastRadius` and `isAcknowledged`. Three cases:

- Always-loaded paths are hard failures: `blastRadius('.ai/CLAUDE.md')` and `blastRadius('.ai/skills/pr-reviewer/SKILL.md')` both return `'fail'`.
- Spec bodies and tests are reported, not failed: `blastRadius('specs/SPEC-002-x.md')` and `blastRadius('scripts/sdlc/foo.test.mjs')` both return `'report'`.
- A line naming the successor counts as acknowledged: `isAcknowledged('ADR-003 (superseded by ADR-004) said X', 'ADR-003', 'ADR-004')` is true, while `isAcknowledged('per ADR-003, the gate is uncapped', 'ADR-003', 'ADR-004')` is false.

```bash
node --test scripts/sdlc/check-stale-citations.test.mjs
```

Expected: FAIL, module not found.

**Step 2: Implement**

Export `blastRadius(path)` returning `'fail'` or `'report'`, and `isAcknowledged(line, staleId, successorId)`. Build the superseded set from ADR frontmatter (`superseded_by`, plus any ADR whose row was annotated as superseded).

Walk the corpus with `lstatSync`, not `statSync`, and skip symlinked directories. `.claude/skills` is a symlink to `.ai/skills` in this repo, and a symlink-following walk reports every skill finding twice under two paths for one underlying file.

`--enforce` makes `report` findings fail too. Default is warn.

**Step 3: Run**

```bash
node --test scripts/sdlc/check-stale-citations.test.mjs
node scripts/sdlc/check-stale-citations.mjs
```

Expected: tests pass; the corpus run reports whatever it finds and exits 0.

**Step 4: Wire it into CI, warn-only**

Add to `.github/workflows/sdlc-validate.yml` with no `if:` scope, commented in the style of the block at lines 49-53:

```yaml
            - name: No superseded decision cited as current (warn — this repo has no superseded ADRs yet)
              # Reports, never fails. Vacuously green until an ADR is superseded; a
              # consuming repo switches this to --enforce once its corpus has history.
              run: node scripts/sdlc/check-stale-citations.mjs
```

**Step 5: Commit**

```bash
git add scripts/sdlc/check-stale-citations.mjs scripts/sdlc/check-stale-citations.test.mjs .github/workflows/sdlc-validate.yml
git commit -m "sdlc: stale-citation gate, scoped by blast radius, warn-only

A superseded decision cited as current in always-loaded context is the failure
worth catching; the same citation in a spec body or a test name is history and
passes. Walks with lstat so the .claude/skills symlink is not double-counted.

Warn-only because this repo has no superseded ADRs, so it grades an empty set.
Consuming repos switch it to --enforce.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 17: `archive-specs --check` as an enforcing gate

**Files:**
- Modify: `.github/workflows/sdlc-validate.yml`

**Step 1: Confirm it is green before arming the gate**

```bash
node scripts/sdlc/archive-specs.mjs --check ; echo "exit=$?"
```

Expected: exit 0. Task 14 already arranged the corpus. If this is red, do not add the CI step; fix the corpus first. The workflow header states the standard: a gate red here means the reference ships a gate it does not itself pass.

**Step 2: Add the step**

```yaml
            - name: Archive boundary is correct (no expired spec in the live corpus)
              run: node scripts/sdlc/archive-specs.mjs --check
```

No `if:` scope. This grades the whole corpus, which is the point: the defect sits in files nobody is touching.

**Step 3: Verify the workflow parses**

```bash
grep -c "name:" .github/workflows/sdlc-validate.yml
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

**Step 4: Commit**

```bash
git add .github/workflows/sdlc-validate.yml
git commit -m "sdlc: enforce the archive boundary corpus-wide

Unscoped on purpose. Every other check here grades changed files, which is
exactly how an expired document in a file nobody touches survives.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 18: `complete-spec.mjs` — the grading half only

**Files:**
- Create: `scripts/sdlc/complete-spec.mjs`
- Test: `scripts/sdlc/complete-spec.test.mjs`

**Scope, and why it is narrow.** Upstream's version flips status, moves files, and regenerates indexes, then opens a PR that a second auto-merge workflow lands. This repo has no index generator, no `spec-index.json`, no `package.json`, and `.ai/CLAUDE.md:73` explicitly says the framework does not ship the auto-merge half. Porting the writer alone would produce bookkeeping PRs nobody merges, which is the manual chore it exists to remove, relocated.

So: this grades and reports. It does not write.

**Step 1: Write the failing tests**

Create `scripts/sdlc/complete-spec.test.mjs` importing `uncheckedCriteria` and `completability`. Five cases, using a fixture body with a `## Success criteria` section containing two checked and one unchecked box:

- Unchecked criteria are extracted verbatim, returning just the unchecked one's text.
- A spec with every criterion checked and `status: active` is completable.
- An unchecked criterion blocks completion and names the criterion in `blocking`.
- `superseded` and `cancelled` are left alone: both return `completable: false` even with every box checked, because replaced is not finished.
- A spec with no `## Success criteria` section refuses rather than guessing.

```bash
node --test scripts/sdlc/complete-spec.test.mjs
```

Expected: FAIL, module not found.

**Step 2: Implement**

Export `uncheckedCriteria(body)` and `completability({status, body})`. Refuse rather than guess: a missing section, a non-`active` status, or any unchecked box all return `completable: false` with a reason. `main` takes a spec id, prints a verdict, and exits 0 for completable, 1 for not.

**Step 3: Run against the real corpus**

```bash
node --test scripts/sdlc/complete-spec.test.mjs
node scripts/sdlc/complete-spec.mjs SPEC-003
```

Expected: tests pass; SPEC-003 reports its unchecked criteria.

**Step 4: Commit**

```bash
git add scripts/sdlc/complete-spec.mjs scripts/sdlc/complete-spec.test.mjs
git commit -m "sdlc: grade a spec's completability - refuse rather than guess

Grades only. It does not flip status, move files, or regenerate indexes: this
repo has no index generator and does not ship the auto-merge half that would
land such a change, so a writer here would produce bookkeeping PRs nobody merges.

superseded and cancelled are left alone; replaced is not finished.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Task 19: Merge-time workflow that comments the verdict back

**Files:**
- Create: `.github/workflows/sdlc-spec-completion.yml`

**Constraints.** No pnpm, no `cache:`, no lockfile, no bot commit, no `contents: write`. Permissions are `contents: read` and `pull-requests: write`. It comments; it never pushes.

**The one bug not to reintroduce.** The webhook property is `pull_request.head.ref`, not `pull_request.head_ref`. The latter is not a field on the payload; GitHub casts the null to `''` and `startsWith('', 'feat/spec-')` is false for every event, so the job silently never runs. Upstream shipped exactly that and fixed it in `597a180a7`.

**Step 1: Write it**

Trigger on `pull_request` with `types: [closed]`. Gate the job on `github.event.pull_request.merged == true && startsWith(github.event.pull_request.head.ref, 'feat/spec-')`. Steps:

1. `actions/checkout@v4`, then `actions/setup-node@v4` with `node-version: '22'` and no `cache:`.
2. Derive the spec id from the branch with `sed -n 's|^feat/spec-\([0-9]\{1,\}\).*|\1|p'`, then zero-pad to
   three digits with `printf 'SPEC-%03d'` before writing it to `$GITHUB_OUTPUT`. Without the pad,
   `feat/spec-7` yields `SPEC-7` and resolves to nothing; the corpus uses `SPEC-007`.
3. Run `node scripts/sdlc/complete-spec.mjs "$id"` with `set +e`, capturing stdout into a heredoc-delimited `$GITHUB_OUTPUT` value plus its exit code.
4. `gh pr comment` the verdict back on the merged PR, with `GH_TOKEN: ${{ github.token }}`. The comment names the spec, shows the verdict in a fenced block, and states that this check grades only, with the manual follow-up command.

**Step 2: Verify the branch pattern matches this repo's convention**

```bash
grep -n "feat/spec-" .ai/skills/spec-execution/SOP.md | head -3
```

Expected: the SOP cuts `feat/spec-NNN`, which the gate matches.

**Step 3: Check for tabs, which YAML rejects**

```bash
node -e "const s=require('fs').readFileSync('.github/workflows/sdlc-spec-completion.yml','utf8'); if(/\t/.test(s)) throw new Error('tabs in YAML'); console.log('ok, '+s.split('\n').length+' lines')"
```

**Step 4: Commit**

```bash
git add .github/workflows/sdlc-spec-completion.yml
git commit -m "sdlc: comment a completion verdict on the merged integration PR

Grades and comments. No bot commit, no contents: write, no pnpm - this repo is
dependency-free and does not ship the auto-merge half a writing workflow needs.

Gates on pull_request.head.ref. head_ref is not a field on the webhook payload;
it casts to '' and the job silently never runs, which is the bug upstream shipped
and fixed in 597a180a7.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

# Final verification

Run all of this before opening the PR.

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/validate-state-machine.mjs
node scripts/sdlc/gen-handoffs.mjs --check
node scripts/sdlc/validate-phase-memory.mjs specs/tasks/*/_index.yaml specs/archive/tasks/*/_index.yaml
node scripts/sdlc/plan-gate.mjs --presence-only specs/tasks/*/_index.yaml specs/archive/tasks/*/_index.yaml
node scripts/sdlc/check-review-constraint-globs.mjs
node scripts/sdlc/archive-specs.mjs --check
node scripts/sdlc/check-stale-citations.mjs
```

Then confirm by hand:

- `grep -rn "surviving two" . | grep -v .git | grep -v docs/plans | grep -v ADR-003` returns nothing.
- `rg -n "artifact completeness" -g '*.md'` does not return the archived SPEC-004.
- `node scripts/sdlc/resolve.mjs SPEC-004` resolves and reports that it is archived.
- Every link in `specs/_index.md` and `specs/intents.md` resolves.
- `ADR-003` frontmatter `superseded_by:` is still empty.

# Rejected, with reasons — do not add these back

**A commit-time git-hook tier.** Archiving from `pre-commit` corrupts the index on a pathspec commit: git runs hooks against a temp index, so the `git mv` commits while the real index stages a rename back to paths that no longer exist. Reproduced independently by a reviewer. Upstream removed it in `597a180a7` with a written postmortem. The only other candidate job, staged-spec schema validation, has no validator in this repo.

**Scoped review rounds 2-3.** `ADR-003:173-174` mandates full re-dispatch twice, and the ADR's own worked example has round 3 finding a blocker in a file no round-2 finding named.

**Porting the upstream constraints module wholesale.** Thirteen transitive functions dominated by bidirectional glob-overlap machinery, and its `lensesForTier` chain has no consumer in this repo.

**The writing half of merge-time completion.** See Task 18.
