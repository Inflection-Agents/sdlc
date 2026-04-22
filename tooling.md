# Tooling

Current and target tooling architecture for the AI-native SDLC.

## Stack comparison

| Layer       | Jira-era                                 | AI-native (target)                                          | Current (pragmatic)         |
| ----------- | ---------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| Intent/spec | Confluence (separate, weakly linked)     | Schema-enforced markdown in repo with CI validation         | Schema-enforced markdown in repo |
| Work graph  | Jira (over-flexible, custom fields)      | Event-sourced graph with typed edges                        | Linear (issues + relations) |
| Execution   | Humans only                              | Agents as first-class assignees with run telemetry          | Claude Code (local) + Jules (cloud, parallel) via REST API |
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
