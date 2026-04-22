# Developer onboarding

Everything a new developer (or new machine) needs to participate in the AI-native SDLC.

## Prerequisites

- GitHub account with repo access
- Google account (for Jules)
- Node.js 18+ (for Jules CLI)

## Quick start

Run the bootstrap script from the SDLC directory:

```bash
./sdlc/bootstrap.sh
```

This will:
1. Check prerequisites
2. Install and configure the Jules CLI
3. Set up Claude Code MCP servers (Linear)
4. Create Linear labels if they don't exist
5. Verify everything works

## Manual setup (if you prefer)

### 1. Claude Code

Install Claude Code if not already installed:
```bash
# macOS
brew install claude-code
# or
npm install -g @anthropic-ai/claude-code
```

### 2. Linear MCP

Add the Linear MCP server to Claude Code:
```bash
claude mcp add linear -- npx @anthropic-ai/linear-mcp-server
```

You'll need a Linear API key. Generate one at: Settings → API → Personal API keys.

### 3. Jules

Install the Jules CLI:
```bash
npm install -g @google/jules
jules login
```

Generate a Jules API key at https://jules.google.com/settings#api and add to your shell profile:
```bash
echo 'export JULES_API_KEY="your-key-here"' >> ~/.zshrc
source ~/.zshrc
```

Grant Jules access to your repos:
1. Go to GitHub → Settings → Applications → Google Labs Jules → Configure
2. Select the repos Jules should access

### 4. Linear labels

Create these labels in your Linear workspace (if they don't exist):
- `jules` — for tasks routed to Jules
- `claude-code` — for tasks routed to the local agent
- `human` — for tasks requiring human action

### 5. Verify

```bash
# Claude Code can reach Linear
claude "list my Linear teams"

# Jules CLI works
jules remote list --repo

# Jules API works
curl -s -H "X-Goog-Api-Key: $JULES_API_KEY" \
  https://julius.googleapis.com/v1alpha/sources
```

## What's in the repo

```
.ai/
├── sdlc.md       ← read this first — the process definition
├── CLAUDE.md     ← how Claude Code operates in this project
├── AGENTS.md     ← how Jules operates in this project
└── setup.md      ← you are here

specs/
├── templates/    ← templates for new specs, ADRs, bugs
├── adrs/         ← architecture decision records
├── bugs/         ← bug specs
└── spec-index.json ← auto-generated, agent-readable index
```

## Day-to-day workflow

1. **Start a session:** open Claude Code in the repo
2. **Check work:** Claude Code reads Linear for your assigned tasks
3. **For your tasks:** implement, test, open PR
4. **For jules-labeled tasks:** Claude Code dispatches them — you review the PRs when they arrive
5. **For spec changes:** update the spec in a PR alongside the code change

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Claude Code can't reach Linear | Check MCP config: `claude mcp list` — is `linear` listed? |
| Jules API returns 401 | Regenerate API key at jules.google.com/settings#api |
| Jules can't access repo | Check GitHub → Settings → Applications → Google Labs Jules |
| CI fails on spec validation | Check frontmatter against schema in `spec-schema.md` |
| Jules task fails | Read session activities, check if the task needs local context (should be `claude-code` instead) |
