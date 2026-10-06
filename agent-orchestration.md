# Agent orchestration: goal-oriented, single-executor delivery

Orchestration of the autonomous half of the SDLC is **one agent delivering one spec against a stated goal**, not a fixed pipeline and not a fan-out of dispatchers. Once a spec is `active` and its delivery guide is approved with it (the front, judgment phases; [ADR-007](specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md)), the owner pastes the generated kickoff prompt, and the local agent enters `spec-execution` and drives the whole thing to a single integration PR. This document defines that model, how the exceptional worktree-isolated subagent plugs into it, and what artifacts each needs.

A deterministic Workflow engine (`execute-spec.js`) used to own this. It was measured in live use and retired — see [ADR-003](specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md) for why, and what each of its capabilities became.

## The skill is the engine

`spec-execution` **is** the execution engine — policy in [`skills/spec-execution/SKILL.md`](skills/spec-execution/SKILL.md), procedures in its [`SOP.md`](skills/spec-execution/SOP.md). There is no Workflow to invoke. The agent that runs the skill is the executor.

**The run, end to end:**

```
validate-guide.mjs + plan-review gate (fail-closed) → arm the goal leash → open a visible task list
  ↓
cut feat/spec-NNN off main
  ↓
for each guide step, in guide order, ONE at a time:
     implement inline → the step's Verify: commands green → self-review the diff
     → PR into feat/spec-NNN → merge it → delete the branch → next step
     (the guide may be re-planned in place; every change is logged and disclosed)
  ↓
end-to-end validation, ONCE, with attached evidence
  ↓
ONE integration PR (feat/spec-NNN → main)
     → multi-lens adversarial panel, independently dispatched, every envelope validated
     → fix at the root, re-dispatch the panel, loop until no blocker or major survives —
       at most three rounds (ADR-004); a survivor is disclosed in the PR body, not ground on
  ↓
LEAVE IT OPEN — a human merges
```

**Why the rigor sits at the end.** Reviewing step 3 in isolation, before anything integrates, costs more and buys less than reviewing the assembled diff once: each per-step reviewer is a fresh context that must re-derive the repo's conventions, and it cannot see cross-step interactions. Concentrating the panel at the gate also lets the constraints registry be evaluated against the *whole* change rather than one step's `Changes:`.

**The persistence leash.** The skill writes `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-<session_id>` (spec, statement, exit criteria, `status: active`). While it is active, `stop-handoff.mjs` blocks a premature stop and feeds the criteria back, so a run does not drift back to the user half-done. `met` and `escalated` are the only release words. It is bounded by a hook-owned counter and fails open — see [tooling.md](tooling.md).

**Transparency is not optional.** The run keeps a visible task list — one entry per guide step plus end-to-end validation and the integration gate — updated as each lands, so anyone in the session can see what is in flight and what remains without asking.

### Non-negotiables

- **Nothing reaches `main` except by merging `feat/spec-NNN`.** No step PR targets `main`; no direct commits. The agent never merges or pushes to `main` and never self-approves.
- **Serial by default; step N merges before step N+1 starts.** Every later step branches off that tip, so an unmerged step means the next is built on a base missing it.
- **Nothing lingers.** After a step: no open PR, no remote branch, no local branch, no step worktree. The spec worktree lives until run exit ([`docs/worktrees.md`](docs/worktrees.md)).
- **Worktree isolation for any subagent that writes files.** Fan-out is the exception (a large spec whose steps have disjoint `Changes:` and `After:` closures); when used, `isolation: "worktree"` is mandatory and the merge discipline is unchanged. Where worktrees go and who removes them: [`docs/worktrees.md`](docs/worktrees.md).
- **Bounded `Changes:`.** Every step declares the paths it may change; `validate-guide.mjs` rejects a step without them. A diff that leaves them is a `task:scope` finding → re-plan the guide in place, never hand-resolve a conflict.
- **Independence is structural at the gate.** Every verdict comes from a separately dispatched reviewer with no `Edit`/`Write`, and every envelope is validated (`.sdlc/scripts/validate-review-envelope.mjs`). Step-level self-review is the deliberate exception, bought back in full here.
- **Review of record is the LLM panel.** Humans gate the inputs (spec and guide) and merge the integration PR. See [roles.md](roles.md).

## Codification: how agents learn the process

The SDLC is codified in the repo so any agent can understand it. Three-tier architecture:

```
${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md             ← agent-agnostic process definition (phase model, shared by all agents)
CLAUDE.md                                      ← local orchestrator config (MCP, running a delivery, the spine)
${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md   ← generic executor brief (read the spec and the step, stay within Changes:, open a PR with evidence)
```

**`${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md`** is the portable core. It defines:
- The spec system (how to find and read specs, frontmatter fields, acceptance criteria)
- Where work is tracked (the repo is the only system of record)
- The delivery lifecycle (read spec and guide → implement a step → verify → PR → log)
- Boundaries (what agents must NOT do, when to escalate)

