# Developer Onboarding — Multi-Agent SDLC

Everything a new developer (or new machine) needs to participate in the AI-native SDLC.

## 1. Prerequisites

- **GitHub account** with repo access.
- **Node.js 22+** — required for the reference SDLC hooks under `.claude/hooks/` (`.mjs` ES modules) and the validators under `scripts/sdlc/` (the registry glob check uses `fs.globSync`). Check the receiving repo's `.nvmrc` / `engines` for any stricter requirement.

The receiving repo may impose additional toolchain requirements (e.g. `pnpm`, Python via `uv`, language-specific runtimes). Read its `.ai/project.md` and root `README.md` after this onboarding to install them.

## 2. Quick start

If the receiving repo provides a bootstrap script (e.g. `pnpm dev:bootstrap`, `./tools/dev/bootstrap.sh`), prefer that — it handles repo-specific env wiring (Supabase users, `.env` files, language toolchains) on top of the SDLC bootstrap below.

Otherwise, run the SDLC's own bootstrap from this directory:

```bash
./sdlc/bootstrap.sh
```

This script:
1. Checks prerequisites (Node.js for the hooks + validators, Git, GitHub CLI, Claude Code)
2. Scaffolds `specs/` and `.ai/`, and copies the spec/task templates
3. Copies the spine: the state machine (`specs/sdlc-state-machine.yaml`), the reference hooks (`.claude/hooks/`), the review contracts (`skills/review-*.yaml` / `.json` / `.md`), and the validators + gates (`scripts/sdlc/`)
4. Wires the hooks into `.claude/settings.json` (advisory by default — and never clobbers an existing settings.json; it prints merge guidance instead)
5. Links `.claude/skills` → `skills`
6. Prints next steps (the MCP + Linear-label setup below, and the customizations to fill in)

It does NOT set up MCP or create Linear labels — those are the manual steps in §3 and §5 below.

## 3. Configure your AI agents

The SDLC is agent-agnostic. You can use Claude Code, Gemini CLI, or both. We recommend having both available.

### A. Claude Code (local orchestrator)

1. **Install:** `npm install -g @anthropic-ai/claude-code` (or `brew install claude-code` on macOS).
2. **Linear MCP:** `claude mcp add linear -- npx @anthropic-ai/linear-mcp-server`. Generate a Linear API key at: Settings → API → Personal API keys.
3. **Superpowers (recommended):** `/plugin install superpowers@claude-plugins-official` from inside Claude Code. Adds the brainstorming + verification-before-completion behavioral skills.

### B. Gemini CLI (local orchestrator, optional)

