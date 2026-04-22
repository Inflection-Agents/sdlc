---
name: sdlc-code-review
description: Use when reviewing any PR — yours, Jules's, or a teammate's — to verify against spec acceptance criteria, ADR constraints, and coding standards
---

# SDLC Code Review

## Overview

Review PRs against the spec, not just code quality. Every PR traces to a task, every task traces to a spec. The review verifies that chain.

**This is a rigid skill.** Every step must be followed. No shortcuts.

**Announce at start:** "Using sdlc-code-review to review this PR against the spec."

**Companion skills (auto-invoked if installed):**
- `requesting-code-review` — mandatory review triggers, context preparation (git SHAs, requirements)
- `receiving-code-review` — handling feedback: verify before implementing, push back when wrong
- `verification-before-completion` — no approval claims without running verification

**Domain skills:** Check `.ai/project.md` → Workspace skills table. When reviewing a PR for a workspace that has domain skills listed, apply those domain-specific conventions in addition to the standard code review. For example, a dbt PR should be reviewed against dbt-craftsman style rules (CTE ordering, naming, macros), not just generic code standards.

## Critical gates

1. **No performative agreement.** "Great catch!", "You're absolutely right!", "Thanks for the feedback!" are banned. Just state the technical finding or fix it. The review is a technical artifact, not a social interaction.
2. **Verify before approving.** Run the tests. Read the output. A review that says "LGTM" without running verification is not a review.
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
- Does the PR only touch files in the declared workspace? (Hard rule: one workspace per task)
- If it touches shared/upstream code, does the task's `verify_workspaces` include all consumers?
- Does the PR violate import boundaries from `.ai/project.md`? (e.g., app importing from another app, shared importing from an app)

**Boundary task check:** If this task produces output that a downstream task consumes (check `blocks` in the task file):
- Does the implementation match the boundary constraints specified in the task? (column names, types, export signatures)
- Is the contract visible where downstream tasks expect it? (schema.yml, exported types, etc.)
- If the implementation deviates from the specified contract, flag it — the downstream task's constraints need updating too

**Task breakdown check:** If the PR reveals the decomposition was wrong (but the spec is fine):
- PR is significantly larger than expected (~300 lines target) → the task should have been split. Flag for re-planning.
- PR includes work that belongs in a different task → scope leak. Request changes to remove the extra work, or flag for re-planning if the task boundaries were wrong.
- PR needed a prerequisite that doesn't exist as a task → flag for re-planning to add the missing task.

When this happens: don't just request changes on the PR. Use `task-decomposition` re-planning mode to fix the task graph, then the PR can be adjusted to match the corrected scope.

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

### Step 9: Verdict

**Approve** — all criteria met, standards followed, tests pass, no concerns.

**Request changes** — specific issues listed with specific fixes. No vague "could be improved." State what's wrong and what the fix is.

**Escalate** — raise to human when:
- Architectural concern beyond the task scope
- Spec ambiguity that needs a decision
- Scope creep that needs PM input
- Security concern

**Trigger spec-amendment** — when the review reveals the spec itself is wrong:
- The implementation deviates from the spec, but the deviation is correct and the spec is wrong
- Acceptance criteria contradict each other and the PR had to pick one interpretation
- The boundary constraints don't match what's actually possible (e.g., upstream task produced a different type than specified)
- The design section describes something that can't work as written

When this happens: don't just request changes on the PR. Invoke the `spec-amendment` skill to fix the root cause. The PR may be fine — the spec needs updating, and other tasks may be affected.

### After approving: check for spec completion

After approving a PR, check whether this was the last task for the spec:

1. Read `specs/tasks/SPEC-NNN/_index.yaml`
2. If ALL tasks are now `done` or `cancelled`, and the spec is still `active`:
   - Announce: "All tasks for SPEC-NNN are done. Invoking spec-completion to verify success criteria."
   - Invoke the `spec-completion` skill.
3. If tasks remain, report progress: "SPEC-NNN: N/M tasks done, K remaining."

This is the primary automated trigger for spec completion. Don't let specs stay `active` after all work is finished.

## Review comment format

```markdown
## Review: SPEC-NNN / TASK-NNN

### Acceptance criteria
| ID | Description | Addressed | Tested |
|----|-------------|-----------|--------|
| AC-001 | ... | ✅ | ✅ |
| AC-002 | ... | ✅ | ⚠️ edge case missing |

### ADR compliance
- ADR-001: ✅ compliant
- ADR-003: ⚠️ see comment on line 42

### Standards
- DRY: ✅
- YAGNI: ⚠️ added unused config option
- Tests: ✅

### Verification
- `npm test`: ✅ 47 passed, 0 failed
- `npm run lint`: ✅ no issues

### Verdict: [Approve / Request changes / Escalate]

[Specific issues if not approved]
```

## Reviewing Jules PRs

Jules PRs need extra scrutiny:
- Jules has no interactive debugging — it may have worked around issues in non-obvious ways
- Check that the implementation follows patterns in the codebase, not just the task file
- Verify Jules didn't add unnecessary dependencies or deviate from project conventions
- Run the full test suite, not just the tests Jules wrote — check for regressions
