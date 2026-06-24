# AI-Native SDLC

A practical framework for running agile software development with AI agents as first-class participants. Designed to replace ticket-centric workflows (Jira) with a spec-driven, run-observable model that serves business users, PMs, and developers.

## Principles

1. **Spec is the root, not the ticket.** Tickets are ephemeral projections; specs are the durable source of truth.
2. **Agents are assignees, not tools.** They have capabilities, budgets, audit trails, and observable runs.
3. **Runs are first-class.** Every agent execution is captured: prompt, tools, cost, evals, artifacts.
4. **Views are projections.** Boards, timelines, dashboards are queries over the work graph — not the schema itself.
5. **Bugs are spec violations.** Not a parallel system — a signal that reality disagrees with a prior spec.
6. **Judgment up front, deterministic execution behind.** *Quality when it's cheap to assure it — then autonomous execution.* Scarce human attention belongs in the front phases, before any code exists; execution is a deterministic engine.
7. **Humans give great instructions, not great reviews.** The deliverable of the front phases is a complete, unambiguous spec + AI-coherent task graph. The reviewer of record for code is an LLM multi-lens panel; humans gate the inputs and merge the final integration PR.

## The phase model — collaborate up front, then run

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → code-review → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (DETERMINISTIC)    (LLM)      (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── AUTONOMOUS ENGINE ──
```

- **Front (judgment) phases are collaborative and human-gated.** Multiple humans — owner/PM, eng lead, domain experts, stakeholders — collaborate on the intent, the spec, and the decomposition. *What* to build and *how* to split it require judgment, and quality is cheapest to assure here. Each phase ends at a hard sign-off gate. See [Roles](roles.md).
- **`spec-execution` is deterministic and autonomous.** Once the spec + task graph are signed off, the [execute-spec engine](.claude/workflows/execute-spec.js) runs the executor → Tier-0 gate → routed multi-lens review → fix loop → per-wave merge loop with no further human attention until the integration PR. Pure-core / effects-at-the-edges; id-derived branches; wave-level resume.
- **Review is LLM, not human.** A multi-lens reviewer panel grades each PR. Humans only merge the final integration PR to `main`.
- **The escape hatch.** When the engine finds the spec or decomposition is wrong (a `spec:*` or `task:scope` blocker), it escalates out of the loop into `spec-amendment` or `task-decomposition` re-planning — a judgment phase — then resumes.

The single source of truth for the phases is [`specs/sdlc-state-machine.yaml`](specs/sdlc-state-machine.yaml); the per-spec `phase:` block in each `_index.yaml` records where a spec is and makes the process resumable.

## Documents

| Doc | Purpose |
|-----|---------|
| [Spec Schema](spec-schema.md) | Spec, ADR, and bug spec formats, frontmatter schema, validation |
| [Task Schema](task-schema.md) | Task files, dependency graph, `touches`/`risk`/`tier`, phase memory |
| [Sync](sync.md) | Repo ↔ Linear sync: ownership model, sync rules, phased mechanism |
| [Agent Orchestration](agent-orchestration.md) | The deterministic execute-spec engine; worktree-isolated local executors behind it |
| [Work Graph](work-graph.md) | Data model — node types, edges, events |
| [Triage](triage.md) | Bug/defect lifecycle from signal to fix |
| [Roles](roles.md) | Human (front + merge) vs agent (execution) responsibilities |
| [Tooling](tooling.md) | Current stack choices and rationale |
| [Playbook](playbook.md) | How to run this on a real project |
| [Skill Architecture](skill-architecture.md) | Three-layer skill model: behavioral + SDLC process + domain |
| [Skills](skills.md) | Skill map, implementation order, relationship to .ai/ config |

### The spine and the execution engine

| Artifact | Purpose |
|----------|---------|
| [`specs/sdlc-state-machine.yaml`](specs/sdlc-state-machine.yaml) | Single source of truth for phases, triggers, exit conditions, transitions, and per-workspace domain-skill routing. The `.ai/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it. |
| [`.claude/workflows/execute-spec.js`](.claude/workflows/execute-spec.js) | Reference deterministic engine for `spec-execution` (pure-core / effects-at-edges). Shipped by bootstrap. |
| [`.ai/skills/review-constraints.yaml`](.ai/skills/review-constraints.yaml) | Lens/constraint registry keyed on a task's `touches`; `baseLenses` per workspace. Drives review-lens routing + tier. |
| [`.ai/skills/review-envelope.schema.json`](.ai/skills/review-envelope.schema.json) | The one reviewer-output schema (severity blocker/major/nit/suggestion, altitude, grounded criteria). |
| [`.ai/skills/review-primitives.md`](.ai/skills/review-primitives.md) | Human-readable runtime contract: severity spine, grounding rules, severity→action policy. |
| [`.claude/hooks/`](.claude/hooks/) | Reference enforcement hooks (Node, advisory by default): prompt→phase classifier, phase-exit handoff, edit-without-task guard, review-identity guard. Wired via `.claude/settings.json`. |

## Agent config (`.ai/` directory)

The SDLC is codified in `.ai/` so agents understand the process. Copy into each repo via `bootstrap.sh`.

| File | Who reads it | Purpose |
|------|-------------|---------|
| `.ai/project.md` | All agents + humans | Project-specific context: repo structure, commands, conventions, data architecture |
| `.ai/sdlc.md` | All agents | Agent-agnostic process: phase model, spec system, task lifecycle, boundaries, escalation |
| `.ai/CLAUDE.md` | Claude Code (or any local agent) | Local orchestrator config: MCP access, invoking the execution engine, the spine (state machine, hooks) |
| `.ai/AGENTS.md` | Any agent dispatched as an executor | Generic executor brief behind the engine: read the task file, stay within declared `touches`, open a PR to the integration branch, populate AC evidence |
| `.ai/setup.md` | Humans | Onboarding guide: prerequisites (incl. Node for hooks/engine), install steps, verification |
| `.ai/skills/` | Skill-aware agents | The SDLC skills + the runtime review contracts and `spec-execution` engine spec |

The local agent is the **orchestrator**: it shepherds a spec through the judgment phases with the humans, then **invokes the deterministic engine** (it does not hand-dispatch tasks). To switch local agents (e.g., Claude Code → Gemini CLI): adapt `.ai/CLAUDE.md` to the new agent's config format. The process in `sdlc.md`, the engine, and the executor brief stay the same.

## Onboarding a new developer

```bash
# From the sdlc/ directory:
./bootstrap.sh

# Or from within a target repo:
/path/to/sdlc/bootstrap.sh
```

The bootstrap script:
1. Checks prerequisites (Node.js — required for the hooks and the execution engine — Git, GitHub CLI)
2. Checks for Claude Code
3. Creates `specs/` and `.ai/` in the repo if missing
4. Copies spec templates, the state machine, the reference hooks + workflow, and the review contracts; wires `.claude/settings.json`

After running, fill in `.ai/project.md` (repo structure, commands, conventions, workspace map) and customize `.ai/CLAUDE.md` and the `WORKSPACES` map + example constraints in `.claude/workflows/execute-spec.js`.

## Distribution strategy

- **Pilot (now):** copy `.ai/` into each repo manually or via `bootstrap.sh`
- **Scale:** if the SDLC process stabilizes and you have many repos, build a lightweight `sdlc init` CLI that scaffolds everything and prompts for project-specific values
- **Don't use git submodules** — the sync tax isn't worth it for 3 small files that rarely change

## Current Stack

- **Work graph:** Linear (issues + relations + cycles)
- **Specs:** Schema-enforced markdown in repo (YAML frontmatter + required sections, CI-validated)
- **Process spine:** `specs/sdlc-state-machine.yaml` + per-spec `phase:` memory + reference hooks (Node) under `.claude/hooks/`
- **Execution:** the deterministic `execute-spec` Workflow engine (`.claude/workflows/execute-spec.js`); the local agent orchestrates, and the engine dispatches one worktree-isolated local executor per task — see [agent-orchestration.md](agent-orchestration.md)
- **Review:** LLM multi-lens panel (routed by `touches` via `review-constraints.yaml`); humans merge the integration PR
- **CI/CD:** GitHub Actions
- **Observability:** per-task run logs + optional append-only `_execution.log.jsonl`

## Status

Experimental. Being piloted on an upcoming major refactoring effort.
