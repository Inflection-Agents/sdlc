# Playbook

How to run the AI-native SDLC on a real project. Start here when kicking off a new initiative or refactoring effort.

## The shape: collaborate up front, then run

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── DELIVERY ──
```

*Quality when it's cheap to assure it — then autonomous delivery.* You and the team spend judgment on the front phases — the intent, the spec, and the task graph. Each ends at a hard sign-off gate. Once the spec is `active`, decomposed and plan-approved, you say "implement SPEC-NNN" and one agent delivers the whole spec — serially, on one integration branch, behind a visible task list — with no further human attention until the integration PR. Review happens in-run: a self-review per task, then an LLM multi-lens adversarial panel on that PR. A human merges it to `main`. The single source of truth for the phases is [`specs/sdlc-state-machine.yaml`](specs/sdlc-state-machine.yaml).

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
3. Route each task (`agent: claude-code | human`) — routing is data the delivery run reads, not a hand-dispatch plan
4. **Sign-off gate:** the eng lead confirms granularity, boundaries, and dependencies; write the `phase:` block; create Linear issues

## Phase 4: Deliver (autonomous)

**Who:** one agent running `spec-execution`; **no human attention required until the integration PR**

Say "implement SPEC-NNN". The run checks the fail-closed plan gate (`node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml`), arms a goal leash so it cannot stop half-done, opens a **visible task list**, and cuts `feat/spec-NNN`. Then, one task at a time in dependency order: implement inline → the task's own tests green → **self-review the diff** → PR into `feat/spec-NNN` → merge it → delete the branch → next task. Nothing lingers between tasks, and no task PR ever targets `main`. Fan-out to worktree-isolated subagents is the exception, for a large spec with genuinely non-overlapping tasks.

The only way it asks for help is to **escalate back into a judgment phase**: a `task:scope` blocker → `task-decomposition` re-plan; a `spec:*` blocker → `spec-amendment`.

## Phase 5: Validate + Integrate (LLM review, human merge)

**Who:** the same run; an LLM panel reviews; a human merges

1. **End-to-end validation runs once** — full build and test suite, the real pipeline where one exists, the app in a real browser for user-visible change, performance where it matters — captured as EVIDENCE
2. The run opens the integration PR `feat/spec-NNN → main` with every success criterion mapped to its evidence
3. A **multi-lens adversarial panel** is dispatched concurrently — `integration-reviewer` against the spec's **success criteria**, an adversarial `task-reviewer`, and every lens the registry fires across the whole diff — with each envelope validated (`scripts/sdlc/validate-review-envelope.mjs`). Blockers and majors are fixed at the root and **the panel is re-dispatched**, until none survive
4. **A human merges the integration PR.** The agent never merges or pushes to `main`.

## Phase 6: Complete

**Who:** `spec-completion` skill + owner

1. Verify the spec's success criteria end-to-end against `main`
2. Move the spec to a terminal state; close out the Linear project

## Phase 7: Triage (ongoing)

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
| Panel rounds per integration PR | `_execution.log.jsonl` | Decomposition/instruction quality |
| Escalations per spec (re-plan / amendment) | Run logs | Front-phase quality |
| Bug density per spec | Linear relations | Spec quality |
| Regression rate by author type | Git + CI | Agent code quality |
| Time from signal to fix | Linear timestamps | Triage effectiveness |

## Anti-patterns to watch

- **Spec drift:** implementation diverges from spec and nobody updates either. Fix: spec review at each milestone; a delivery run escalates `spec:*` blockers to `spec-amendment` instead of quietly reinterpreting.
- **Agent overload:** assigning tasks that need human judgment to agents. Fix: route those tasks `human` (deferred and surfaced) in decomposition.
- **Sizing tasks for human review:** fragmenting one coherent change into many tiny "reviewable" PRs. Fix: a human is not the reviewer of record — size by coherence + bounded `touches`. Never reintroduce a ~300-line / one-PR-per-task rule.
- **Ad-hoc implementation outside the process:** picking tasks off and building them without a goal leash, an integration branch, or a task list. Fix: enter `spec-execution` and let it own the run — the discipline is what makes the gate meaningful.
- **Batching merges to the end:** letting task PRs pile up open. Fix: task N merges into `feat/spec-NNN` before task N+1 starts, so nothing is built on a stale base.
- **Invisible progress:** burning a whole spec down without a task list anyone can follow. Fix: the run's task list is mandatory, and updated as each task lands.
- **Skimping on the front phases:** rushing intent/spec/decomposition to "start coding." Fix: that is exactly where attention belongs — bad decomposition is the top cause of stalled runs.
- **Invisible runs:** agent work happens but isn't logged. Fix: no merge without run metadata; optionally enable `_execution.log.jsonl` (SOP §9).
- **Ticket creep:** falling back to Jira-style "create a ticket for everything." Fix: specs are the root, tasks are ephemeral.
