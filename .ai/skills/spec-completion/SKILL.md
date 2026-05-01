---
name: spec-completion
description: Use when all tasks for a spec are done or nearly done — "is this spec finished?", "all tasks are merged", "verify the spec", "close out SPEC-NNN", or when checking whether a spec's success criteria are actually met end-to-end
---

# Spec Completion

## Overview

The bookend to spec-authoring. Spec-authoring opens the loop (intent → spec). This skill closes it (all tasks done → spec verified → completed).

Individual tasks verify their own acceptance criteria. But a spec's **success criteria** are holistic — they describe outcomes that may not be covered by any single task. "p99 latency < 200ms" or "all dealer reports load within 3 seconds" require verifying the system as a whole, not just that each piece was built.

Without this skill, specs stay `active` forever. You can't answer "what shipped this quarter" because nothing is ever formally done.

**This is a rigid skill.** A spec is not complete until success criteria are verified. Merged PRs are not the finish line — verified outcomes are.

**Announce at start:** "Using spec-completion to verify whether SPEC-NNN's success criteria are met."

## Hard gates

1. **All tasks must be done or cancelled.** If any task is `pending`, `in-progress`, or `blocked`, the spec is not ready for completion. Cancelled tasks are acceptable only if the cancelled scope was intentional (documented in a spec amendment).
2. **Success criteria must be verified, not assumed.** "All tasks passed their acceptance criteria" does not mean the success criteria are met. Verify each one independently.
3. **User signs off.** The spec owner (human) makes the final call. The agent presents evidence; the human decides.

---

## Step 1: Check task graph status

Read `specs/tasks/SPEC-NNN/_index.yaml`. Verify:

- [ ] Every task has `status: done` or `status: cancelled`
- [ ] No task is `pending`, `in-progress`, or `blocked`
- [ ] Cancelled tasks have a documented reason (spec amendment, scope reduction, or superseded by another task)

If tasks remain incomplete, report what's outstanding and stop. The spec isn't ready.

```markdown
### Task status: SPEC-NNN

| Task | Title | Status | Notes |
|------|-------|--------|-------|
| TASK-001 | Add auth middleware | done | |
| TASK-002 | Write auth tests | done | |
| TASK-003 | Add login endpoint | done | |
| TASK-004 | Update API docs | cancelled | Scope removed in v2 amendment |
```

## Step 2: Map success criteria to evidence

Read the spec's **Success criteria** section. For each criterion, determine what kind of verification it needs:

| Verification type | Description | Example |
|------------------|-------------|---------|
| **Task-covered** | The criterion is directly satisfied by one or more task acceptance criteria passing | "Auth middleware rejects invalid tokens" → covered by TASK-001 AC-002 |
| **Integration** | The criterion requires multiple completed tasks working together | "User can log in end-to-end" → requires middleware + endpoint + tests working together |
| **Measurement** | The criterion requires measuring the running system | "p99 latency < 200ms" → requires load test or production metrics |
| **Manual** | The criterion requires human judgment | "Admin UI is intuitive" → needs human review |

Build the verification plan:

```markdown
### Success criteria verification plan

| # | Criterion | Type | How to verify | Status |
|---|-----------|------|---------------|--------|
| 1 | Invalid tokens return 401 | Task-covered | TASK-001 AC-002 passed | verified |
| 2 | End-to-end login works | Integration | Run integration test suite | pending |
| 3 | p99 auth latency < 200ms | Measurement | Load test against staging | pending |
| 4 | No regression in existing endpoints | Integration | Full test suite passes | pending |
```

## Step 3: Verify task-covered criteria

For each **task-covered** criterion:

1. Find the task(s) and acceptance criteria that cover it
2. Confirm the acceptance criteria passed (check task file frontmatter: `status: pass`)
3. If the task's PR is merged, the criteria are verified

This is usually straightforward — the work is already done. Document the mapping:

```
Success criterion 1: "Invalid tokens return 401"
  → Covered by TASK-001 / AC-002: "Invalid tokens return 401 with error body" [pass]
  → Verified: yes
```

## Step 4: Run integration verification

For each **integration** criterion:

1. Identify what needs to run together
2. Run the verification — typically an integration test suite, an end-to-end test, or a manual walkthrough
3. Read the output. Document pass/fail with evidence.

```
Success criterion 2: "End-to-end login works"
  → Ran: `pnpm --filter @org/app test:e2e -- --grep auth`
  → Result: 12 passed, 0 failed
  → Verified: yes
```

