---
name: sdlc-code-review
description: Use when reviewing any PR — an executor's or a teammate's — to verify against spec acceptance criteria, ADR constraints, and coding standards
---

# SDLC Code Review

## Overview

Review PRs against the spec, not just code quality. Every PR traces to a guide step, every step traces to a spec. The review verifies that chain.

**This is a rigid skill.** Every step must be followed. No shortcuts.

**Announce at start:** "Using sdlc-code-review to review this PR against the spec."

**Output model (post-SPEC-001).** This skill is the human-readable rendering layer on top of the machine-graded reviewer. The structured grading — per-finding severity (`blocker | major | nit | suggestion`) and the JSON envelope — is produced upstream by [`pr-reviewer/SKILL.md`](../pr-reviewer/SKILL.md) per the contract in [`review-primitives.md`](../review-primitives.md). This skill consumes that JSON and renders a human-readable review comment with per-finding severity and a policy-derived action recommendation. Historical note: this skill previously emitted a binary verdict (a two-state model that this skill no longer carries); that has been replaced with the severity-graded output consumed from `pr-reviewer`, and the routing action is derived from the orchestrator severity→action policy in `review-primitives.md`, not chosen freehand by this skill.

**Companion skills (auto-invoked if installed):**
- `requesting-code-review` — mandatory review triggers, context preparation (git SHAs, requirements)
- `receiving-code-review` — handling feedback: verify before implementing, push back when wrong
- `verification-before-completion` — no approval claims without running verification

**Domain skills:** Check each workspace's `skills` in `.sdlc/config.yaml`. When reviewing a PR for a workspace that has domain skills listed, apply those domain-specific conventions in addition to the standard code review. For example, a dbt PR should be reviewed against dbt-craftsman style rules (CTE ordering, naming, macros), not just generic code standards.

## Critical gates

1. **No performative agreement.** "Great catch!", "You're absolutely right!", "Thanks for the feedback!" are banned. Just state the technical finding or fix it. The review is a technical artifact, not a social interaction.
2. **Verify before rendering an `accept` action.** Run the tests. Read the output. A review that renders `accept` (or "LGTM") without running verification is not a review.
3. **Push back with technical reasoning when code is correct.** If a reviewer (human or agent) suggests a change that would break something, reference working tests, existing code, or ADRs. Reviewers are peers, not authorities.
4. **Verify reviewer suggestions before implementing.** Check every suggestion against codebase reality. Does it break existing functionality? Is the reviewer missing context?

## Process

### Step 1: Identify the spec and step

From the PR title or branch name, extract `SPEC-NNN` and the step id `S<n>`
(`claude/SPEC-NNN-S<n>`, or a title starting `SPEC-NNN S<n>:`).

Read:
- The step's block in the delivery guide: `specs/tasks/SPEC-NNN/GUIDE.md` (`Covers:`, `Changes:`,
  `Verify:`, `Workspace:`, `Notes:`)
- The parent spec: `specs/SPEC-NNN-*.md`
- Linked ADRs referenced in either

### Step 2: Read the diff

Read the full PR diff. Understand what changed and why.

### Step 3: Acceptance criteria checklist

For each spec acceptance criterion in the step's `Covers:`:

| Criterion | Addressed in diff? | Test exists? | Test passes? |
|-----------|-------------------|-------------|-------------|
| AC-001: ... | Yes/No/Partial | Yes/No | Yes/No |
| AC-002: ... | Yes/No/Partial | Yes/No | Yes/No |

If any criterion is not addressed or not tested, flag it.

### Step 4: ADR compliance

For each ADR linked from the spec:
- Does the implementation respect the decision?
- If it deviates, is there a justification?

### Step 5: Code standards

**Apply the `sdlc-code-standards` skill alongside this review.**