**`CLAUDE.md`** adds local-orchestrator capabilities:
- MCP integrations (as configured)
- Running a delivery through `spec-execution` and handling its escalations
- The spine: state machine, per-spec phase memory, reference hooks
- Phase-by-phase responsibilities (intent, spec drafting and the delivery guide, completion)

**`${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md`** is the **executor brief** — the agent-agnostic instructions a dispatched, worktree-isolated subagent follows (the exception, not the normal path; during a normal serial run the orchestrator implements each step itself, per the `spec-execution` skill and its SOP, not this brief):
- Read the spec, its guide step and the linked ADRs before writing code
- Stay strictly within the step's `Changes:`
- Self-verify (the step's `Verify:` commands) and self-review the diff before opening a PR
- Open a PR to the integration branch with evidence for each AC in the step's `Covers:`

### Agent portability

If you switch from Claude Code to another local agent (e.g., Gemini CLI):
1. `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` stays unchanged — it's the process
2. Point the new agent's config file at `AGENTS.md`, as `CLAUDE.md` does with `@AGENTS.md`
3. `${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md` stays unchanged — the executor brief is agent-agnostic

The process knowledge is in `sdlc.md`. The agent-specific wiring is in the config files. Swap the wiring, keep the process.

### When you start a new repo

Run `/sdlc-init`. It installs the `.sdlc/` tree and the SDLC block in `AGENTS.md`. Then update:
- the SDLC block in `AGENTS.md`: project structure and conventions (the context any executor reads)
- `.sdlc/config.yaml` `workspaces`: paths, setup and test commands, agent eligibility, domain skills
- `CLAUDE.md`: MCP server details, local orchestrator wiring

The process doc and the executor brief ship with the plugin and stay as they are.

## Owner decisions and human-run steps

Work an agent must not close alone is data in the guide, not a routing label on a task:

| In the guide | Meaning | Delivery behavior |
|---------|---------|-----------------|
| An ordinary step | Clear acceptance criteria, bounded `Changes:`, no human judgment required | Implemented inline by the delivery agent (or, exceptionally, a worktree-isolated subagent) |
| A step with `Run by: <role>` | Work only a human can perform: a credentialed run, live infra an agent can't safely drive | Not run by the agent; stays `pending` until the human reports it done; blocks the integration PR |
| An owner decision (`D<n>`) | Architecture, priority, scope or stakeholder calls | Surfaced at once; a `pending` decision blocks the integration PR; a deferred step needs a decided one |

There is no cloud executor and no separate execution backend to configure.

## The key insight

**The context that implements the spec should be the context that already understands the repo.** One executor carries its knowledge of conventions, boundaries and test commands across every step in the spec instead of paying to rebuild it in a fresh agent per step. What the retired engine bought with determinism — uniform ceremony on every task — is what made a spec unclearable in a day; what replaces it is judgment above a machine-readable floor, with the expensive, independent scrutiny spent once, on the assembled change, where it can see the interactions.

The spec is the brief, and the short delivery guide in `specs/tasks/SPEC-NNN/GUIDE.md` is the plan: step order, the ACs each step covers, the paths it may change and the commands that verify it. The executor already holds the spec, so the guide does not restate it (ADR-007). Step status in `_index.yaml` is the live status board.

## The executor brief (`${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md`)

`${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md` is the generic brief every dispatched executor reads for context about the codebase. It's how an executor understands your project without interactive exploration, and it carries the standing rules an executor must obey (stay within the step's `Changes:`, self-verify, open a PR to the integration branch with AC evidence).

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
implementing any step. Acceptance criteria are testable conditions — verify
each one.

## ADRs
Architecture decisions are in `specs/adrs/`. Check relevant ADRs before
making design choices — they document constraints and rationale.
```

## Guide steps: the executor's contract

The spec plus one guide step is everything an executor needs. The step names what to deliver and how to check it; the spec and ADRs say why and within what limits. Schema: [`skills/guide-schema.md`](skills/guide-schema.md).

```
### S2: <title>
- Covers: AC-003, AC-004          ← the spec ACs this step delivers; evidence goes in the PR body
- Changes: `src/api/**`           ← the paths it may change; the self-review audits the diff against it
- Verify: `npm test -- api`       ← the commands that gate the step
- Workspace: api                  ← when .sdlc/config.yaml lists workspaces
- After: S1                       ← optional: the earlier steps it needs
- Notes: <a contract a later step must match, or a pointer to a brief>
```

## How the delivery run drives steps

The skill — not a human stepping through work, and not a dispatcher — runs the loop:

```
validate-guide.mjs + plan-gate.mjs must exit 0
for each guide step, ONE at a time, in guide order:
   IF the step has Run by: <role>:
     surface it; it stays pending until the human reports it done; it blocks integration
   ELSE:
     branch off the current feat/spec-NNN tip → implement inline
     → the step's Verify: commands green → self-review the diff → PR → merge → delete the branch
   a guide change mid-run → edit GUIDE.md + _index.yaml, log it, list it under ## Guide changes
