# Agent orchestration: the deterministic execute-spec engine

Orchestration of the autonomous half of the SDLC is a **deterministic engine**, not an agent improvising. Once a spec is `active` and decomposed (the front, judgment phases), the local agent invokes one engine and it drives execution end-to-end to an integration PR. This document defines the engine, how its worktree-isolated executors plug in behind it, and what artifacts each needs.

## The engine is the orchestrator

`spec-execution` is implemented as a reference **Workflow script** at [`.claude/workflows/execute-spec.js`](.claude/workflows/execute-spec.js); the full algorithm lives in [`.ai/skills/spec-execution/SKILL.md`](.ai/skills/spec-execution/SKILL.md). The local agent does **not** hand-dispatch tasks one at a time. It invokes the engine once:

```
Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })
```

**Pure-core / effects-at-the-edges.** Routing (`routingOf`), tier resolution (`tier`), lens selection (`lensesFor`), verdict folding (`gate`), branch naming (`branchFor`), and wave planning (`buildWaves`) are **total functions** — no agents, no I/O, unit-testable. Only thin `agent()` wrappers touch the model. That split is what makes a run reproducible and auditable.

**Idempotent, id-derived branches + wave-level resume.** A task's branch is a pure function of its id (`claude/SPEC-NNN-TASK-NNN`); the integration branch is `feat/SPEC-NNN`. A re-run reuses the same branch and PR — updates, never duplicates. A task is `done` once its branch is merged into the integration branch and its `_index.yaml` status is committed; a stopped run resumes by re-invoking with the same `spec`.

**The loop.** Build the wave graph from `depends_on` → for each wave, run eligible tasks in parallel, each through the per-task pipeline:

```
executor (worktree-isolated)
  ↓
Tier-0 gate (cheap: lint/typecheck/unit for the task's workspace)
   red  → fix agent (shared fix counter; cap 3 → escalate)
   green↓
routed multi-lens review (lenses = baseLenses(workspace) ∪ constraints whose `when` matches touches)
   ↓ validate each envelope against review-envelope.schema.json — malformed/abstained → escalate
   ↓ severity → action: blocker/major → fix (cap 3); task:scope → re-plan; spec:* → amendment; nits → follow-ups; clean → accept
accept → merge into feat/SPEC-NNN (a merge conflict = bad decomposition → escalate; never hand-resolve)
```

Then Phase 3: run the expensive integration verification (captured as EVIDENCE), open the integration PR `feat/SPEC-NNN → main`, run an independent `integration-reviewer` against the spec's success criteria. **A human merges; the engine never merges to `main`.**

### Non-negotiables

- **Worktree isolation.** Every executor runs with `isolation: "worktree"` — the engine dispatches each task into its own isolated copy of the tree so parallel tasks within a wave never collide.
- **Tier-0 gates review.** No LLM reviewer is dispatched while Tier-0 is red — a red PR goes to a fix agent, not a reviewer. The single largest token-cost optimization in the design.
- **Bounded `touches`.** A task with no declared `touches` is refused before any agent runs. A merge conflict folding a task into the integration branch means the decomposition's `touches` scoping was wrong → escalate to re-plan.
- **Fix-loop cap = 3 per task.** A shared counter across Tier-0 and review-driven fixes. After 3, escalate — the situation needs human judgment.
- **Review of record is the LLM panel.** Humans gate the inputs (spec, tasks) and merge the integration PR. See [roles.md](roles.md).

## Codification: how agents learn the process

The SDLC is codified in the repo so any agent can understand it. Three-tier architecture:

```
.ai/
├── sdlc.md       ← agent-agnostic process definition (phase model, shared by all agents)
├── CLAUDE.md     ← local orchestrator config (MCP, Linear, invoking the execution engine, the spine)
└── AGENTS.md     ← generic executor brief (read the task, stay within touches, open a PR, populate evidence)
```

**`.ai/sdlc.md`** is the portable core. It defines:
- The spec system (how to find and read specs, frontmatter fields, acceptance criteria)
- The work tracker conventions (Linear labels, issue naming, run logging)
- The task lifecycle (read spec → implement → test → PR → log)
- Boundaries (what agents must NOT do, when to escalate)

**`.ai/CLAUDE.md`** adds local-orchestrator capabilities:
- MCP integrations (Linear, Slack, etc.)
- Invoking the deterministic `execute-spec` engine and handling its escalations
- The spine: state machine, per-spec phase memory, reference hooks
- Phase-by-phase responsibilities (intent, spec drafting, decomposition/routing, completion)

**`.ai/AGENTS.md`** is the **executor brief** — the agent-agnostic instructions any agent dispatched as an executor follows:
- Read the task file and the linked spec/ADRs before writing code
- Stay strictly within the task's declared `touches` set
- Self-verify (Tier-0: lint/typecheck/unit) before opening a PR
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

## Routing: data the engine reads, not a hand-dispatch plan

Each task carries a routing field — `agent: claude-code | human` (mirrored as a Linear label for human visibility). It is **data**, set during decomposition; the engine reads `routingOf = task.routing || task.agent || 'claude-code'` and dispatches accordingly. The engine is **agent-agnostic**: one generic executor, specialization is data.

| Routing | Meaning | Engine behavior |
|---------|---------|-----------------|
| `claude-code` | An agent-executable task — clear acceptance criteria, bounded `touches`, no human judgment required | Dispatch the worktree-isolated local executor |
| `human` | Architecture decisions, stakeholder comms, priority calls, anything needing credentials/live infra the engine can't safely drive | **Deferred** — the engine skips it and surfaces it for a human; a pending `human` task blocks integration |

