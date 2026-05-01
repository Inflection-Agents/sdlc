---
name: task-decomposition
description: Use when a spec has status active and needs to be broken into executable tasks, or when existing tasks need restructuring — "decompose this spec," "break this down," "this task is too big," "split this task," "we need another task before X," "merge these tasks," "re-route this to claude-code"
---

# Task Decomposition

## Overview

Break an active spec into a dependency graph of independently-executable tasks. Each task gets a structured file in the repo and a corresponding Linear issue.

**This is a rigid skill.** Follow the steps exactly. No shortcuts.

**Announce at start:** "Using task-decomposition to break this spec into executable tasks."

**Prerequisite:** Spec must have `status: active`. If it's still `draft`, use the `spec-authoring` skill first.

**Companion skills (auto-invoked if installed):**
- `writing-plans` — plan discipline: no placeholders, exact file paths, complete code, bite-sized steps
- `dispatching-parallel-agents` — principles for routing independent work to separate agents

**Domain skills:** Check `.ai/project.md` → Workspace skills table. When decomposing tasks into a workspace that has domain skills, read those skills to understand:
- Technology-specific decomposition patterns (e.g., dbt-cartographer has its own plan → champion model)
- Workspace-specific style rules that should appear in task constraints
- Domain-specific verification commands
- Whether the workspace has its own orchestration model (e.g., cartographer spawning craftsman agents) that SDLC task execution should integrate with rather than override

## Critical gates (from writing-plans discipline)

1. **No placeholders.** Every task file must contain actual acceptance criteria, actual constraints, actual verification commands. "TBD," "TODO," "similar to TASK-N," and empty sections are plan failures.
2. **Bite-sized tasks.** Each task should be completable in one PR (~300 lines). If it's bigger, split it.
3. **Exact paths and context.** Task files must specify which files to modify, which patterns to follow, which test commands to run. Assume the implementing agent has zero codebase context.
4. **Mandatory self-review.** After creating all task files, verify: every spec acceptance criterion is covered, no circular dependencies, _index.yaml matches task files.

## Process

### Step 1: Read the spec deeply

Read the full spec. Focus on:
- **Acceptance criteria** — each becomes one or more tasks
- **Design section** — informs how to split the work
- **Dependencies/risks** — inform task ordering
- **Scope boundaries** — what NOT to include

**If the spec can't be decomposed** — the design has circular dependencies, acceptance criteria contradict, or the architecture is unimplementable — **stop and invoke `spec-amendment`**. Don't force a bad decomposition from a flawed spec. Fix the spec first.

### Step 1b: Check for collisions with other active specs

Read `specs/spec-index.json`. For each other spec with `status: active`:
1. Compare workspace lists — does this spec's `workspaces` overlap with any other active spec?
2. If workspaces overlap, read the other spec's task directory (`specs/tasks/SPEC-NNN/_index.yaml`) for active/pending tasks in the overlapping workspace
3. If active tasks exist in the same workspace from another spec:

**Flag to the user:**
```
Collision detected: SPEC-NNN also has active tasks in [workspace].
- TASK-XXX: [title] (status: in-progress)
- TASK-YYY: [title] (status: pending)

Risk: tasks from both specs may touch the same files, causing merge conflicts
or behavioral conflicts that no single PR review would catch.

Options:
a) Proceed with awareness — add constraints to tasks noting the overlap
b) Sequence the specs — finish SPEC-NNN's tasks in [workspace] before starting these
c) Coordinate — identify specific files at risk and ensure tasks don't overlap
```

The user decides. Do not silently proceed when two specs compete for the same workspace.

This check takes 30 seconds and prevents the hardest-to-debug class of problems: two independently-correct PRs that break each other when both merge.

### Step 2: Identify task boundaries

Split along these lines:
- **One concern per task.** A task should do one thing well.
- **Independently testable.** Each task has tests that can pass without other tasks being done.
- **Minimal dependencies.** Maximize parallelism. If tasks CAN run in parallel, they SHOULD.
- **Right-sized.** A task should be one PR. If it's more than ~300 lines changed, split further.

