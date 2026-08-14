# Task schema

Tasks are the unit of execution in the AI-native SDLC. They bridge the gap between specs (intent) and runs (execution). A task is a structured file in the repo that any agent can read, with a corresponding Linear issue for human visibility and status tracking.

## The problem this solves

1. **An executor needs a self-contained brief.** The agent dispatched to a task must know — from the repo alone — what its task is, its acceptance criteria, its dependencies, and the broader plan. The task file is that brief.
2. **Tasks have dependencies.** Task B can't start until Task A is done. This must be encoded somewhere both agents and CI can read it.
3. **Plans are worth versioning.** The decomposition of a spec into tasks is a decision. It should be reviewable in a PR, not hidden inside Linear issue creation.
4. **Linear is for status, the repo is for definition.** Linear tracks "is this done?" The repo tracks "what is this and how does it fit?"

## How it works

```
Spec (intent)
  │
  └─ Claude Code decomposes into a task graph
       │
       ├─ specs/tasks/SPEC-001/        ← task files in repo (definition)
       │    ├─ _index.yaml             ← dependency graph + summary
       │    ├─ TASK-001-add-auth-middleware.md
       │    ├─ TASK-002-write-auth-tests.md
       │    ├─ TASK-003-add-login-endpoint.md
       │    └─ TASK-004-update-api-docs.md
       │
       └─ Linear issues                ← mirrored for human visibility (status)
            ├─ SPEC-001: Add auth middleware    [claude-code]
            ├─ SPEC-001: Write auth tests       [claude-code]
            ├─ SPEC-001: Add login endpoint     [claude-code]
            └─ SPEC-001: Update API docs        [claude-code]
```

**The repo is the source of truth for task definition.** Linear is the source of truth for task status. Both reference the same task IDs.

## Task file schema

Each task is a markdown file with YAML frontmatter:

```yaml
---
id: TASK-001
spec: SPEC-001
title: "Add auth middleware"
status: pending | in-progress | done | blocked | cancelled
agent: claude-code | human          # routing; a delivery run defers `human` tasks and surfaces them
workspace: dealer-app               # primary workspace this task targets (one workspace per task)
touches:                            # file globs this task may modify — REQUIRED for executable tasks
  - src/middleware/**
  - src/auth/jwt.ts
risk: low                           # low | medium | high — author hint; raises review tier
tier: standard                      # express | standard | fortified — review-intensity HINT
verify_workspaces: [dealer-app]     # workspaces whose tests must pass (monorepo)
depends_on: []                      # list of TASK-NNN ids that must complete first
blocks: [TASK-003]                  # list of TASK-NNN ids this blocks
linear_issue: LIN-XYZ              # Linear issue id, set after creation
acceptance_criteria:
  - id: AC-001
    description: "Middleware extracts JWT from Authorization header"
    status: pending | pass | fail
    evidence: |
      The implementing agent populates this with concrete proof. Examples:
      dbt task → relevant `dbt run` output; code task → test command output;
      manual verification → describe what was checked and how.
  - id: AC-002
    description: "Invalid tokens return 401 with error body"
    status: pending | pass | fail
    evidence: ""
  - id: AC-003
    description: "Expired tokens return 401 with 'token_expired' code"
    status: pending | pass | fail
    evidence: ""
created: 2026-04-22
updated: 2026-04-22
---
```

### Task sizing: AI-coherent granularity (NOT human-reviewable PRs)

A task is **one coherent unit of AI execution** — sized to what a single executor agent can
implement, self-verify, and get reviewed in one coherent session, against a **bounded, explicitly
declared set of files** (`touches`). Size is governed by *coherence*, not line count.

This replaces the old "≈ one PR ≈ ~300 lines" rule. That rule existed so a **human** could review
the diff. In the AI-native SDLC the reviewer of record for code is an **LLM multi-lens panel**, not
a human (humans gate the inputs upstream and merge the final integration PR). PR size is therefore
irrelevant; what matters is that the task's instructions are complete and its `touches` are bounded.
A task that creates a whole design-token layer (6+ files) is ONE task because it is one coherent thing.

**Split a task only when:**
- it would span more than one workspace (one workspace per task — hard rule), OR
- it contains independently-dispatchable sub-units with no shared in-flight state, OR
- its `touches` set is so broad that review lenses can no longer be attributed to it.

**Do NOT split** because of line count, or because "a human couldn't review this PR."

### Execution fields: `touches`, `risk`, `tier`

