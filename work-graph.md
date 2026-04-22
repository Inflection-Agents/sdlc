# Work Graph

The work graph replaces the flat ticket list. Every unit of work is a typed node; relationships are typed edges. The graph is event-sourced — append-only log with materialized views for boards, dashboards, and reports.

## Node types

```
Initiative
  └─ Spec
       ├─ Plan
       │    └─ Task
       │         └─ Run
       └─ ADR
```

### Initiative
- Business outcome or strategic goal
- Owner: human (exec, PM, or tech lead)
- Horizon: quarters
- Fields: title, description, success criteria, status, owner

### Spec
- Versioned markdown artifact — the "why + what"
- Lives in the repo alongside code, linked from the work tracker
- Fields: title, version, status (draft/active/superseded), author, linked initiative
- A spec can be authored by a human or drafted by an agent for human review

### Plan
- Decomposition of a spec into tasks
- Can be agent-authored, human-reviewed
- Fields: spec_id, tasks[], approach, estimated effort, risks

### Task
- Unit of execution — the thing that gets assigned
- Assignee: human or agent
- Fields: title, assignee, status, spec_id, plan_id, type (feature/bug/chore)
- Tasks are ephemeral — close them, don't maintain them

### Run
- One agent execution against a task
- Fields: task_id, agent_id, model, start/end time, token cost, tool calls, eval results, artifacts (diffs, tests, logs), outcome (success/failure/escalated)
- This is the primitive Jira has no equivalent for

### ADR (Architecture Decision Record)
- Decisions captured during spec or implementation
- Fields: title, status (proposed/accepted/superseded), context, decision, consequences, linked spec

## Edge types

| Edge            | From → To       | Meaning                              |
| --------------- | --------------- | ------------------------------------ |
| `decomposes`    | Plan → Spec     | This plan implements this spec       |
| `assigned`      | Task → Plan     | This task belongs to this plan       |
| `executed`      | Run → Task      | This run attempted this task         |
| `violates`      | Bug Spec → Spec | This bug contradicts this spec       |
| `supersedes`    | Spec → Spec     | New version replaces old             |
| `blocks`        | Task → Task     | Dependency                           |
| `implements`    | PR → Task       | This PR delivers this task           |
| `decided-by`    | Spec → ADR      | This spec is shaped by this decision |
| `regression-of` | Bug Spec → Run  | This bug was introduced by this run  |
| `verified-by`   | Bug Spec → Run  | This run confirms the fix            |

## Events

All state changes are events. Examples:

```
SpecDrafted        { spec_id, author, version }
SpecApproved       { spec_id, approver }
PlanProposed       { plan_id, spec_id, author(agent|human) }
PlanApproved       { plan_id, approver }
TaskCreated        { task_id, plan_id, assignee }
TaskAssigned       { task_id, assignee(agent_id|human_id) }
RunStarted         { run_id, task_id, agent_id, model }
RunCompleted       { run_id, outcome, cost, eval_results, artifacts }
RunEscalated       { run_id, reason, escalated_to }
PROpened           { pr_id, task_id, run_id }
PRMerged           { pr_id, reviewer }
BugReported        { signal_id, source, raw_content }
BugNormalized      { bug_spec_id, linked_spec_id, confidence }
BugConfirmed       { bug_spec_id, confirmer }
BugRejected        { bug_spec_id, reason(wontfix|duplicate|works-as-designed) }
```

## Queries the graph enables

- Defect density per spec — which specs keep breaking?
- Defect density per agent/model — which agents produce fragile code?
- Cost per feature — sum of run costs from spec to deploy
- Time from signal to fix — not ticket-open to ticket-close
- Specs with repeated violations — candidates for rewrite
- Agent throughput — tasks completed per cycle, cost per task
- Regression rate — agent-authored vs human-authored code

## Mapping to Linear (current implementation)

| Graph concept | Linear primitive |
|---------------|-----------------|
| Initiative | Initiative |
| Spec | Project + linked doc |
| Plan | Project description or sub-issues |
| Task | Issue |
| Run | Comment thread on issue (interim) |
| ADR | Linked doc |
| Edges | Issue relations (`blocks`, `relates to`) |
| Events | Linear webhooks + activity log |

Linear's main gaps: no Run primitive, no typed edges beyond the basics, no event sourcing. These are filled by logging to a side store until better tooling exists.
