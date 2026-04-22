# Task schema

Tasks are the unit of execution in the AI-native SDLC. They bridge the gap between specs (intent) and runs (execution). A task is a structured file in the repo that any agent can read, with a corresponding Linear issue for human visibility and status tracking.

## The problem this solves

1. **Jules can't access Linear.** It needs to know: what's my task, what are the acceptance criteria, what are my dependencies, what's the broader plan.
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
            ├─ SPEC-001: Add auth middleware    [jules]
            ├─ SPEC-001: Write auth tests       [jules]
            ├─ SPEC-001: Add login endpoint     [claude-code]
            └─ SPEC-001: Update API docs        [jules]
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
agent: jules | claude-code | human
workspace: dealer-app               # primary workspace this task targets (monorepo)
verify_workspaces: [dealer-app]     # workspaces whose tests must pass (monorepo)
depends_on: []                      # list of TASK-NNN ids that must complete first
blocks: [TASK-003]                  # list of TASK-NNN ids this blocks
linear_issue: LIN-XYZ              # Linear issue id, set after creation
acceptance_criteria:
  - id: AC-001
    description: "Middleware extracts JWT from Authorization header"
    status: pending | pass | fail
  - id: AC-002
    description: "Invalid tokens return 401 with error body"
    status: pending | pass | fail
  - id: AC-003
    description: "Expired tokens return 401 with 'token_expired' code"
    status: pending | pass | fail
created: 2026-04-22
updated: 2026-04-22
---
```

### Monorepo fields

| Field | Required | Notes |
|-------|----------|-------|
| `workspace` | no | Primary workspace this task targets. Omit for single-app repos. Tells the agent where to focus. |
| `verify_workspaces` | no | Workspaces whose test suites must pass. Defaults to `[workspace]`. For shared/cross-cutting tasks, include all consumers. |

**Rules:**
- **One workspace per task (hard rule).** A task must not touch files in multiple workspaces. Cross-workspace changes are split into separate tasks linked by `depends_on`/`blocks`. No exceptions.
- A task touching `shared` code must set `verify_workspaces` to include all consuming workspaces
- A task touching only one app sets `verify_workspaces: [that-app]`
- Verification commands in the task body should use workspace-scoped commands (e.g., `pnpm --filter @high-gear/dealer-app test`)
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

tasks:
  - id: TASK-001
    title: "Add auth middleware"
    agent: jules
    workspace: dealer-app
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-002
    title: "Write auth tests"
    agent: jules
    workspace: dealer-app
    status: pending
    depends_on: []
    blocks: [TASK-003]

  - id: TASK-003
    title: "Add login endpoint"
    agent: claude-code
    workspace: dealer-app
    status: pending
    depends_on: [TASK-001, TASK-002]
    blocks: [TASK-004]

  - id: TASK-004
    title: "Update API docs"
    agent: jules
    workspace: dealer-app
    status: pending
    depends_on: [TASK-003]
    blocks: []

# Execution order (computed from graph):
# Parallel:    TASK-001, TASK-002 (no deps)
# Sequential:  TASK-003 (after 001 + 002)
# Sequential:  TASK-004 (after 003)
```

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

### 2. Dispatch (Claude Code)

Claude Code reads `_index.yaml` to determine which tasks are ready (no unfinished dependencies):

```
Ready = tasks where all depends_on tasks have status: done
```

For `jules`-labeled ready tasks:
- Read the task file
- Assemble the Jules prompt from the task body (context, requirements, constraints, verification)
- Call Jules API
- Log session ID on the task file and Linear issue

For `claude-code`-labeled ready tasks:
- Read the task file
- Implement directly

### 3. Completion

When a task is done:
1. Agent updates the task file: `status: done`, acceptance criteria statuses
2. Claude Code updates the Linear issue status
3. Claude Code re-reads `_index.yaml` to find newly-unblocked tasks
4. Dispatch the next wave

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

## How Jules uses task files and Linear

Jules has access to both the repo and Linear (via MCP). It uses both:

**From the repo:**
1. Reads its task file (`specs/tasks/SPEC-NNN/TASK-NNN-*.md`) for definition, acceptance criteria, constraints
2. Reads `_index.yaml` to understand dependencies and where the task fits in the graph
3. Reads the parent spec for broader context
4. Reads linked ADRs for design constraints

**From Linear (via MCP):**
1. Reads the corresponding Linear issue for comments, discussion, and live context from the team
2. Checks dependency status — are blocking tasks actually done in Linear?
3. Updates its own issue status (in-progress → done)
4. Logs its run summary as a comment on the issue

Both agents have the same view of the work. The repo owns the structured definition; Linear owns the live status and discussion.

## How CI uses task files

CI can validate:
- `_index.yaml` has no circular dependencies
- All `depends_on` references point to real task IDs
- All tasks reference a valid spec
- Acceptance criteria IDs are unique
- Task status transitions are valid

## Template

See `templates/task.md` for the task template.
