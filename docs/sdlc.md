# AI-Native SDLC — Agent Operating Instructions

You are participating in an AI-native software development lifecycle. This document defines the process, your responsibilities, and how to interact with the system. Read this before starting any work.

## Principles

1. **Spec is the root, not the ticket.** Every feature, refactor, and bug traces back to a spec in `specs/`. Don't create work without a spec to anchor it.
2. **Agents are assignees.** You are a first-class participant — you get assigned specs, produce artifacts, and are accountable for your output.
3. **Runs are observable.** Log what you did, what it cost, and whether it passed. Your work must be auditable.
4. **Humans decide intent and priority.** You propose, draft, and implement. Humans approve specs, prioritize work, and make tradeoff calls.
5. **Judgment up front, autonomous delivery behind.** Scarce human attention belongs in the front phases, where it is cheapest to assure quality. Delivery is autonomous, and the rigor inside it is concentrated at one integration gate rather than spread thinly over every task. (See the phase model below.)
6. **Humans give great instructions, not great reviews.** The deliverable of the front phases is a complete, unambiguous spec + its short delivery guide. The reviewer of record for code is an LLM multi-lens panel; humans gate the inputs and merge the final integration PR.

## The phase model — collaborate up front, then run

```
intent-triage → spec-authoring (spec + delivery guide) │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)                          │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──     │  ── DELIVERY ──
```

- **Front (judgment) phases are collaborative and human-gated.** Multiple humans — owner/PM, eng
  lead, domain experts, stakeholders — collaborate on the intent and the spec. *What* to build and
  *in what order* require judgment. Quality is cheapest to assure here, before any code exists, so
  this is where human attention is spent. Each judgment phase ends at a hard sign-off gate.
- **`spec-execution` is autonomous single-executor delivery** (ADR-003). Once the spec and its
  delivery guide are signed off together (ADR-007), the owner pastes the kickoff prompt; one agent
  arms a goal leash, cuts `feat/spec-NNN`, and burns the guide's steps down **itself**, one at a
  time, behind a **visible task list** — each step gated by its own `Verify:` commands plus an
  executor self-review, merged into that branch before the next one starts. It is a policy the
  agent applies with judgment, not a fixed pipeline (see the `spec-execution` skill and its SOP).
- **Rigor is concentrated, not removed.** End-to-end validation runs **once** before the gate, and
  the single integration PR then faces a **multi-lens adversarial panel** — independently
  dispatched, every envelope validated, the constraints registry evaluated across the whole diff —
  looped until no blocker or major survives, to a maximum of three rounds (ADR-004). Review is LLM and happens **in-run**; there is no
  standalone review phase. Humans only merge that final integration PR to `main`.
- **The escape hatch back to judgment.** When delivery finds the guide is wrong (a `task:scope`
  blocker), it re-plans the guide in place and discloses the change in the integration PR. When it
  finds the spec is wrong (a `spec:*` blocker), it escalates out of the run into `spec-amendment` —
  a judgment phase — then resumes.

The single source of truth for the phases, their triggers, and transitions is
`.sdlc/state-machine.yaml`. The per-spec `phase:` block in each `_index.yaml` records where a
spec is and what comes next, making the process resumable.

## Spec system

All specs live in `specs/` in the repo. Every spec has YAML frontmatter and required body sections.

### Reading a spec

Before working on any step:
1. Read `specs/spec-index.json` to find the relevant spec by id or tag
2. Read the full spec file
3. Check the `status` field — only work on `active` specs
4. Read linked ADRs in `specs/adrs/` for design constraints
5. Check acceptance criteria — these are your definition of done

### Spec frontmatter fields

```yaml
id: SPEC-NNN          # unique identifier, referenced in guides and bugs
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

### One project per spec

Each spec is a Linear project; there is no per-step issue graph to mirror (ADR-007). The project
description links the spec, its delivery guide and its kickoff prompt.

```
Spec (one file in specs/) + delivery guide (specs/tasks/SPEC-NNN/GUIDE.md)
  │
  └─ spec-execution burns the steps down serially on feat/spec-NNN:
       ├─ S1                     → implemented inline, merged, branch deleted
       ├─ S2                     → implemented inline, merged, branch deleted
       ├─ S3 (Run by: owner)     → surfaced; a human does it; blocks the integration PR until done
       └─ S4                     → implemented inline, merged, branch deleted
                                   (worktree-isolated subagents are the exception)
