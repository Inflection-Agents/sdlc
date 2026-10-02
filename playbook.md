# Playbook

How to run the AI-native SDLC on a real project. Start here when kicking off a new initiative or refactoring effort.

## The shape: collaborate up front, then run

```
intent-triage → spec-authoring (spec + delivery guide) │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)                          │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──     │  ── DELIVERY ──
```

*Quality when it's cheap to assure it — then autonomous delivery.* You and the team spend judgment on the front phases — the intent, the spec, and its short delivery guide. Each ends at a hard sign-off gate. Once the spec is `active` with its guide approved, you paste the generated kickoff prompt (or say "implement SPEC-NNN") and one agent delivers the whole spec — serially, on one integration branch, behind a visible task list — with no further human attention until the integration PR. Review happens in-run: a self-review per step, then an LLM multi-lens adversarial panel on that PR. A human merges it to `main`. The single source of truth for the phases is [`.sdlc/state-machine.yaml`](.sdlc/state-machine.yaml).

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

1. Brainstorm the intent into `.sdlc/templates/spec.md` → `specs/SPEC-NNN-name.md`
2. Fill the frontmatter (id, title, initiative, owner, tags) and body (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks)
3. If a refactor, include the Migration section (current state, target state, strategy, rollback)
4. Open a spec PR — CI validates the schema; `spec-reviewer` grades it; the named reviewers and stakeholders sign off on *intent*
5. **Write the delivery guide** (`spec-authoring` Step 10b): ordered steps naming the ACs they cover, the paths they change and the commands that verify them; `validate-guide.mjs` checks it; `KICKOFF.md` (at most 3,800 characters) is generated at sign-off
6. **Sign-off gate:** on approval, set status to `active` and `plan_review.approved: true` together and merge; create the Linear project, set `linear_project`

There is no separate decomposition phase ([ADR-007](specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md)). The executor already holds the spec, so the plan is a short guide approved with it. A guide over 10 steps means the spec should be split.

## Phase 3: Deliver (autonomous)

**Who:** one agent running `spec-execution`; **no human attention required until the integration PR**

Paste `KICKOFF.md` (or say "implement SPEC-NNN"). The run checks the guide (`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide specs/tasks/SPEC-NNN/GUIDE.md`) and the fail-closed plan gate (`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs plan-gate specs/tasks/SPEC-NNN/_index.yaml`), arms a goal leash so it cannot stop half-done, opens a **visible task list**, and cuts `feat/spec-NNN`. Then, one guide step at a time in order: implement inline → the step's `Verify:` commands green → **self-review the diff** → PR into `feat/spec-NNN` → merge it → delete the branch → next step. Nothing lingers between steps, and no step PR ever targets `main`. Fan-out to worktree-isolated subagents is the exception, for a large spec with genuinely independent steps.

A `task:scope` blocker means the guide was wrong: the run re-plans it in place, logs the change and lists it under `## Guide changes` in the integration PR. The only way it asks for help is to **escalate back into a judgment phase**: a `spec:*` blocker → `spec-amendment`.

## Phase 4: Validate + Integrate (LLM review, human merge)

**Who:** the same run; an LLM panel reviews; a human merges

1. **End-to-end validation runs once** — full build and test suite, the real pipeline where one exists, the app in a real browser for user-visible change, performance where it matters — captured as EVIDENCE
2. The run opens the integration PR `feat/spec-NNN → main` with every success criterion mapped to its evidence
3. A **multi-lens adversarial panel** is dispatched concurrently — `integration-reviewer` against the spec's **success criteria**, an adversarial `task-reviewer`, and every lens the registry fires across the whole diff — with each envelope validated (`.sdlc/scripts/validate-review-envelope.mjs`). Blockers and majors are fixed at the root and **the panel is re-dispatched**, until none survive, to a maximum of three rounds (ADR-004)
4. **A human merges the integration PR.** The agent never merges or pushes to `main`.

## Phase 5: Complete

**Who:** `spec-completion` skill + owner

1. Verify the spec's success criteria end-to-end against `main`
2. Move the spec to a terminal state; close out the Linear project

## Phase 6: Triage (ongoing)

See [triage.md](triage.md) for the full pipeline. During active development:
- Bugs found during implementation → normalize immediately, don't create loose tickets
- Agent-found issues during execution → auto-file as bug specs with linked run
- Human-found issues during review → reporter role, agent picks up from there

## Ceremonies

### Daily (async)
- Agent posts a summary: steps completed, steps in progress, blockers, run costs
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
| Specs delivered per cycle | Linear | Throughput |
| Guide words ÷ spec words | `wc -w` at the gate | Planning cost (ADR-007 target ≤ 0.30) |
| Cost per spec (tokens) | Run logs | Efficiency |
| Panel rounds per integration PR | `_execution.log.jsonl` | Spec and guide quality |
| Guide changes per run | `DECISIONS.md` | Guide quality |
| Escalations per spec (re-plan / amendment) | Run logs | Front-phase quality |
| Bug density per spec | Linear relations | Spec quality |
| Regression rate by author type | Git + CI | Agent code quality |
| Time from signal to fix | Linear timestamps | Triage effectiveness |

## Anti-patterns to watch

- **Spec drift:** implementation diverges from spec and nobody updates either. Fix: spec review at each milestone; a delivery run escalates `spec:*` blockers to `spec-amendment` instead of quietly reinterpreting.
- **Agent overload:** leaving decisions that need human judgment to the agent. Fix: list them as owner decisions in the guide; a pending one blocks the integration PR.
- **Sizing steps for human review:** fragmenting one coherent change into many tiny "reviewable" PRs. Fix: a human is not the reviewer of record — size by coherence + bounded `Changes:`. Never reintroduce a ~300-line / one-PR-per-step rule.
- **Ad-hoc implementation outside the process:** building from a plan document without a goal leash, an integration branch, or a task list. Fix: enter `spec-execution` and let it own the run — the discipline is what makes the gate meaningful.
- **Batching merges to the end:** letting step PRs pile up open. Fix: step N merges into `feat/spec-NNN` before step N+1 starts, so nothing is built on a stale base.
- **Invisible progress:** burning a whole spec down without a task list anyone can follow. Fix: the run's task list is mandatory, and updated as each step lands.
- **Skimping on the front phases:** rushing intent and spec to "start coding." Fix: that is exactly where attention belongs — an unclear spec is the top cause of stalled runs.
- **Invisible runs:** agent work happens but isn't logged. Fix: no merge without run metadata; optionally enable `_execution.log.jsonl` (SOP §9).
- **Ticket creep:** falling back to Jira-style "create a ticket for everything." Fix: specs are the root; a guide's steps are ephemeral.