Common decomposition patterns:
- Data model changes → API layer → UI layer
- Core logic → integration → tests → docs
- Write tests → implement → wire up → validate

#### Monorepo decomposition

If `.ai/project.md` defines workspaces, split tasks along workspace boundaries.

**Hard rule: one workspace per task.** A task must not touch files in multiple workspaces. Cross-workspace changes are split into separate tasks linked by dependencies. No exceptions — this enables independent testing, clear agent routing, and parallel execution.

##### Step A: Read the workspace context

Read these sections in `.ai/project.md` before decomposing:
1. **Workspace map** — what exists, dependency graph, agent eligibility
2. **Workspace interfaces** — how workspaces interact at runtime (contracts, schemas, exports)
3. **Change propagation patterns** — recurring cross-workspace change sequences with task ordering

##### Step B: Split along workspace boundaries

1. **Assign each task a single workspace.** If a change touches dbt AND shared types AND an app, that's at least 3 tasks.
2. **Follow change propagation patterns.** If project.md defines a pattern for the type of change you're making (e.g., "New field: data → apps"), follow its task ordering and boundary constraints.
3. **Upstream before downstream.** Changes flow from producer to consumer: data → shared → apps. The dependency graph must reflect this.
4. **Parallel where possible.** Consumer tasks that don't depend on each other run in parallel (e.g., dealer-app and admin-app both depend on shared, but not on each other).

##### Step C: Write boundary constraints on boundary tasks

Tasks at workspace boundaries need explicit constraints so the implementing agent produces output that the downstream task can consume. Use the **Workspace interfaces** section in project.md to write these.

For example, a task adding a dbt column must specify in its Constraints section:
```
- Column name: `loan_status`
- Column type: `text`
- Nullable: no
- Schema.yml documentation: required
- Downstream: TASK-003 (shared types) will use this exact name and type
```

The downstream task references the upstream:
```
- Must match column name and type from TASK-002 (see dbt schema.yml after TASK-002 merges)
- Source of truth for the contract: dbt/models/marts/schema.yml
```

Without these boundary constraints, downstream tasks are guessing at the interface.

##### Step D: Set verification scope

1. **Set `verify_workspaces` correctly:**
   - Task in a leaf app (e.g., `dealer-app`): `verify_workspaces: [dealer-app]`
   - Task in shared code: `verify_workspaces` must include ALL consuming workspaces (e.g., `[shared, dealer-app, admin-app]`)
   - Task in data layer (e.g., dbt): may need separate verification (e.g., `dbt test`)
2. **Use workspace-scoped commands** in the Verification section (e.g., `pnpm --filter @org/app test`, not `pnpm test`).
3. **Respect import boundaries** from project.md — don't create tasks that violate them.
4. **Workspace-level eligibility** — check project.md's agent eligibility table. Workspaces requiring credentials/database access are never jules-eligible regardless of task complexity.

**Cross-workspace tasks are the hardest to get right.** When a spec spans multiple workspaces:
- Shared/upstream changes come first in the dependency graph
- Consumer updates depend on the shared changes
- Never send two tasks to parallel agents if they edit the same workspace — they'll conflict

### Step 3: Build the dependency graph

For each task, determine:
- `depends_on`: which tasks must complete before this one starts
- `blocks`: which tasks can't start until this one completes

Rules:
- Dependencies are acyclic (no circular deps)
- Minimize depth — flat is better than deep chains
- If two tasks don't depend on each other, they can run in parallel

### Step 4: Route each task

Apply one routing label per task using these rules:

**`jules`** — ALL of these must be true:
- Clear acceptance criteria (Given/When/Then)
- Self-contained — no local env, running services, or MCP needed
- Follows existing patterns — no architecture decisions
- Verifiable by running tests
- Narrow scope — bounded set of files
- Workspace is marked jules-eligible in `.ai/project.md` (if monorepo)

