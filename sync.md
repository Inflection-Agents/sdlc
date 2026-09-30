# Sync: repo ↔ Linear

Linear is the view layer for human visibility. The repo is the source of truth for the spec and its delivery guide. This document defines what lives where, what stays in sync, and how.

Since ADR-007 there is no per-task issue graph to mirror. A spec is delivered from a short guide (`specs/tasks/SPEC-NNN/GUIDE.md`) that the owner approves with the spec, so Linear tracks the spec as one project and follows delivery through project updates.

## Ownership model

| Data | Owner | Direction |
|------|-------|-----------|
| Spec content (problem, design, scope) | Repo | → Linear project description (link to spec file) |
| Delivery guide (steps, owner decisions) | Repo (`GUIDE.md`) | → Linear project description (link to the guide) |
| Acceptance criteria definitions | Repo | → Linear project description (link to spec file) |
| Step and decision status | Repo (`_index.yaml`) | → Linear project updates |
| Spec status | **Bidirectional** | See sync rules below |
| Acceptance criteria evidence | Repo (step PRs and the integration PR) | → Linear project update at the gate |
| Comments / discussion | Linear | Does not sync to repo |
| Cycle / sprint assignment | Linear | Does not sync to repo |
| Priority | Linear | Does not sync to repo |
| Notifications | Linear | Does not sync to repo |
| Board / roadmap views | Linear | Does not sync to repo |

## Sync rules for spec status

Spec status is the one field that can change in both systems. Rules:

### The owner approves a spec and its guide
1. `status: active` and `plan_review.approved: true` land in the repo in one commit
2. The agent sets the Linear project to in progress via MCP and links the spec, the guide and `KICKOFF.md`

### A delivery run makes progress
1. The executor flips step statuses in `_index.yaml` as each step's PR merges
2. The agent posts a Linear project update at the milestones that matter to a reader: run started, integration PR opened, gate result
3. Both systems agree. No conflict.

### Human re-prioritizes or pauses in Linear
This is a signal, not a source-of-truth change. The agent should:
1. Read the Linear project for the updated priority or status
2. If the change affects what gets built → that is a `spec-amendment`, done in the repo
3. If it's just priority/cycle → respect it without repo changes (priority lives in Linear)

### Conflict resolution
If the repo and Linear disagree:
- **Repo wins for definition** (spec, guide, acceptance criteria)
- **Linear wins for priority and scheduling**
- Step status is read from `_index.yaml`; a Linear update that disagrees is corrected from it

## Sync mechanism

### Phase 1: Agent-driven (now)

No automation. The agents are the sync layer.

**Claude Code (local agent):**
- Creates the Linear project when a spec is approved, linking the spec, guide and kickoff prompt
- Reads Linear for priority and discussion before starting work
- Posts project updates at the delivery milestones

**The delivery agent (or, exceptionally, a worktree-isolated subagent):**
- Reads the spec and guide from the repo for definition
- Flips step statuses in `_index.yaml` as steps merge

**Human:**
- Reads Linear for status, boards, dashboards
- Comments on the Linear project for discussion
- Changes priority/cycle in Linear
- Reviews and merges the integration PR

This works for a small team. The agents maintain consistency because they touch both systems every time they act.

### Phase 2: CI-assisted (when friction emerges)

Add a GitHub Action that runs on pushes touching `specs/tasks/`:

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
      - name: Sync delivery status to Linear
        run: node scripts/sync-to-linear.js
        env:
          LINEAR_API_KEY: ${{ secrets.LINEAR_API_KEY }}
```

The sync script:
1. Reads every `_index.yaml`
2. For each spec: summarizes step and decision statuses
3. Posts or updates the Linear project status where the repo has newer changes
4. Reports any conflicts for human review

This is a safety net — it catches cases where an agent updated the repo but missed Linear.

### Phase 3: Webhook-driven (at scale)

Linear webhooks → a small service → opens a PR for a status change. This is the full bidirectional sync. Only build this if Phase 2 isn't sufficient.

## What this means for stakeholders

| Stakeholder | Where they look | What they see |
|-------------|----------------|---------------|
| Developer | Repo (spec + guide) + Linear | Full context: definition in repo, discussion in Linear |
| PM | Linear boards | Spec status, cycles, roadmap, initiative progress |
| Stakeholder | Linear dashboards | High-level: what's done, what's in progress, what's blocked |
| Agent | Repo + Linear (MCP) | Spec and guide + live status + discussion |

Nobody needs to know about the sync mechanism. Developers work in the repo + Linear. PMs and stakeholders work in Linear. Agents work in both. The system keeps them consistent.

## The bug exception

Bugs are the one artifact type where **Linear is the intake point**, not the repo. Non-technical reporters create Linear issues with a `bug` label. The agent normalizes the signal into a bug spec file in the repo.

Flow direction for bugs:

```
Linear (raw signal) → Agent normalizes → Repo (structured bug spec)
                                        → Agent updates Linear issue with structured data
                                        → Agent writes the fix's delivery guide in the repo
                                        → Agent links the guide from the Linear issue
```

After normalization, the bug spec in the repo is the source of truth for definition. The Linear issue becomes the view + discussion layer, same as for a feature spec.

See [triage.md](triage.md) for the full pipeline.

## Anti-patterns

- **Editing definitions in Linear.** Linear descriptions link to the repo. Edit the spec or guide, not the Linear body.
- **Creating feature work in Linear without a spec.** Feature work must exist in the repo first. The Linear project is created as a downstream step. (Bugs are the exception — they start in Linear.)
- **Ignoring Linear comments.** Discussion happens in Linear, not in the repo. Agents should read Linear comments before starting work — there may be context from the team.
- **Manual status tracking.** Don't hand-edit step statuses. The delivery run flips them as steps merge. Human status changes happen in Linear and flow back as priority, not as step state.
- **Requiring reporters to write structured bug reports.** The agent does the structuring. Non-technical reporters write a sentence and the agent handles the rest.
