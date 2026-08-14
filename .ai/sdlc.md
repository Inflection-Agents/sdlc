# AI-Native SDLC — Agent Operating Instructions

You are participating in an AI-native software development lifecycle. This document defines the process, your responsibilities, and how to interact with the system. Read this before starting any work.

## Principles

1. **Spec is the root, not the ticket.** Every feature, refactor, and bug traces back to a spec in `specs/`. Don't create work without a spec to anchor it.
2. **Agents are assignees.** You are a first-class participant — you get assigned tasks, produce artifacts, and are accountable for your output.
3. **Runs are observable.** Log what you did, what it cost, and whether it passed. Your work must be auditable.
4. **Humans decide intent and priority.** You propose, draft, and implement. Humans approve specs, prioritize work, and make tradeoff calls.
5. **Judgment up front, autonomous delivery behind.** Scarce human attention belongs in the front phases, where it is cheapest to assure quality. Delivery is autonomous, and the rigor inside it is concentrated at one integration gate rather than spread thinly over every task. (See the phase model below.)
6. **Humans give great instructions, not great reviews.** The deliverable of the front phases is a complete, unambiguous spec + task graph. The reviewer of record for code is an LLM multi-lens panel; humans gate the inputs and merge the final integration PR.

## The phase model — collaborate up front, then run

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── DELIVERY ──
```

- **Front (judgment) phases are collaborative and human-gated.** Multiple humans — owner/PM, eng
  lead, domain experts, stakeholders — collaborate on the intent and the spec. *What* to build and
  *how* to split it require judgment. Quality is cheapest to assure here, before any code exists, so
  this is where human attention is spent. Each judgment phase ends at a hard sign-off gate.
- **`spec-execution` is autonomous single-executor delivery** (ADR-003). Once the spec + task graph
  are signed off, one agent arms a goal leash, cuts `feat/spec-NNN`, and burns the tasks down
  **itself**, one at a time, behind a **visible task list** — each task gated by its own tests plus
  an executor self-review, merged into that branch before the next one starts. It is a policy the
  agent applies with judgment, not a fixed pipeline (see the `spec-execution` skill and its SOP).
- **Rigor is concentrated, not removed.** End-to-end validation runs **once** before the gate, and
  the single integration PR then faces a **multi-lens adversarial panel** — independently
  dispatched, every envelope validated, the constraints registry evaluated across the whole diff —
  looped until no blocker or major survives. Review is LLM and happens **in-run**; there is no
  standalone review phase. Humans only merge that final integration PR to `main`.
- **The escape hatch back to judgment.** When delivery finds the spec or the decomposition is wrong
  (a `spec:*` or `task:scope` blocker), it escalates out of the run into `spec-amendment` or
  `task-decomposition` re-planning — a judgment phase — then resumes.

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
| `claude-code` | The default. Implemented by the delivery agent itself, or — for a large spec with genuinely non-overlapping tasks — by a worktree-isolated subagent. |
| `human` | Requires a human decision: architecture direction, priority/tradeoff calls, stakeholder comms, security-sensitive sign-off. Deferred and surfaced, never silently skipped. |

### How tasks get routed

One spec produces many tasks. The **local agent** (Claude Code or equivalent) decomposes the spec into Linear issues during the planning phase and applies a routing label to each one. The label determines who executes it.

```
Spec (one file in specs/)
  │
  └─ Local agent decomposes into tasks (Linear issues)
       │
       └─ spec-execution burns them down serially on feat/spec-NNN:
            ├─ Task A: label=claude-code  → implemented inline, merged, branch deleted
            ├─ Task B: label=claude-code  → implemented inline, merged, branch deleted
            ├─ Task C: label=human        → deferred and surfaced (a human does it)
            └─ Task D: label=claude-code  → implemented inline, merged, branch deleted
                                            (worktree-isolated subagents are the exception)
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

Once a spec is decomposed, **`spec-execution` delivers all of it in one run**: the agent running that skill is the executor. It arms a goal leash, cuts `feat/spec-NNN`, tracks every task on a visible task list, and implements them one at a time — each gated by its own tests and an executor self-review, each merged into the integration branch before the next begins. The per-task lifecycle below is the executor's view of a single task inside that loop.

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

