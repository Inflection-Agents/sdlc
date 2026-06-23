# Developer Onboarding — Multi-Agent SDLC

Everything a new developer (or new machine) needs to participate in the AI-native SDLC.

## 1. Prerequisites

- **GitHub account** with repo access.
- **Node.js 18+** — required for the reference SDLC hooks under `.claude/hooks/` (`.mjs` ES modules) and the deterministic execution engine (`spec-execution`'s reference Workflow script at `.claude/workflows/execute-spec.js`, plus the validators under `scripts/sdlc/`). Check the receiving repo's `.nvmrc` / `engines` for any stricter requirement.

The receiving repo may impose additional toolchain requirements (e.g. `pnpm`, Python via `uv`, language-specific runtimes). Read its `.ai/project.md` and root `README.md` after this onboarding to install them.

## 2. Quick start

If the receiving repo provides a bootstrap script (e.g. `pnpm dev:bootstrap`, `./tools/dev/bootstrap.sh`), prefer that — it handles repo-specific env wiring (Supabase users, `.env` files, language toolchains) on top of the SDLC bootstrap below.

Otherwise, run the SDLC's own bootstrap from this directory:

```bash
./sdlc/bootstrap.sh
```

This script:
1. Checks prerequisites (including Node.js for the hooks + execution engine)
2. Copies the spine: the state machine (`specs/sdlc-state-machine.yaml`), the reference hooks (`.claude/hooks/`), the execution Workflow (`.claude/workflows/execute-spec.js`), and the review contracts (`.ai/skills/review-*.yaml` / `.json` / `.md`)
3. Wires the hooks into `.claude/settings.json` (advisory by default — they nudge, they don't block)
4. Sets up Claude Code MCP servers (Linear)
5. Creates Linear labels if they don't exist
6. Runs the SDLC validators and verifies everything works

## 3. Configure your AI agents

The SDLC is agent-agnostic. You can use Claude Code, Gemini CLI, or both. We recommend having both available.

### A. Claude Code (local orchestrator)

1. **Install:** `npm install -g @anthropic-ai/claude-code` (or `brew install claude-code` on macOS).
2. **Linear MCP:** `claude mcp add linear -- npx @anthropic-ai/linear-mcp-server`. Generate a Linear API key at: Settings → API → Personal API keys.
3. **Superpowers (recommended):** `/plugin install superpowers@claude-plugins-official` from inside Claude Code. Adds the brainstorming + verification-before-completion behavioral skills.

### B. Gemini CLI (local orchestrator, optional)

1. **Install:** follow the [Gemini CLI installation guide](https://github.com/google/generative-ai-docs).
2. **Superpowers (recommended):** `gemini install-skill brainstorming verification-before-completion`.

> **Executors.** Task execution is handled by the deterministic engine's worktree-isolated local executor (`claude-code`) — there is no separate cloud executor to install. The framework is executor-agnostic in principle, so a different executor backend could be added later, but none ships by default.

## 4. Wire skills into your agents

If the repo ships SDLC skills under `.ai/skills/` (the standard location — see `templates/project.md`), point your local agents at them:

- **Claude Code** auto-discovers `.claude/skills/` in the repo root. Either symlink (`ln -s ../.ai/skills .claude/skills`) or run the repo's `setup-sdlc.sh` if it provides one.
- **Gemini CLI** discovers skills via `~/.agents/skills/`. Symlink each repo skill into it.

The repo's bootstrap script usually handles this. Restart your agent session after wiring so it reloads the skill index.

## 4b. The execution spine (state machine, hooks, engine)

The autonomous half of the SDLC runs on a deterministic spine. The bootstrap script copies and wires it; this is what it sets up and how to confirm it.

- **State machine** — `specs/sdlc-state-machine.yaml` is the single source of truth for phases, entry triggers, exit conditions, and per-workspace domain-skill routing. The `.ai/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it.
- **Reference hooks** — `.claude/hooks/` (`.mjs`, Node-based), wired via **`.claude/settings.json`** so they travel with the repo (NOT `settings.local.json`). **Advisory by default** — they nudge, they don't block:
  - `user-prompt-submit.mjs` — classify the prompt to its current phase
  - `stop-handoff.mjs` (Stop + SubagentStop) — advisory next-phase handoff at a phase exit
  - `pre-tool-use-edit-write.mjs` — flag implementation-code edits with no active task context
  - `pre-tool-use-review-identity.mjs` — flag an author reviewing their own PR
- **Execution engine** — `.claude/workflows/execute-spec.js`, the reference Workflow script that `spec-execution` invokes: `Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })`.
- **Review contracts** — `.ai/skills/review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`.

## 5. Linear labels

Create these labels in your Linear workspace (if they don't already exist):
- `claude-code` — for tasks executed by the deterministic engine's local executor (the default)
- `human` — for tasks requiring a human decision

## 6. Verify

```bash
# Node is present (hooks + execution engine need it)
node --version

# State machine is valid (phases, triggers, transitions, domain routing)
node scripts/sdlc/validate-state-machine.mjs

# Phase-memory blocks in _index.yaml files conform to the contract
node scripts/sdlc/validate-phase-memory.mjs

# Claude Code can reach Linear
claude "list my Linear teams"
```

`scripts/sdlc/` also ships `gen-handoffs.mjs` (regenerates skill `## Handoff` footers from the state machine) and `check-review-contract-drift.mjs` (catches review-contract drift). See `scripts/sdlc/README.md`.

## 7. Directory structure

```
.ai/
├── sdlc.md         ← the shared process definition (read this first)
├── project.md      ← repo structure, commands, code conventions
├── CLAUDE.md       ← instructions for the Claude Code orchestrator
├── GEMINI.md       ← instructions for the Gemini CLI orchestrator (if used)
├── AGENTS.md       ← the executor brief (any agent dispatched to a task)
├── setup.md        ← you are here
└── skills/         ← shared SDLC + domain skills + review contracts
                       (review-primitives.md, review-constraints.yaml,
                        review-envelope.schema.json)

.claude/
├── settings.json   ← wires the hooks (travels with the repo)
├── hooks/          ← advisory SDLC hooks (.mjs)
├── workflows/      ← execute-spec.js — the deterministic execution engine
└── skills → ../.ai/skills   ← symlink; Claude Code loads skills from here

scripts/sdlc/       ← validators: validate-state-machine.mjs, validate-phase-memory.mjs,
                       gen-handoffs.mjs, check-review-contract-drift.mjs

specs/
├── sdlc-state-machine.yaml  ← single source of truth for phases + transitions
├── templates/      ← templates for new specs, ADRs, bugs
├── adrs/           ← architecture decision records
├── bugs/           ← bug specs
├── tasks/          ← per-spec task graphs (_index.yaml carries the phase: memory block)
└── spec-index.json ← auto-generated, agent-readable index
```

## 8. Daily workflow

1. **Start a session:** `claude` or `gemini`.
2. **Check work:** the orchestrator reads Linear for your assigned tasks.
3. **Judgment phases (with the user):** intent-triage → spec-authoring → task-decomposition. This is where human attention goes.
4. **Execution (autonomous):** invoke the engine once the spec is `active` and decomposed — `Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })`. It runs the wave loop, LLM multi-lens review, fix-loop, and opens the integration PR. A human merges it to `main`.
5. **For spec changes mid-flight:** the engine escalates `spec:*` back to `spec-amendment`; update the spec in a PR.

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| Skills not found | Re-run the repo's `setup-sdlc.sh` (or re-symlink) and restart your agent session. |
| Hooks not firing | Confirm they're wired in `.claude/settings.json` (not `settings.local.json`) and that `node` is on PATH. Hooks are advisory — they log/nudge, they don't block. |
| State-machine / phase-memory validation fails | Run `node scripts/sdlc/validate-state-machine.mjs` and `node scripts/sdlc/validate-phase-memory.mjs` and fix the reported drift. |
| `execute-spec` won't run | Needs Node and a spec with `status: active` plus a decomposed task graph (`specs/tasks/SPEC-NNN/_index.yaml`). |
| Claude Code can't reach Linear | Check MCP config: `claude mcp list` — is `linear` listed? |
| CI fails on spec validation | Check frontmatter against schema in `spec-schema.md` |
| Linear labels missing | Ensure `claude-code` and `human` exist in your Linear workspace. |
