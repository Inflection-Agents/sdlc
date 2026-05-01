# AI-Native SDLC — Agent Operating Instructions

You are participating in an AI-native software development lifecycle. This document defines the process, your responsibilities, and how to interact with the system. Read this before starting any work.

## Principles

1. **Spec is the root, not the ticket.** Every feature, refactor, and bug traces back to a spec in `specs/`. Don't create work without a spec to anchor it.
2. **Agents are assignees.** You are a first-class participant — you get assigned tasks, produce artifacts, and are accountable for your output.
3. **Runs are observable.** Log what you did, what it cost, and whether it passed. Your work must be auditable.
4. **Humans decide intent and priority.** You propose, draft, and implement. Humans approve specs, prioritize work, and make tradeoff calls.

## Spec system

All specs live in `specs/` in the repo. Every spec has YAML frontmatter and required body sections.

### Reading a spec

Before working on any task:
1. Read `specs/spec-index.json` to find the relevant spec by id or tag
2. Read the full spec file
3. Check the `status` field — only work on `active` specs
4. Read linked ADRs in `specs/adrs/` for design constraints
5. Check acceptance criteria — these are your definition of done

### Spec frontmatter fields

```yaml
id: SPEC-NNN          # unique identifier, referenced in tasks and bugs
title: ""             # short description
status: draft | active | superseded | deprecated
version: N            # increments on material changes
initiative: INI-NNN   # links to the initiative in the work tracker
owner: username       # human accountable for intent
tags: []              # for search/grouping
linear_project: PRJ-X # work tracker project id
```

### Bug specs

Bugs are in `specs/bugs/`. They have extra fields:
- `violates: SPEC-NNN` — which spec this contradicts
- `severity: sev1 | sev2 | sev3`
- `confidence: high | medium | low`

## Work tracker (Linear)

The work graph lives in Linear. Key conventions:

### Labels for task routing

| Label | Meaning |
|-------|---------|
| `jules` | Task is eligible for Jules (cloud agent). Self-contained, clear acceptance criteria, no local env needed. |
| `claude-code` | Task requires a local orchestrator (Claude Code, Gemini CLI, or equivalent). Needs MCP, local env, architecture judgment, or interactive debugging. |
| `human` | Task requires human. Architecture decisions, stakeholder comms, priority calls. |

### How tasks get routed

One spec produces many tasks. The **local agent** (Claude Code or equivalent) decomposes the spec into Linear issues during the planning phase and applies a routing label to each one. The label determines who executes it.

```
Spec (one file in specs/)
  │
  └─ Local agent decomposes into tasks (Linear issues)
       ├─ Task A: label=jules        → dispatched to Jules via API
       ├─ Task B: label=claude-code  → implemented by local agent
       ├─ Task C: label=jules        → dispatched to Jules via API
       ├─ Task D: label=human        → assigned to human
       └─ Task E: label=claude-code  → implemented by local agent
```

Specs don't live in agent-specific folders. There is one `specs/` directory. Routing is by label on the Linear issue, not by file location.

The local orchestrator's configuration file (`CLAUDE.md` or `GEMINI.md`) contains the detailed routing rules — the checklist for deciding which label to apply.

### Issue conventions

- Issue title: `SPEC-NNN: [task description]`
- Issue description must include:
  - Link to the spec file in the repo
  - Acceptance criteria (copied from spec)
  - Any constraints or ADR references
- Use issue relations: `blocks`, `relates to`, `is blocked by`
- Link PRs to issues

### Run logging

When you complete a task, comment on the Linear issue with:
```
**Run summary**
- Agent: [your identity]
- Duration: [time]
- Outcome: [success | failure | escalated]
- Artifacts: [PR link, test results]
- Acceptance criteria met: [list which ones]
```

## Task system

Tasks are structured files in the repo at `specs/tasks/SPEC-NNN/`. Each task has YAML frontmatter with: id, spec, agent assignment, dependencies, acceptance criteria. An `_index.yaml` in each directory encodes the full dependency graph.

Tasks also have corresponding Linear issues for human visibility and live status tracking. The repo owns definition; Linear owns status.

### How to find your task

1. Your task prompt or assignment will reference a task ID (e.g., TASK-001)
2. Find the task file at `specs/tasks/SPEC-NNN/TASK-001-*.md`
3. Read the `_index.yaml` in the same directory to understand dependencies
4. Read the parent spec for broader context
5. Read linked ADRs for constraints

### Task lifecycle

```
1. Read your task file (specs/tasks/SPEC-NNN/TASK-NNN-*.md)
2. Check dependencies in _index.yaml — all depends_on tasks must be done
3. Read the parent spec + linked ADRs
4. Implement against the acceptance criteria in the task frontmatter
5. Write or update tests — every acceptance criterion should have a test
6. Run tests and linter — all must pass
7. Open a PR referencing the task ID and spec ID
8. Log the run (on the Linear issue if you have access, or in the PR description)
9. Update acceptance criteria statuses in the task file
```

## What you must NOT do

- **Don't merge without human approval.** Open PRs; don't merge them.
- **Don't deploy.** Humans approve releases.
- **Don't close bugs without human confirmation.** Propose; don't close.
- **Don't make priority decisions.** Implement what's assigned.
- **Don't change spec intent.** If the spec is wrong, flag it — don't silently reinterpret it.
- **Don't work on `draft` or `superseded` specs.** Only `active`.

## What you must ALWAYS do

- **Cite your sources.** Every claim about behavior, every link to a spec or ADR — cite it.
- **Report confidence.** If you're unsure about a decision, say so explicitly.
- **Escalate security, data loss, payments.** Hard stop — human must review.
- **Log your runs.** No invisible work.

## Escalation

Escalate to a human immediately for:
- Security vulnerabilities
- Data loss or corruption risk
- Payment/billing logic
- Spec ambiguity that blocks implementation
- Anything where you're guessing at intent

## Agent-specific instructions

This document is the shared process. Your agent-specific config file has additional instructions:
- **Claude Code / local agents:** see `CLAUDE.md` for MCP access, Linear integration, Jules orchestration, local env capabilities
- **Jules / cloud agents:** see `AGENTS.md` for cloud VM constraints, what's available, how to read specs from the repo
- **Other agents:** follow this document. If you have capabilities beyond what's described here, document them in your agent-specific config.
