---
name: spec-amendment
description: Use when implementation reveals the spec is wrong, incomplete, or needs change — "the spec assumed X but it's actually Y," "we need to add scope," "this acceptance criterion is untestable," "the design doesn't work," or when the user changes requirements mid-flight
---

# Spec Amendment

## Overview

The backward path in the SDLC. Spec-authoring moves forward (intent → spec). This skill handles what happens when reality pushes back — a task reveals a bad assumption, the user changes direction, or an external dependency shifts.

Spec amendment is normal, not failure. Every non-trivial spec will be amended at least once. The goal is to amend cleanly: classify the change, assess impact on in-flight work, update all artifacts, and get approval before continuing.

**This is a rigid skill.** No implementation continues against a known-wrong spec. No task changes without assessing the full impact.

**Announce at start:** "Using spec-amendment — the spec needs a change. Let me classify the impact before we continue."

## Hard gates

1. **No implementation against a known-wrong spec.** If you discover the spec is wrong, stop implementing and invoke this skill. Continuing wastes effort and creates artifacts that need rework.
2. **No breaking changes without user approval.** Cosmetic fixes can proceed. Additive and breaking changes require the user to review and approve before work resumes.
3. **No silent task invalidation.** If a spec change affects in-flight tasks, every affected task must be explicitly updated or cancelled. Don't leave stale tasks in the graph.

---

## Step 1: Identify the trigger

Something prompted this amendment. Name it clearly:

- **Implementation discovery:** "TASK-003 revealed that the auth middleware can't intercept at the route level — it needs to be app-level middleware."
- **User direction change:** "The user decided to drop feature X from scope."
- **External shift:** "The API we planned to integrate deprecated endpoint Y."
- **Review finding:** "Code review on TASK-002's PR found the design creates a circular dependency."
- **Bug during implementation:** "Tests for TASK-004 exposed a flaw in the acceptance criteria — criterion AC-005 contradicts AC-002."

Document the trigger. This becomes the "why" for the version bump.

## Step 2: Classify the change

Every spec change falls into one of three categories. The classification determines the process:

### Cosmetic

**Definition:** Typo fixes, clarification of ambiguous wording, adding examples, formatting. No change to what gets built or how it's tested.

**Rules:**
- No version bump
- No task impact analysis needed
- No user approval needed (but commit clearly)
- Update `updated` date in frontmatter

**Examples:**
- Fix a typo in the design section
- Clarify that "user" means "authenticated user" (if all tasks already assumed this)
- Add a code example to a constraint

### Additive

**Definition:** New acceptance criteria, expanded scope, additional constraints. Everything that was true before is still true — you're adding, not changing.

**Rules:**
- Version bump required
- Task impact analysis required (new tasks may be needed)
- User approval required
- No existing task should break — but new tasks may be needed

**Examples:**
- Add a new acceptance criterion: "Given admin user, when deleting account, then soft-delete only"
- Expand scope: "Also support OAuth in addition to JWT"
- Add a new ADR constraint discovered during implementation

### Breaking

**Definition:** Changed or removed acceptance criteria, altered design, reduced scope, changed architecture. Something that was true before is no longer true.

**Rules:**
- Version bump required
- Full task impact analysis required (existing tasks may be invalid)
- User approval required
- In-flight tasks must be assessed for rework, cancellation, or re-scoping

**Examples:**
- Change design: "Use app-level middleware instead of route-level" (affects tasks already built against the old design)
- Remove acceptance criterion: "Drop the real-time notification requirement"
- Change scope: "This spec now covers only the API, not the UI"
- Change architecture decision: "Switch from PostgreSQL to DynamoDB" (invalidates ADR + tasks)

## Step 3: Write the amendment

### For cosmetic changes

Edit the spec directly. Commit with message: `SPEC-NNN: clarify [what] (cosmetic, no version bump)`

Done. No further steps needed.

### For additive and breaking changes

**3a. Create a change summary** — before editing the spec, write a concise summary of what's changing and why. This becomes the basis for user review and task impact analysis.