| Field | Required | Notes |
|-------|----------|-------|
| `touches` | yes (executable tasks) | Flat list of file globs this task may modify. The single most important field: it bounds the task, drives review-lens routing (`review-constraints.yaml`), and makes "a merge conflict means the decomposition's file-scoping was wrong" a hard guarantee. `human`-routed tasks may omit it. |
| `risk` | no | `low \| medium \| high`. Author's complexity hint. `high` forces the `fortified` review tier. |
| `tier` | no | `express \| standard \| fortified`. Review-intensity HINT, resolved against the constraints registry — a change that trips a registry **blocker** is `fortified` regardless of the hint; a declared-`low`-risk, well-scoped task that trips nothing may be `express`. The registry can only raise the tier, never lower it. |

**Rules:**
- `touches` must stay within the task's single workspace.
- An executable task with no `touches` is not deliverable: it cannot be bounded, and the
  self-review's changed-path audit has nothing to check against. Omitting it is a hard error at
  decomposition, not something to discover mid-run.
- `risk`/`tier` are additive and optional — older task files without them stay valid (`tier`
  defaults to `standard`, `risk` is treated as unset).

### Routing field (`agent`)

`agent` is the canonical routing field (`claude-code | human`). A delivery run reads
`routing || agent` and treats `human` as **deferred** — surfaced on the run's task list with its
reason, blocking integration until resolved. `claude-code` means the delivery agent implements it
(or, for a large spec with genuinely non-overlapping tasks, a worktree-isolated subagent). Route a
task to `human` only when it genuinely requires a human decision (architecture direction, a
priority/tradeoff call, a security-sensitive sign-off); everything else is `claude-code`.

### Evidence field rules

The `evidence:` field appears on each acceptance criterion:

| State | Meaning |
|-------|---------|
| Field absent or empty string | Not populated (Tier 0: PR review blocked) |
| Field present with non-empty content | Populated (Tier 0 passes; Tier 1 grades quality) |

**Rules:**
- `evidence:` is **optional at task creation** — the decomposing agent omits it or leaves it empty.
- `evidence:` **MUST be populated before PR review enters.** The implementing agent fills it with concrete proof: test output, command results, or a description of what was manually verified.
- Tier 0 presence check and Tier 1 content quality grading are defined in SPEC-001 and SPEC-004. The `pr-reviewer` raises `task:evidence-missing` (major) if content is absent or clearly insufficient.
- Existing task files without `evidence:` remain valid — the field is additive only.

### Monorepo fields

| Field | Required | Notes |
|-------|----------|-------|
| `workspace` | no | Primary workspace this task targets. Omit for single-app repos. Tells the agent where to focus. |
| `verify_workspaces` | no | Workspaces whose test suites must pass. Defaults to `[workspace]`. For shared/cross-cutting tasks, include all consumers. |

**Rules:**
- **One workspace per task (hard rule).** A task must not touch files in multiple workspaces. Cross-workspace changes are split into separate tasks linked by `depends_on`/`blocks`. No exceptions.
- A task touching `shared` code must set `verify_workspaces` to include all consuming workspaces
- A task touching only one app sets `verify_workspaces: [that-app]`
- Verification commands in the task body should use workspace-scoped commands (e.g., `pnpm --filter @your-org/workspace-name test`)
- Tasks in workspaces that require credentials/database (e.g., dbt) auto-route to `claude-code`

### Boundary constraints

When a task produces output that a downstream task consumes (i.e., this task `blocks` another task in a different workspace), the Constraints section must specify the exact interface contract:

```markdown
## Constraints

- **Produces for TASK-003:** column `loan_status` (text, not null) in `hg.dim_loans`
- **Contract location:** `dbt/models/marts/schema.yml` — downstream task reads this
- ADR-003: use existing naming convention
```

The downstream task references the upstream:

```markdown
## Constraints

- **Consumes from TASK-002:** `loan_status` field from `hg.dim_loans` (see schema.yml after TASK-002 merges)
- Must match type definition in `packages/shared/src/types/loan.ts`
```

Without explicit boundary constraints, downstream tasks guess at the interface — leading to mismatches, rework, and failed reviews. See `.ai/project.md` → Workspace interfaces for the canonical contracts between workspaces.

### Body sections

```markdown
## Context

Why this task exists. What part of the spec it addresses.
Reference the spec section directly: "Implements the auth layer
described in SPEC-001 § Design § Middleware."

## Requirements

What needs to be built. Extracted from the spec's design section,
scoped to just this task.

## Constraints

- ADR references: "Must use RS256 per ADR-003"
- Patterns to follow: "Use the existing middleware pattern in src/middleware/"
- Files NOT to touch: "Do not modify src/auth/legacy.ts — being removed in TASK-005"
- Dependencies: "Depends on TASK-000 for the User model changes"

## Verification

- Run: `npm test -- --grep auth-middleware`
- Run: `npm run lint`
- New tests required: yes, in tests/middleware/auth.test.ts
```

