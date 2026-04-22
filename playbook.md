# Playbook

How to run the AI-native SDLC on a real project. Start here when kicking off a new initiative or refactoring effort.

## Phase 0: Setup

1. Create a Linear initiative for the effort
2. Create the `specs/` directory structure in the repo:
   ```
   specs/
   ├── adrs/
   ├── bugs/
   └── templates/    ← copy from sdlc/templates/
   ```
3. Add the spec validation CI check (validates frontmatter, sections, references)
4. Set up the agent's access: repo, Linear (via MCP), CI
5. Define escalation rules for this project (what requires human sign-off)
6. Agree on run budget limits (tokens, cost, timeout)

## Phase 1: Spec

**Who:** PM or tech lead drafts, agent can assist

1. Copy `templates/spec.md` to `specs/SPEC-NNN-name.md`
2. Fill in the frontmatter (id, title, initiative, owner, tags)
3. Write the body sections (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks)
4. If this is a refactor, include the Migration section (current state, target state, strategy, rollback)
5. Open a PR — CI validates the schema, team reviews the intent
6. On approval, set status to `active` and merge
7. Create the Linear project, set `linear_project` in frontmatter

## Phase 2: Plan

**Who:** Agent drafts, human reviews

1. Agent reads the spec and produces a plan:
   - Task breakdown with dependencies
   - Suggested ordering (what can parallelize, what's sequential)
   - Risk flags (areas needing human review, areas with weak test coverage)
   - Estimated complexity per task
2. Human reviews the plan:
   - Are the tasks the right granularity?
   - Are dependencies correct?
   - Are the risky areas identified?
3. Create Linear issues from the approved plan
4. Assign: which tasks go to agents, which need humans

## Phase 3: Execute

**Who:** Agent implements, human reviews

For each task:
1. Agent reads the spec + plan + relevant code
2. Agent creates a branch, implements, writes tests
3. Agent opens a PR linking to the Linear issue
4. Agent runs CI and reports results
5. Human reviews the PR
6. On approval: merge and close the Linear issue

Run logging (interim approach):
- Each agent run logs: start time, end time, token cost, tool calls, outcome
- Summary posted as a comment on the Linear issue
- Structured log appended to a project-level run log

## Phase 4: Verify

**Who:** Agent runs evals, human validates

1. Agent runs the full test suite post-merge
2. Agent checks for regressions (new failures, performance changes)
3. For refactors: agent verifies behavior parity between old and new paths
4. Human does exploratory testing on changed surfaces
5. Update the spec if behavior has intentionally changed

## Phase 5: Triage (ongoing)

See [triage.md](triage.md) for the full pipeline. During active development:
- Bugs found during implementation → normalize immediately, don't create loose tickets
- Agent-found issues during execution → auto-file as bug specs with linked run
- Human-found issues during review → reporter role, agent picks up from there

## Ceremonies

### Daily (async)
- Agent posts a summary: tasks completed, tasks in progress, blockers, run costs
- Human reviews, unblocks, adjusts priorities

### Weekly (sync, 30 min max)
- Review: what shipped, what's blocked, what changed
- Triage: prioritize accumulated bugs (agent has pre-classified them)
- Plan adjustment: re-scope if needed based on learnings

### Per-milestone
- Spec review: does the spec still reflect what we're building?
- ADR check: any decisions made during implementation that need recording?
- Retrospective: what worked, what didn't, agent effectiveness

## Metrics to track

| Metric | Source | Purpose |
|--------|--------|---------|
| Tasks completed per cycle | Linear | Throughput |
| Agent vs human task ratio | Linear labels | Agent adoption |
| Cost per task (tokens) | Run logs | Efficiency |
| PR review turnaround | GitHub | Bottleneck detection |
| Bug density per spec | Linear relations | Spec quality |
| Regression rate by author type | Git + CI | Agent code quality |
| Time from signal to fix | Linear timestamps | Triage effectiveness |

## Anti-patterns to watch

- **Spec drift:** implementation diverges from spec and nobody updates either. Fix: spec review at each milestone.
- **Agent overload:** assigning tasks that need human judgment to agents. Fix: clear criteria in the plan for what's agent-suitable.
- **Review bottleneck:** agents produce PRs faster than humans review them. Fix: budget agent throughput to review capacity, not the other way around.
- **Invisible runs:** agent work happens but isn't logged. Fix: no merge without run metadata attached.
- **Ticket creep:** falling back to Jira-style "create a ticket for everything." Fix: specs are the root, tasks are ephemeral.
