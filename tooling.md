# Tooling

Current and target tooling architecture for the AI-native SDLC.

## Stack comparison

| Layer       | Jira-era                                 | AI-native (target)                                          | Current (pragmatic)         |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Intent/spec | Confluence (separate, weakly linked)     | Schema-enforced markdown in repo with CI validation         | Schema-enforced markdown in repo |
| Work graph  | Jira (over-flexible, custom fields)      | Event-sourced graph with typed edges                        | The repo: `specs/`, `specs/intents.md`, `_index.yaml`, plus GitHub PRs and issues |
| Process spine | Tribal knowledge / wiki                | Executable state machine + phase memory + enforcement hooks | `.sdlc/state-machine.yaml` + per-spec `phase:` block + `.claude/hooks/` (Node) |
| Orchestration | Humans assign + chase                   | One agent delivering against a stated goal, with a machine-readable floor | `spec-execution` skill + goal leash (`.claude/hooks/stop-handoff.mjs`) |
| Execution   | Humans only                              | Agents as first-class assignees with run telemetry          | One executor, serial burn-down onto `feat/spec-NNN`, tracked on a visible task list (worktree-isolated subagents by exception) |
| Review      | Human PR review                          | LLM multi-lens panel, routed by change surface              | Self-review per guide step, then a routed adversarial panel on the integration PR (lenses from `review-constraints.yaml`); human merges it |
| CI/CD       | Jenkins/Actions                          | Same, plus eval pipelines                                   | GitHub Actions              |
| Reporting   | Jira dashboards (story points, velocity) | Graph queries (cost/feature, defect/spec, agent throughput) | `spec-index.json`, review logs, git history |

## Why no external work tracker

The framework once mirrored each spec into a Linear project. Since ADR-007 a spec is delivered from a short guide with no per-step issues, so every fact the tracker held already lives in the repo: intents in `specs/intents.md`, step status in `_index.yaml`, run evidence in the integration PR and `DECISIONS.md`. A second copy added a sync duty and no information, and the agent skipped it whenever the tracker was not connected. Bug intake uses GitHub issues, which the repo already has ([triage.md](triage.md)).

## Gaps in current tooling

None of the current tools provide:

1. **Run as a primitive** — agent executions aren't tracked as first-class objects anywhere
2. **Typed edges** — only basic relations (blocks, relates-to, duplicate)
3. **Event sourcing** — activity logs exist but aren't queryable as an event stream
4. ~~**Spec-as-root** — all tools are still ticket-first~~ **Solved.** Schema-enforced markdown specs with YAML frontmatter, CI validation, and auto-generated `spec-index.json`. See [spec-schema.md](skills/spec-schema.md).

### Interim solutions

| Gap | Workaround |
|-----|------------|
| Runs | The integration PR body and `specs/tasks/SPEC-NNN/DECISIONS.md` |
| Typed edges | Use labels + naming conventions on relations |
| Event sourcing | Git history of `specs/` |
| Spec-as-root | Schema-enforced markdown with frontmatter, CI validation, auto-generated index. See [spec-schema.md](skills/spec-schema.md) |

## Delivery model (decided)

`spec-execution` **is** the engine — a policy an agent applies with judgment above a machine-readable floor, not a fixed pipeline. A deterministic Workflow engine held this slot first and was retired after live measurement ([ADR-003](specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md)); the residual per-task ceremony, not the orchestration layer, was the cost.