```markdown
## Amendment to SPEC-NNN v[current] → v[next]

**Trigger:** [from Step 1]
**Classification:** additive | breaking

### What's changing
- [Specific change 1]
- [Specific change 2]

### Why
[The trigger, expanded with context]

### What's NOT changing
[Explicitly list unchanged sections — this reassures reviewers]
```

**3b. Edit the spec:**
- Bump `version` field (increment by 1)
- Update `updated` date
- Make the changes to the body sections
- If an ADR is affected: update the ADR status (superseded) and create a new one if needed
- Do NOT remove old acceptance criteria without marking them in the change summary

**3c. Add a changelog entry** at the bottom of the spec:

```markdown
## Changelog

### v2 (YYYY-MM-DD)
- **Breaking:** Changed auth middleware from route-level to app-level (TASK-003 discovery)
- **Additive:** Added admin soft-delete acceptance criterion

### v1 (YYYY-MM-DD)
- Initial spec
```

## Step 4: Task impact analysis

This is the critical step. For every task in `specs/tasks/SPEC-NNN/`:

Read `_index.yaml` and each task file. For each task, classify:

| Task status | Impact | Action |
|------------|--------|--------|
| `pending` (not started) | Affected by change | Update task file to reflect new spec |
| `pending` (not started) | Not affected | No action |
| `in-progress` | Affected by change | Signal the agent — see Step 5 |
| `in-progress` | Not affected | No action |
| `done` (PR merged) | Invalidated by change | Create a **rework task** — see Step 6 |
| `done` (PR merged) | Not affected | No action |
| N/A | New work needed | Create new task(s) — see Step 6 |

Build the impact table:

```markdown
### Task impact

| Task | Status | Impact | Action |
|------|--------|--------|--------|
| TASK-001 | done | Not affected | None |
| TASK-002 | in-progress | Breaking — design changed | Signal agent, update task |
| TASK-003 | pending | Breaking — acceptance criteria changed | Update task file |
| TASK-004 | pending | Not affected | None |
| NEW | — | Additive — new acceptance criterion | Create TASK-005 |
```

## Step 5: Handle in-progress tasks

When a spec amendment affects a task that an agent is actively working on:

**For Claude Code tasks:**
- You're the agent. Stop implementation, apply the amendment, adjust your work.

**For Jules tasks:**
- If the PR doesn't exist yet: send a follow-up message to the Jules session with the updated requirements. Use the Jules API `sendMessage` endpoint.
- If the PR already exists but not merged: add a review comment explaining the spec change and what needs to change in the PR. Request changes.
- If the task is fundamentally invalidated: cancel the Jules session if possible. Create a replacement task.

**For human tasks:**
- Add a comment on the Linear issue explaining the spec change and its impact on this task.

## Step 6: Update the task graph

Based on the impact analysis:

**Update existing pending task files:**
- Change acceptance criteria to match new spec
- Update constraints if design changed
- Update verification commands if scope changed
- Update `updated` date

**Create rework tasks** for completed work that's now invalid:
- ID: next available TASK-NNN
- Title: "Rework: [original task title] for SPEC-NNN v[new version]"
- Context: reference original task, explain what changed, link the amendment
- Scope to ONLY the delta — not a redo of the entire original task

**Create new tasks** for additive scope:
- Follow the same process as task-decomposition Step 6
- Wire into the dependency graph correctly

**Cancel obsolete tasks:**
- Set `status: cancelled` in the task file
- Update Linear issue to cancelled
- Remove from `_index.yaml` dependency graph (update `depends_on`/`blocks` on other tasks)

### Dependency wiring rules for rework tasks

Rework tasks inherit the dependency position of the task they're reworking. The principle: **any task that depended on the original's output now depends on the rework landing first.**

**Rule 1: Rework tasks replace their original in the dependency graph.**

If TASK-001 is done and needs rework (→ TASK-005), then every task that had `depends_on: [TASK-001]` gets updated to `depends_on: [TASK-005]`.

```
Before amendment:
  TASK-001 [done] → TASK-003 [pending, depends_on: [TASK-001]]

After amendment:
  TASK-001 [done]
  TASK-005 [pending, rework of 001] → TASK-003 [pending, depends_on: [TASK-005]]
```

**Rule 2: Multiple rework tasks respect the original ordering.**