If integration tests don't exist for this criterion, flag it. Either:
- Write the integration test now (preferred — it becomes part of the regression suite)
- Do a manual walkthrough and document the result
- Flag as unverifiable and note why

## Step 5: Handle measurement criteria

For each **measurement** criterion:

1. Determine where to measure (staging, production, load test)
2. If measurable now: run the measurement, document the result
3. If requires production: flag as **deferred-to-production** with a clear verification plan

```
Success criterion 3: "p99 auth latency < 200ms"
  → Requires production traffic. Cannot verify in staging.
  → Deferred: monitor after deploy. Dashboard: [link]
  → Verification owner: franklin
  → Deadline: 1 week post-deploy
```

Deferred criteria don't block completion, but they must have:
- A clear measurement plan
- An owner responsible for checking
- A deadline
- A dashboard or tool to check against

## Step 6: Handle manual criteria

For each **manual** criterion, present it to the user for judgment. The agent provides evidence and context; the human decides.

## Step 7: Build the completion report

Assemble everything into a completion report:

```markdown
## Completion report: SPEC-NNN v[version]

### Task summary
- Total tasks: N
- Completed: N
- Cancelled: N (with reasons)

### Success criteria

| # | Criterion | Type | Evidence | Status |
|---|-----------|------|----------|--------|
| 1 | Invalid tokens return 401 | Task-covered | TASK-001 AC-002 | verified |
| 2 | End-to-end login works | Integration | e2e test suite: 12/12 passed | verified |
| 3 | p99 latency < 200ms | Measurement | Deferred to production (1 week) | deferred |
| 4 | No regression in existing endpoints | Integration | Full suite: 347/347 passed | verified |

### Deferred verifications
| Criterion | Owner | Deadline | How to check |
|-----------|-------|----------|-------------|
| p99 latency < 200ms | franklin | YYYY-MM-DD | Grafana dashboard: [link] |

### Verdict: [Ready to complete / Blocked / Needs discussion]
```

## Step 8: Get user sign-off

Present the completion report to the user. Ask:

- Are the verified criteria sufficient?
- Are the deferred verification plans acceptable?
- Any concerns before we mark this complete?

**Do not proceed without explicit user approval.**

## Step 9: Close the spec

After user approval:

1. **Update spec frontmatter:**
   - `status: active` → `status: completed`
   - Update `updated` date

2. **Update spec-index.json** (or let CI regenerate it)

3. **Update Linear:**
   - Mark the Linear project as completed
   - Add the completion report as a project update/comment
   - Close any remaining open Linear issues for this spec

4. **Check for deferred verifications:**
   - If any criteria are deferred-to-production, create a follow-up task or Linear issue to track the verification
   - Set a reminder with the deadline from Step 5

5. **Commit:** `SPEC-NNN: mark completed — N/M success criteria verified, K deferred`

6. **Announce:** "SPEC-NNN is complete. [N verified, K deferred to production with deadlines.]"

---

## Partial completion

Sometimes not all success criteria can be verified, and the user wants to ship anyway. This is valid — but it must be explicit:

- Document which criteria are verified, which are deferred, and which are waived
- Waived criteria need a reason: "Decided not to pursue real-time notifications — polling is sufficient"
- If a criterion is waived, check whether it should be removed from the spec via `spec-amendment` first

A spec with waived criteria is still `completed` — the decision to waive is itself a completion decision.

## When NOT to use this skill

| Situation | What to do instead |
|-----------|-------------------|
| Spec is being replaced by a new spec | Set `status: superseded`, not completed |
| Spec was a bad idea and work is being abandoned | Set `status: deprecated` with a note |
| Some tasks are done but others are in-progress | Wait. Come back when all tasks are done or cancelled. |
| Tasks are done but you discover the spec needs changes | Use `spec-amendment` first, then come back to completion |

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Marking complete because all PRs merged | PRs merged ≠ success criteria met. Verify each criterion. |
| Skipping integration verification | Individual task tests don't prove the pieces work together. Run integration checks. |
| Deferring everything to production | Only measurement criteria should be deferred. Task-covered and integration criteria can be verified now. |
| No deferred verification plan | "We'll check in prod" without an owner, deadline, and dashboard is not a plan. |
| Completing a spec with cancelled tasks and no explanation | Every cancelled task needs a documented reason (amendment, scope reduction, superseded). |
| Forgetting to update Linear | The spec, spec-index, and Linear project must all reflect completion. |
