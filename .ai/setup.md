# Developer Onboarding — Multi-Agent SDLC

Everything a new developer (or new machine) needs to participate in the AI-native SDLC.

## 1. Prerequisites

- **GitHub account** with repo access.
- **Google account** (for Jules).
- **Node.js 18+** (for Jules CLI; check the receiving repo's `.nvmrc` / `engines` for any stricter requirement).

The receiving repo may impose additional toolchain requirements (e.g. `pnpm`, Python via `uv`, language-specific runtimes). Read its `.ai/project.md` and root `README.md` after this onboarding to install them.

## 2. Quick start

If the receiving repo provides a bootstrap script (e.g. `pnpm dev:bootstrap`, `./tools/dev/bootstrap.sh`), prefer that — it handles repo-specific env wiring (Supabase users, `.env` files, language toolchains) on top of the SDLC bootstrap below.

Otherwise, run the SDLC's own bootstrap from this directory:

```bash
./sdlc/bootstrap.sh
```

This script:
1. Checks prerequisites
2. Installs and configures the Jules CLI
3. Sets up Claude Code MCP servers (Linear)
4. Creates Linear labels if they don't exist
5. Verifies everything works

## 3. Configure your AI agents

The SDLC is agent-agnostic. You can use Claude Code, Gemini CLI, or both. We recommend having both available.

### A. Claude Code (local orchestrator)

1. **Install:** `npm install -g @anthropic-ai/claude-code` (or `brew install claude-code` on macOS).
2. **Linear MCP:** `claude mcp add linear -- npx @anthropic-ai/linear-mcp-server`. Generate a Linear API key at: Settings → API → Personal API keys.
3. **Superpowers (recommended):** `/plugin install superpowers@claude-plugins-official` from inside Claude Code. Adds the brainstorming + verification-before-completion behavioral skills.

### B. Gemini CLI (local orchestrator, optional)

1. **Install:** follow the [Gemini CLI installation guide](https://github.com/google/generative-ai-docs).
2. **Superpowers (recommended):** `gemini install-skill brainstorming verification-before-completion`.

### C. Jules (cloud executor)

1. **Install:** `npm install -g @google/jules && jules login`
2. **API key:** generate at <https://jules.google.com/settings#api> and add to your shell profile:
   ```bash
   echo 'export JULES_API_KEY="your-key-here"' >> ~/.zshrc
   source ~/.zshrc
   ```
3. **Grant repo access:** GitHub → Settings → Applications → Google Labs Jules → Configure (select the repo).

## 4. Wire skills into your agents

If the repo ships SDLC skills under `.ai/skills/` (the standard location — see `templates/project.md`), point your local agents at them:

- **Claude Code** auto-discovers `.claude/skills/` in the repo root. Either symlink (`ln -s ../.ai/skills .claude/skills`) or run the repo's `setup-sdlc.sh` if it provides one.
- **Gemini CLI** discovers skills via `~/.agents/skills/`. Symlink each repo skill into it.

The repo's bootstrap script usually handles this. Restart your agent session after wiring so it reloads the skill index.

## 5. Linear labels

Create these labels in your Linear workspace (if they don't already exist):
- `jules` — for tasks routed to Jules
- `claude-code` — for tasks routed to a local orchestrator (Claude Code, Gemini CLI, or equivalent)
- `human` — for tasks requiring human action

## 6. Verify

```bash
# Claude Code can reach Linear
claude "list my Linear teams"

# Jules CLI works
jules remote list --repo

# Jules API works
curl -s -H "X-Goog-Api-Key: $JULES_API_KEY" \
  https://julius.googleapis.com/v1alpha/sources
```

## 7. Directory structure

```
.ai/
├── sdlc.md         ← the shared process definition (read this first)
├── project.md      ← repo structure, commands, code conventions
├── CLAUDE.md       ← instructions for Claude Code orchestrator
├── GEMINI.md       ← instructions for Gemini CLI orchestrator (if used)
├── AGENTS.md       ← instructions for Jules executor
├── setup.md        ← you are here
└── skills/         ← shared SDLC + domain skills

specs/
├── templates/      ← templates for new specs, ADRs, bugs
├── adrs/           ← architecture decision records
├── bugs/           ← bug specs
└── spec-index.json ← auto-generated, agent-readable index
```

## 8. Daily workflow

1. **Start a session:** `claude` or `gemini`.
2. **Check work:** the orchestrator reads Linear for your assigned tasks.
3. **For local tasks:** implement, test, open a PR.
4. **For `jules`-labeled tasks:** the orchestrator dispatches them — you review the PRs when they arrive.
5. **For spec changes:** update the spec in a PR alongside the code change.

## 9. Troubleshooting

| Problem | Fix |
|---------|-----|
| Skills not found | Re-run the repo's `setup-sdlc.sh` (or re-symlink) and restart your agent session. |
| Claude Code can't reach Linear | Check MCP config: `claude mcp list` — is `linear` listed? |
| Jules API returns 401 | Regenerate API key at jules.google.com/settings#api |
| Jules can't access repo | Check GitHub → Settings → Applications → Google Labs Jules |
| CI fails on spec validation | Check frontmatter against schema in `spec-schema.md` |
| Jules task fails | Read session activities; check if the task needs local context (should be `claude-code` instead) |
| Linear labels missing | Ensure `jules`, `claude-code`, and `human` exist in your Linear workspace. |