**`claude-code`** — ANY of these is true:
- Needs local env, MCP, running services, or credentials
- Requires architecture judgment or design decisions
- Requires interactive debugging or exploration
- Multi-file refactor with cascading decisions
- Spec is ambiguous for this task
- Workspace requires credentials or env vars (e.g., dbt, data pipelines)

**`human`** — ANY of these is true:
- Architecture vision or framework decisions
- Priority/tradeoff calls
- Stakeholder communication
- Security-sensitive review

**Default: `claude-code`.** Better to handle locally with full context than to send to Jules and have it fail.

**Route based on task characteristics, not Jules availability.** Label tasks `jules` if they meet the criteria above, even if Jules isn't currently set up. The label records the task's nature (self-contained, parallelizable). At dispatch time, if Jules isn't available, `jules`-labeled tasks fall back to Claude Code execution automatically. This means routing decisions survive across environments — a task labeled `jules` will use Jules when available and fall back gracefully when not.

**Routing principle (from dispatching-parallel-agents):** One agent per independent problem domain. Group by what is logically related, not by file proximity. If fixing one task might affect another, they should NOT run in parallel — investigate the dependency first.

### Step 5: Assign task IDs

Check existing task directories in `specs/tasks/` for the highest TASK ID globally. Increment from there.

Format: `TASK-NNN` (zero-padded to 3 digits).

### Step 6: Create task files

Create directory: `specs/tasks/SPEC-NNN/`

For each task, create `TASK-NNN-short-description.md`:

```yaml
---
id: TASK-NNN
spec: SPEC-NNN
title: "Clear, specific title"
status: pending
agent: jules | claude-code | human
workspace: dealer-app              # primary workspace (from .ai/project.md)
verify_workspaces: [dealer-app]    # all workspaces to test (include consumers of shared code)
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-NNN
    description: "Given X, when Y, then Z"
    status: pending
  - id: AC-NNN
    description: "Given A, when B, then C"
    status: pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Context

[Why this task exists. Which part of the spec it addresses.]

## Requirements

[What needs to be built. Scoped to just this task. Include exact file paths.]

## Constraints

- [ADR references: "Must use X per ADR-NNN"]
- [Patterns to follow: "Use existing middleware pattern in src/middleware/"]
- [Files NOT to touch]
- [Dependencies: "TASK-NNN must be done first for the User model"]

## Verification

- Run: `[test command]`
- Run: `[lint command]`
- New tests required: yes/no, location
```

**No placeholders in task files.** Every field must have actual content. If you don't know a verification command, investigate and find the right one.

### Step 7: Create _index.yaml

Create `specs/tasks/SPEC-NNN/_index.yaml`:

```yaml
spec: SPEC-NNN
title: "Spec title"
created: YYYY-MM-DD
updated: YYYY-MM-DD

tasks:
  - id: TASK-001
    title: "Task title"
    agent: jules
    workspace: dealer-app
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-002
    title: "Task title"
    agent: jules
    workspace: dealer-app
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-003
    title: "Task title"
    agent: claude-code
    workspace: shared
    status: pending
    depends_on: [TASK-001, TASK-002]
    blocks: []
```

### Step 8: Self-review (mandatory)

Before presenting to the user, verify:

- [ ] Every acceptance criterion from the spec is covered by at least one task
- [ ] No circular dependencies in the graph
- [ ] Maximum parallelism — tasks that CAN run in parallel DO run in parallel
- [ ] Each task is one PR in size (~300 lines or less)
- [ ] Jules-eligible tasks have everything in the task file (no assumed context)
- [ ] Every task has at least one acceptance criterion with Given/When/Then
- [ ] `_index.yaml` matches the individual task files
- [ ] No placeholders, TBDs, or empty sections in any task file
- [ ] Verification commands are real commands that will actually work
- [ ] (Monorepo) Every task targets exactly ONE workspace — no task touches multiple
- [ ] (Monorepo) Tasks touching shared code have `verify_workspaces` including all consumers
- [ ] (Monorepo) No two parallel tasks edit the same workspace
- [ ] (Monorepo) Import boundaries from `.ai/project.md` are respected
- [ ] (Monorepo) Workspace-ineligible tasks (e.g., dbt) are not routed to jules
- [ ] (Monorepo) Boundary tasks have explicit constraints (column names, types, exports) so downstream tasks don't guess
- [ ] (Monorepo) Cross-workspace changes follow propagation patterns from `.ai/project.md`
- [ ] (Collision) No overlapping tasks with other active specs in the same workspace — or overlap is flagged and user has decided how to handle it
- [ ] (Standards) No task's Constraints section instructs a violation of `sdlc-code-standards` — no "leave X deprecated," "skip test for Y," "comment out Z," or similar directives that would override the floor. Task briefs cannot un-enforce universal standards. If a genuine exception is needed, the Constraints section documents the exact reason.

