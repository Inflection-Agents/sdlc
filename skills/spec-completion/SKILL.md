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
3. **Behavioral changes need an armed regression guard, not a deferred check.** If the spec changes a production behavioral metric (prompts, matching/scoring, gating rules, retrieval inputs, thresholds), it is not complete until it has a declared guardrail (baseline + threshold), a realized measurement on the first production exposure, and an armed rollback with an automatic trigger. See Step 5a. A "monitor the dashboard next week" deferral does not satisfy this.
4. **User signs off.** The spec owner (human) makes the final call. The agent presents evidence; the human decides.

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
  → Trigger: 1 week post-deploy
```

Deferred criteria don't block completion, but they must have:
- A clear measurement plan
- An owner responsible for checking
- A trigger (a calendar date such as "2026-06-01" OR an observable condition such as "after the next spec executes")
- A dashboard or tool to check against

**Rigor requirement:** Every measurement-class deferred criterion MUST have all three fields populated: Owner, Trigger, Method. The skill emits a completion-blocking failure (reports verdict: "Blocked") if any measurement-class criterion is missing any of the three. No deferral without a clear path to verification.

### Step 5a: Behavioral-change regression gate (mandatory)

**Trigger:** the spec changes a **production behavioral metric** — anything where the same input can now produce a different model/system output at scale: coder/critic prompts or instructions, ranking/matching/scoring logic, auto-approve or gating rules, retrieval/RAG inputs, classifier thresholds, pricing/eligibility logic. If in doubt, it qualifies.

For these, a *deferred-to-production, owned-by-a-human* measurement (Step 5) is **NOT sufficient** and MUST NOT be used as the completion path. The failure mode this closes: a change ships, the "realized-lift measurement" is handed to a human to check "next day," the metric silently regresses, and nobody notices until a downstream incident. (This is exactly how SPEC-026's screening coder-instruction change cut the AIWW `validated` rate 50%→16% and collapsed automation for a full prod batch before a human caught it.)

A behavioral-change spec is **complete only when ALL of the following exist and are stamped in the completion report**:

1. **Guardrail metric + baseline + regression threshold**, declared in the spec (not invented at completion). e.g. `screening first-pass validated% ≥ baseline(50%) − 5pt`, measured over the first N post-deploy units (batch / hour / 1k requests). If the spec has no guardrail, that is a **spec-amendment blocker** — send it back to `spec-authoring`/`spec-amendment` to add one; do not complete.
2. **A realized post-deploy measurement of that guardrail on the FIRST real production exposure** — not a future promise. The spec status stays `active` (a `monitoring` sub-state) until this first measurement lands. "Blocked" verdict until then.
3. **An armed, pre-written rollback** — the exact revert (migration/flag/config) prepared and referenced by path/id, plus the automatic trigger condition (`if guardrail breaches threshold on the first N units → execute rollback`). "Someone will watch the dashboard" is not an armed rollback. Prefer a flag/kill-switch or a one-command revert so the rollback is seconds, not a rebuild.

**Prefer a canary over a full-fleet cutover** for behavioral changes: expose the new behavior to a bounded slice (one practice / N% of traffic / a shadow run) and compare the guardrail against control before full rollout. A shadow/canary that never touched the full fleet cannot cause a full-fleet regression.

Stamp the outcome in the completion report's **Deferred verifications** section as a `behavioral-guardrail` row: metric, baseline, threshold, first-exposure result, rollback artifact + trigger. A behavioral-change spec with an empty or missing `behavioral-guardrail` row is **Blocked**, never **Ready to complete**.

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
| Criterion | Owner | Trigger | Method |
|-----------|-------|---------|--------|
| p99 latency < 200ms | franklin | YYYY-MM-DD | Grafana dashboard: [link] |

### Verdict: [Ready to complete / Blocked / Needs discussion]
```

The completion report shape is defined in `templates/completion-report.md` (canonical). The skill produces this template at completion time.

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

5. **Move the closed spec out of the default search path:**

   ```bash
   node scripts/sdlc/archive-specs.mjs --dry-run   # read the plan first
   node scripts/sdlc/archive-specs.mjs             # git mv spec + its task tree
   ```

   A terminal status is what makes a spec archivable, so this belongs in the same commit
   as the status flip: `archive-specs.mjs --check` runs enforcing in CI, and a spec left
   behind turns that gate red on the next push.

   Nothing is deleted. The spec and its `specs/tasks/SPEC-NNN/` tree move under
   `specs/archive/`, stay tracked in git, and remain addressable by id
   (`node scripts/sdlc/resolve.mjs SPEC-NNN`). The repo-root `.ignore` explains why
   position beats a status label.

   **A no-op here is a legitimate outcome.** Two denylist clauses hold a spec in the live
   corpus on purpose: a live skill citing its id, or a non-archived ADR binding it. If the
   script reports nothing to archive, say which clause held it rather than re-running or
   editing around it.

6. **Commit:** `SPEC-NNN: mark completed — N/M success criteria verified, K deferred`

7. **Announce:** "SPEC-NNN is complete. [N verified, K deferred to production with deadlines.]"

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
| No deferred verification plan | "We'll check in prod" without an owner, trigger, and method is not a plan. |
| Completing a spec with cancelled tasks and no explanation | Every cancelled task needs a documented reason (amendment, scope reduction, superseded). |
| Forgetting to update Linear | The spec, spec-index, and Linear project must all reflect completion. |

<!-- sdlc:handoff:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-completion** in the SDLC state machine (`specs/sdlc-state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- is this spec finished
- all tasks are merged
- verify the spec
- close out SPEC-NNN

**Preconditions:**

- all tasks for the spec are done or nearly done and the integration PR is merged — the delivery run's independent integration review already graded the success criteria, so completion does not re-grade (when the PR was opened outside a delivery run, with no integration-reviewer verdict on the record, verify the success criteria here)

**Exit condition:** spec success criteria verified end-to-end, spec status set to a terminal state, and the closed spec archived out of the default search path (archive-specs.mjs), unless a denylist clause holds it in the live corpus

**Next step:** `none` (terminal phase — no next phase)
<!-- sdlc:handoff:end -->
