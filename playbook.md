# Playbook

How to run the AI-native SDLC on a real project. Start here when kicking off a new initiative or refactoring effort.

## The shape: collaborate up front, then run

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → review → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (DETERMINISTIC)   (LLM)    (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── AUTONOMOUS ENGINE ──
```

*Quality when it's cheap to assure it — then autonomous execution.* You and the team spend judgment on the front phases — the intent, the spec, and the task graph. Each ends at a hard sign-off gate. Once the spec is `active` and decomposed, you invoke one engine (`execute-spec`) and it drives execution to an integration PR with no further human attention. An LLM multi-lens panel reviews the code; a human merges the integration PR to `main`. The single source of truth for the phases is [`specs/sdlc-state-machine.yaml`](specs/sdlc-state-machine.yaml).

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

## Phase 1: Intent (judgment — human + LLM)

**Who:** owner/PM with the agent (`intent-triage` skill)

1. Capture raw intents ("I want to…", "we should…") into `specs/intents.md`
2. Prioritize the backlog with the owner
3. Select an intent to spec out

## Phase 2: Spec (judgment — human + LLM)

**Who:** owner/PM drafts with the agent; eng lead + domain experts + stakeholders weigh in (`spec-authoring` skill)

1. Brainstorm the intent into `templates/spec.md` → `specs/SPEC-NNN-name.md`
2. Fill the frontmatter (id, title, initiative, owner, tags) and body (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks)
3. If a refactor, include the Migration section (current state, target state, strategy, rollback)
4. Open a spec PR — CI validates the schema; `spec-reviewer` grades it; the named reviewers and stakeholders sign off on *intent*
5. **Sign-off gate:** on approval, set status to `active` and merge; create the Linear project, set `linear_project`

## Phase 3: Decompose (judgment — human + LLM)

**Who:** eng lead + agent decide the breakdown (`task-decomposition` skill)

1. Break the spec into an **AI-coherent task graph** — each task is one coherent unit of AI execution with a bounded, declared `touches` set (file globs), one workspace per task. **Size by coherence, not line count** (a coherent 800-line token layer is one task). The deliverable is *great instructions*, not small diffs.
2. Set `risk` and `tier` hints; wire `depends_on`/`blocks`; ensure parallel tasks have non-overlapping `touches`
3. Route each task (`agent: claude-code | human`) — routing is data the engine reads, not a hand-dispatch plan
4. **Sign-off gate:** the eng lead confirms granularity, boundaries, and dependencies; write the `phase:` block; create Linear issues

## Phase 4: Execute (deterministic — autonomous)

**Who:** the `execute-spec` engine; **no human attention until the integration PR**

Invoke the engine once:
```
Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })
```
It builds the wave graph from `depends_on`, then per task: dispatches a worktree-isolated executor → gates on a green **Tier-0** (lint/typecheck/unit) → dispatches **routed multi-lens reviewers** (lenses selected by `touches` from `review-constraints.yaml`) → runs a **fix loop (cap 3/task)** → merges each accepted task into `feat/SPEC-NNN`. Branches are id-derived, so a stopped run resumes wave-level on re-invoke. The only way it asks for help is to **escalate back into a judgment phase**: a `task:scope` blocker → `task-decomposition` re-plan; a `spec:*` blocker → `spec-amendment`.

## Phase 5: Review + Integrate (LLM review, human merge)

**Who:** LLM panel reviews; a human merges

1. The engine runs the expensive integration verification (captured as EVIDENCE) and opens the integration PR `feat/SPEC-NNN → main`, with per-task verdicts and the Testing Evidence section
2. An independent `integration-reviewer` checks the spec's **success criteria** (not just per-task ACs)
3. **A human merges the integration PR.** The engine never merges to `main`.

## Phase 6: Complete

**Who:** `spec-completion` skill + owner

1. Verify the spec's success criteria end-to-end against `main`
2. Move the spec to a terminal state; close out the Linear project

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
| Fix-loop iterations per task | `_execution.log.jsonl` | Decomposition/instruction quality |
| Escalations per spec (re-plan / amendment) | Run logs | Front-phase quality |
| Bug density per spec | Linear relations | Spec quality |
| Regression rate by author type | Git + CI | Agent code quality |
| Time from signal to fix | Linear timestamps | Triage effectiveness |

## Anti-patterns to watch

- **Spec drift:** implementation diverges from spec and nobody updates either. Fix: spec review at each milestone; the engine escalates `spec:*` blockers to `spec-amendment`.
- **Agent overload:** assigning tasks that need human judgment to agents. Fix: route those tasks `human` (deferred by the engine) in decomposition.
- **Sizing tasks for human review:** fragmenting one coherent change into many tiny "reviewable" PRs. Fix: a human is not the reviewer of record — size by coherence + bounded `touches`. Never reintroduce a ~300-line / one-PR-per-task rule.
- **Hand-dispatching tasks:** running tasks one at a time instead of invoking the engine. Fix: get the decomposition right, then run `execute-spec` once.
- **Skimping on the front phases:** rushing intent/spec/decomposition to "start coding." Fix: that is exactly where attention belongs — bad decomposition is the top cause of stalled runs.
- **Invisible runs:** agent work happens but isn't logged. Fix: no merge without run metadata; enable `_execution.log.jsonl`.
- **Ticket creep:** falling back to Jira-style "create a ticket for everything." Fix: specs are the root, tasks are ephemeral.
