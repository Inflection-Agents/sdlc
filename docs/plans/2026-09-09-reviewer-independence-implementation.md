# Reviewer Independence — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make spec review and PR review structurally independent — graded by a dispatched agent with no `Edit`/`Write`, never inline by the context that authored the artifact.

**Architecture:** Two reviewers currently ship as skills only, so the authoring context invokes them in its own turn and grades its own work. Ship them as agents (the `tools:` line is the enforcement), rewrite the three call sites to dispatch, guard the direct-invocation path with a refusal, and add reviewer provenance to the envelope so a self-graded review is at least detectable after the fact.

**Tech Stack:** Node built-ins only. Tests are `node:test` + `node:assert/strict`. Version bump to `0.2.0` — `review-envelope.schema.json` is a contract file.

**Branch:** `sdlc/reviewer-independence` (already created)

---

## Before you start

**The defect.** `skills/spec-authoring/SKILL.md:293` says *"Invoke `spec-reviewer`"*. `agents/` ships four reviewers and `spec-reviewer` is not among them. So the sign-off gate grades its own draft, in the same context that wrote it. `pr-reviewer` has the same shape: our copy carries **zero** "do not inline-grade" prohibitions where the upstream project's carries two — a known regression from the original port, not a new idea.

**The enforcement is the `tools:` line.** "You grade, you never fix" is an instruction a model can talk itself out of. An absent `Edit` tool is not. That is why these must be agents and not only skills.

**Two traps specific to this work:**

1. **Do NOT copy the upstream dispatch prose.** It defines the fold as *"every lens except `security`/`design-fidelity` per the `SPECIAL_REVIEWER` map"* — a hardcoded lens→reviewer map, which is exactly what ADR-001 deleted here and what `SOP.md` §7.2 was corrected to remove in PR #43. Take the shape; express it as **one dispatch per distinct resolved agent**, resolved through `reviewer-routing.mjs`.
2. **Do NOT duplicate the grading rules into the agent.** The four existing agents carry role + independence + a pointer to their contract. Copying `skills/spec-reviewer/SKILL.md`'s prompt into `agents/spec-reviewer.md` creates two copies that drift — the same failure ADR-001 exists to prevent.

**Run the suite at any checkpoint:**

```bash
node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs
```

**Commit trailer:**

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 1: Ship the two reviewer agents

**Files:**
- Create: `agents/spec-reviewer.md`
- Create: `agents/pr-reviewer.md`

**Step 1: Read the pattern before writing**

```bash
cat agents/task-reviewer.md
cat agents/integration-reviewer.md
```

Note what they do and do not contain: frontmatter with `name`, a `description` naming when they are dispatched, `tools: Read, Grep, Glob, Bash` and `model: opus`; a body that states the independence rule, names the lenses or criteria they grade, points at their contract, and mandates envelope-only output. They do **not** restate the contract.

**Step 2: Write `agents/spec-reviewer.md`**

Frontmatter exactly mirroring the four existing reviewers — `tools: Read, Grep, Glob, Bash`, no `Edit`, no `Write`.

Body covers, in this order:

- **You grade, you do not fix.** No `Edit`/`Write` by design. If a change is needed you raise a finding.
- **You did not author this spec.** The context that wrote or amended it must never be the context that grades it. If you were handed a spec you also drafted, say so and stop.
- **Ground against `skills/spec-reviewer/SKILL.md`** — the gap catalogue, the severity ladder and the spec-side citation prefixes live there and are not restated here.
- **Inputs you are given**, matching the dispatch inputs the call sites supply.
- **Output — the envelope ONLY**, per `skills/review-primitives.md`, with `reviewed_by: "agent:spec-reviewer"`.
- **Do not inflate.** A reviewer asked to find gaps will always find some; `blocker`/`major` is for something that violates a stated criterion or a registered constraint.

**Step 3: Write `agents/pr-reviewer.md`**

Same shape. Grounds against `skills/pr-reviewer/SKILL.md`, carries the PR-side prefixes by reference, sets `reviewed_by: "agent:pr-reviewer"`.

**Step 4: Verify against the gates that already exist**