```

Work that needs a human is data in the guide: a `Run by:` step for work only a human can perform,
and an owner decision for a call the agent must not make. A pending one of either blocks the
integration PR. Specs don't live in agent-specific folders; there is one `specs/` directory.

### Project conventions

- Project name: `SPEC-NNN: [spec title]`
- Project description must include:
  - Link to the spec file in the repo
  - Link to the delivery guide
  - Any constraints or ADR references
- Link the integration PR to the project

### Run logging

At each delivery milestone, post a Linear project update with:
```
**Run summary**
- Agent: [your identity]
- Duration: [time]
- Outcome: [success | failure | escalated]
- Artifacts: [PR link, test results]
- Acceptance criteria met: [list which ones]
```

## Delivery guide

Each spec's plan is a short **delivery guide** at `specs/tasks/SPEC-NNN/GUIDE.md`, written at the end
of spec authoring and approved by the owner in the same sign-off that makes the spec `active`
(ADR-007). Each step names the spec ACs it covers (`Covers:`), the paths it may change (`Changes:`)
and the commands that verify it (`Verify:`); the guide also lists owner decisions and the
end-to-end validation. Beside it, `_index.yaml` holds the `plan_review:` verdict, step and decision
statuses and the optional `phase:` memory block, and `KICKOFF.md` holds the prompt (at most 3,800
characters) the owner pastes to start delivery. `.sdlc/scripts/validate-guide.mjs` checks all three.
Schema: `skills/guide-schema.md`.

The executor already holds the spec, so a guide does not restate it. A guide over 10 steps means
the spec is too big: split the spec.

**`spec-execution` delivers all of it in one run**: the agent running that skill is the executor.
It arms a goal leash, cuts `feat/spec-NNN`, tracks every step on a visible task list, and implements
them one at a time — each gated by its own `Verify:` commands and an executor self-review, each
merged into the integration branch before the next begins. The step lifecycle below is the
executor's view of a single step inside that loop.

Each spec has a Linear project for human visibility. The repo owns definition and step status;
Linear owns priority and discussion.

### How to find your step

1. Your prompt or assignment references a spec ID and a step ID (e.g., SPEC-001, S3)
2. Read the parent spec at `specs/SPEC-NNN-*.md` — it is the brief
3. Read the step's block in `specs/tasks/SPEC-NNN/GUIDE.md`
4. Read earlier steps' `Notes:` for any contract your step must match
5. Read linked ADRs for constraints

### Step lifecycle

```
1. Read the spec and your step in GUIDE.md
2. Check _index.yaml — every step your step needs (After:, or all earlier steps) is done
3. Read linked ADRs
4. Implement against the acceptance criteria in the step's Covers:, inside its Changes:
5. Write or update tests — every acceptance criterion should have a test
6. Run the step's Verify: commands — all must pass
7. Open a PR titled "SPEC-NNN S<n>: <title>" with evidence per AC in the body
8. Log the run (a Linear project update if you have access, or in the PR description)
```

## What you must NOT do

- **Don't merge to `main`.** This rule is about **`main`**. Two merges exist and they are governed differently (ADR-003):
    - **Step PR → the spec integration branch `feat/spec-NNN`:** the delivery agent **merges these itself, immediately, as soon as the step's `Verify:` commands are green and its self-review is clean** — then deletes the branch. This is not a human-approval merge (nothing reaches `main`), and leaving a step PR open breaks the next step's base. See `spec-execution` §4.
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
- **Executor agents:** see `AGENTS.md` for the executor brief — how any agent dispatched to one guide step reads the spec and the step, stays within its `Changes:`, and opens a PR to the integration branch
- **Other agents:** follow this document. If you have capabilities beyond what's described here, document them in your agent-specific config.

<!-- sdlc:phases:start -->
<!-- GENERATED from .sdlc/state-machine.yaml by ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## SDLC phases

The phases below are generated from `.sdlc/state-machine.yaml` — the single,
machine-readable source of truth for the SDLC state machine. Each phase is owned by
a skill, has documented entry triggers, and hands off to the next phase on its exit
condition. **Do not hand-edit this section** — change the YAML and re-run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-handoffs.mjs`.

### intent-triage

- **Owner skill:** `intent-triage`
- **Entry triggers:** "I want to", "we need to", "we should", "brain dump", "review the intent backlog", "prioritize the backlog"
- **Preconditions:** one or more raw intents to capture or an existing intent backlog to review
- **Exit condition:** an intent is captured/prioritized in specs/intents.md and selected to spec out
- **Next step:** `spec-authoring` — trigger: "spec out intent #N"

### spec-authoring