Check:
- [ ] DRY — no unnecessary duplication
- [ ] YAGNI — nothing built that the spec didn't ask for
- [ ] TDD — tests exist and were written for the criteria
- [ ] Single responsibility — functions and modules focused
- [ ] Naming — clear, specific, descriptive
- [ ] Error handling — at boundaries only
- [ ] No dead code — no commented-out blocks, unused imports
- [ ] Commit messages — reference the SPEC id and step

### Step 6: Scope check

- Does the PR change anything outside the step's `Changes:`?
- Does it introduce features the spec didn't ask for?
- Does it touch files the step's `Notes:` or the spec said not to touch?

**Monorepo scope check (if the step sets `Workspace:`):**

Enforce the following checks — these are blockers, not advisories:

- **`monorepo:workspace-scope`** — PR modifies files outside the step's `Workspace:`. Every modified file path must fall within the workspace's root directory as defined by its `path` in `.sdlc/config.yaml`.
- **`monorepo:verify-coverage`** — PR fails any command in the step's `Verify:`, which must include each consuming workspace's command. Run all of them, not just the primary workspace's.
- **`monorepo:boundary`** — Import-graph violation: a file in workspace A imports from workspace B against the dependency graph in `AGENTS.md`. Distinct from file-touch violations (`monorepo:workspace-scope`) — this is about import semantics, not file location.

Three non-overlapping prefixes, all blockers (severity assigned in SPEC-004 AC-006). Use the matching prefix when raising the finding.

**Boundary step check:** If this step produces output a later step consumes (a contract in its `Notes:`):
- Does the implementation match the contract the `Notes:` states? (column names, types, export signatures)
- Is the contract visible where the later step expects it? (schema.yml, exported types, etc.)
- If the implementation deviates from the stated contract, raise it citing `task:blocks:<later step id>` — the later step needs updating too

**Guide check:** If the PR reveals the guide was wrong (but the spec is fine). Note: **diff size is NOT a defect** — a large but coherent PR that stays within its `Changes:` is fine. The defects are incoherence and scope leak:
- PR modifies files OUTSIDE the step's `Changes:` → scope leak. Raise a `blocker` finding citing `task:scope`; it routes to an in-place guide re-plan.
- PR bundles two independent concerns that should be separate steps → raise a `blocker` finding citing `task:scope` and propose the split in `suggested_fix`.
- PR includes work that belongs in a different step → scope leak. Raise a `blocker` finding citing `task:scope` and propose the scope reduction in `suggested_fix`.
- PR needed a prerequisite that no step covers → raise a `blocker` finding citing `task:scope` so the re-plan adds the missing step.

When this happens: the executor re-plans the guide in place (`spec-execution` §4 > Changing the guide during a run), logs it as a guide change, and adjusts the PR to the corrected scope.

### Step 7: Regression check

- Could these changes break anything outside the step's scope?
- Are there related tests that should still pass?
- Were any existing tests modified? If so, is it justified?