```bash
node scripts/sdlc/validate-plugin-manifest.mjs
node --test scripts/sdlc/reviewer-routing.test.mjs
```

Expected: manifest OK, and `no reviewer agent carries Edit or Write` still passes — it globs `agents/*-reviewer.md`, so the two new files are graded automatically. If that test does not pick them up, the glob is wrong; fix the test, not the filename.

**Step 5: Commit**

```bash
git add agents/
git commit -m "sdlc: ship spec-reviewer and pr-reviewer as agents

The tools: line is the enforcement. 'You grade, you never fix' is an
instruction a model can talk itself out of; an absent Edit tool is not.

Both point at their skill for grading rules rather than restating them - two
copies of a contract is the drift ADR-001 deleted the hardcoded lens map to
prevent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 2: Multi-path constraint selection

**Files:**
- Modify: `scripts/sdlc/reviewer-routing.mjs`
- Test: `scripts/sdlc/reviewer-routing.test.mjs`

**Why:** `applicableConstraints(rows, relPath)` takes ONE path. A PR has many. Without a shared multi-path helper the first implementer of Task 3 invents a loop, and two places compute the same lens set differently — the two-engines-disagree failure this codebase has already hit twice (`globToRe` vs `globSync`, and the three registry parsers).

**Step 1: Write the failing tests**

```javascript
test('applicableConstraintsFor: unions across paths and dedupes by id', () => {
    const rows = [
        { id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' },
        { id: 'B', scope: 'task', when: { touches: ['docs/**'] }, check: 'b', cite: 'inv:B' }
    ]
    const hits = applicableConstraintsFor(rows, ['scripts/x.mjs', 'docs/y.md', 'scripts/z.mjs'])
    assert.deepEqual(hits.map((c) => c.id).sort(), ['A', 'B'])
})

test('applicableConstraintsFor: a row matching several paths appears once', () => {
    const rows = [{ id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' }]
    assert.equal(applicableConstraintsFor(rows, ['scripts/a.mjs', 'scripts/b.mjs']).length, 1)
})

test('applicableConstraintsFor: no paths yields no constraints, and does not throw', () => {
    const rows = [{ id: 'A', scope: 'task', when: { touches: ['**'] }, check: 'a', cite: 'inv:A' }]
    assert.deepEqual(applicableConstraintsFor(rows, []), [])
    assert.deepEqual(applicableConstraintsFor(rows, null), [])
})

test('applicableConstraintsFor: integration-scope rows are excluded, as in the single-path form', () => {
    const rows = [{ id: 'I', scope: 'integration', when: { touches: ['**'] }, check: 'i', cite: 'inv:I' }]
    assert.deepEqual(applicableConstraintsFor(rows, ['a.ts']), [])
})

test('applicableConstraintsFor agrees with applicableConstraints on a single path', () => {
    // One matcher, two entry points. If these ever disagree, a lens fires at write
    // time and not at review time, or the reverse.
    const rows = [{ id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' }]
    assert.deepEqual(
        applicableConstraintsFor(rows, ['scripts/x.mjs']).map((c) => c.id),
        applicableConstraints(rows, 'scripts/x.mjs').map((c) => c.id)
    )
})
```

**Step 2: Run and watch them fail**

```bash
node --test scripts/sdlc/reviewer-routing.test.mjs
```

Expected: FAIL — `applicableConstraintsFor is not a function`.

**Step 3: Implement**

```javascript
/**
 * The task-scope constraints registered against ANY of these paths, deduped by id.
 *
 * A PR touches many files; `applicableConstraints` grades one. Both delegate to the
 * same predicate on purpose — two ways to compute one lens set is how a lens ends up
 * firing at write time and not at review time.
 */
export const applicableConstraintsFor = (rows, relPaths) => {
    const paths = Array.isArray(relPaths) ? relPaths : []
    const seen = new Set()
    const out = []
    for (const p of paths) {
        for (const c of applicableConstraints(rows, p)) {
            if (c?.id && seen.has(c.id)) continue
            if (c?.id) seen.add(c.id)
            out.push(c)
        }
    }
    return out
}
```

**Step 4: Run, then the whole suite**

```bash
node --test scripts/sdlc/reviewer-routing.test.mjs
node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs
```

**Step 5: Commit**

## Task 3: The `pr-reviewer` dispatch section

**Files:**
- Modify: `skills/pr-reviewer/SKILL.md`

**Step 1: Confirm the gap is real before fixing it**

```bash
grep -c "inline-grade\|Grading dispatch" skills/pr-reviewer/SKILL.md
grep -c "inline-grade\|Grading dispatch" /Users/franklin/_code/high-gear/.ai/skills/pr-reviewer/SKILL.md
```

Expected: `0` here, `2` upstream. That difference is the regression.

**Step 2: Add the section, immediately after the Prompt block**

It must say, in this order:

1. **This skill MUST NOT grade inline.** It dispatches a distinct reviewer by calling the `Agent` tool with `subagent_type: pr-reviewer`, then validates and renders the returned envelope. The verdict is never produced in the orchestrator's own context.
2. **Compute the lens set.** Derive changed files from `gh pr diff <pr> --name-only`. Load the registry with `loadConstraints()` from `scripts/sdlc/reviewer-routing.mjs`. Compute applicable constraints with `applicableConstraintsFor(rows, changedFiles)` (Task 2).
3. **Fold by resolved agent.** Resolve every firing lens with `node scripts/sdlc/reviewer-routing.mjs <lens>` and **dispatch one reviewer per distinct resolved agent, not one per lens.** Lenses resolving to the same agent fold into that agent's single pass: it reads the diff once and grades each lens in sequence, and every finding sets its `lens` so a later round can be scoped. Lenses resolving to their own specialist keep their own dispatch.

    **Name no reviewer here.** Which lenses fold is registry data — a one-line `agent:` edit in `review-constraints.yaml`. The upstream version of this section hardcodes `security` and `design-fidelity` as the special reviewers; that is the map ADR-001 deleted, and `SOP.md` §7.2 was corrected to remove it in PR #43. Keep the two consistent.
4. **Clean seed.** The reviewer prompt carries only the diff, the task ACs, the spec and linked ADRs, the applicable constraints, and the envelope schema. The author's execution transcript is never passed in — independence comes from a clean context, not a credential.
5. **Validate, then route.** Run `node scripts/sdlc/validate-review-envelope.mjs <file>` on every returned envelope. Exit `0` folds the findings, `2` is an abstention and escalates, `3` is malformed and re-dispatches or escalates. A malformed envelope is never a clean review.

**Step 3: Verify consistency with the SOP**

```bash
sed -n '/### 7.2/,/Always in the panel/p' skills/spec-execution/SOP.md
grep -n "security-reviewer\|design-fidelity-reviewer" skills/pr-reviewer/SKILL.md
```

Expected: the SOP's fold rule and this new section say the same thing in the same terms, and the grep returns nothing from the new section. A hit means the map came back.

**Step 4: Commit**

## Task 4: Rewrite the three call sites to dispatch

**Files:**
- Modify: `skills/spec-authoring/SKILL.md` (Step 10a, ~line 287-300)
- Modify: `skills/spec-amendment/SKILL.md` (Step 6c)
- Modify: `skills/pr-reviewer/SKILL.md` (the Prompt block's framing)

**This is the task that changes behaviour. Everything else is backstop.**

**Step 1: Find every call site**

```bash
grep -rn "Invoke \`spec-reviewer\`\|invoke \`spec-reviewer\`\|Run \`spec-reviewer\`" skills/
grep -rn "spec-reviewer" skills/spec-amendment/SKILL.md | head
```

Report anything beyond the two named — a third inline call site would be the sibling-miss pattern this repo keeps hitting.

**Step 2: Rewrite spec-authoring Step 10a**

Replace *"**Dispatch inputs.** Invoke `spec-reviewer` with the following inputs"* with an explicit dispatch:

```markdown
**Dispatch, do not invoke.** Call the `Agent` tool with `subagent_type: spec-reviewer`.
Both variants — `default` and `adversarial` — go in ONE message so they run
concurrently against the same draft.

**The authoring context must never grade its own spec.** You wrote this draft; a
review you produce in this turn is a self-review wearing a reviewer's output format.
The agent has no `Edit`/`Write` and a clean context, which is what makes its verdict
worth having. If you find yourself about to write findings inline, stop and dispatch.

Seed each dispatch with these inputs (all paths concrete; do not invent them):
```

Keep the existing input list unchanged below that.

**Step 3: Rewrite spec-amendment Step 6c**

Same treatment, same wording about never grading your own amendment.

**Step 4: Verify no inline path survives**

```bash
grep -rn "Invoke \`spec-reviewer\`\|invoke \`spec-reviewer\`" skills/
```

Expected: no output.

**Step 5: Commit**

## Task 5: Refusal guards, and ship the two orphaned contracts

**Files:**
- Modify: `skills/spec-reviewer/SKILL.md` (top of file)
- Modify: `skills/pr-reviewer/SKILL.md` (top of file)
- Move: `spec-schema.md` → `skills/spec-schema.md`
- Move: `task-schema.md` → `skills/task-schema.md`

**Step 1: Add the refusal to both skills**

At the very top, before anything else:

```markdown
> **Stop if you authored this.** `review SPEC-NNN` is a supported entry point, so this
> skill will sometimes be invoked directly — including by the context that just wrote
> the artifact. If you drafted or amended what you are being asked to grade, do not
> grade it. Dispatch `subagent_type: spec-reviewer` via the `Agent` tool and let the
> returned envelope stand. A self-review in the reviewer's output format is
> indistinguishable from an independent one in the artifact, and that is the failure
> this guard exists to make loud.
```

Adapt the agent name for `pr-reviewer`.

**Step 2: Move the two orphaned contracts**

`spec-schema.md` is named as a required input by 4 skills and `task-schema.md` by 1, and **neither ships** — they sit at the repo root, so a plugin adopter has skills naming an input that does not exist in their tree. `review-primitives.md` was moved into `skills/` and these two were not.

```bash
git mv spec-schema.md skills/spec-schema.md
git mv task-schema.md skills/task-schema.md
```

**Step 3: Fix every reference**

```bash
grep -rln "spec-schema.md\|task-schema.md" . 2>/dev/null | grep -v "^\./\.git" | grep -vE "^\./(specs|docs/plans)/"
```

Rewrite the LIVE ones only. **Do not touch anything under `specs/` or `docs/plans/`** — completed specs and shipped plans are immutable here and correctly describe the world as it was.

Check whether `bootstrap.sh` copies these two; if it does, its source path must follow.

**Step 4: Verify**

```bash
node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs
node scripts/sdlc/validate-plugin-manifest.mjs
node scripts/sdlc/gen-handoffs.mjs --check
git status --porcelain | grep -E "^ M (specs|docs/plans)/" && echo "VIOLATION" || echo "immutable set untouched"
```

**Step 5: Commit**

## Task 6: Reviewer provenance, and gate the dispatch target

**Files:**
- Modify: `skills/review-envelope.schema.json`
- Modify: `skills/review-primitives.md` (Output schema section)
- Modify: `scripts/sdlc/validate-review-envelope.mjs`
- Modify: `scripts/sdlc/validate-plugin-manifest.mjs`
- Test: `scripts/sdlc/validate-review-envelope.test.mjs`, `scripts/sdlc/validate-plugin-manifest.test.mjs`
- Modify: `.claude-plugin/plugin.json` (version → `0.2.0`)

**Step 1: Add `reviewed_by` as OPTIONAL, not required**

```json
"reviewed_by": {
    "enum": ["agent:spec-reviewer", "agent:pr-reviewer", "agent:task-reviewer", "agent:integration-reviewer", "agent:security-reviewer", "agent:design-fidelity-reviewer", "inline"],
    "description": "Which context produced this verdict. SELF-DECLARED, so it is forensics rather than enforcement — an inline self-review can claim an agent value. The enforcement is the dispatch discipline in the calling skills plus the agents' absent Edit/Write. Absent is treated as `inline` by the validator. Required is deliberately avoided: this schema is a contract, and requiring a new field invalidates every envelope in flight."
}
```

**Do not add it to `required`.** `docs/RELEASING.md` names this file as a contract whose changes ripple into artifacts adopters own.

**Step 2: Write the failing validator tests**

```javascript
test('an inline-graded envelope carrying a blocker is a contract violation', () => {
    // A self-review and an independent one are byte-identical without this field.
    const env = { reviewer_status: 'assessed', reviewed_by: 'inline', findings: [{ severity: 'blocker', criterion: 'ac:AC-001', location: 'x' }] }
    assert.equal(exitCodeFor(env), EXIT_MALFORMED)
})

test('an ABSENT reviewed_by is treated as inline, not waved through', () => {
    const env = { reviewer_status: 'assessed', findings: [{ severity: 'major', criterion: 'ac:AC-001', location: 'x' }] }
    assert.equal(exitCodeFor(env), EXIT_MALFORMED)
})

test('an inline envelope with only nits is allowed', () => {
    // The bar is on a BLOCKING grading. A nit from the authoring context costs nothing.
    const env = { reviewer_status: 'assessed', reviewed_by: 'inline', findings: [{ severity: 'nit', criterion: 'ac:AC-001', location: 'x' }] }
    assert.notEqual(exitCodeFor(env), EXIT_MALFORMED)
})

test('an agent-graded envelope with a blocker passes', () => {
    const env = { reviewer_status: 'assessed', reviewed_by: 'agent:spec-reviewer', findings: [{ severity: 'blocker', criterion: 'ac:AC-001', location: 'x' }] }
    assert.equal(exitCodeFor(env), 0)
})
```

Adapt to the test file's existing helper shape — read it first rather than assuming `exitCodeFor` exists.

**Step 3: Implement the check, and say why in the error**

The failure message must name the fix, not just the rule: an inline blocker/major means dispatch the agent and re-grade.

**Step 4: Extend the manifest gate to `subagent_type`**

Every `subagent_type: <name>` appearing in a skill must resolve to `agents/<name>.md`. `subagent_type: spec-reviewer` is a new dangling-name surface, and every dangling-name defect this project has hit came from exactly that. **Prove it bites**: point one at a nonexistent agent, confirm red, restore.

**Step 5: Bump the version and record it**

`0.1.0` → `0.2.0` in `.claude-plugin/plugin.json`, and add a line to `docs/RELEASING.md`'s contract table noting that `reviewed_by` landed optional-with-inline-default in `0.2.0`.

**Step 6: Full verification**

```bash
node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs
node scripts/sdlc/validate-plugin-manifest.mjs
node scripts/sdlc/validate-constraints-registry.mjs
node scripts/sdlc/gen-handoffs.mjs --check
node scripts/sdlc/archive-specs.mjs --check
node scripts/sdlc/check-stale-citations.mjs
```

**Step 7: Commit**

---

# Final verification

Beyond the gates, confirm by hand:

- `grep -rn "invoke \`spec-reviewer\`" skills/` returns nothing.
- `agents/spec-reviewer.md` and `agents/pr-reviewer.md` carry no `Edit`/`Write` in `tools:`.
- `skills/spec-schema.md` and `skills/task-schema.md` exist; no live file references the old root paths.
- The `pr-reviewer` dispatch section names no specific reviewer agent.
- Nothing under `specs/` or `docs/plans/` was modified.
- A fresh consuming repo still passes the shipped workflow (the two moved contracts are plugin-side, so this should be unaffected — verify rather than assume).

# Rejected, with reasons

**Copying the upstream dispatch prose.** It hardcodes `security`/`design-fidelity` as the special reviewers, which is the lens→reviewer map ADR-001 deleted and PR #43 removed from `SOP.md` §7.2.

**Porting `lensesForTier` / `checksForLens` / `BASE_LENSES`.** The tier model has no consumer here; it was rejected during the plugin design for the same reason.

**Making `reviewed_by` required.** It is a contract file; a new required field invalidates every envelope in flight. Optional-with-inline-default fails loudly in the direction that matters without breaking parsing.

**Treating `reviewed_by` as enforcement.** It is self-declared and therefore gameable. The enforcement is the dispatch discipline plus the agents' absent tools; this field is forensics.
