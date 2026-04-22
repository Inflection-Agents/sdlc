# Sync: repo ↔ Linear

Linear is the view layer for human visibility. The repo is the source of truth for task definition. This document defines what lives where, what stays in sync, and how.

## Ownership model

| Data | Owner | Direction |
|------|-------|-----------|
| Spec content (problem, design, scope) | Repo | → Linear project description (link to spec file) |
| Task definition (requirements, constraints, verification) | Repo | → Linear issue description |
| Acceptance criteria definitions | Repo | → Linear issue description |
| Dependency graph | Repo (`_index.yaml`) | → Linear issue relations |
| Agent assignment | Repo (task file `agent` field) | → Linear issue label |
| Task status | **Bidirectional** | See sync rules below |
| Acceptance criteria pass/fail | Repo (updated by agent on completion) | → Linear issue comment |
| Comments / discussion | Linear | Does not sync to repo |
| Cycle / sprint assignment | Linear | Does not sync to repo |
| Priority | Linear | Does not sync to repo |
| Notifications | Linear | Does not sync to repo |
| Board / roadmap views | Linear | Does not sync to repo |

## Sync rules for task status

Task status is the one field that can change in both systems. Rules:

### Agent completes a task
1. Agent updates the task file frontmatter: `status: done`, acceptance criteria → `pass`
2. Agent updates the Linear issue status via MCP
3. Agent commits the task file changes in the same PR as the implementation
4. Both systems agree. No conflict.

### Agent starts a task
1. Agent updates the task file frontmatter: `status: in-progress`
2. Agent updates the Linear issue status via MCP
3. Both systems agree.

### Human re-prioritizes or reassigns in Linear
This is a signal, not a source-of-truth change. The agent should:
1. Read the Linear issue for updated priority/assignment
2. If the change affects task definition → update the task file and commit
3. If it's just priority/cycle → respect it without repo changes (priority lives in Linear)

### Human blocks or cancels a task in Linear
1. Agent detects the status change via Linear MCP
2. Agent updates the task file frontmatter: `status: blocked` or `status: cancelled`
3. Agent commits the change

### Conflict resolution
If the repo and Linear disagree on status:
- **Repo wins for definition** (requirements, acceptance criteria, constraints)
- **Linear wins for status** (the most recent status update is truth)
- Agent reconciles by reading Linear and updating the repo task file

## Sync mechanism

### Phase 1: Agent-driven (now)

No automation. The agents are the sync layer.

**Claude Code (local agent):**
- Creates task files in repo → creates corresponding Linear issues via MCP
- Reads Linear for status updates → updates task files if needed
- Reviews PRs → updates Linear issue with results

**Jules (cloud agent):**
- Reads task files from repo for definition
- Reads/updates Linear issues via MCP for status and discussion
- Commits task file status updates in the same PR as implementation

**Human:**
- Reads Linear for status, boards, dashboards
- Comments on Linear issues for discussion
- Changes priority/cycle in Linear
- Reviews and merges PRs (which contain task file updates)

This works for a small team. The agents maintain consistency because they touch both systems every time they act.

### Phase 2: CI-assisted (when friction emerges)

Add a GitHub Action that runs on PRs touching `specs/tasks/`:

```yaml
# .github/workflows/sync-linear.yml
on:
  push:
    branches: [main]
    paths: ['specs/tasks/**']

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Sync task files to Linear
        run: node scripts/sync-to-linear.js
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
```

The sync script:
1. Reads all `_index.yaml` files
2. For each task: compares repo status with Linear status
3. Updates Linear issues where repo has newer changes
4. Reports any conflicts for human review

This is a safety net — catches cases where an agent updated the repo but missed Linear, or vice versa.

### Phase 3: Webhook-driven (at scale)

Linear webhooks → a small service → updates task files via PR. This is the full bidirectional sync. Only build this if Phase 2 isn't sufficient.

## What this means for stakeholders

| Stakeholder | Where they look | What they see |
|-------------|----------------|---------------|
| Developer | Repo (task files) + Linear | Full context: definition in repo, discussion in Linear |
| PM | Linear boards | Status, cycles, roadmap, initiative progress |
| Stakeholder | Linear dashboards | High-level: what's done, what's in progress, what's blocked |
| Agent | Repo + Linear (MCP) | Task definition + live status + discussion |

Nobody needs to know about the sync mechanism. Developers work in the repo + Linear. PMs and stakeholders work in Linear. Agents work in both. The system keeps them consistent.

## The bug exception

Bugs are the one artifact type where **Linear is the intake point**, not the repo. Non-technical reporters create Linear issues with a `bug` label. The agent normalizes the signal into a bug spec file in the repo.

Flow direction for bugs:

```
Linear (raw signal) → Agent normalizes → Repo (structured bug spec)
                                        → Agent updates Linear issue with structured data
                                        → Agent creates task files in repo for the fix
                                        → Agent creates Linear issues for the fix tasks
```

After normalization, the bug spec in the repo is the source of truth for definition. The Linear issue becomes the view + discussion layer, same as for feature tasks.

See [triage.md](triage.md) for the full pipeline.

## Anti-patterns

- **Editing task definitions in Linear.** Linear issue descriptions are synced FROM the repo. Edit the task file, not the Linear issue body.
- **Creating feature tasks in Linear without a task file.** Feature tasks must exist in the repo first. Linear issues are created as a downstream step. (Bugs are the exception — they start in Linear.)
- **Ignoring Linear comments.** Discussion happens in Linear, not in the repo. Agents should read Linear comments before starting work — there may be context from the team.
- **Manual status tracking.** Don't manually update task file status. Let the agents do it as part of their implementation flow. Human status changes happen in Linear and flow back.
- **Requiring reporters to write structured bug reports.** The agent does the structuring. Non-technical reporters write a sentence and the agent handles the rest.
