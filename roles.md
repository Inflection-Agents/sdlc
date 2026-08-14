# Roles

Clear boundaries between what AI agents do and what humans do at each stage of the SDLC.

## The shape: humans up front + at the merge; agents in the middle

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → spec-completion
  HUMAN + LLM     HUMAN + LLM       HUMAN + LLM       │  ONE EXECUTOR     HUMAN + LLM
                                                      │  + panel at the gate
   ── collaborative, gated: human attention ──        │  ── autonomous: no human attention ──   ↑ merge
```

*Quality when it's cheap to assure it — then autonomous delivery.* Scarce human attention is spent **up front** (intent, spec, decomposition) — where quality is cheapest to assure, before any code exists — and **at the merge** (a human merges the integration PR). In between, the engine executes and an **LLM multi-lens panel is the reviewer of record for code**. Humans set intent and give great *instructions*; humans are not the PR reviewers.

## Front-phase collaboration (multi-team, human + LLM)

The front phases are **collaborative judgment phases** where multiple humans contribute, the agent drafts and structures, and each phase ends at a **hard sign-off gate**. Who contributes what:

| Role | intent-triage | spec-authoring | task-decomposition |
|------|---------------|----------------|--------------------|
| **Owner / PM** | Owns the intent backlog; decides what's worth doing and the priority | Owns the spec; defines Problem, Success criteria, Scope (in/out); **signs off** to flip draft→active | Confirms scope is honored; approves the plan |
| **Eng lead** | Flags feasibility / sequencing | Owns the Design section; sets ADR constraints; names reviewers | **Owns the breakdown:** task boundaries, dependencies, routing; **signs off** the task graph |
| **Domain experts** | Surface domain intents | Validate domain assumptions; supply acceptance-criteria detail | Supply boundary constraints (contracts, schemas) for boundary tasks |
| **Stakeholders** | Raise needs | Review intent; confirm the spec solves their problem | — |
| **LLM (agent)** | Capture, normalize, prioritize-assist | Draft the spec; `spec-reviewer` grades it pre-gate | Build the AI-coherent task graph, declare `touches`/`risk`/`tier`/routing, self-review |

The collective deliverable is a **signed-off spec + an AI-coherent task graph** — complete, unambiguous *instructions* that let one executor deliver the spec without stalling or escalating. Getting this right is the highest-leverage human work in the SDLC; bad decomposition is the top cause of a stalled or escalated run.

## Role matrix

| Stage | AI does | Human does |
|-------|---------|------------|
| **Discovery / intent** | Capture + normalize intents, research prior art, summarize feedback, prioritize-assist | Define the problem worth solving, set priority, validate with users |
| **Spec writing** | Draft specs from conversations, link ADRs, `spec-reviewer` grades the draft | Refine intent, decide in/out of scope, **sign off** to make the spec active |
| **Decomposition** | Build the AI-coherent task graph (bounded `touches`, routing), self-review, identify risks/deps | Confirm boundaries + dependencies + routing, **sign off** the task graph |
| **Delivery** | One agent implements every task itself — code/tests, self-review, a short-lived PR per task onto the integration branch, evidence populated — tracked on a visible task list | Nothing until the integration PR (the autonomous half); the task list is there to follow along if you want to |
| **Code review** | **In-run**: executor self-review per task, then the **LLM multi-lens adversarial panel** on the integration PR — routed lenses, validated envelopes, integration-reviewer vs success criteria | — (humans gate inputs, not per-task PRs) |
| **Integration** | Runs end-to-end validation once (EVIDENCE), opens the integration PR, loops the panel until clean, leaves it open | **Merge the integration PR to `main`** (the agent never does) |
| **Completion** | Verify success criteria end-to-end, propose terminal state | Confirm completion, own the call |
| **Triage** | Capture signals, normalize bug specs, attempt reproduction, classify | Confirm bugs, prioritize, decide tradeoffs |
| **Deploy** | Execute deployment steps, monitor rollout | Approve releases, decide rollback |
| **Incident response** | Correlate signals, draft timelines, propose fixes | Own communication, make severity calls, authorize hotfixes |

## What stays human forever

- **Intent + instructions** — deciding what the system *should* do and writing the unambiguous spec + task graph that defines it (the front-phase sign-off gates)
- **The integration merge** — a human merges the integration PR to `main`; the agent never does, and no phrasing in a request creates an exception
- **Judgment calls on tradeoffs** — ship vs fix, customer X vs customer Y, tech debt vs velocity
- **Stakeholder relationships** — talking to the affected user, negotiating with other teams
- **Accountability** — severity, SLA, "who owns this"
- **Architecture vision** — agents suggest, humans decide direction

## Agent roles in the autonomous half

Delivery is **one executor plus a review panel at the end** — not a fan-out of agents per task. The local agent runs `spec-execution`, and that skill *is* the engine.

| Agent role | Responsibility |
|------------|----------------|
| **Delivery agent (executor)** | Checks the plan gate, arms the goal leash, keeps the visible task list, cuts `feat/spec-NNN`, implements every task against its `touches`, verifies, **self-reviews its own diff**, merges each task onto the branch, validates end-to-end once, and opens the integration PR. |
| **Dispatched executor (exception)** | Same brief (`.ai/AGENTS.md`), for a large spec with genuinely non-overlapping tasks. Always `isolation: "worktree"`; same merge discipline. |
| **Reviewers (multi-lens panel)** | The reviewer of record for code, dispatched at the integration gate. `task-reviewer` (folded generic lenses) + specialist reviewers (e.g. invariants, security, design-fidelity) selected from the registry across the whole diff. Emit graded, grounded envelopes; never fix. |
| **Integration-reviewer** | Independent review of the integration PR against the spec's **success criteria**, not just per-task ACs. |

The self-review inside a task is the deliberate exception to author≠reviewer independence, and it is bought back in full at the gate, where every verdict comes from a separately dispatched reviewer.

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
