---
name: task-decomposition
description: Use when a spec has status active and needs to be broken into executable tasks, or when existing tasks need restructuring — "decompose this spec," "break this down," "this task is too big," "split this task," "we need another task before X," "merge these tasks," "re-route this to claude-code"
---

# Task Decomposition

## Overview

Break an active spec into a dependency graph of independently-executable tasks. Each task gets a structured file in the repo and a corresponding Linear issue.

**This is a judgment phase — human + LLM, with a hard sign-off gate.** Task decomposition is one of the front-loaded phases where scarce human attention belongs: getting the breakdown, the boundaries, and the instructions right here is cheap, and it is what makes the downstream `spec-execution` engine able to run **deterministically and autonomously**. Bad decomposition is the single most common cause of a stalled or escalated execution run.

**This is a rigid skill.** Follow the steps exactly. No shortcuts.

**Announce at start:** "Using task-decomposition to break this spec into executable tasks."

### Size tasks for AI execution, not human review

The reviewer of record for code in this SDLC is an **LLM multi-lens panel**, not a human. So tasks are **not** sized to be small, human-reviewable PRs. A task is **one coherent unit of AI execution** — what one executor agent can implement, self-verify, and get reviewed in one coherent session, against a **bounded, explicitly declared set of files** (`touches`).

- **Coherence, not line count, sets the size.** A task that builds a whole token layer, a whole module, or a whole endpoint-plus-its-tests is ONE task if it is one coherent thing — even if that is far more than ~300 lines.
- **Your job is great instructions, not small diffs.** Spend the effort making each task file complete and unambiguous (exact files, exact contracts, exact verification). The executor and the reviewer are both AI with zero prior context — the task file is the entire brief.
- **Forget "could a human review this PR?"** That question no longer sizes tasks. The questions that size a task are below (Step 2).

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
2. **AI-coherent tasks with declared `touches`.** Each task is one coherent unit of AI execution with a bounded, explicitly declared `touches` set (file globs it may modify). Size by coherence, not line count. The deterministic engine refuses to run an executable task that declares no `touches`.
3. **Exact paths and context.** Task files must specify which files to modify, which patterns to follow, which test commands to run. Assume the implementing agent has zero codebase context.
4. **Mandatory self-review.** After creating all task files, verify: every spec acceptance criterion is covered, no circular dependencies, _index.yaml matches task files, every executable task has a non-empty `touches`, and no two parallel tasks have overlapping `touches`.

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
- **One coherent concern per task.** A task should do one coherent thing well — and the *whole* of that thing. Don't fragment one coherent change across several tasks just to make each smaller.
- **One workspace per task.** Hard rule (see Monorepo decomposition). A task's `touches` stay within a single workspace.
- **Bounded, declared `touches`.** You must be able to write down the file globs the task may modify. If you can't bound them, the task is too vague — sharpen it, don't ship it.
- **Independently testable.** Each task has tests/verification that can pass without other tasks being done.
- **Minimal dependencies.** Maximize parallelism. If tasks CAN run in parallel, they SHOULD — and parallel tasks must have **non-overlapping `touches`** (overlap means a merge conflict, which the engine treats as a decomposition defect).

**The sizing questions** (ask these instead of "is this ~300 lines?"):
- Is this one coherent thing an executor can hold in its head and finish in one session?
- Can I bound its `touches` to a single workspace?
- Can I write complete, unambiguous instructions for it without hand-waving?
- Does it own at least one acceptance criterion end-to-end?

If yes to all, the size is right — however many lines that is. If it sprawls across workspaces or its `touches` can't be bounded, split. If it's a trivial fragment with no independent value, merge it into the coherent whole it belongs to.

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
4. **Workspace-level eligibility** — check project.md's agent eligibility table. Workspaces requiring credentials/database access may need to be routed to `human` (deferred) regardless of task complexity.

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

Apply one routing value per task. The only routing values are `claude-code` and `human`.

**`claude-code`** (default) — the engine's worktree-isolated local executor implements the task. Route here unless a human decision is required. Suitable for the full range of executable work: self-contained changes with clear acceptance criteria, work needing local env / MCP / running services / credentials, architecture judgment, interactive debugging, and multi-file refactors with cascading decisions.

**`human`** — ANY of these is true (the engine defers the task and surfaces it for a human):
- Architecture vision or framework decisions
- Priority/tradeoff calls
- Stakeholder communication
- Security-sensitive review