## Index file: the dependency graph

Each spec's task directory has an `_index.yaml` that encodes the full graph. This is what agents and CI read to understand ordering and parallelism.

```yaml
spec: SPEC-001
title: "User authentication flow"
created: 2026-04-22
updated: 2026-04-22

# Phase-memory block (additive, optional) — the shared contract the SDLC hooks read/write.
# owner_skills confirm the phase on entry and advance it on exit. See specs/sdlc-state-machine.yaml.
phase:
  current: task-decomposition        # a phases[].id from the state machine, or `none`
  next_action: spec-execution        # the current phase's next_phase
  next_trigger: "execute SPEC-001"   # the current phase's next_trigger
  exit_condition_met: false          # set true by the owner_skill at phase exit (read by stop-handoff)
  updated: 2026-04-22

# Plan-review block (additive) — the durable verdict of the plan-review gate, stamped by
# task-decomposition at its approval gate. spec-execution checks it before the run starts and
# fails closed on it (see "Plan-review block" below).
plan_review:
  status: approve-ready              # approve-ready | approve-after-fixes | needs-rework
  approved: true                     # OWNER sign-off — spec-execution gates on this
  reviewed: 2026-04-22               # ISO date the plan review was recorded

tasks:
  - id: TASK-001
    title: "Add auth middleware"
    agent: claude-code
    workspace: dealer-app
    touches: [src/middleware/**, src/auth/jwt.ts]
    risk: low
    tier: standard
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-002
    title: "Write auth tests"
    agent: claude-code
    workspace: dealer-app
    touches: [tests/middleware/**]
    risk: low
    tier: standard
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-003
    title: "Add login endpoint"
    agent: claude-code
    workspace: dealer-app
    touches: [src/routes/auth/**]
    risk: medium
    tier: standard
    status: pending
    depends_on: [TASK-001, TASK-002]
    blocks: [TASK-004]

  - id: TASK-004
    title: "Update API docs"
    agent: claude-code
    workspace: dealer-app
    touches: [docs/api/**]
    risk: low
    tier: express
    status: pending
    depends_on: [TASK-003]
    blocks: []

# Execution order (a topological read of depends_on; shown here for review). Delivery is serial
# by default, so this is the order tasks land on the integration branch — tasks on the same line
# are the only ones a large spec could justify fanning out:
#   1. TASK-001, TASK-002 (no deps)
#   2. TASK-003 (after 001 + 002)
#   3. TASK-004 (after 003)
```

### Phase-memory block

The optional top-level `phase:` block makes the SDLC **resumable and self-advancing**. Each phase's
owner_skill reads it on entry (to confirm which phase the spec is in) and writes it on exit (setting
`exit_condition_met: true` and advancing `current`/`next_action`/`next_trigger`). The Stop /
SubagentStop handoff hook reads it to surface the next phase's trigger to the operator. The block is
additive — `_index.yaml` files without it stay valid, and single-session repos can ignore it. The
allowed `current`/`next_action` values and the `next_trigger` strings are defined once in
`specs/sdlc-state-machine.yaml`; do not invent new ones here.

### Plan-review block

The top-level `plan_review:` block is the durable, machine-readable verdict of the **plan-review
gate** — the pre-code gate that attests the spec *and* its decomposition before any executor runs. It
sits beside `phase:` and `tasks:` in `_index.yaml`. The `task-decomposition` skill stamps it at its
approval gate (the decomposition-stage half of the two-stage plan-review gate); the owner sets
`approved: true`.

| Field | Type | Notes |
|-------|------|-------|
| `status` | enum | `approve-ready \| approve-after-fixes \| needs-rework`. The plan-review verdict. |
| `approved` | boolean | OWNER sign-off. The skill stamps `false`; the owner flips it to `true`. `spec-execution` gates on this. |
| `reviewed` | ISO date | When the plan review was recorded. |

The block is **additive** — `_index.yaml` files without it remain schema-valid. But the gate
**fails closed** on it: before a delivery run touches anything it HALTs unless
`plan_review.approved === true` and `plan_review.status !== 'needs-rework'`. A *missing*
`plan_review` block halts exactly like an unapproved one — absent and unapproved are treated
identically. The predicate lives in [`scripts/sdlc/plan-gate.mjs`](scripts/sdlc/plan-gate.mjs)
(`node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml`), so the same check runs in a
delivery run and in CI. (Existing `_index.yaml` files that predate the gate are back-filled with the
block so the fail-closed behaviour does not retroactively block them.)

