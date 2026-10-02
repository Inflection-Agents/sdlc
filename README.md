# AI-Native SDLC

A practical framework for running agile software development with AI agents as first-class participants. Designed to replace ticket-centric workflows (Jira) with a spec-driven, run-observable model that serves business users, PMs, and developers.

## Principles

1. **Spec is the root, not the ticket.** Tickets are ephemeral projections; specs are the durable source of truth.
2. **Agents are assignees, not tools.** They have capabilities, budgets, audit trails, and observable runs.
3. **Runs are first-class.** Every agent execution is captured: prompt, tools, cost, evals, artifacts.
4. **Views are projections.** Boards, timelines, dashboards are queries over the work graph — not the schema itself.
5. **Bugs are spec violations.** Not a parallel system — a signal that reality disagrees with a prior spec.
6. **Judgment up front, autonomous delivery behind.** *Quality when it's cheap to assure it — then one agent delivers.* Scarce human attention belongs in the front phases, before any code exists; delivery is autonomous, and its rigor is concentrated at a single integration gate rather than spread thinly over every task.
7. **Humans give great instructions, not great reviews.** The deliverable of the front phases is a complete, unambiguous spec + AI-coherent task graph. The reviewer of record for code is an LLM multi-lens panel; humans gate the inputs and merge the final integration PR.

## Install

```
/plugin install sdlc@inflection-agents
/sdlc-init      # scaffolds this repo, then interviews for YOUR review constraints
```

`/sdlc-init` asks about your workspaces, layer boundaries and security surfaces, writes
a constraints registry from your answers, and then proves every generated rule against
your actual tree before keeping it. A rule whose glob matches nothing is dropped, not
shipped.

After a later plugin update, `/sdlc-sync` refreshes the repo-local half.

### What lives where, and why it matters on update

The plugin owns what nobody edits. Your repo owns what you edit, plus anything CI reads.

| | Where | On a plugin update |
| --- | --- | --- |
| Skills, agents, hooks, the two review contracts | Plugin | Replaced — that is the point |
| `.sdlc/config.yaml` (workspaces, `domain_routing`, extensions), `.sdlc/review-constraints.yaml`, the `AGENTS.md` content, `specs/` | Your repo | **Never touched** (a migration rewrites layout-1 paths in live specs, once) |
| Validators and CI workflows | Your repo | Refreshed only when you run `/sdlc-sync` |

A plugin cannot create directories in your repo, and a GitHub Actions runner checks out
your repo rather than the plugin cache — so the gates have to live with you. The upside
is that your laws survive every upgrade.

`bootstrap.sh` still works for a repo that would rather not install a plugin, but it is
copy-once: nothing it installs is ever updated.

## The phase model — collaborate up front, then run

```
intent-triage → spec-authoring (spec + delivery guide) │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)                          │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──     │  ── DELIVERY ──
```

- **Front (judgment) phases are collaborative and human-gated.** Multiple humans — owner/PM, eng lead, domain experts, stakeholders — collaborate on the intent, the spec, and its delivery guide. *What* to build and *in what order* require judgment, and quality is cheapest to assure here. Each phase ends at a hard sign-off gate. See [Roles](roles.md).
- **`spec-execution` is autonomous single-executor delivery** ([ADR-003](specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md)). Once the spec and its short delivery guide are signed off together ([ADR-007](specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md)), the owner pastes the generated kickoff prompt; one agent arms a persistence goal leash, cuts `feat/spec-NNN`, and burns the guide's steps down itself — one at a time, behind a visible task list, each gated by its own `Verify:` commands plus an executor self-review and merged before the next starts. A deterministic Workflow engine used to do this; it was measured and retired for cost.
- **Rigor is concentrated, not removed.** End-to-end validation runs once, then the single integration PR faces a multi-lens adversarial panel — independently dispatched, every envelope validated, the constraints registry evaluated across the whole diff — looped until no blocker or major survives (at most three rounds, ADR-004). Review is LLM and happens in-run; there is no standalone review phase. Humans only merge that final PR to `main`.
- **The escape hatch.** When a run finds the guide is wrong (a `task:scope` blocker), it re-plans the guide in place and discloses the change in the integration PR. When it finds the spec is wrong (a `spec:*` blocker), it escalates into `spec-amendment` — a judgment phase — then resumes.