The label is the task's *nature*, set in decomposition. The framework remains executor-agnostic in principle — the engine dispatches behind a thin `agent()` wrapper, so the execution backend could be swapped later — but it ships with one named executor: the local worktree agent. There is no cloud executor.

## The key insight

The **engine** is the orchestrator — a deterministic Workflow script that plans waves, gates on Tier-0, routes reviews, runs the fix loop, and merges. Executors are **interchangeable workers behind it**: the engine dispatches one worktree-isolated local executor per `claude-code` task and defers `human` tasks. The local agent's *orchestration* job in the autonomous half is just to **invoke the engine and handle escalations** — the per-task choreography is the script's, not a human's or an improvising agent's.

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
**Branch from:** the integration branch (feat/SPEC-NNN)

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

## How the engine drives executors

The engine — not a human stepping through tasks — runs the loop. Each `claude-code` task is dispatched behind a thin `agent()` wrapper into its own worktree:

```
engine: buildWaves(SPEC-NNN) from depends_on
for each eligible task (deps accepted):
   routing = routingOf(task)
   IF routing == human:
     defer — surface for a human; it blocks integration until resolved
   ELSE:                                  # claude-code (the default)
     dispatch local executor with isolation: "worktree"
   → Tier-0 gate → routed multi-lens review → fix loop (cap 3) → merge into feat/SPEC-NNN
engine: integration verification (EVIDENCE) → integration PR → integration-reviewer
human: merge the integration PR
```

Every executor gets `isolation: "worktree"`, so parallel tasks in the same wave operate on independent copies of the tree and can never corrupt each other's working state.

## Agent eligibility criteria

Not every task should be routed `claude-code`. The decomposing agent assesses each task against these criteria; anything that fails goes to `human`:

| Criteria | `claude-code` | `human` instead |
|----------|---------------|-----------------|
| Self-contained (no live env/infra deps the engine can't drive) | Yes | — |
| Clear acceptance criteria in spec | Yes | — |
| Needs credentials, a live DB, or running external services | — | Yes |
| Requires architecture decisions | — | Yes |
| Requires interactive debugging or stakeholder judgment | — | Yes |
| Mechanical: tests, lint fixes, dependency updates, boilerplate | Yes | — |
| Multi-step refactor touching many files with judgment calls | — | Yes |
| Bug with a failing test — "make this pass" | Yes | — |
| Bug requiring reproduction and investigation | — | Yes |

## Phase-by-phase assignment

| SDLC Phase | Local agent (orchestrator) | Engine executor |
|------------|----------------------------|-----------------|
| **intent-triage** (judgment) | Capture + prioritize intents with the owner | — |
| **spec-authoring** (judgment) | Draft + refine the spec, link ADRs, frontmatter | — |
| **task-decomposition** (judgment) | Build the AI-coherent task graph; set `touches`/`risk`/`tier`/routing | — |
| **spec-execution** (deterministic) | **Invoke the engine**; handle escalations | The engine dispatches a worktree-isolated executor per `claude-code` task, in parallel within a wave |
| **review** (LLM) | The engine runs the multi-lens panel + integration-reviewer | (executors are not reviewers) |
| **spec-completion** (judgment) | Verify success criteria end-to-end with the owner | — |
| **triage / bug fixes** | Normalize, link specs, investigate, complex fixes | Confirmed bugs with a failing test attached |

## Artifact flow diagram

```
Spec (active, decomposed)  →  Workflow({ name: 'execute-spec', args: { spec } })
  │
  └─── engine builds waves, then per task (in parallel within a wave):
            │
            ├─── Task A (claude-code) → local executor (worktree-isolated) → PR → feat/SPEC-NNN
            │         └─── Tier-0 gate → routed multi-lens review → fix loop (cap 3) → merge
            │
            ├─── Task B (claude-code) → local executor (worktree-isolated) → PR → feat/SPEC-NNN
            │         └─── Tier-0 gate → routed multi-lens review → fix loop → merge
            │
            └─── Task C (human) → deferred — surfaced for a human; blocks integration
  │
  └─── engine: integration verification (EVIDENCE) → integration PR (feat/SPEC-NNN → main)
            │   → integration-reviewer vs spec success criteria
            │
            └─── a HUMAN merges the integration PR
                      │
                      └─── CI validates spec schema, runs tests, updates spec-index.json
```

## Error handling

The engine handles per-task failure deterministically — it does not improvise:
- **Tier-0 red** → fix agent (shared counter; cap 3 → escalate `fix_loop_exhausted`)
- **Blocker/major review finding** → fix agent (same counter, same cap)
- **`task:scope` blocker** → escalate to `task-decomposition` re-plan (a judgment phase)
- **`spec:*` blocker** → escalate to `spec-amendment` (subject to a per-spec amendment cap)
- **Merge conflict into the integration branch** → escalate (the `touches` scoping was wrong); never hand-resolve
- **Dispatch crash / contract violation / executor failure** → degrade that task to `failed` and escalate; it never sinks the wave

Every escalation notifies the spec owner. The full trigger table is in [`.ai/skills/spec-execution/SKILL.md`](.ai/skills/spec-execution/SKILL.md) → Failure escalation. An executor failure is just a `dispatch_failed`/exec failure to the engine — re-running with the same `spec` reuses the task's deterministic branch.