If TASK-001 blocked TASK-002, and both need rework, the rework tasks preserve that ordering:

```
Before amendment:
  TASK-001 [done] → TASK-002 [done] → TASK-003 [pending]

After amendment (both need rework):
  TASK-005 [rework of 001] → TASK-006 [rework of 002, depends_on: [TASK-005]] → TASK-003 [depends_on: [TASK-006]]
```

**Rule 3: Rework tasks don't depend on the original.**

The original is done — its code is on main. The rework task modifies that code. It doesn't wait for anything the original waited for (those are also done). Its only dependencies are other rework tasks that must land first.

**Rule 4: In-progress tasks that are affected get a new dependency, not a replacement.**

If TASK-003 is in-progress and a rework task TASK-005 is created for upstream work it depends on, TASK-003 gets `depends_on: [TASK-005]` added (not replacing existing deps). TASK-003 is blocked until TASK-005 lands.

**Rule 5: Unaffected tasks keep their original dependencies.**

If TASK-004 depends on TASK-002, and TASK-002 is done and NOT affected by the amendment, TASK-004's dependencies don't change.

### Update `_index.yaml`

After all task file changes:
- Add new tasks (rework + additive)
- Remove cancelled tasks
- Rewire dependency edges per the rules above
- Update `updated` date
- Verify: no circular dependencies, no dangling references

## Step 7: Review with the user

Present the full picture:

1. **The amendment summary** (from Step 3a)
2. **The task impact table** (from Step 4)
3. **Specific changes to task files** (updated, new, cancelled)
4. **Dependency graph changes** (if any)

Ask:
- Does the amendment capture the right change?
- Is the task impact assessment correct?
- Are the new/rework tasks scoped correctly?
- Any in-progress work I should handle differently?

**Do not proceed until the user approves.**

## Step 8: Commit and update Linear

**Commit everything together** — the spec change and all task file updates in one commit:
- Message: `SPEC-NNN v[new]: [amendment summary] (N tasks updated, M new, K cancelled)`
- If the change is large enough for a PR: branch `amend/SPEC-NNN-v[new]-short-description`

**Update Linear:**
- Update the Linear project description to reference the new spec version
- For updated tasks: update Linear issue descriptions
- For new tasks: create Linear issues
- For cancelled tasks: cancel Linear issues
- For rework tasks: create Linear issues with `rework` label
- Add a comment on the Linear project: "Spec amended to v[new]: [summary]"

## Step 9: Resume work

After the amendment is committed and Linear is updated:

1. Re-read `_index.yaml` for the current ready queue
2. Dispatch ready tasks (new, updated, or rework)
3. Continue the normal SDLC flow

---

## When to amend vs. when to supersede

| Situation | Action |
|-----------|--------|
| Design tweak discovered during implementation | Amend (this skill) |
| User adds a requirement | Amend (this skill) |
| User changes direction fundamentally | **Supersede** — create a new spec via spec-authoring |
| External shift invalidates most of the design | **Supersede** |
| More than ~50% of tasks would need rework | **Supersede** |
| Original spec was the wrong solution to the problem | **Supersede** |

**Superseding means:** Create SPEC-NNN+1 via spec-authoring with `supersedes: SPEC-NNN`. Set the old spec to `status: superseded`. Cancel all remaining tasks for the old spec. Start fresh decomposition.

Amending means the spec is still fundamentally right — you're adjusting, not replacing.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Continuing implementation against a known-wrong spec | Stop and amend. Wasted work is worse than a pause. |
| Amending without checking task impact | Always run Step 4. A "small" spec change can invalidate multiple tasks. |
| Silently updating a task file without the amendment trail | The spec version bump + changelog + commit message create the audit trail. |
| Treating every change as breaking | Classify honestly. Additive changes are lower-friction and don't require rework analysis. |
| Amending when you should supersede | If >50% of tasks need rework, the spec is fundamentally wrong. Start over. |
| Forgetting to update `_index.yaml` | The index must always match the task files. New, cancelled, and re-wired tasks all change it. |
| Not signaling in-progress Jules tasks | Jules won't know the spec changed unless you tell it. Use the API or PR review. |
