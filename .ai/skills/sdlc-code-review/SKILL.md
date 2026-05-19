---
name: sdlc-code-review
description: Use when reviewing any PR — yours, Jules's, or a teammate's — to verify against spec acceptance criteria, ADR constraints, and coding standards
---

# SDLC Code Review

## Overview

Review PRs against the spec, not just code quality. Every PR traces to a task, every task traces to a spec. The review verifies that chain.

**This is a rigid skill.** Every step must be followed. No shortcuts.

**Announce at start:** "Using sdlc-code-review to review this PR against the spec."

**Output model (post-SPEC-001).** This skill is the human-readable rendering layer on top of the machine-graded reviewer. The structured grading — per-finding severity (`blocker | major | nit | suggestion`) and the JSON envelope — is produced upstream by [`pr-reviewer/SKILL.md`](../pr-reviewer/SKILL.md) per the contract in [`review-primitives.md`](../review-primitives.md). This skill consumes that JSON and renders a human-readable review comment with per-finding severity and a policy-derived action recommendation. Historical note: this skill previously emitted a binary verdict (a two-state model that this skill no longer carries); that has been replaced with the severity-graded output consumed from `pr-reviewer`, and the routing action is derived from the orchestrator severity→action policy in `review-primitives.md`, not chosen freehand by this skill.

**Companion skills (auto-invoked if installed):**
- `requesting-code-review` — mandatory review triggers, context preparation (git SHAs, requirements)
- `receiving-code-review` — handling feedback: verify before implementing, push back when wrong
- `verification-before-completion` — no approval claims without running verification

**Domain skills:** Check `.ai/project.md` → Workspace skills table. When reviewing a PR for a workspace that has domain skills listed, apply those domain-specific conventions in addition to the standard code review. For example, a dbt PR should be reviewed against dbt-craftsman style rules (CTE ordering, naming, macros), not just generic code standards.

## Critical gates

1. **No performative agreement.** "Great catch!", "You're absolutely right!", "Thanks for the feedback!" are banned. Just state the technical finding or fix it. The review is a technical artifact, not a social interaction.
2. **Verify before rendering an `accept` action.** Run the tests. Read the output. A review that renders `accept` (or "LGTM") without running verification is not a review.
3. **Push back with technical reasoning when code is correct.** If a reviewer (human or agent) suggests a change that would break something, reference working tests, existing code, or ADRs. Reviewers are peers, not authorities.
4. **Verify reviewer suggestions before implementing.** Check every suggestion against codebase reality. Does it break existing functionality? Is the reviewer missing context?

## Process

### Step 1: Identify the spec and task

From the PR title or branch name, extract `SPEC-NNN` and/or `TASK-NNN`.

Read:
- The task file: `specs/tasks/SPEC-NNN/TASK-NNN-*.md`
- The parent spec: `specs/SPEC-NNN-*.md`
- Linked ADRs referenced in either

### Step 2: Read the diff

Read the full PR diff. Understand what changed and why.

### Step 3: Acceptance criteria checklist

For each acceptance criterion in the task file:

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
- [ ] Commit messages — reference SPEC/TASK IDs

### Step 6: Scope check

- Does the PR change anything outside the task's scope?
- Does it introduce features the spec didn't ask for?
- Does it touch files the task constraints said not to touch?

**Monorepo scope check (if `workspace` is set in the task):**

Enforce the following checks — these are blockers, not advisories:

- **`monorepo:workspace-scope`** — PR modifies files outside the declared `workspace` field in the task frontmatter. Every modified file path must fall within the workspace's root directory as defined in `.ai/project.md`.
- **`monorepo:verify-coverage`** — PR fails tests in any workspace listed in `verify_workspaces`. Run ALL workspaces in `verify_workspaces`, not just the primary.
- **`monorepo:boundary`** — Import-graph violation: a file in workspace A imports from workspace B against the dependency graph in `.ai/project.md`. Distinct from file-touch violations (`monorepo:workspace-scope`) — this is about import semantics, not file location.

Three non-overlapping prefixes, all blockers (severity assigned in SPEC-004 AC-006). Use the matching prefix when raising the finding.

**Boundary task check:** If this task produces output that a downstream task consumes (check `blocks` in the task file):
- Does the implementation match the boundary constraints specified in the task? (column names, types, export signatures)
- Is the contract visible where downstream tasks expect it? (schema.yml, exported types, etc.)
- If the implementation deviates from the specified contract, flag it — the downstream task's constraints need updating too

**Task breakdown check:** If the PR reveals the decomposition was wrong (but the spec is fine):
- PR is significantly larger than expected (~300 lines target) → the task should have been split. Raise a `blocker` finding citing `task:scope` so the policy routes to `fix_loop` and the orchestrator opens a `task-decomposition` re-plan.
- PR includes work that belongs in a different task → scope leak. Raise a `blocker` finding citing `task:scope` and propose the scope reduction in `suggested_fix`, or flag for re-planning if the task boundaries themselves were wrong.
- PR needed a prerequisite that doesn't exist as a task → raise a `blocker` finding citing `task:scope` so re-planning adds the missing task.

When this happens: don't just push the PR back into `fix_loop` and stop. Use `task-decomposition` re-planning mode to fix the task graph, then the PR can be adjusted to match the corrected scope.