**Behavioral-expansion check (the class tests can't catch — `std:behavior-preservation`):**
- Does this change make a routing / delivery / ingestion / gating / access / scope path do *more* than before — new data / scope / site / tenant / traffic now flowing, a previously-inert config path now active, a guard relaxed, a default flipped? A change can be code-correct with every test green and still be wrong here.
- If so, does the PR state the prior behavioral contract AND show the expansion is intended? "The config already listed it" is **not** intent — a value in config is not authorization. An unstated expansion is a `major` finding (`blocker` if it reaches production data/traffic).
- Was any behavioral/infra change validated off-prod (dry-run / non-prod)? Flag if the validation itself mutated production.

**Monorepo regression check:**
- If shared code changed, were ALL consuming workspaces tested?
- If data models changed (dbt), could downstream app queries break?
- Check the step's `Verify:` — were all of its commands actually run?

### Step 8: Verification (mandatory)

**Run the step's `Verify:` commands.** Read the full output. Do not skip this.

- If the step's `Verify:` says `npm test` → run it, read the output, confirm pass/fail.
- If tests fail, that's a finding. Report it.
- "Tests should pass" without running them is not acceptable.

**Monorepo verification:** Run every workspace command in the step's `Verify:`, not just the primary workspace's. A PR that passes `dealer-app` tests but breaks `admin-app` (because shared code changed) is not passing.

### Step 8b: Evidence content quality check

For each spec acceptance criterion in the step's `Covers:`, read the evidence the step PR body gives
under that AC id:

- If evidence is present but content is insufficient — e.g., "tests passed" with no output excerpt, "verified" with no proof, a one-word claim with nothing to inspect — raise a `task:evidence-missing` **major** finding. Include a one-sentence explanation of what is missing.

**Insufficient evidence examples:**
- "AC-001: tests passed" — no output excerpt
- "AC-001: verified manually" — no screenshot, log, or artifact
- "AC-001: done" — no proof of any kind

**Sufficient evidence examples:**
- "AC-001: `npm test -- --grep 'AC-001'`: 3 passing (42ms)" — includes command + output excerpt
- "AC-001: grep output: <paste>" — includes the actual artifact

Note: evidence presence is checked by the executor's own self-review, not a CI gate — ADR-003 retired the automatic pre-review gate along with per-step review. This step grades **content quality** on the evidence given.

### Step 9: Consume graded findings from pr-reviewer

This skill does not decide a verdict on its own. The graded findings come from `pr-reviewer` as the JSON envelope defined in [`review-primitives.md`](../review-primitives.md) ("Output schema"). Steps 1–8 above are the source material that the graded run (or this skill, when running upstream of the JSON) draws on; this step is where you bring in the structured `findings[]` and prepare to render.

For each finding produced by `pr-reviewer`, you have:

- `severity` — one of `blocker | major | nit | suggestion`. Severity definitions live in `review-primitives.md` ("Severity spine" and "PR-side consequence catalog"); do not redefine them here.
- `criterion` — the grounded citation (e.g., `AC-003`, `ADR-007`, `sdlc-code-standards:dry`, `monorepo:boundary`, `task:blocks:S4`, `task:scope`, or a cross-skill signal prefix such as `spec:ambiguous-ac`).
- `location` — `file:line` (or `file` for whole-file findings).
- `finding` — one sentence describing what is wrong.
- `suggested_fix` — one sentence describing what to do (may be `null`).
- `carried_forward_from_previous` — boolean; if `true`, this finding was carried forward unchanged from a prior iteration per the carry-forward contract in `review-primitives.md`.

You also receive the `verification` object (commands run and pass/fail) and the `tier_2_dispatch_recommended` list. Both pass through to the rendered comment unchanged.

### Step 10: Derive the action recommendation from policy (do not freehand)

The action recommendation is **derived**, not chosen. Apply the orchestrator severity→action policy from [`review-primitives.md`](../review-primitives.md) ("Orchestrator severity→action policy") verbatim. The four action values it can return are:

- `fix_loop` — any `blocker` or `major` finding present.
- `batch_followup_and_accept` — only `nit` / `suggestion` findings present.
- `accept` — no findings.
- `escalate` — any finding whose `criterion` prefix is not in the allowed list for `pr-reviewer` (Tier 1) or for the relevant Tier 2 specialist; this signals a SPEC-001 contract violation or an unrecognized cross-skill signal.

Do not invent additional action values, and do not substitute your own judgment for the policy. If you believe the policy's verdict is wrong for this PR, that is a SPEC-001 amendment, not a per-PR override — surface it through `spec-amendment`, not through the rendered comment.

**Cross-skill signals** raised by `pr-reviewer` as `blocker` findings with `criterion` prefixes `task:scope`, `spec:ambiguous-ac`, `spec:contradictory-ac`, `spec:wrong-design`, or `spec:missing-section` route to `fix_loop` like any other blocker, but the fix is an in-place guide re-plan (for `task:scope`) or `spec-amendment` (for the `spec:*` prefixes) rather than a patch from the PR author. Render the criterion verbatim in the comment so the reader can see which hand-off is implied.

### After the action is rendered: check for spec completion

When the rendered action is `accept` (or `batch_followup_and_accept` once the follow-up is filed), check whether this was the last step for the spec:

1. Read the `steps:` list in `specs/tasks/SPEC-NNN/_index.yaml`
2. If every step is now `done`, `cancelled`, or `deferred` with a decided owner decision, and the spec is still `active`:
   - Announce: "Every step of SPEC-NNN is done. Invoking spec-completion to verify success criteria."
   - Invoke the `spec-completion` skill.
3. If steps remain, report progress: "SPEC-NNN: N/M steps done, K remaining."

This is the primary automated trigger for spec completion. Don't let specs stay `active` after all work is finished.

## Review comment template

The rendered comment groups findings by severity (highest first), shows the policy-derived action at the top, and surfaces a per-finding badge (`[criterion]`) plus `location` for every finding. Severity definitions are not duplicated here — see [`review-primitives.md`](../review-primitives.md) ("Severity spine" and "PR-side consequence catalog"). The shape:

```markdown
## Review: SPEC-NNN / S<n> — fix_loop (1 blocker, 2 majors, 3 nits)

### Blockers (1)
- **[AC-003]** `apps/dealer-app/src/Foo.tsx:42` — Acceptance criterion not addressed in diff. Fix: implement the validation logic.

### Majors (2)
- **[sdlc-code-standards:dry]** `apps/dealer-app/src/utils.ts:12-34` — Reimplements existing helper in @repo/shared. Fix: import from @repo/shared.
- **[task:blocks:S4]** `dbt/models/marts/dim_loans.sql:15` — Column rename breaks the contract this step's `Notes:` promises S4. Fix: revert the column name, or re-plan S4 to match.

### Nits (3)
- [...]

### Suggestions (0)
_(none — omit the section when empty.)_

### Verification
- `pnpm -F dealer-app test`: passed (47/47)
- `pnpm -F dealer-app lint`: passed (0 warnings)

### Tier 2 dispatch
- (none, or list specialist names from `tier_2_dispatch_recommended` — e.g., `cross_spec`, `adversarial`, `domain:dbt`)

### Action: fix_loop
```

**Rendering rules:**

- The top-line summary names the action verbatim (`accept`, `batch_followup_and_accept`, `fix_loop`, or `escalate`) and parenthesizes the count of findings by severity. Omit severities with a count of zero from the parenthesized summary.
- Group findings under exactly four section headings: `Blockers`, `Majors`, `Nits`, `Suggestions`. If a severity has no findings, omit the section entirely (do not show an empty list).
- Each finding renders as: `**[criterion]** \`location\` — finding. Fix: suggested_fix.` If `suggested_fix` is `null`, drop the `Fix: …` clause.
- Findings with `carried_forward_from_previous: true` get a trailing ` _(carried forward)_` marker so the reader can see what is unchanged from the prior iteration.
- The `Verification` section reproduces the `commands_run` from the JSON `verification` object with their pass/fail. Do not editorialize.
- The `Tier 2 dispatch` section reproduces `tier_2_dispatch_recommended` from the JSON. If empty, render `(none)` or omit the section.
- The final `Action:` line is the policy-derived action from Step 10 — it MUST match the top-line summary's action value.

**Escalation rendering.** When the action is `escalate` (per the policy guard in `review-primitives.md`), render the comment with the standard sections plus a leading `### Escalation cause` section that names the offending `criterion` value(s) and which finding(s) carried them. Do not suppress the rest of the findings — they may still be valid; only the routing is escalated.

## Reviewing executor PRs

The reviewer treats all executor PRs identically — apply the same scrutiny regardless of which executor produced the PR:
- An executor may have worked around issues in non-obvious ways
- Check that the implementation follows patterns in the codebase, not just the guide step
- Verify the executor didn't add unnecessary dependencies or deviate from project conventions
- Run the full test suite, not just the tests the executor wrote — check for regressions