The single source of truth for the phases is [`.sdlc/state-machine.yaml`](.sdlc/state-machine.yaml); the per-spec `phase:` block in each `_index.yaml` records where a spec is and makes the process resumable.

> **Archived specs.** A spec whose status reaches a terminal value moves under
> `specs/archive/` and is hidden from default search, while staying tracked in git —
> unless a live skill cites it or a non-archived ADR binds it, which holds it in the
> live corpus on purpose.
> Resolve any id with `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs resolve SPEC-NNN`, or search with
> `rg --no-ignore`. See [`.ignore`](.ignore) for why position beats a status label.

## Documents

| Doc | Purpose |
|-----|---------|
| [Spec Schema](skills/spec-schema.md) | Spec, ADR, and bug spec formats, frontmatter schema, validation |
| [Guide Schema](skills/guide-schema.md) | Delivery guide, `_index.yaml` step and decision statuses, plan-review and phase-memory blocks, the 3,800-character kickoff prompt |
| [Sync](sync.md) | Repo ↔ Linear sync: ownership model, sync rules, phased mechanism |
| [Agent Orchestration](agent-orchestration.md) | Goal-oriented single-executor delivery; the worktree-isolated subagent exception |
| [Work Graph](work-graph.md) | Data model — node types, edges, events |
| [Triage](triage.md) | Bug/defect lifecycle from signal to fix |
| [Roles](roles.md) | Human (front + merge) vs agent (delivery) responsibilities |
| [Tooling](tooling.md) | Current stack choices and rationale |
| [Playbook](playbook.md) | How to run this on a real project |
| [Skill Architecture](skill-architecture.md) | Three-layer skill model: behavioral + SDLC process + domain |
| [Skills](skills.md) | Skill map, implementation order, relationship to the `.sdlc/` config |

### The spine

