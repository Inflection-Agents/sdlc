# Tooling

Current and target tooling architecture for the AI-native SDLC.

## Stack comparison

| Layer       | Jira-era                                 | AI-native (target)                                          | Current (pragmatic)         |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Intent/spec | Confluence (separate, weakly linked)     | Schema-enforced markdown in repo with CI validation         | Schema-enforced markdown in repo |
| Work graph  | Jira (over-flexible, custom fields)      | Event-sourced graph with typed edges                        | Linear (issues + relations) |
| Process spine | Tribal knowledge / wiki                | Executable state machine + phase memory + enforcement hooks | `specs/sdlc-state-machine.yaml` + per-spec `phase:` block + `.claude/hooks/` (Node) |
| Orchestration | Humans assign + chase                   | Deterministic engine (pure-core/effects-at-edges)           | `execute-spec` Workflow script (`.claude/workflows/execute-spec.js`) |
| Execution   | Humans only                              | Agents as first-class assignees with run telemetry          | Worktree-isolated local executors dispatched **by the engine** (parallel per wave) |
| Review      | Human PR review                          | LLM multi-lens panel, routed by change surface              | Routed reviewers (lenses from `review-constraints.yaml`); human merges integration PR |
| CI/CD       | Jenkins/Actions                          | Same, plus eval pipelines                                   | GitHub Actions              |
| Reporting   | Jira dashboards (story points, velocity) | Graph queries (cost/feature, defect/spec, agent throughput) | Linear insights + manual    |

## Why Linear over alternatives

| Criteria | Linear | Jira | ClickUp | GitHub Issues |
|----------|--------|------|---------|---------------|
| API quality | GraphQL, clean schema | REST, sprawling | REST, inconsistent | GraphQL, decent |
| Agent compatibility | MCP server, rigid schema = portable agents | Custom fields per project = agents need per-project adapters | Too many ways to model same concept | Good API, weak hierarchy |
| Data model | Opinionated, small primitives | Maximally flexible | Maximally flexible | Minimal |
| Speed/UX | Fast, keyboard-first | Slow, menu-heavy | Feature-dense, slower | Adequate |
| AI-native features | Agent-assignable issues | Rovo (bolted on) | Limited | Copilot coding agent |

Linear wins because rigidity is a feature for agents: an agent that works on one Linear workspace works on all of them.

## Gaps in current tooling

None of the current tools provide:

1. **Run as a primitive** — agent executions aren't tracked as first-class objects anywhere
2. **Typed edges** — only basic relations (blocks, relates-to, duplicate)
3. **Event sourcing** — activity logs exist but aren't queryable as an event stream
4. ~~**Spec-as-root** — all tools are still ticket-first~~ **Solved.** Schema-enforced markdown specs with YAML frontmatter, CI validation, and auto-generated `spec-index.json`. See [spec-schema.md](spec-schema.md).

### Interim solutions

| Gap | Workaround |
|-----|------------|
| Runs | Log to a side store (structured JSON per run), link from Linear issue comments |
| Typed edges | Use labels + naming conventions on relations |
| Event sourcing | Linear webhooks → append-only log (could be a simple DB or even a file) |
| Spec-as-root | Schema-enforced markdown with frontmatter, CI validation, auto-generated index. See [spec-schema.md](spec-schema.md) |

## MCP integration

Linear's MCP server enables agents to:
- Create, update, and query issues
- Manage cycles and projects
- Read and write comments
- Follow issue relations

Claude Code connects to Linear via MCP, making the agent a direct participant in the work graph rather than operating through a human proxy.

## Execution engine (decided)

`spec-execution` is a **deterministic Workflow engine**, not an agent improvising — reference implementation at [`.claude/workflows/execute-spec.js`](.claude/workflows/execute-spec.js).

- **Pure-core / effects-at-the-edges:** routing, tier resolution, lens selection, verdict folding, branch naming, and wave planning are total functions; only thin `agent()` wrappers touch a model. The run is reproducible and auditable.
- **Idempotent, id-derived branches** (`claude/SPEC-NNN-TASK-NNN`, integration `feat/SPEC-NNN`) → re-runs reuse the same branch/PR; resume is wave-level.
- **Executors are interchangeable workers behind it:** the engine dispatches one worktree-isolated local executor per task. The engine is agent-agnostic — specialization is data on the task, not a named backend.
- **Runtime requirement:** Node.js (also runs the reference hooks).

## Review layer (decided)

The reviewer of record for code is an **LLM multi-lens panel**, not a human.

- **Routed by change surface:** lenses = `baseLenses(workspace) ∪ {constraints in [`review-constraints.yaml`](.ai/skills/review-constraints.yaml) whose `when` matches the task's `touches`}`. Matched constraint severity resolves the review tier.
- **One reviewer-output schema:** [`review-envelope.schema.json`](.ai/skills/review-envelope.schema.json) (severity blocker/major/nit/suggestion, altitude, grounded criteria). The engine validates every envelope before routing on it; malformed/abstained → escalate.
- **Contract:** [`review-primitives.md`](.ai/skills/review-primitives.md) — severity spine, grounding rules, severity→action policy.
- **Tier-0 first:** cheap per-workspace lint/typecheck/unit gate runs before any reviewer is dispatched (the largest token-cost optimization). Humans gate the inputs and merge the integration PR.

## Process spine (decided)

- **State machine:** [`specs/sdlc-state-machine.yaml`](specs/sdlc-state-machine.yaml) is the single source of truth for phases, triggers, exit conditions, and per-workspace domain-skill routing. The `.ai/sdlc.md` narrative and skill `## Handoff` footers are generated/validated from it (`scripts/sdlc/gen-handoffs.mjs`, `validate-state-machine.mjs`).
- **Phase memory:** each `specs/tasks/SPEC-NNN/_index.yaml` may carry an additive `phase:` block (`{current, next_action, next_trigger, exit_condition_met, updated}`) so the process is resumable.
- **Reference hooks (Node, advisory by default):** `.claude/hooks/` — prompt→phase classifier, phase-exit handoff, edit-without-task guard, review-identity guard. Wired via `.claude/settings.json` so they travel with the repo.

## Spec layer (decided)

Schema-enforced markdown in the repo. See [spec-schema.md](spec-schema.md) for full details.

- **Format:** Markdown with required YAML frontmatter (id, status, version, initiative, owner, etc.)
- **Body:** Required sections (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks)
- **Validation:** CI check on every PR touching `specs/` — frontmatter, status transitions, reference resolution
- **Index:** Auto-generated `spec-index.json` — agents read this instead of scanning the directory
- **Templates:** `templates/spec.md`, `templates/adr.md`, `templates/bug.md`
- **Why not an external tool:** Specs must version with the code they describe. A spec updated in the same PR as the code change is reviewable, atomic, and doesn't require sync between systems.

## Future tooling candidates

- **Run telemetry:** Custom service, or adapt existing observability (OpenTelemetry traces for agent runs)
- **Event store:** EventStoreDB, or a simpler append-only Postgres table
- **Reporting:** Grafana/Metabase over the event store, replacing ticket-based dashboards
