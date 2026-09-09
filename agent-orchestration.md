# Agent orchestration: goal-oriented, single-executor delivery

Orchestration of the autonomous half of the SDLC is **one agent delivering one spec against a stated goal**, not a fixed pipeline and not a fan-out of dispatchers. Once a spec is `active`, decomposed and plan-approved (the front, judgment phases), the local agent enters `spec-execution` and drives the whole thing to a single integration PR. This document defines that model, how the exceptional worktree-isolated subagent plugs into it, and what artifacts each needs.

A deterministic Workflow engine (`execute-spec.js`) used to own this. It was measured in live use and retired — see [ADR-003](specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md) for why, and what each of its capabilities became.

## The skill is the engine

`spec-execution` **is** the execution engine — policy in [`.ai/skills/spec-execution/SKILL.md`](.ai/skills/spec-execution/SKILL.md), procedures in its [`SOP.md`](.ai/skills/spec-execution/SOP.md). There is no Workflow to invoke. The agent that runs the skill is the executor.

**The run, end to end:**

```
plan-review gate (fail-closed) → arm the goal leash → open a visible task list
  ↓
cut feat/spec-NNN off main
  ↓
for each task, in dependency order, ONE at a time:
     implement inline → the task's own tests green → self-review the diff
     → PR into feat/spec-NNN → merge it → delete the branch → next task
  ↓
end-to-end validation, ONCE, with attached evidence
  ↓
ONE integration PR (feat/spec-NNN → main)
     → multi-lens adversarial panel, independently dispatched, every envelope validated
     → fix at the root, re-dispatch the panel, loop until no blocker or major survives
  ↓
LEAVE IT OPEN — a human merges
```

**Why the rigor sits at the end.** Reviewing task 3 in isolation, nine tasks before anything integrates, costs more and buys less than reviewing the assembled diff once: each per-task reviewer is a fresh context that must re-derive the repo's conventions, and it cannot see cross-task interactions. Concentrating the panel at the gate also lets the constraints registry be evaluated against the *whole* change rather than one task's declared `touches`.

**The persistence leash.** The skill writes `.claude/.sdlc-goal-<session_id>` (spec, statement, exit criteria, `status: active`). While it is active, `stop-handoff.mjs` blocks a premature stop and feeds the criteria back, so a run does not drift back to the user half-done. `met` and `escalated` are the only release words. It is bounded by a hook-owned counter and fails open — see [tooling.md](tooling.md).

**Transparency is not optional.** The run keeps a visible task list — one entry per task plus end-to-end validation and the integration gate — updated as each lands, so anyone in the session can see what is in flight and what remains without asking.

### Non-negotiables

- **Nothing reaches `main` except by merging `feat/spec-NNN`.** No task PR targets `main`; no direct commits. The agent never merges or pushes to `main` and never self-approves.
- **Serial by default; task N merges before task N+1 starts.** Every later task branches off that tip, so an unmerged task means the next is built on a base missing it.
- **Nothing lingers.** After a task: no open PR, no remote branch, no local branch, no worktree.
- **Worktree isolation for any subagent that writes files.** Fan-out is the exception (a large spec with genuinely non-overlapping tasks); when used, `isolation: "worktree"` is mandatory and the merge discipline is unchanged.
- **Bounded `touches`.** A task with no declared `touches` is not executable. A merge conflict folding a task into the integration branch means the decomposition's scoping was wrong → escalate to re-plan, never hand-resolve.
- **Independence is structural at the gate.** Every verdict comes from a separately dispatched reviewer with no `Edit`/`Write`, and every envelope is validated (`scripts/sdlc/validate-review-envelope.mjs`). Task-level self-review is the deliberate exception, bought back in full here.
- **Review of record is the LLM panel.** Humans gate the inputs (spec, tasks) and merge the integration PR. See [roles.md](roles.md).

## Codification: how agents learn the process

The SDLC is codified in the repo so any agent can understand it. Three-tier architecture:

```
.ai/
├── sdlc.md       ← agent-agnostic process definition (phase model, shared by all agents)
├── CLAUDE.md     ← local orchestrator config (MCP, Linear, running a delivery, the spine)
└── AGENTS.md     ← generic executor brief (read the task, stay within touches, open a PR, populate evidence)
```

**`.ai/sdlc.md`** is the portable core. It defines:
- The spec system (how to find and read specs, frontmatter fields, acceptance criteria)
- The work tracker conventions (Linear labels, issue naming, run logging)
- The task lifecycle (read spec → implement → test → PR → log)
- Boundaries (what agents must NOT do, when to escalate)

**`.ai/CLAUDE.md`** adds local-orchestrator capabilities:
- MCP integrations (Linear, Slack, etc.)
- Running a delivery through `spec-execution` and handling its escalations
- The spine: state machine, per-spec phase memory, reference hooks
- Phase-by-phase responsibilities (intent, spec drafting, decomposition/routing, completion)

**`.ai/AGENTS.md`** is the **executor brief** — the agent-agnostic instructions a dispatched, worktree-isolated subagent follows (the exception, not the normal path; during a normal serial run the orchestrator implements each task itself, per the `spec-execution` skill and its SOP, not this brief):
- Read the task file and the linked spec/ADRs before writing code
- Stay strictly within the task's declared `touches` set
- Self-verify (the task's own tests + lint) and self-review the diff before opening a PR
- Open a PR to the integration branch and populate each AC's evidence field

### Agent portability

If you switch from Claude Code to another local agent (e.g., Gemini CLI):
1. `.ai/sdlc.md` stays unchanged — it's the process
2. Rename or duplicate `.ai/CLAUDE.md` to match the new agent's config file convention
3. `.ai/AGENTS.md` stays unchanged — the executor brief is agent-agnostic

The process knowledge is in `sdlc.md`. The agent-specific wiring is in the config files. Swap the wiring, keep the process.

### When you start a new repo

Copy `.ai/` from the SDLC templates into your repo. Update:
- `AGENTS.md`: project structure, setup commands, test commands (the brief any executor reads)
- `CLAUDE.md`: MCP server details, local orchestrator wiring
- `sdlc.md`: generally stays as-is unless you customize the process

## Routing: data set at decomposition, read at delivery

Each task carries a routing field — `agent: claude-code | human` (mirrored as a Linear label for human visibility). It is **data**, set during decomposition and read as `routing = task.routing || task.agent || 'claude-code'`. Execution is agent-agnostic: specialization lives on the task, not in the executor.

| Routing | Meaning | Delivery behavior |
|---------|---------|-----------------|
| `claude-code` | An agent-executable task — clear acceptance criteria, bounded `touches`, no human judgment required | Implemented inline by the delivery agent (or, exceptionally, a worktree-isolated subagent) |
| `human` | Architecture decisions, stakeholder comms, priority calls, anything needing credentials or live infra an agent can't safely drive | **Deferred** — surfaced on the task list with its reason; a pending `human` task blocks integration |

The label is the task's *nature*, set in decomposition. There is no cloud executor and no separate execution backend to configure.

## The key insight

**The context that implements the spec should be the context that already understands the repo.** One executor carries its knowledge of conventions, boundaries and test commands across every task in the spec instead of paying to rebuild it in a fresh agent per task. What the retired engine bought with determinism — uniform ceremony on every task — is what made a spec unclearable in a day; what replaces it is judgment above a machine-readable floor, with the expensive, independent scrutiny spent once, on the assembled change, where it can see the interactions.

The structured task files in `specs/tasks/` are the contract — `touches`, `risk`, `tier`, routing, and acceptance criteria give every executor and reviewer the same zero-prior-context brief. Linear is the live status board.

## The executor brief (`.ai/AGENTS.md`)

`.ai/AGENTS.md` is the generic brief every dispatched executor reads for context about the codebase. It's how an executor understands your project without interactive exploration, and it carries the standing rules an executor must obey (stay within `touches`, self-verify, open a PR to the integration branch, populate evidence).

```markdown
# AGENTS.md

## Project overview
[Brief description of the project, its purpose, and architecture]

## Tech stack
- Language: [e.g., TypeScript, Python]
- Framework: [e.g., Next.js, FastAPI]
- Database: [e.g., PostgreSQL, Supabase]
- Testing: [e.g., pytest, vitest]
- Package manager: [e.g., pnpm, uv]

## Setup
[Commands to install dependencies and run tests]
```bash
npm install
npm test
```

## Project structure
```
src/
  api/          — API routes
  components/   — React components
  lib/          — shared utilities
  ...
```

## Conventions
- [Coding conventions, naming, patterns]
- [How tests are organized]
- [How migrations work]

## Specs
Feature specs with acceptance criteria are in `specs/`. Each spec has YAML
frontmatter with id, status, and version. Read the relevant spec before
implementing any task. Acceptance criteria are testable conditions — verify
each one.

## ADRs
Architecture decisions are in `specs/adrs/`. Check relevant ADRs before
making design choices — they document constraints and rationale.
```

## Task artifacts: the executor's contract

The task file is the executor's zero-prior-context brief. Everything an executor needs is in the task file or reachable from the repo — `touches`, acceptance criteria, constraints, and the linked spec/ADRs. A well-formed task prompt makes the requirements explicit rather than relying on the executor to navigate:

```
## Task: [title]

**Spec:** SPEC-NNN (see specs/SPEC-NNN-name.md)
**Linear issue:** [ID]
**Branch from:** the integration branch (feat/spec-NNN)

## Context
[Brief context: why this task exists, what it's part of]

## Requirements
[The relevant section from the spec, restated so the task is self-contained]

## Acceptance criteria
[From the spec — each is a testable condition]
- [ ] Given X, when Y, then Z
- [ ] Given A, when B, then C

## touches
[The bounded set of file globs this task may modify — the executor must not stray outside it]

## Constraints
- [Any ADR constraints: "Must use PostgreSQL, not SQLite (ADR-001)"]
- [Any patterns to follow: "Use the existing ApiClient class in src/lib/api.ts"]
- [Any files NOT to touch]

## Verification
- Run: `npm test` (all tests must pass)
- Run: `npm run lint` (no new warnings)
- New tests required: [yes/no, and where]
```

## How the delivery run drives tasks

The skill — not a human stepping through tasks, and not a dispatcher — runs the loop:

```
read the task graph from _index.yaml (dependency order)
for each task, ONE at a time:
   routing = task.routing || task.agent || 'claude-code'
   IF routing == human:
     defer — surface it on the task list with the reason; it blocks integration
   ELSE:                                  # claude-code (the default)
     branch off the current feat/spec-NNN tip → implement inline
     → the task's own tests green → self-review the diff → PR → merge → delete the branch
end-to-end validation ONCE (evidence attached)
integration PR → adversarial panel → fix at the root → re-dispatch → loop until clean
human: merge the integration PR
```

For a large spec with genuinely non-overlapping tasks the run may fan a few tasks out to subagents. Each one gets `isolation: "worktree"` — mandatory — so it cannot corrupt the orchestrator's working tree or another task's, and each still merges into `feat/spec-NNN` as it is accepted rather than being batched to the end.

## Agent eligibility criteria

Not every task should be routed `claude-code`. The decomposing agent assesses each task against these criteria; anything that fails goes to `human`:

| Criteria | `claude-code` | `human` instead |
|----------|---------------|-----------------|
| Self-contained (no live env/infra an agent can't drive) | Yes | — |
| Clear acceptance criteria in spec | Yes | — |
| Needs credentials, a live DB, or running external services | — | Yes |
| Requires architecture decisions | — | Yes |
| Requires interactive debugging or stakeholder judgment | — | Yes |
| Mechanical: tests, lint fixes, dependency updates, boilerplate | Yes | — |
| Multi-step refactor touching many files with judgment calls | — | Yes |
| Bug with a failing test — "make this pass" | Yes | — |
| Bug requiring reproduction and investigation | — | Yes |

## Phase-by-phase assignment

| SDLC Phase | Local agent (orchestrator = executor) | Dispatched subagents |
|------------|----------------------------------------|----------------------|
| **intent-triage** (judgment) | Capture + prioritize intents with the owner | — |
| **spec-authoring** (judgment) | Draft + refine the spec, link ADRs, frontmatter | `spec-reviewer` at the sign-off gate |
| **task-decomposition** (judgment) | Build the AI-coherent task graph; set `touches`/`risk`/`tier`/routing | — |
| **spec-execution** (autonomous) | **Deliver the spec**: goal leash, task list, serial burn-down, e2e validation, integration PR; handle escalations | The gate's review panel; exceptionally, worktree-isolated executors for a large spec |
| *(review happens in-run)* | Self-review per task; run the adversarial panel at the gate | `integration-reviewer`, an adversarial `task-reviewer`, and the lenses the registry fires |
| **spec-completion** (judgment) | Verify success criteria end-to-end with the owner | — |
| **triage / bug fixes** | Normalize, link specs, investigate, fix | — |

## Artifact flow diagram

```
Spec (active, decomposed, plan-approved)  →  "implement SPEC-NNN"  →  spec-execution
  │
  └─── goal leash armed · task list opened · feat/spec-NNN cut off main
            │
            ├─── Task A (claude-code) → implemented inline → tests green → self-review
            │         └─── PR → feat/spec-NNN → merged → branch deleted
            │
            ├─── Task B (claude-code) → implemented inline → tests green → self-review
            │         └─── PR → feat/spec-NNN → merged → branch deleted
            │
            └─── Task C (human) → deferred — surfaced on the task list; blocks integration
  │
  └─── end-to-end validation, ONCE (build, suites, pipeline, browser, perf) → EVIDENCE
  │
  └─── integration PR (feat/spec-NNN → main)
            │   → adversarial panel: integration-reviewer vs success criteria, an adversarial
            │     task-reviewer, + every lens the registry fires on the whole diff
            │   → envelopes validated → fix at the root → re-dispatch → loop until clean
            │
            └─── a HUMAN merges the integration PR
                      │
                      └─── CI validates spec schema, runs tests, updates spec-index.json
```

## Error handling

A delivery run escalates rather than grinds: set the goal file to `status: escalated`, write the reason, surface it, stop.
- **Security, data-loss or payment risk** → hard stop, always
- **A decision that is the owner's** (priority, scope, a tradeoff the spec does not settle) → escalate
- **Round 3 completes with a blocker or major still open** → disclose it in the PR body (ADR-004), do not run a fourth round
- **`task:scope` blocker** → escalate to `task-decomposition` re-plan (a judgment phase)
- **`spec:*` blocker** → escalate to `spec-amendment`, subject to the amendment cap (`spec.version − 1 ≥ 3`)
- **Merge conflict into the integration branch** → escalate (the `touches` scoping was wrong); never hand-resolve
- **A malformed, ungrounded or abstaining reviewer envelope** → re-dispatch or escalate; never fold it as a clean review
- **A task that cannot land and cannot be fixed at the root** → mark it `blocked` in `_index.yaml` with the reason and escalate; never leave its PR open and move on

Every escalation notifies the spec owner, and `status: escalated` releases the goal leash so the halt can actually be surfaced. The full list is in [`.ai/skills/spec-execution/SKILL.md`](.ai/skills/spec-execution/SKILL.md) §8 and its SOP §8. Branches are id-derived (`claude/SPEC-NNN-TASK-NNN`), so a resumed run recreates the same name rather than forking a differently-named one; the branch itself is deleted at merge, so resume is solely a read of `_index.yaml` status.