- **Owner skill:** `spec-authoring`
- **Entry triggers:** "I want to build", "we need to refactor", "spec out", "new feature", "new initiative", "write the guide for"
- **Preconditions:** intent exists or owner confirms none is needed (or, for "write the guide for", the spec is active and has no guide)
- **Exit condition:** spec status flips draft -> active and plan_review.approved flips true in one owner sign-off (ADR-007), after spec-reviewer sign-off on the spec; specs/tasks/SPEC-NNN/GUIDE.md passes .sdlc/scripts/validate-guide.mjs, and KICKOFF.md (at most 3,800 characters) is written and shown to the owner
- **Next step:** `spec-execution` — trigger: "execute SPEC-NNN"

### spec-execution

- **Owner skill:** `spec-execution`
- **Entry triggers:** "execute this spec", "execute SPEC-NNN", "implement SPEC-NNN", "deliver SPEC-NNN", "finish SPEC-NNN", "run the spec", "start the execution loop"
- **Preconditions:** spec has status active and specs/tasks/SPEC-NNN/GUIDE.md passes .sdlc/scripts/validate-guide.mjs (ADR-007); the plan-review gate passes (ADR-002, fail-closed): the _index.yaml plan_review block is present, approved, and not needs-rework — verify with .sdlc/scripts/plan-gate.mjs
- **Exit condition:** single-executor delivery (ADR-003): the owner skill armed a session goal leash ($CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-<session_id>, enforced by the Stop hook), kept a visible task list covering every guide step plus end-to-end validation and the integration gate, cut the integration branch feat/spec-NNN off main, and burned the guide's steps down ITSELF one at a time — each step gated by its own Verify: commands plus an executor self-review, landed via a short-lived PR into feat/spec-NNN that is merged and deleted before the next step starts, with no PR, step branch or step worktree left lingering and the spec worktree removed at run exit (docs/worktrees.md in the SDLC plugin); guide changes mid-run are logged in DECISIONS.md and listed under "## Guide changes" in the integration PR; sub-agent fan-out is the exception, for large specs with steps whose After: closures and Changes: do not overlap, and carries the same merge discipline. End-to-end validation ran ONCE before the gate with attached evidence. Exit (success) = the goal file is status:met and ONE integration PR (feat/spec-NNN -> main) is open, carrying every spec success criterion mapped to its evidence, having survived a full multi-lens adversarial review panel — independently dispatched, every envelope validated with .sdlc/scripts/validate-review-envelope.mjs, the constraints registry evaluated in full across the whole diff — looped until no blocker or major survives OR the three-round cap (ADR-004) is reached with every survivor named in a "## Disclosed, not fixed" section of the PR body, and LEFT OPEN for the human to review and merge. Nothing for a spec reaches main except by merging that branch; the agent never merges or pushes to main. A HALT is goal file status:escalated with a surfaced reason — security/data-loss/payment risk, an owner decision, the amendment cap (spec.version reaching 4), or a step that cannot land and cannot be fixed at the root
- **Next step:** `spec-completion` — trigger: "close out SPEC-NNN"

### spec-completion

- **Owner skill:** `spec-completion`
- **Entry triggers:** "is this spec finished", "all steps are merged", "verify the spec", "close out SPEC-NNN"
- **Preconditions:** every guide step for the spec is done, cancelled, or deferred with a decided owner decision, and the integration PR is merged — the delivery run's independent integration review already graded the success criteria, so completion does not re-grade (when the PR was opened outside a delivery run, with no integration-reviewer verdict on the record, verify the success criteria here)
- **Exit condition:** spec success criteria verified end-to-end, spec status set to a terminal state, and the closed spec archived out of the default search path (archive-specs.mjs), unless a denylist clause holds it in the live corpus
- **Next step:** `none` (terminal phase)

### spec-amendment

- **Owner skill:** `spec-amendment`
- **Entry triggers:** "the spec assumed X but it is actually Y", "we need to add scope", "this acceptance criterion is untestable", "the design does not work", "the requirements changed"
- **Preconditions:** an active spec is found to be wrong, incomplete, or in need of change mid-flight; a spec is amendable IFF its status is active or draft — every other status (done, superseded, deprecated, cancelled) is CLOSED and immutable; route a change to a closed spec to a new spec (spec-authoring) or a bug spec under specs/bugs/ instead
- **Exit condition:** spec is amended (version bumped), spec-reviewer re-signs off, the guide is updated in the same commit (Covers: re-mapped, spec_version bumped) and passes .sdlc/scripts/validate-guide.mjs, KICKOFF.md is rewritten, and the owner re-approves plan_review; an active spec with no guide hands off to "write the guide for SPEC-NNN" instead
- **Next step:** `spec-execution` — trigger: "execute SPEC-NNN"
<!-- sdlc:phases:end -->