**Default: `claude-code`.** Routing is `claude-code` unless a human decision is required.

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
agent: claude-code | human         # routing; the engine treats `human` as deferred
workspace: dealer-app              # primary workspace (from .ai/project.md) — one per task
touches:                           # REQUIRED: file globs this task may modify (bounds the task)
  - src/area/**
  - src/file.ts
risk: low                          # low | medium | high
tier: standard                     # express | standard | fortified (review-intensity hint)
verify_workspaces: [dealer-app]    # all workspaces to test (include consumers of shared code)
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-NNN
    description: "Given X, when Y, then Z"
    status: pending
    evidence:    # left empty by decomposer; populated by implementing agent before PR review (per SPEC-004)
  - id: AC-NNN
    description: "Given A, when B, then C"
    status: pending
    evidence:    # left empty by decomposer; populated by implementing agent before PR review (per SPEC-004)
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

The `evidence:` field is created empty (or omitted) at decomposition time — the decomposing agent doesn't know the proof yet. It is the implementing agent's responsibility to populate before opening the PR for review. Tier 0 CI gates on presence; Tier 1 review grades quality. See SPEC-004.

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
    agent: claude-code
    workspace: dealer-app
    touches: [src/area-a/**]
    risk: low
    tier: standard
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-002
    title: "Task title"
    agent: claude-code
    workspace: dealer-app
    touches: [src/area-b/**]    # non-overlapping with TASK-001 → safe to run in parallel
    risk: low
    tier: standard
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-003
    title: "Task title"
    agent: claude-code
    workspace: shared
    touches: [packages/shared/src/**]
    risk: medium
    tier: standard
    status: pending
    depends_on: [TASK-001, TASK-002]
    blocks: []
```

On exit, also write the `phase:` block to `_index.yaml` to advance the SDLC state machine (see `specs/sdlc-state-machine.yaml` and the Handoff section below):

```yaml
phase:
  current: task-decomposition
  next_action: spec-execution
  next_trigger: "execute SPEC-NNN"
  exit_condition_met: true
  updated: YYYY-MM-DD
```

### Step 8: Self-review (mandatory)

Before presenting to the user, verify:

- [ ] Every acceptance criterion from the spec is covered by at least one task
- [ ] No circular dependencies in the graph
- [ ] Maximum parallelism — tasks that CAN run in parallel DO run in parallel
- [ ] Each task is ONE coherent unit of AI execution (sized by coherence, not line count — no artificial fragmentation, no sprawling multi-concern tasks)
- [ ] Every executable task declares a non-empty `touches` set, bounded to its single workspace
- [ ] No two tasks that can run in parallel have overlapping `touches` (overlap → merge conflict → decomposition defect)
- [ ] `risk` and `tier` are set on every executable task (tier is a hint; the engine resolves the real tier)
- [ ] Every executable task has everything in the task file (no assumed context)
- [ ] Every task has at least one acceptance criterion with Given/When/Then
- [ ] `_index.yaml` matches the individual task files
- [ ] No placeholders, TBDs, or empty sections in any task file
- [ ] Verification commands are real commands that will actually work
- [ ] (Monorepo) Every task targets exactly ONE workspace — no task touches multiple
- [ ] (Monorepo) Tasks touching shared code have `verify_workspaces` including all consumers
- [ ] (Monorepo) No two parallel tasks edit the same workspace
- [ ] (Monorepo) Import boundaries from `.ai/project.md` are respected
- [ ] (Monorepo) Tasks in workspaces requiring credentials/database access (e.g., dbt) are routed to `human` (deferred) where they can't run unattended
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
   - Label: `claude-code` or `human`
   - Relations: `blocks` / `is blocked by` matching the dependency graph
2. Set `linear_issue` field in the task file frontmatter
3. Commit the Linear issue IDs

**Next:** Hand off to the deterministic execution engine — invoke the `spec-execution` skill (`Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })` on the Claude Code runtime). The engine builds the wave graph, dispatches executors for all ready tasks in parallel, and drives the Tier-0 → review → fix → merge loop autonomously. Do not hand-dispatch tasks one at a time. On exit, set the `_index.yaml` `phase:` block (see Step 7) with `exit_condition_met: true`; the canonical handoff fields are in the generated `## Handoff` footer below.

---

## Re-planning mode

**Trigger:** Tasks already exist but the decomposition needs adjustment — "this task is too big," "we need another task before TASK-003," "merge these two tasks," "split this task," or when a completed task reveals the remaining plan won't work (but the spec itself is fine).

**Important distinction:** If the *spec* is wrong, use `spec-amendment` — it handles the spec version bump and cascading task impact. Re-planning mode is for when the spec is correct but the *breakdown* needs adjusting. The requirements haven't changed; the plan to deliver them has.

### When to re-plan

| Situation | Action |
|-----------|--------|
| Task is not coherent — spans >1 workspace or its `touches` can't be bounded | Split along the coherent seam (one workspace, bounded touches per task) |
| Task is trivially small and has no independent value | Merge into the coherent whole it belongs to |
| Completed task reveals a missing prerequisite for the next task | Add a new task, wire dependencies |
| Two tasks assigned in parallel will actually conflict | Add a dependency edge between them, or restructure |
| Task routing was wrong (deferred to `human` but executable, or vice versa) | Change the `agent` field |
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
3. If re-routing between `claude-code` and `human` mid-flight: stop any in-flight executor for that task if it hasn't completed, or let it finish and then handle the PR

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
| Fragmenting one coherent change into many tiny tasks "so each PR is small" | Stop sizing for human review. Make it one AI-coherent task with complete instructions. |
| Sizing tasks by line count (~300 lines) | Size by coherence + bounded `touches`. A coherent 800-line token layer is one task. |
| Executable task with no `touches` | Declare the file globs. The engine refuses to run a task with empty `touches`. |
| Parallel tasks with overlapping `touches` | They'll conflict at merge. Re-scope so parallel tasks touch disjoint files, or add a dependency edge. |
| Deep dependency chains — 8 tasks in sequence | Restructure to maximize parallelism. |
| Routing executable work to `human` | Only defer to `human` for genuine human decisions (architecture vision, tradeoffs, security review). Executable tasks go to `claude-code`. |
| Routing human-decision work to `claude-code` | Architecture vision, priority/tradeoff calls, and security-sensitive review belong to `human`, not the executor. |
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

<!-- sdlc:handoff:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **task-decomposition** in the SDLC state machine (`specs/sdlc-state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- decompose this spec
- break this down
- this task is too big
- split this task
- we need another task before X
- merge these tasks
- re-route this task

**Preconditions:**

- spec has status active

**Exit condition:** AI-coherent tasks + _index.yaml dependency graph exist with touches/routing declared

**Next step:** `spec-execution` — trigger: "execute SPEC-NNN"
<!-- sdlc:handoff:end -->