### Step 7: Regression check

- Could these changes break anything outside the task scope?
- Are there related tests that should still pass?
- Were any existing tests modified? If so, is it justified?

**Monorepo regression check:**
- If shared code changed, were ALL consuming workspaces tested?
- If data models changed (dbt), could downstream app queries break?
- Check `verify_workspaces` in the task — were all of them actually run?

### Step 8: Verification (mandatory)

**Run the verification commands from the task file.** Read the full output. Do not skip this.

- If the task specifies `Run: npm test` → run it, read the output, confirm pass/fail.
- If tests fail, that's a finding. Report it.
- "Tests should pass" without running them is not acceptable.

**Monorepo verification:** Run tests for ALL workspaces listed in `verify_workspaces`, not just the primary workspace. A PR that passes `dealer-app` tests but breaks `admin-app` (because shared code changed) is not passing.

### Step 8b: Evidence content quality check

For each acceptance criterion in the task file, read the `evidence:` field:

- If `evidence:` is present but content is insufficient — e.g., "tests passed" with no output excerpt, "verified" with no proof, a one-word claim with nothing to inspect — raise a `task:evidence-missing` **major** finding. Include a one-sentence explanation of what is missing.

**Insufficient evidence examples:**
- `evidence: "tests passed"` — no output excerpt
- `evidence: "verified manually"` — no screenshot, log, or artifact
- `evidence: "done"` — no proof of any kind

**Sufficient evidence examples:**
- `evidence: "npm test -- --grep 'AC-001': 3 passing (42ms)"` — includes command + output excerpt
- `evidence: "grep output: <paste>"` — includes the actual artifact

Note: `evidence:` presence (empty vs populated) is a Tier 0 CI gate (per SPEC-004 / `review-primitives.md`). This step grades **content quality** on populated fields — it is a Tier 1 concern.

### Step 9: Consume graded findings from pr-reviewer

This skill does not decide a verdict on its own. The graded findings come from `pr-reviewer` as the JSON envelope defined in [`review-primitives.md`](../review-primitives.md) ("Output schema"). Steps 1–8 above are the source material that the graded run (or this skill, when running upstream of the JSON) draws on; this step is where you bring in the structured `findings[]` and prepare to render.

For each finding produced by `pr-reviewer`, you have:

- `severity` — one of `blocker | major | nit | suggestion`. Severity definitions live in `review-primitives.md` ("Severity spine" and "PR-side consequence catalog"); do not redefine them here.
- `criterion` — the grounded citation (e.g., `AC-003`, `ADR-007`, `sdlc-code-standards:dry`, `monorepo:boundary`, `task:blocks:TASK-088`, `task:scope`, or a cross-skill signal prefix such as `spec:ambiguous-ac`).
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

**Cross-skill signals** raised by `pr-reviewer` as `blocker` findings with `criterion` prefixes `task:scope`, `spec:ambiguous-ac`, `spec:contradictory-ac`, `spec:wrong-design`, or `spec:missing-section` route to `fix_loop` like any other blocker, but the fix loop is opened against `task-decomposition` (for `task:scope`) or `spec-amendment` (for the `spec:*` prefixes) rather than against the PR author. Render the criterion verbatim in the comment so the reader can see which hand-off is implied.

### After the action is rendered: check for spec completion

When the rendered action is `accept` (or `batch_followup_and_accept` once the follow-up is filed), check whether this was the last task for the spec:

1. Read `specs/tasks/SPEC-NNN/_index.yaml`
2. If ALL tasks are now `done` or `cancelled`, and the spec is still `active`:
   - Announce: "All tasks for SPEC-NNN are done. Invoking spec-completion to verify success criteria."
   - Invoke the `spec-completion` skill.
3. If tasks remain, report progress: "SPEC-NNN: N/M tasks done, K remaining."

This is the primary automated trigger for spec completion. Don't let specs stay `active` after all work is finished.

## Review comment template

The rendered comment groups findings by severity (highest first), shows the policy-derived action at the top, and surfaces a per-finding badge (`[criterion]`) plus `location` for every finding. Severity definitions are not duplicated here — see [`review-primitives.md`](../review-primitives.md) ("Severity spine" and "PR-side consequence catalog"). The shape:

```markdown
## Review: SPEC-NNN / TASK-NNN — fix_loop (1 blocker, 2 majors, 3 nits)

### Blockers (1)
- **[AC-003]** `apps/dealer-app/src/Foo.tsx:42` — Acceptance criterion not addressed in diff. Fix: implement the validation logic.

### Majors (2)
- **[sdlc-code-standards:dry]** `apps/dealer-app/src/utils.ts:12-34` — Reimplements existing helper in @repo/shared. Fix: import from @repo/shared.
- **[task:blocks:TASK-088]** `dbt/models/marts/dim_loans.sql:15` — Column rename breaks the contract this task is supposed to produce. Fix: revert column name or update TASK-088 spec.

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

## Reviewing Jules PRs

Jules PRs need extra scrutiny:
- Jules has no interactive debugging — it may have worked around issues in non-obvious ways
- Check that the implementation follows patterns in the codebase, not just the task file
- Verify Jules didn't add unnecessary dependencies or deviate from project conventions
- Run the full test suite, not just the tests Jules wrote — check for regressions