1. **Install:** follow the [Gemini CLI installation guide](https://github.com/google/generative-ai-docs).
2. **Superpowers (recommended):** `gemini install-skill brainstorming verification-before-completion`.

> **Executors.** There is nothing extra to install: the agent running `spec-execution` implements the tasks itself, dispatching worktree-isolated subagents only as an exception for a large spec (ADR-003). There is no cloud executor and no separate engine.

## 4. Wire skills into your agents

If the repo ships SDLC skills under `skills/` (the standard location — see `templates/project.md`), point your local agents at them:

- **Claude Code** auto-discovers `.claude/skills/` in the repo root. Either symlink (`ln -s ../skills .claude/skills`) or run the repo's `setup-sdlc.sh` if it provides one.
- **Gemini CLI** discovers skills via `~/.agents/skills/`. Symlink each repo skill into it.

The repo's bootstrap script usually handles this. Restart your agent session after wiring so it reloads the skill index.

## 4b. The delivery spine (state machine, hooks, gates)

The autonomous half of the SDLC runs on a small spine of machine-checkable pieces. The bootstrap script copies and wires it; this is what it sets up and how to confirm it.

- **State machine** — `specs/sdlc-state-machine.yaml` is the single source of truth for phases, entry triggers, exit conditions, and per-workspace domain-skill routing. The `.ai/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it.
- **Reference hooks** — `.claude/hooks/` (`.mjs`, Node-based), wired via **`.claude/settings.json`** so they travel with the repo (NOT `settings.local.json`). **Advisory by default** — they nudge, they don't block:
  - `user-prompt-submit.mjs` — classify the prompt to its current phase
  - `stop-handoff.mjs` (Stop + SubagentStop) — advisory next-phase handoff at a phase exit, **and the delivery goal leash** on `Stop`: while `.claude/.sdlc-goal-<session_id>` is `status: active` it blocks a premature stop and feeds back the run's exit criteria (bounded, fails open)
  - `pre-tool-use-edit-write.mjs` — flag implementation-code edits with no active task context
  - `pre-tool-use-review-identity.mjs` — flag an author reviewing their own PR
- **Delivery gates** — `scripts/sdlc/plan-gate.mjs` (the fail-closed plan-review gate a run checks before it starts), `scripts/sdlc/validate-review-envelope.mjs` (every reviewer verdict is validated through it), `scripts/sdlc/reviewer-routing.mjs` (lens → reviewer, from the registry), `scripts/sdlc/check-review-constraint-globs.mjs` (registry rows must resolve to real files).
- **Review contracts** — `skills/review-primitives.md`, `skills/review-envelope.schema.json` (universal, identical in every repo).
- **Constraint registry** — `.ai/sdlc/review-constraints.yaml`, this repo's own invariants. It sits outside `skills/` so a skills-tree update can never overwrite it.

There is **no execution engine to install.** A deterministic `execute-spec` Workflow script used to sit here; it was measured and retired (ADR-003). `spec-execution` is itself the engine.

## 5. Linear labels

Create these labels in your Linear workspace (if they don't already exist):
- `claude-code` — for tasks the delivery run implements (the default)
- `human` — for tasks requiring a human decision

## 6. Verify

```bash
# Node is present (hooks + validators need it)
node --version

# State machine is valid (phases, triggers, transitions, domain routing)
node scripts/sdlc/validate-state-machine.mjs

# Phase-memory blocks in _index.yaml files conform to the contract
node scripts/sdlc/validate-phase-memory.mjs

# Claude Code can reach Linear
claude "list my Linear teams"
```

`scripts/sdlc/` also ships `gen-handoffs.mjs` (regenerates skill `## Handoff` footers from the state machine; run with `--check` in CI). See `scripts/sdlc/README.md` for the full list, including forthcoming validators.

## 7. Directory structure

```
.ai/
├── sdlc.md         ← the shared process definition (read this first)
├── project.md      ← repo structure, commands, code conventions
├── CLAUDE.md       ← instructions for the Claude Code orchestrator
├── GEMINI.md       ← instructions for the Gemini CLI orchestrator (if used)
├── AGENTS.md       ← the executor brief (any agent dispatched to a task)
├── setup.md        ← you are here
├── sdlc/           ← this repo's own SDLC config, never overwritten by an update
│   └── review-constraints.yaml   ← lens/constraint registry (yours to edit)
└── skills/         ← shared SDLC + domain skills + review contracts
                       (review-primitives.md, review-envelope.schema.json)

.claude/
├── settings.json   ← wires the hooks (travels with the repo)
├── hooks/          ← advisory SDLC hooks (.mjs)
└── skills → ../skills   ← symlink; Claude Code loads skills from here

scripts/sdlc/       ← validators + gates: validate-state-machine.mjs, validate-phase-memory.mjs,
                       gen-handoffs.mjs, plan-gate.mjs, reviewer-routing.mjs,
                       validate-review-envelope.mjs, check-review-constraint-globs.mjs

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
4. **Delivery (autonomous):** once the spec is `active`, decomposed and plan-approved, say "implement SPEC-NNN". The run arms its goal leash, tracks a visible task list, burns the tasks down serially onto `feat/spec-NNN`, validates end-to-end once, and opens one integration PR graded by an adversarial panel. A human merges it to `main`.
5. **For spec changes mid-flight:** the run escalates `spec:*` back to `spec-amendment`; update the spec in a PR.

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| Skills not found | Re-run the repo's `setup-sdlc.sh` (or re-symlink) and restart your agent session. |
| Hooks not firing | Confirm they're wired in `.claude/settings.json` (not `settings.local.json`) and that `node` is on PATH. Most hooks are advisory — they log/nudge, they don't block — except the delivery goal leash (`stop-handoff.mjs`'s `Stop` branch), which deliberately blocks while a run is active. |
| State-machine / phase-memory validation fails | Run `node scripts/sdlc/validate-state-machine.mjs` and `node scripts/sdlc/validate-phase-memory.mjs` and fix the reported drift. |
| A delivery run refuses to start | It needs a spec with `status: active`, a decomposed task graph (`specs/tasks/SPEC-NNN/_index.yaml`), and an approved `plan_review:` block — check with `node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml`. |
| A session won't stop / keeps being blocked | A delivery goal leash is armed. Finish the run and set `status: met` in `.claude/.sdlc-goal-<session_id>`, set `status: escalated` if you are blocked on a human, or delete that file to disarm it. |
| Claude Code can't reach Linear | Check MCP config: `claude mcp list` — is `linear` listed? |
| CI fails on spec validation | Check frontmatter against schema in `skills/spec-schema.md` |
| Linear labels missing | Ensure `claude-code` and `human` exist in your Linear workspace. |