## Directory structure (updated)

```
specs/
├── SPEC-001-user-auth.md
├── SPEC-002-data-pipeline-refactor.md
├── tasks/
│   ├── SPEC-001/
│   │   ├── _index.yaml
│   │   ├── TASK-001-add-auth-middleware.md
│   │   ├── TASK-002-write-auth-tests.md
│   │   ├── TASK-003-add-login-endpoint.md
│   │   └── TASK-004-update-api-docs.md
│   └── SPEC-002/
│       ├── _index.yaml
│       ├── TASK-005-extract-pipeline-config.md
│       └── TASK-006-add-retry-logic.md
├── adrs/
├── bugs/
├── templates/
└── spec-index.json
```

## Lifecycle

### 1. Planning (Claude Code)

Claude Code reads the spec and produces:
1. Task files in `specs/tasks/SPEC-NNN/`
2. An `_index.yaml` with the dependency graph
3. Opens a PR for the plan — team reviews the decomposition
4. On approval: creates corresponding Linear issues with labels
5. Sets `linear_issue` field in each task file

This is reviewable. The team can say "TASK-003 is too big, split it" or "TASK-001 and TASK-002 can be one task" before any work starts.

### 2. Delivery (spec-execution)

A delivery run reads `_index.yaml` and burns the graph down **one task at a time**, in dependency order, each landing on the integration branch before the next starts:

```
Ready = tasks where all depends_on tasks are accepted/done
```

For each ready `claude-code` task, the delivery agent implements it inline within the declared `touches` — or, for a large spec with genuinely non-overlapping tasks, dispatches a worktree-isolated subagent. `human`-routed tasks are deferred (surfaced on the run's task list; they block integration until resolved). See the `spec-execution` skill.

### 3. Completion

When a task's own tests are green and its self-review is clean:
1. The run merges the task branch into the integration branch, deletes the branch, and sets `status: done` in `_index.yaml` and the task file
2. Linear issue status and the run's task list are updated
3. The next task branches off the new integration tip

The independent review panel runs once, at the end, against the assembled integration PR.

### 4. Re-planning

Two paths depending on what's wrong:

**If the spec is wrong** (acceptance criteria, scope, or design need to change): use the `spec-amendment` skill. It bumps the spec version, runs task impact analysis, and cascades changes to affected tasks.

**If the spec is fine but the task breakdown is wrong** (task too big, needs splitting, missing prerequisite, wrong routing): use the `task-decomposition` skill's **re-planning mode**. It restructures the task graph without touching the spec. Covers: splitting, merging, adding, cancelling, re-routing tasks, and rewiring dependencies.

**Do not patch task files ad hoc.** Always go through the appropriate skill so that `_index.yaml`, Linear, and dependency edges all stay in sync.

## Sync: repo ↔ Linear

| Field | Source of truth | Synced to |
|-------|----------------|-----------|
| Task definition (what to do) | Repo (task file) | Linear issue description |
| Acceptance criteria | Repo (task file frontmatter) | Linear issue description |
| Dependencies | Repo (`_index.yaml`) | Linear issue relations |
| Agent assignment | Repo (task file `agent` field) | Linear issue label |
| Task status | Linear (live updates) | Repo (updated on completion) |
| Comments / discussion | Linear | — (not synced to repo) |

**Status flows from Linear → repo** (Linear is the live system).
**Definition flows from repo → Linear** (repo is the structured source).

## How an executor uses task files

Whoever implements a task — the delivery agent itself, or a dispatched subagent — works from the repo, and the task file is the complete, self-contained brief:

1. Reads its task file (`specs/tasks/SPEC-NNN/TASK-NNN-*.md`) for definition, acceptance criteria, `touches`, and constraints
2. Reads `_index.yaml` to understand dependencies and where the task fits in the graph
3. Reads the parent spec for broader context
4. Reads linked ADRs for design constraints
5. Stays within the declared `touches`, self-reviews the diff against the ACs and constraints, populates each acceptance criterion's `evidence:`, and opens a PR to the integration branch

The repo owns the structured definition; Linear owns the live status and discussion. (The orchestrator, which has MCP access, mirrors task status to Linear — the executor itself need not.)

## How CI uses task files

CI can validate:
- `_index.yaml` has no circular dependencies
- All `depends_on` references point to real task IDs
- All tasks reference a valid spec
- Acceptance criteria IDs are unique
- Task status transitions are valid

## Template

See `templates/task.md` for the task template.