end-to-end validation ONCE (evidence attached)
integration PR (blocked while an owner decision is pending) → adversarial panel → fix at the root
  → re-dispatch → loop until clean (≤3 rounds, ADR-004)
human: merge the integration PR
```

For a large spec whose steps have disjoint `Changes:` and `After:` closures, the run may fan a few steps out to subagents. Each one gets `isolation: "worktree"` — mandatory — so it cannot corrupt the orchestrator's working tree or another step's, and each still merges into `feat/spec-NNN` as it is accepted rather than being batched to the end.

## What an unattended run can do

The agent writing the guide decides what goes in an ordinary step and what becomes a `Run by:` step or an owner decision:

| Criteria | Ordinary step | `Run by:` step or owner decision |
|----------|---------------|-----------------|
| Self-contained (no live env/infra an agent can't drive) | Yes | — |
| Clear acceptance criteria in spec | Yes | — |
| Needs credentials, a live DB, or running external services | — | `Run by:` |
| Requires an architecture decision the spec does not settle | — | Owner decision |
| Requires interactive debugging or stakeholder judgment | — | Owner decision |
| Mechanical: tests, lint fixes, dependency updates, boilerplate | Yes | — |
| Bug with a failing test — "make this pass" | Yes | — |
| Bug requiring reproduction and investigation | Yes, with the investigation in the step | — |

## Phase-by-phase assignment

| SDLC Phase | Local agent (orchestrator = executor) | Dispatched subagents |
|------------|----------------------------------------|----------------------|
| **intent-triage** (judgment) | Capture + prioritize intents with the owner | — |
| **spec-authoring** (judgment) | Draft + refine the spec, link ADRs, frontmatter; write the delivery guide and kickoff prompt | `spec-reviewer` at the sign-off gate (the spec only) |
| **spec-execution** (autonomous) | **Deliver the spec**: goal leash, task list, serial burn-down, e2e validation, integration PR; handle escalations | The gate's review panel; exceptionally, worktree-isolated executors for a large spec |
| *(review happens in-run)* | Self-review per step; run the adversarial panel at the gate | `integration-reviewer`, an adversarial `task-reviewer`, and the lenses the registry fires |
| **spec-completion** (judgment) | Verify success criteria end-to-end with the owner | — |
| **triage / bug fixes** | Normalize, link specs, investigate, fix | — |

## Artifact flow diagram

```
Spec + guide (active, plan-approved)  →  owner pastes KICKOFF.md  →  spec-execution
  │
  └─── goal leash armed · task list opened · feat/spec-NNN cut off main
            │
            ├─── S1 → implemented inline → Verify: green → self-review
            │         └─── PR → feat/spec-NNN → merged → branch deleted
            │
            ├─── S2 → implemented inline → Verify: green → self-review
            │         └─── PR → feat/spec-NNN → merged → branch deleted
            │
            └─── S3 (Run by: owner) → surfaced; pending until the owner reports it; blocks integration
  │
  └─── end-to-end validation, ONCE (build, suites, pipeline, browser, perf) → EVIDENCE
  │
  └─── integration PR (feat/spec-NNN → main)
            │   → adversarial panel: integration-reviewer vs success criteria, an adversarial
            │     task-reviewer, + every lens the registry fires on the whole diff
            │   → envelopes validated → fix at the root → re-dispatch → loop until clean (≤3, ADR-004)
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
- **`task:scope` blocker** → re-plan the guide in place, log it, and list it under `## Guide changes` (not an escalation)
- **`spec:*` blocker** → escalate to `spec-amendment`, subject to the amendment cap (`spec.version − 1 ≥ 3`)
- **Merge conflict into the integration branch** → the steps' `Changes:` overlapped; re-plan the guide, never hand-resolve
- **A malformed, ungrounded or abstaining reviewer envelope** → re-dispatch or escalate; never fold it as a clean review
- **A step that cannot land and cannot be fixed at the root** → mark it `blocked` in `_index.yaml` with the reason and escalate; never leave its PR open and move on

Every escalation notifies the spec owner, and `status: escalated` releases the goal leash so the halt can actually be surfaced. The full list is in [`skills/spec-execution/SKILL.md`](skills/spec-execution/SKILL.md) §8 and its SOP §8. Branches are id-derived (`claude/SPEC-NNN-S<n>`), so a resumed run recreates the same name rather than forking a differently-named one; the branch itself is deleted at merge, so resume is solely a read of `_index.yaml` status.
