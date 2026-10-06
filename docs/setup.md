# Developer Onboarding — Multi-Agent SDLC

Everything a new developer (or new machine) needs to participate in the AI-native SDLC.

## 1. Prerequisites

- **GitHub account** with repo access.
- **Node.js 22+** — required for the reference SDLC hooks under `.claude/hooks/` (`.mjs` ES modules) and the validators under `.sdlc/scripts/` (the registry glob check uses `fs.globSync`). Check the receiving repo's `.nvmrc` / `engines` for any stricter requirement.

The receiving repo may impose additional toolchain requirements (e.g. `pnpm`, Python via `uv`, language-specific runtimes). Read its `AGENTS.md` and root `README.md` after this onboarding to install them.

## 2. Quick start

If the receiving repo provides a bootstrap script (e.g. `pnpm dev:bootstrap`, `./tools/dev/bootstrap.sh`), prefer that — it handles repo-specific env wiring (Supabase users, `.env` files, language toolchains) on top of the SDLC bootstrap below.

Otherwise, run the SDLC's own bootstrap from this directory:

```bash
./sdlc/bootstrap.sh
```

This script:
1. Checks prerequisites (Node.js for the hooks + validators, Git, GitHub CLI, Claude Code)
2. Stops on a repo still on the older `.ai/` layout and points at the migration (`/sdlc-sync`)
3. Installs the `.sdlc/` tree (ADR-008): `config.yaml`, the review-constraints registry, the state machine, the validators + gates in `.sdlc/scripts/`, and the templates. It adds the SDLC block to `AGENTS.md`, `@AGENTS.md` to `CLAUDE.md`, and the needed lines to `.ignore`, `.gitignore` and `.gitattributes`
4. Copies the skills into `.sdlc/skills/` and links `.claude/skills` → `../.sdlc/skills`, then copies the reference hooks (with their `lib/`) into `.claude/hooks/` and the reviewer agents into `.claude/agents/`
5. Wires the hooks into `.claude/settings.json` (advisory by default — and never clobbers an existing settings.json; it prints merge guidance instead)
6. Prints next steps (the agent setup below, and the customizations to fill in)

It does NOT install your agents. That is the manual step in §3 below.

## 3. Configure your AI agents

The SDLC is agent-agnostic. You can use Claude Code, Gemini CLI, or both. We recommend having both available.

### A. Claude Code (local orchestrator)

1. **Install:** `npm install -g @anthropic-ai/claude-code` (or `brew install claude-code` on macOS).
2. **Superpowers (recommended):** `/plugin install superpowers@claude-plugins-official` from inside Claude Code. Adds the brainstorming + verification-before-completion behavioral skills.

### B. Gemini CLI (local orchestrator, optional)