- **One executor per spec:** the agent running the skill implements every guide step itself, keeping repo context across steps instead of rebuilding it in a fresh agent per step. Fan-out to worktree-isolated subagents is an exception for large, genuinely independent work.
- **Serial burn-down on one integration branch:** `feat/spec-NNN`, step N merged before step N+1 starts, nothing lingering between steps, nothing reaching `main` except by merging that branch.
- **Id-derived branches** (`claude/SPEC-NNN-S<n>`) → a resumed run recreates the same name rather than forking a differently-named one; the branch itself is deleted at merge, so resume is solely a read of `_index.yaml` status.
- **A repo-side persistence leash:** `.claude/.sdlc-goal-<session_id>` + the `Stop` hook keep a run from stopping half-done. `met` and `escalated` are the only release words; the leash is bounded by a hook-owned counter, expires 24h after `armed_at`, and fails open whenever that bound cannot be enforced.
- **Transparency by default:** a visible task list covering every guide step plus end-to-end validation and the gate, so the run is followable in-session.
- **Machine-checkable gates around the judgment:** `plan-gate.mjs` (fail-closed entry), `reviewer-routing.mjs` (lens → reviewer, from the registry), `validate-review-envelope.mjs` (every verdict), `check-review-constraint-globs.mjs` (registry rows resolve).
- **Runtime requirement:** Node.js (also runs the reference hooks).

## Review layer (decided)

The reviewer of record for code is an **LLM multi-lens panel**, not a human.

- **Routed by change surface:** lenses = `baseLenses(workspace) ∪ {constraints in [`review-constraints.yaml`](.sdlc/review-constraints.yaml) whose `when` matches the change}`. Matched constraint severity resolves the review tier. The registry is evaluated **in full at the integration gate**, across the whole diff — per-task matching on a narrowly declared `touches` set is unreliable in both directions.
- **One reviewer-output schema:** [`review-envelope.schema.json`](skills/review-envelope.schema.json) (severity blocker/major/nit/suggestion, altitude, grounded criteria). Every envelope is validated by [`.sdlc/scripts/validate-review-envelope.mjs`](.sdlc/scripts/validate-review-envelope.mjs) before anything routes on it — exit 0 fold, 2 abstained, 3 malformed/ungrounded; the latter two escalate and never read as a clean accept.
- **Contract:** [`review-primitives.md`](skills/review-primitives.md) — severity spine, grounding rules, severity→action policy.
- **Cheap gates first, expensive review once:** a step is gated by its own `Verify:` commands plus the executor's self-review; the independent panel is spent once, on the assembled integration diff, where it can see cross-task interactions. Humans gate the inputs and merge the integration PR.

## Process spine (decided)

- **State machine:** [`.sdlc/state-machine.yaml`](.sdlc/state-machine.yaml) is the single source of truth for phases, triggers, exit conditions, and per-workspace domain-skill routing. The `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` narrative and skill `## Handoff` footers are generated/validated from it (`${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-handoffs.mjs`, `validate-state-machine.mjs`).
- **Phase memory:** each `specs/tasks/SPEC-NNN/_index.yaml` may carry an additive `phase:` block (`{current, next_action, next_trigger, exit_condition_met, updated}`) so the process is resumable.
- **Reference hooks (Node, advisory by default):** `.claude/hooks/` — prompt→phase classifier, phase-exit handoff **and the delivery goal leash**, edit-without-task guard, review-identity guard. Wired via `.claude/settings.json` so they travel with the repo.

## Spec layer (decided)

Schema-enforced markdown in the repo. See [spec-schema.md](skills/spec-schema.md) for full details.

- **Format:** Markdown with required YAML frontmatter (id, status, version, initiative, owner, etc.)
- **Body:** Required sections (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks)
- **Validation:** CI check on every PR touching `specs/` — frontmatter, status transitions, reference resolution
- **Index:** Auto-generated `spec-index.json` — agents read this instead of scanning the directory
- **Templates:** `.sdlc/templates/spec.md`, `.sdlc/templates/adr.md`, `.sdlc/templates/bug.md`
- **Why not an external tool:** Specs must version with the code they describe. A spec updated in the same PR as the code change is reviewable, atomic, and doesn't require sync between systems.

## Future tooling candidates

- **Run telemetry:** Custom service, or adapt existing observability (OpenTelemetry traces for agent runs)
- **Event store:** EventStoreDB, or a simpler append-only Postgres table
- **Reporting:** Grafana/Metabase over the event store, replacing ticket-based dashboards
