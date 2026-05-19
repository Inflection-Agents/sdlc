# AI-Native SDLC

A practical framework for running agile software development with AI agents as first-class participants. Designed to replace ticket-centric workflows (Jira) with a spec-driven, run-observable model that serves business users, PMs, and developers.

## Principles

1. **Spec is the root, not the ticket.** Tickets are ephemeral projections; specs are the durable source of truth.
2. **Agents are assignees, not tools.** They have capabilities, budgets, audit trails, and observable runs.
3. **Runs are first-class.** Every agent execution is captured: prompt, tools, cost, evals, artifacts.
4. **Views are projections.** Boards, timelines, dashboards are queries over the work graph — not the schema itself.
5. **Bugs are spec violations.** Not a parallel system — a signal that reality disagrees with a prior spec.

## Current state

This framework is dogfooded on itself. The `specs/` directory is the live backlog:

- [`specs/SPEC-001-tiered-code-review.md`](specs/SPEC-001-tiered-code-review.md) — graded review primitives (blocker / major / nit / suggestion) and the PR merge policy
- [`specs/SPEC-002-spec-execution-orchestration.md`](specs/SPEC-002-spec-execution-orchestration.md) — wave-based task execution and the Claude Code + Jules orchestration model
- [`specs/intents.md`](specs/intents.md) — live backlog of incoming intents before they become specs

See [`specs/_index.md`](specs/_index.md) for the full spec index.

## Documents

| Doc | Purpose |
|-----|---------|
| [Spec Schema](spec-schema.md) | Spec, ADR, and bug spec formats, frontmatter schema, validation |
| [Task Schema](task-schema.md) | Task files, dependency graph, agent dispatch |
| [Playbook](playbook.md) | How to run this on a real project |
| [Skill Architecture](skill-architecture.md) | Three-layer skill model: behavioral + SDLC process + domain |
| [Skills](skills.md) | Skill map, implementation order, relationship to .ai/ config |
| [Spec Index](specs/_index.md) | The framework's own dogfooded backlog |

## Agent config (`.ai/` directory)

The SDLC is codified in `.ai/` so agents understand the process. Copy into each repo via `bootstrap.sh`.

| File | Who reads it | Purpose |
|------|-------------|---------|
| `.ai/project.md` | All agents + humans | Project-specific context: repo structure, commands, conventions, data architecture |
| `.ai/sdlc.md` | All agents | Agent-agnostic process: spec system, task lifecycle, boundaries, escalation |
| `.ai/CLAUDE.md` | Claude Code (or any local agent) | MCP access, Jules orchestration, labeling workflow |
| `.ai/AGENTS.md` | Jules (or any cloud agent) | VM constraints, how to read specs from repo, PR conventions |
| `.ai/setup.md` | Humans | Onboarding guide: prerequisites, install steps, verification, troubleshooting |
| `.ai/skills/` | Claude Code (via `.claude/skills/` symlink) | SDLC + domain skills sourced from this framework; `bootstrap.sh` creates `.claude/skills/` as a symlink here |

To switch local agents (e.g., Claude Code → Gemini CLI): adapt `.ai/CLAUDE.md` to the new agent's config format. The process in `sdlc.md` stays the same.

## Onboarding a new developer

```bash
# From the sdlc/ directory:
./bootstrap.sh

# Or from within a target repo:
/path/to/sdlc/bootstrap.sh
```

The bootstrap script:
1. Checks prerequisites (Node.js, Git, GitHub CLI)
2. Installs Jules CLI if needed
3. Validates Jules API key
4. Checks for Claude Code
5. Creates `specs/` and `.ai/` in the repo if missing
6. Copies spec templates

After running, fill in `.ai/project.md` (repo structure, commands, conventions) and customize `.ai/CLAUDE.md` (Jules source IDs).

## Distribution strategy

- **Pilot (now):** copy `.ai/` into each repo manually or via `bootstrap.sh`
- **Scale:** if the SDLC process stabilizes and you have many repos, build a lightweight `sdlc init` CLI that scaffolds everything and prompts for project-specific values — longer-term wizard work is tracked under INI-002 (sdlc-onboarding); this Phase 1 spec fixes what's actively broken
- **Don't use git submodules** — the sync tax isn't worth it for 3 small files that rarely change

## Current Stack

- **Work graph:** Linear (issues + relations + cycles)
- **Specs:** Schema-enforced markdown in repo (YAML frontmatter + required sections, CI-validated)
- **Execution:** Claude Code (local, interactive) + Jules (cloud, async parallel) — see [agent-orchestration.md](agent-orchestration.md)
- **CI/CD:** GitHub Actions
- **Observability:** Run logs captured per-task

## Status

Experimental. Being piloted on an upcoming major refactoring effort.