1. **Install:** follow the [Gemini CLI installation guide](https://github.com/google/generative-ai-docs).
2. **Superpowers (recommended):** `gemini install-skill brainstorming verification-before-completion`.

> **Executors.** There is nothing extra to install: the agent running `spec-execution` implements the guide's steps itself, dispatching worktree-isolated subagents only as an exception for a large spec (ADR-003). There is no cloud executor and no separate engine.

## 4. Wire skills into your agents

With the plugin installed, Claude Code loads the SDLC skills from the plugin, and a repo keeps only its own domain skills. A repo set up by `bootstrap.sh` keeps all of them in `.sdlc/skills/`:

- **Claude Code** auto-discovers `.claude/skills/` in the repo root, which `bootstrap.sh` links to `../.sdlc/skills`.
- **Gemini CLI** discovers skills via `~/.agents/skills/`. Symlink each repo skill into it.

The repo's bootstrap script usually handles this. Restart your agent session after wiring so it reloads the skill index.

## 4b. The delivery spine (state machine, hooks, gates)

The autonomous half of the SDLC runs on a small spine of machine-checkable pieces. The bootstrap script copies and wires it; this is what it sets up and how to confirm it.

- **State machine** — `.sdlc/state-machine.yaml` is the single source of truth for phases, entry triggers, exit conditions, and per-workspace domain-skill routing. The `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it.
- **Reference hooks** — `.claude/hooks/` (`.mjs`, Node-based), wired via **`.claude/settings.json`** so they travel with the repo (NOT `settings.local.json`). **Advisory by default** — they nudge, they don't block:
  - `user-prompt-submit.mjs` — classify the prompt to its current phase
  - `stop-handoff.mjs` (Stop + SubagentStop) — advisory next-phase handoff at a phase exit, **and the delivery goal leash** on `Stop`: while `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-<session_id>` is `status: active` it blocks a premature stop and feeds back the run's exit criteria (bounded, fails open)
  - `pre-tool-use-edit-write.mjs` — flag implementation-code edits made off a spec work branch
  - `pre-tool-use-review-identity.mjs` — flag an author reviewing their own PR
- **Delivery gates** — `.sdlc/scripts/validate-guide.mjs` (a spec's delivery guide is complete, current and within the 3,800-character kickoff limit), `.sdlc/scripts/plan-gate.mjs` (the fail-closed plan-review gate a run checks before it starts), `.sdlc/scripts/validate-review-envelope.mjs` (every reviewer verdict is validated through it), `.sdlc/scripts/reviewer-routing.mjs` (lens → reviewer, from the registry), `.sdlc/scripts/check-review-constraint-globs.mjs` (registry rows must resolve to real files).
- **Review contracts** — `skills/review-primitives.md`, `skills/review-envelope.schema.json` (universal, identical in every repo).
- **Constraint registry** — `.sdlc/review-constraints.yaml`, this repo's own invariants. It sits outside `skills/` so a skills-tree update can never overwrite it.

There is **no execution engine to install.** A deterministic `execute-spec` Workflow script used to sit here; it was measured and retired (ADR-003). `spec-execution` is itself the engine.

## 5. Verify

```bash
# Node is present (hooks + validators need it)
node --version

# State machine is valid (phases, triggers, transitions, domain routing)
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-state-machine

# Phase-memory blocks in _index.yaml files conform to the contract
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-phase-memory
```

`.sdlc/scripts/` also ships `gen-handoffs.mjs` (regenerates skill `## Handoff` footers from the state machine; run with `--check` in CI). See `.sdlc/scripts/README.md` for the full list, including forthcoming validators.

## 6. Directory structure

```
AGENTS.md            ← project context in the SDLC block (read this first); CLAUDE.md imports it
CLAUDE.md            ← instructions for the Claude Code orchestrator, with @AGENTS.md

.sdlc/               ← everything the framework puts in the repo (ADR-008)
├── config.yaml      ← workspaces, domain_routing, extensions, scan.allow (yours to edit)
├── review-constraints.yaml   ← lens/constraint registry (yours to edit)
├── state-machine.yaml        ← the phase spine; framework-owned, refreshed by every sync
├── scripts/         ← validators + gates: validate-state-machine.mjs, validate-phase-memory.mjs,
│                      plan-gate.mjs, reviewer-routing.mjs, validate-review-envelope.mjs,
│                      check-review-constraint-globs.mjs, scan-legacy-paths.mjs, lib/
├── templates/       ← templates for new specs, ADRs, bugs, guides, kickoff prompts
└── contracts/       ← review-primitives.md, review-envelope.schema.json

.claude/
├── settings.json    ← wires the hooks (travels with the repo)
├── hooks/           ← advisory SDLC hooks (.mjs), when the plugin is not installed
└── skills → ../.sdlc/skills   ← symlink, for a repo set up by bootstrap.sh

specs/
├── adrs/            ← architecture decision records
├── bugs/            ← bug specs
├── tasks/           ← per-spec delivery guides: GUIDE.md, _index.yaml (phase: memory), KICKOFF.md
└── spec-index.json  ← auto-generated, agent-readable index
```

The process definition and the executor brief ship with the plugin: `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` and `${CLAUDE_PLUGIN_ROOT}/docs/executor-brief.md`.

## 7. Daily workflow

1. **Start a session:** `claude` or `gemini`.
2. **Check work:** the orchestrator reads `specs/intents.md` and the active specs' `_index.yaml` files.
3. **Judgment phases (with the user):** intent-triage → spec-authoring, which ends with the spec and its delivery guide approved together. This is where human attention goes.
4. **Delivery (autonomous):** once the spec is `active` with its guide approved, paste its `KICKOFF.md` (or say "implement SPEC-NNN"). The run arms its goal leash, tracks a visible task list, burns the guide's steps down serially onto `feat/spec-NNN`, validates end-to-end once, and opens one integration PR graded by an adversarial panel. A human merges it to `main`.
5. **For spec changes mid-flight:** the run escalates `spec:*` back to `spec-amendment`; update the spec in a PR.

## 8. Troubleshooting

| Problem | Fix |
|---------|-----|
| Skills not found | Re-run the repo's `setup-sdlc.sh` (or re-symlink) and restart your agent session. |
| Hooks not firing | Confirm they're wired in `.claude/settings.json` (not `settings.local.json`) and that `node` is on PATH. Most hooks are advisory — they log/nudge, they don't block — except the delivery goal leash (`stop-handoff.mjs`'s `Stop` branch), which deliberately blocks while a run is active. |
| State-machine / phase-memory validation fails | Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-state-machine` and `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-phase-memory` and fix the reported drift. |
| A delivery run refuses to start | It needs a spec with `status: active`, a delivery guide that passes `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide specs/tasks/SPEC-NNN/GUIDE.md`, and an approved `plan_review:` block — check with `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs plan-gate specs/tasks/SPEC-NNN/_index.yaml`. A spec specced before guides existed needs "write the guide for SPEC-NNN" first. |
| A session won't stop / keeps being blocked | A delivery goal leash is armed. Finish the run and set `status: met` in `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-<session_id>`, set `status: escalated` if you are blocked on a human, or delete that file to disarm it. |
| CI fails on spec validation | Check frontmatter against schema in `skills/spec-schema.md` |