### Step 9: Review with the user

Present the decomposition. For each task, show:
- What it does
- Who it's routed to (and why)
- What it depends on / blocks
- Acceptance criteria

Ask:
- Is the granularity right?
- Are the dependencies correct?
- Do the routing labels make sense?
- Anything missing?

### Step 10: Open a PR

- Branch: `plan/SPEC-NNN-task-decomposition`
- Commit: `SPEC-NNN: task decomposition — N tasks`
- PR title: `SPEC-NNN: Task decomposition`
- PR body: summary of all tasks with routing labels and dependency graph

### Step 11: After approval, create Linear issues

For each task:
1. Create Linear issue:
   - Title: `SPEC-NNN: [task title]`
   - Description: acceptance criteria + constraints (from task file)
   - Label: `jules`, `claude-code`, or `human`
   - Relations: `blocks` / `is blocked by` matching the dependency graph
2. Set `linear_issue` field in the task file frontmatter
3. Commit the Linear issue IDs

**Next:** Ready tasks (no unfinished dependencies) can be dispatched. Use the `jules-dispatch` skill for jules-labeled tasks (once created).

---

## Re-planning mode

**Trigger:** Tasks already exist but the decomposition needs adjustment — "this task is too big," "we need another task before TASK-003," "merge these two tasks," "split this task," or when a completed task reveals the remaining plan won't work (but the spec itself is fine).

**Important distinction:** If the *spec* is wrong, use `spec-amendment` — it handles the spec version bump and cascading task impact. Re-planning mode is for when the spec is correct but the *breakdown* needs adjusting. The requirements haven't changed; the plan to deliver them has.

### When to re-plan

| Situation | Action |
|-----------|--------|
| Task is too large (>300 lines, multi-day) | Split into smaller tasks |
| Task is trivially small and has no independent value | Merge into an adjacent task |
| Completed task reveals a missing prerequisite for the next task | Add a new task, wire dependencies |
| Two tasks assigned in parallel will actually conflict | Add a dependency edge between them, or restructure |
| Task routing was wrong (jules task needs local context) | Change the `agent` field |
| A task is no longer needed (redundant, covered by another task) | Cancel it |
| Dependency ordering is wrong | Rewire `depends_on`/`blocks` |

### Re-planning process

**Step R1: Identify what's changing and why.**

Read `_index.yaml` and understand the current state. Which tasks are done, in-progress, pending? What's the specific problem with the current decomposition?

**Step R2: Draft the changes.**

For each type of change:

**Splitting a task:**
1. The original task gets `status: cancelled` (if not started) or stays `done` (if completed and you're splitting remaining work)
2. Create new task files for each piece, with next available TASK IDs
3. New tasks inherit the original's `spec`, `workspace`, and relevant acceptance criteria (split them — don't duplicate)
4. Wire dependencies: anything that depended on the original now depends on the appropriate new task(s)
5. Anything the original depended on carries forward to the new tasks (if relevant)

**Merging tasks:**
1. Both tasks must be `pending` — you can't merge a done task with a pending one
2. Cancel one task, update the other to absorb its acceptance criteria, constraints, and verification
3. Rewire dependencies: anything that depended on or was blocked by the cancelled task now points to the surviving task

**Adding a task:**
1. Create a new task file with next available TASK ID
2. Wire into the dependency graph — figure out what it `depends_on` and what it `blocks`
3. If this new task blocks an in-progress task, that task is now `blocked` until the new task completes