| Artifact | Purpose |
|----------|---------|
| [`.sdlc/state-machine.yaml`](.sdlc/state-machine.yaml) | Single source of truth for phases, triggers, exit conditions, transitions, and per-workspace domain-skill routing. The `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it. |
| [`.sdlc/scripts/`](.sdlc/scripts/) | Validators and delivery gates: state machine + phase memory, handoff generation, the fail-closed `plan-gate.mjs`, registry-driven `reviewer-routing.mjs`, `validate-review-envelope.mjs`, and the registry checkers. **Copied into your repo by `/sdlc-init`**, because a GitHub Actions runner checks out your repo, not the plugin cache. |
| [`.sdlc/review-constraints.yaml`](.sdlc/review-constraints.yaml) | Lens/constraint registry keyed on changed paths (`touches` globs); `baseLenses` per workspace. Drives review-lens routing + tier. Lives outside `skills/` because every repo replaces its rows with its own invariants. |
| [`skills/review-envelope.schema.json`](skills/review-envelope.schema.json) | The one reviewer-output schema (severity blocker/major/nit/suggestion, altitude, grounded criteria). |
| [`skills/review-primitives.md`](skills/review-primitives.md) | Human-readable runtime contract: severity spine, grounding rules, severity→action policy. |
| [`hooks/`](hooks/) | Enforcement hooks (Node, advisory by default): prompt→phase classifier, phase-exit handoff **and the delivery goal leash**, edit-without-task guard, review-identity guard. **Ship with the plugin** and are wired by `hooks/hooks.json`; this repo also wires them locally via `.claude/settings.json` so it can run them on itself. |

## Where the SDLC files live (`.sdlc/`, ADR-008)

An adopting repo keeps everything the framework puts in it under one folder, `.sdlc/`, plus the
project context in root `AGENTS.md`. `/sdlc-init` writes this tree, and `/sdlc-sync` migrates a
repo that still uses the older `.ai/` layout to it, on a branch for review.

| Path | Who reads it | Purpose |
|------|-------------|---------|
| `AGENTS.md` (the SDLC block) | All agents + humans | Project context: what the product is, layout, boundaries, conventions. `CLAUDE.md` imports it with `@AGENTS.md`. |
| `.sdlc/config.yaml` | Validators, hooks, skills | Workspaces (paths, test and build commands, agent eligibility, domain skills), `domain_routing`, `extensions`, `scan.allow`. Schema: [`skills/sdlc-config-schema.md`](skills/sdlc-config-schema.md). |
| `.sdlc/review-constraints.yaml` | The review panel | The repo's own laws, routed by changed path. |
| `.sdlc/state-machine.yaml` | Hooks, validators | The phase spine. Framework-owned and refreshed by every sync. |
| `.sdlc/scripts/`, `.sdlc/templates/`, `.sdlc/contracts/` | CI, skills | The validators CI runs, the copy-and-fill templates, and the review contracts. |
| `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` | All agents | Agent-agnostic process: phase model, spec system, delivery guide, boundaries, escalation. |
| `${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md` | Any agent handed a single guide step | Generic executor brief: read the spec and the step, stay within its `Changes:`, run its `Verify:`, self-review, open a PR to the integration branch with AC evidence. |
| `${CLAUDE_PLUGIN_ROOT}/docs/setup.md` | Humans | Onboarding guide: prerequisites (incl. Node for hooks/validators), install steps, verification. |

The local agent is the **orchestrator and the executor**: it shepherds a spec through the judgment phases with the humans, then delivers it itself through `spec-execution`. To switch local agents (e.g., Claude Code → Gemini CLI), point the new agent's config file at `AGENTS.md`. The process doc, the skills and the executor brief stay the same.

## Onboarding a new developer

```bash
# From the sdlc/ directory:
./bootstrap.sh

# Or from within a target repo:
/path/to/sdlc/bootstrap.sh
```

The bootstrap script:
1. Checks prerequisites (Node.js — required for the hooks and the `.sdlc/scripts/` validators — Git, GitHub CLI)
2. Checks for Claude Code
3. Stops on a repo still on the `.ai/` layout and points at the migration
4. Installs the `.sdlc/` payload, the SDLC block in `AGENTS.md`, the skills in `.sdlc/skills/` (linked from `.claude/skills`), the hooks with their `lib/`, and the reviewer agents; wires `.claude/settings.json`

After running, fill in the SDLC block in `AGENTS.md` (repo structure, conventions) and the workspaces in `.sdlc/config.yaml` (paths, commands, eligibility, domain skills), replace the example rows in `.sdlc/review-constraints.yaml` with your repo's real constraints, and fill the per-workspace verification commands into `skills/spec-execution/SOP.md` §3 and §6.

## Distribution

The plugin is the path: `/plugin install sdlc@inflection-agents`, then `/sdlc-init`.
`bootstrap.sh` remains for a repo that cannot install a plugin, and is copy-once — it
receives no future release without a manual diff.

## Current Stack

- **Work graph:** Linear (issues + relations + cycles)
- **Specs:** Schema-enforced markdown in repo (YAML frontmatter + required sections, CI-validated)
- **Process spine:** `.sdlc/state-machine.yaml` + per-spec `phase:` memory + reference hooks (Node) under `.claude/hooks/`
- **Delivery:** goal-oriented single-executor `spec-execution` — the local agent implements the spec itself, serially, on one integration branch, with worktree-isolated subagents only as an exception — see [agent-orchestration.md](agent-orchestration.md)
- **Review:** in-run — executor self-review per task, then an LLM multi-lens adversarial panel on the integration PR (lenses routed by `review-constraints.yaml`, envelopes validated); humans merge that PR
- **CI/CD:** GitHub Actions
- **Observability:** per-task run logs + optional append-only `_execution.log.jsonl`

## Status

Experimental. Being piloted on an upcoming major refactoring effort.
