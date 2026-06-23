# Roles

Clear boundaries between what AI agents do and what humans do at each stage of the SDLC.

## The shape: humans up front + at the merge; agents in the middle

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → review → spec-completion
  HUMAN + LLM     HUMAN + LLM       HUMAN + LLM       │   AGENT ENGINE   LLM PANEL  HUMAN + LLM
   ── collaborative, gated: human attention ──        │  ── autonomous: no human attention ──   ↑ merge
```

*Quality when it's cheap to assure it — then autonomous execution.* Scarce human attention is spent **up front** (intent, spec, decomposition) — where quality is cheapest to assure, before any code exists — and **at the merge** (a human merges the integration PR). In between, the engine executes and an **LLM multi-lens panel is the reviewer of record for code**. Humans set intent and give great *instructions*; humans are not the PR reviewers.

## Front-phase collaboration (multi-team, human + LLM)

The front phases are **collaborative judgment phases** where multiple humans contribute, the agent drafts and structures, and each phase ends at a **hard sign-off gate**. Who contributes what:

| Role | intent-triage | spec-authoring | task-decomposition |
|------|---------------|----------------|--------------------|
| **Owner / PM** | Owns the intent backlog; decides what's worth doing and the priority | Owns the spec; defines Problem, Success criteria, Scope (in/out); **signs off** to flip draft→active | Confirms scope is honored; approves the plan |
| **Eng lead** | Flags feasibility / sequencing | Owns the Design section; sets ADR constraints; names reviewers | **Owns the breakdown:** task boundaries, dependencies, routing; **signs off** the task graph |
| **Domain experts** | Surface domain intents | Validate domain assumptions; supply acceptance-criteria detail | Supply boundary constraints (contracts, schemas) for boundary tasks |
| **Stakeholders** | Raise needs | Review intent; confirm the spec solves their problem | — |
| **LLM (agent)** | Capture, normalize, prioritize-assist | Draft the spec; `spec-reviewer` grades it pre-gate | Build the AI-coherent task graph, declare `touches`/`risk`/`tier`/routing, self-review |

The collective deliverable is a **signed-off spec + an AI-coherent task graph** — complete, unambiguous *instructions* that let the engine run deterministically. Getting this right is the highest-leverage human work in the SDLC; bad decomposition is the top cause of a stalled or escalated run.

## Role matrix

| Stage | AI does | Human does |
|-------|---------|------------|
| **Discovery / intent** | Capture + normalize intents, research prior art, summarize feedback, prioritize-assist | Define the problem worth solving, set priority, validate with users |
| **Spec writing** | Draft specs from conversations, link ADRs, `spec-reviewer` grades the draft | Refine intent, decide in/out of scope, **sign off** to make the spec active |
| **Decomposition** | Build the AI-coherent task graph (bounded `touches`, routing), self-review, identify risks/deps | Confirm boundaries + dependencies + routing, **sign off** the task graph |
| **Execution** | The engine dispatches executors that write code/tests, open PRs, populate evidence | Nothing until the integration PR (the autonomous half) |
| **Code review** | **LLM multi-lens panel is the reviewer of record** — Tier-0 gate, routed lenses, integration-reviewer vs success criteria | — (humans gate inputs, not PRs) |
| **Integration** | Engine runs integration verification (EVIDENCE), opens the integration PR | **Merge the integration PR to `main`** (the engine never does) |
| **Completion** | Verify success criteria end-to-end, propose terminal state | Confirm completion, own the call |
| **Triage** | Capture signals, normalize bug specs, attempt reproduction, classify | Confirm bugs, prioritize, decide tradeoffs |
| **Deploy** | Execute deployment steps, monitor rollout | Approve releases, decide rollback |
| **Incident response** | Correlate signals, draft timelines, propose fixes | Own communication, make severity calls, authorize hotfixes |

## What stays human forever

- **Intent + instructions** — deciding what the system *should* do and writing the unambiguous spec + task graph that defines it (the front-phase sign-off gates)
- **The integration merge** — a human merges the integration PR to `main`; the engine never does
- **Judgment calls on tradeoffs** — ship vs fix, customer X vs customer Y, tech debt vs velocity
- **Stakeholder relationships** — talking to the affected user, negotiating with other teams
- **Accountability** — severity, SLA, "who owns this"
- **Architecture vision** — agents suggest, humans decide direction

## Agent roles in the autonomous half

Execution is not one agent — it is a deterministic **engine** dispatching specialized agent roles. The local agent's job here is to invoke the engine and handle its escalations; the rest is the script's.

| Agent role | Responsibility |
|------------|----------------|
| **Orchestrator engine** | The deterministic `execute-spec` Workflow: plans waves, gates on Tier-0, routes review, runs the fix loop, merges into the integration branch, opens the integration PR. Pure-core/effects-at-edges. |
| **Executor** | Implements one task against its `touches`, self-verifies, opens/updates its PR, populates each AC's evidence. The engine's worktree-isolated local executor. |
| **Tester / Tier-0** | The cheap, attributable per-task gate (lint, typecheck, unit). No reviewer runs while it is red. |
| **Reviewers (multi-lens panel)** | The reviewer of record for code. `task-reviewer` (folded generic lenses) + specialist reviewers (e.g. invariants, design-fidelity) selected by `touches`. Emit graded, grounded envelopes. |
| **Integration-reviewer** | Independent review of the integration PR against the spec's **success criteria**, not just per-task ACs. |

## Agent operating model

Think of the agent as a **very fast, tireless junior engineer who drafts well from great instructions** — so the human's leverage is in the instructions (front phases) and the final merge, not in per-PR review.

### Agent capabilities
- Read all code, specs, docs, git history
- Write code, tests, and documentation
- Open PRs and respond to review feedback
- Run builds, tests, and evals
- Search error logs and monitoring
- Draft specs, plans, and bug reports

### Agent constraints
- Cannot merge without human approval
- Cannot deploy without human approval
- Cannot close bugs without human confirmation
- Cannot make priority decisions
- Cannot communicate with external users
- Must cite sources for all claims
- Must self-report confidence levels
- Must escalate on security, data, and payment issues

### Agent budget
Each run has a budget:
- Token limit per run
- Wall-clock timeout
- Maximum tool calls
- Cost ceiling

If the agent hits a budget limit, it escalates with a summary of progress and what it needs to continue.