- **Don't merge to `main`.** This rule is about **`main`**. Two merges exist and they are governed differently (ADR-003):
    - **Task PR → the spec integration branch `feat/spec-NNN`:** the delivery agent **merges these itself, immediately, as soon as the task's tests are green and its self-review is clean** — then deletes the branch. This is not a human-approval merge (nothing reaches `main`), and leaving a task PR open breaks the next task's base. See `spec-execution` §4.
    - **Integration PR → `main`:** **the human's, always.** Open it, get it panel-clean, and leave it open. There is no agent-merge exception, and no phrasing in a user message creates one.
    - Never push to `main` directly, and never merge anything else.
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
- **Claude Code / local orchestrator:** see `CLAUDE.md` for MCP access, Linear integration, running a delivery, local env capabilities
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
- **Entry triggers:** "execute this spec", "execute SPEC-NNN", "implement SPEC-NNN", "deliver SPEC-NNN", "finish SPEC-NNN", "run the spec", "start the execution loop", "dispatch the tasks"
- **Preconditions:** spec has status active and decomposed tasks with a dependency graph exist; the plan-review gate passes (ADR-002, fail-closed): the _index.yaml plan_review block is present, approved, and not needs-rework — verify with scripts/sdlc/plan-gate.mjs
- **Exit condition:** single-executor delivery (ADR-003): the owner skill armed a session goal leash (.claude/.sdlc-goal-<session_id>, enforced by the Stop hook), kept a visible task list covering every task plus end-to-end validation and the integration gate, cut the integration branch feat/spec-NNN off main, and burned the tasks down ITSELF one at a time — each task gated by its own tests (or the workspace equivalent) plus an executor self-review, landed via a short-lived PR into feat/spec-NNN that is merged and deleted before the next task starts, with no PR, branch or worktree left lingering; sub-agent fan-out is the exception, for large specs with genuinely non-overlapping tasks only, and carries the same merge discipline. End-to-end validation ran ONCE before the gate with attached evidence. Exit (success) = the goal file is status:met and ONE integration PR (feat/spec-NNN -> main) is open, carrying every spec success criterion mapped to its evidence, having survived a full multi-lens adversarial review panel — independently dispatched, every envelope validated with scripts/sdlc/validate-review-envelope.mjs, the constraints registry evaluated in full across the whole diff — looped until no blocker or major survives, and LEFT OPEN for the human to review and merge. Nothing for a spec reaches main except by merging that branch; the agent never merges or pushes to main. A HALT is goal file status:escalated with a surfaced reason — security/data-loss/payment risk, an owner decision, the same integration finding surviving two panel rounds, the amendment cap (spec.version reaching 4), or a task that cannot land and cannot be fixed at the root
- **Next step:** `spec-completion` — trigger: "close out SPEC-NNN"

### spec-completion

- **Owner skill:** `spec-completion`
- **Entry triggers:** "is this spec finished", "all tasks are merged", "verify the spec", "close out SPEC-NNN"
- **Preconditions:** all tasks for the spec are done or nearly done and the integration PR is merged — the delivery run's independent integration review already graded the success criteria, so completion does not re-grade (when the PR was opened outside a delivery run, with no integration-reviewer verdict on the record, verify the success criteria here)
- **Exit condition:** spec success criteria verified end-to-end and spec status set to a terminal state
- **Next step:** `none` (terminal phase)

### spec-amendment

- **Owner skill:** `spec-amendment`
- **Entry triggers:** "the spec assumed X but it is actually Y", "we need to add scope", "this acceptance criterion is untestable", "the design does not work", "the requirements changed"
- **Preconditions:** an active spec is found to be wrong, incomplete, or in need of change mid-flight; a spec is amendable IFF its status is active or draft — every other status (done, superseded, deprecated, cancelled) is CLOSED and immutable; route a change to a closed spec to a new spec (spec-authoring) or a bug spec under specs/bugs/ instead
- **Exit condition:** spec is amended (version bumped) and spec-reviewer re-signs off
- **Next step:** `task-decomposition` — trigger: "decompose SPEC-NNN"
<!-- sdlc:phases:end -->
