# Work Graph

The work graph replaces the flat ticket list. Every unit of work is a typed node; relationships are typed edges. The graph is event-sourced — append-only log with materialized views for boards, dashboards, and reports.

## Node types

```
Initiative
  └─ Spec
       ├─ Guide
       │    └─ Step
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

### Guide
- The delivery plan for a spec: ordered steps, owner decisions, end-to-end validation (ADR-007)
- Agent-authored at the end of spec authoring, approved by the owner with the spec
- Fields: spec_id, spec_version, steps[], decisions[], plan_review

### Step
- Unit of execution — one PR onto the spec's integration branch
- Executed by the delivery agent, or by a human when it carries `Run by:`
- Fields: id, title, status, covers (AC ids), changes (paths), verify (commands)
- Steps are ephemeral — close them, don't maintain them

### Run
- One agent execution against a spec's guide, step by step
- Fields: step_ids, agent_id, model, start/end time, token cost, tool calls, eval results, artifacts (diffs, tests, logs), outcome (success/failure/escalated)
- This is the primitive Jira has no equivalent for

### ADR (Architecture Decision Record)
- Decisions captured during spec or implementation
- Fields: title, status (proposed/accepted/superseded), context, decision, consequences, linked spec

## Edge types

| Edge            | From → To       | Meaning                              |
| --------------- | --------------- | ------------------------------------ |
| `plans`         | Guide → Spec    | This guide delivers this spec        |
| `part-of`       | Step → Guide    | This step belongs to this guide      |
| `executed`      | Run → Step      | This run attempted this step         |
| `violates`      | Bug Spec → Spec | This bug contradicts this spec       |
| `supersedes`    | Spec → Spec     | New version replaces old             |
| `after`         | Step → Step     | Dependency (`After:`)                |
| `implements`    | PR → Step       | This PR delivers this step           |
| `decided-by`    | Spec → ADR      | This spec is shaped by this decision |
| `regression-of` | Bug Spec → Run  | This bug was introduced by this run  |
| `verified-by`   | Bug Spec → Run  | This run confirms the fix            |

## Events

All state changes are events. Examples:

```
SpecDrafted        { spec_id, author, version }
SpecApproved       { spec_id, approver }
GuideProposed      { spec_id, author(agent|human) }
GuideApproved      { spec_id, approver }
GuideChanged       { spec_id, run_id, decision_heading }
RunStarted         { run_id, spec_id, agent_id, model }
StepMerged         { run_id, step_id, pr_id }
RunCompleted       { run_id, outcome, cost, eval_results, artifacts }
RunEscalated       { run_id, reason, escalated_to }
PROpened           { pr_id, step_id, run_id }
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
- Agent throughput — specs delivered per cycle, cost per spec
- Regression rate — agent-authored vs human-authored code

## Mapping to Linear (current implementation)

| Graph concept | Linear primitive |
|---------------|-----------------|
| Initiative | Initiative |
| Spec | Project + linked doc |
| Guide | Link in the project description |
| Step | Project update at milestones (no per-step issue) |
| Run | Project update thread (interim) |
| ADR | Linked doc |
| Edges | Issue relations (`blocks`, `relates to`) |
| Events | Linear webhooks + activity log |

Linear's main gaps: no Run primitive, no typed edges beyond the basics, no event sourcing. These are filled by logging to a side store until better tooling exists.