**Cancelling a task:**
1. Set `status: cancelled` in the task file
2. Rewire dependencies: tasks that depended on this one lose the dependency (unless the cancelled task's work is now covered by another task — point there instead)
3. Update Linear issue to cancelled

**Re-routing a task:**
1. Change the `agent` field in the task file
2. Update the Linear issue label
3. If re-routing from `jules` to `claude-code` mid-flight: cancel the Jules session if it hasn't started, or let it finish and then handle the PR

**Rewiring dependencies:**
1. Update `depends_on` and `blocks` in affected task files
2. Verify no circular dependencies are introduced

**Step R3: Update `_index.yaml`.**

After all task file changes, rebuild the index. Verify:
- [ ] No circular dependencies
- [ ] No dangling references (task IDs that don't exist)
- [ ] Maximum parallelism preserved — don't add unnecessary sequential dependencies
- [ ] All monorepo rules still hold (one workspace per task, boundary constraints on boundary tasks)

**Step R4: Review with the user.**

Present the changes:
- What's being split/merged/added/cancelled and why
- Updated dependency graph
- Impact on in-progress work (if any)

For small changes (re-routing a single task, adding one prerequisite), a quick confirmation is sufficient. For larger restructures (splitting multiple tasks, significant dependency rewiring), present the full updated graph.

**Step R5: Commit and update Linear.**

- Commit message: `SPEC-NNN: re-plan — [summary of changes]`
- Create/cancel/update Linear issues to match
- If a PR is warranted (large restructure): branch `replan/SPEC-NNN-short-description`

### Re-planning vs. spec-amendment

| Signal | Action |
|--------|--------|
| "The task is too big" | Re-plan (split) |
| "We need a prerequisite task" | Re-plan (add) |
| "The design in the spec won't work" | Spec-amendment |
| "We need to add a new acceptance criterion" | Spec-amendment (additive) |
| "This task's routing is wrong" | Re-plan (re-route) |
| "The acceptance criteria are wrong" | Spec-amendment (breaking) |
| "These two tasks should be one" | Re-plan (merge) |
| "The spec assumed X but it's actually Y" | Spec-amendment |

The boundary: if acceptance criteria, scope, or design change → spec-amendment. If only the task graph structure changes → re-plan.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Tasks too large — each one is a multi-day effort | Split further. Target: hours, not days. |
| Deep dependency chains — 8 tasks in sequence | Restructure to maximize parallelism. |
| Routing everything to jules | Tasks needing judgment, debugging, or local context should be `claude-code`. |
| Routing everything to claude-code | Self-contained tasks with clear criteria should go to `jules` for parallelism. |
| Missing acceptance criteria on tasks | Every task must have testable criteria. No "implement stuff." |
| Task depends on something outside the spec | Flag as a risk. Either add a task to address it or mark as a constraint. |
| Placeholder verification commands | Investigate the project. Find the actual test/lint commands. |
| Parallel tasks that edit the same files | They will conflict. Add a dependency or restructure the split. |
| Task touches two workspaces | Hard rule violation. Split into one task per workspace with a dependency edge. |
| Boundary task without interface constraints | Downstream task will guess at column names/types/exports. Specify the contract explicitly. |
| Ignoring propagation patterns in project.md | Following them prevents misordered dependencies and missed boundary tasks. |
| Re-planning when the spec is wrong | If acceptance criteria or design changed, use spec-amendment first. Re-planning is for task graph structure only. |
| Splitting a task without splitting its acceptance criteria | Each new task must own specific criteria. Don't duplicate the same criteria across both halves. |
| Merging a done task with a pending task | You can't un-merge merged code. Only merge two pending tasks. |
| Adding a blocking task without pausing in-progress work | If the new task blocks an in-progress task, that task is now blocked. Signal the agent. |
| Creating tasks in a workspace where another spec has active tasks | Check spec-index.json for collisions. Flag to user — they decide whether to sequence or proceed with awareness. |
