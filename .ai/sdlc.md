# AI-Native SDLC — Agent Operating Instructions

You are participating in an AI-native software development lifecycle. This document defines the process, your responsibilities, and how to interact with the system. Read this before starting any work.

## Principles

1. **Spec is the root, not the ticket.** Every feature, refactor, and bug traces back to a spec in `specs/`. Don't create work without a spec to anchor it.
2. **Agents are assignees.** You are a first-class participant — you get assigned tasks, produce artifacts, and are accountable for your output.
3. **Runs are observable.** Log what you did, what it cost, and whether it passed. Your work must be auditable.
4. **Humans decide intent and priority.** You propose, draft, and implement. Humans approve specs, prioritize work, and make tradeoff calls.
5. **Judgment up front, deterministic execution behind.** Scarce human attention belongs in the front phases, where it is cheapest to assure quality. Execution is autonomous. (See the phase model below.)
6. **Humans give great instructions, not great reviews.** The deliverable of the front phases is a complete, unambiguous spec + task graph. The reviewer of record for code is an LLM multi-lens panel; humans gate the inputs and merge the final integration PR.

## The phase model — collaborate up front, then run

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → review → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (DETERMINISTIC)   (LLM)    (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── AUTONOMOUS ENGINE ──
```

- **Front (judgment) phases are collaborative and human-gated.** Multiple humans — owner/PM, eng
  lead, domain experts, stakeholders — collaborate on the intent and the spec. *What* to build and
  *how* to split it require judgment. Quality is cheapest to assure here, before any code exists, so
  this is where human attention is spent. Each judgment phase ends at a hard sign-off gate.
- **`spec-execution` is deterministic and autonomous.** Once the spec + task graph are signed off,
  the execution engine runs the executor → Tier-0 gate → routed multi-lens review → fix loop → merge
  loop with no further human attention until the integration PR. It is a Workflow script with a
  pure-core / effects-at-the-edges split (see the `spec-execution` skill).
- **Review is LLM, not human.** A multi-lens reviewer panel grades each PR. Humans only merge the
  final integration PR to `main`.
- **The escape hatch back to judgment.** When the engine finds the spec or the decomposition is
  wrong (a `spec:*` or `task:scope` blocker), it escalates out of the autonomous loop into
  `spec-amendment` or `task-decomposition` re-planning — a judgment phase — then resumes.

The single source of truth for the phases, their triggers, and transitions is
`specs/sdlc-state-machine.yaml`. The per-spec `phase:` block in each `_index.yaml` records where a
spec is and what comes next, making the process resumable.

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
| `claude-code` | The default. Executed by the deterministic engine's worktree-isolated local executor. |
| `human` | Requires a human decision: architecture direction, priority/tradeoff calls, stakeholder comms, security-sensitive sign-off. Deferred by the engine. |

### How tasks get routed

One spec produces many tasks. The **local agent** (Claude Code or equivalent) decomposes the spec into Linear issues during the planning phase and applies a routing label to each one. The label determines who executes it.

```
Spec (one file in specs/)
  │
  └─ Local agent decomposes into tasks (Linear issues)
       │
       └─ spec-execution engine dispatches the wave graph:
            ├─ Task A: label=claude-code  → worktree-isolated local executor
            ├─ Task B: label=claude-code  → worktree-isolated local executor
            ├─ Task C: label=human        → deferred (a human does it)
            └─ Task D: label=claude-code  → worktree-isolated local executor
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

Tasks are structured files in the repo at `specs/tasks/SPEC-NNN/`. Each task has YAML frontmatter with: id, spec, agent (routing), `workspace`, `touches` (the file globs it may modify), `risk`, `tier`, dependencies, and acceptance criteria. An `_index.yaml` in each directory encodes the full dependency graph (and the optional `phase:` memory block).

Tasks are **AI-coherent units of execution**, not human-reviewable PR chunks: sized by coherence and a bounded `touches` set, not by line count. See `task-schema.md`.

Once a spec is decomposed, the **deterministic execution engine** (`spec-execution` skill, implemented by `.claude/workflows/execute-spec.js`) drives all tasks: it builds the wave graph, runs executors in parallel (worktree-isolated), gates review on a green Tier-0, runs the LLM multi-lens review + fix loop, and merges into the integration branch. You do not hand-dispatch tasks one at a time. The per-task lifecycle below is the **executor's** view of a single task within that loop.

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
- **Claude Code / local orchestrator:** see `CLAUDE.md` for MCP access, Linear integration, invoking the execution engine, local env capabilities
- **Executor agents:** see `AGENTS.md` for the executor brief — how any agent dispatched to a task reads its task file, stays within `touches`, and opens a PR to the integration branch
- **Other agents:** follow this document. If you have capabilities beyond what's described here, document them in your agent-specific config.

<!-- sdlc:phases:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## SDLC phases

The phases below are generated from `specs/sdlc-state-machine.yaml` — the single,
machine-readable source of truth for the SDLC state machine. Each phase is owned by
a skill, has documented entry triggers, and hands off to the next phase on its exit
condition. **Do not hand-edit this section** — change the YAML and re-run
`node scripts/sdlc/gen-handoffs.mjs`.

### intent-triage

- **Owner skill:** `intent-triage`
- **Entry triggers:** "I want to", "we need to", "we should", "brain dump", "review the intent backlog", "prioritize the backlog"
- **Preconditions:** one or more raw intents to capture or an existing intent backlog to review
- **Exit condition:** an intent is captured/prioritized in specs/intents.md and selected to spec out
- **Next step:** `spec-authoring` — trigger: "spec out intent #N"

### spec-authoring

- **Owner skill:** `spec-authoring`
- **Entry triggers:** "I want to build", "we need to refactor", "spec out", "new feature", "new initiative"
- **Preconditions:** intent exists or owner confirms none is needed
- **Exit condition:** spec status flips draft -> active (after spec-reviewer sign-off and owner approval)
- **Next step:** `task-decomposition` — trigger: "decompose SPEC-NNN"

### task-decomposition

- **Owner skill:** `task-decomposition`
- **Entry triggers:** "decompose this spec", "break this down", "this task is too big", "split this task", "we need another task before X", "merge these tasks", "re-route this task"
- **Preconditions:** spec has status active
- **Exit condition:** AI-coherent tasks + _index.yaml dependency graph exist with touches/routing declared
- **Next step:** `spec-execution` — trigger: "execute SPEC-NNN"

### spec-execution

- **Owner skill:** `spec-execution`
- **Entry triggers:** "execute this spec", "execute SPEC-NNN", "run the spec", "start the execution loop", "dispatch the tasks"
- **Preconditions:** spec has status active and decomposed tasks with a dependency graph exist
- **Exit condition:** all tasks merged into the integration branch and the integration PR (feat/spec-NNN -> main) is open
- **Next step:** `review` — trigger: "review the PRs for SPEC-NNN"

### review

- **Owner skill:** `pr-reviewer`
- **Entry triggers:** "review the PR", "review this PR", "grade the PR", "review the PRs for SPEC-NNN"
- **Preconditions:** one or more PRs exist and the author is not the reviewer
- **Exit condition:** every PR carries a graded verdict and accepted PRs are merged
- **Next step:** `spec-completion` — trigger: "close out SPEC-NNN"

### spec-completion

- **Owner skill:** `spec-completion`
- **Entry triggers:** "is this spec finished", "all tasks are merged", "verify the spec", "close out SPEC-NNN"
- **Preconditions:** all tasks for the spec are done or nearly done
- **Exit condition:** spec success criteria verified end-to-end and spec status set to a terminal state
- **Next step:** `none` (terminal phase)

### spec-amendment

- **Owner skill:** `spec-amendment`
- **Entry triggers:** "the spec assumed X but it is actually Y", "we need to add scope", "this acceptance criterion is untestable", "the design does not work", "the requirements changed"
- **Preconditions:** an active spec is found to be wrong, incomplete, or in need of change mid-flight; a spec is amendable IFF its status is active or draft — every other status (done, superseded, deprecated, cancelled) is CLOSED and immutable; route a change to a closed spec to a new spec (spec-authoring) or a bug spec under specs/bugs/ instead
- **Exit condition:** spec is amended (version bumped) and spec-reviewer re-signs off
- **Next step:** `task-decomposition` — trigger: "decompose SPEC-NNN"
<!-- sdlc:phases:end -->
