#!/bin/bash
set -euo pipefail

# --legacy: take the copy-once path deliberately, and suppress the plugin notice.
LEGACY=false
for arg in "$@"; do
  case "$arg" in
    --legacy) LEGACY=true ;;
  esac
done

# AI-Native SDLC Bootstrap
#
# THE PLUGIN IS THE PRIMARY PATH. This script still copies everything it always did,
# but what it installs is copy-once: a repo bootstrapped today receives nothing from a
# future framework release without a manual diff of two checkouts. That is the problem
# the plugin exists to solve.
#
#   /plugin install sdlc@inflection-agents
#   /sdlc-init      # scaffolds this repo and interviews for your constraints
#   /sdlc-sync      # after a later update, refreshes the repo-local half
#
# Use this when you cannot install a plugin, or to bootstrap the reference repo
# itself. Pass --legacy to acknowledge the copy-once path and skip the notice.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $1"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $1"; }
fail()  { echo -e "${RED}[fail]${NC}  $1"; }

echo ""
echo "========================================="
echo "  AI-Native SDLC — Bootstrap"
echo "========================================="
echo ""

# ── Check prerequisites ──

info "Checking prerequisites..."

if command -v node &> /dev/null; then
  NODE_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
    ok "Node.js $(node --version)"
  else
    # scripts/sdlc/check-review-constraint-globs.mjs uses fs.globSync (Node 22+).
    fail "Node.js $(node --version) is too old — the SDLC validators need v22+."
    exit 1
  fi
else
  fail "Node.js not found. Install it: https://nodejs.org/"
  exit 1
fi

if command -v git &> /dev/null; then
  ok "Git $(git --version | cut -d' ' -f3)"
else
  fail "Git not found."
  exit 1
fi

if command -v gh &> /dev/null; then
  ok "GitHub CLI $(gh --version | head -1 | cut -d' ' -f3)"
else
  warn "GitHub CLI not found. Install: brew install gh"
fi

echo ""


# ── Claude Code ──

info "Checking Claude Code..."

if command -v claude &> /dev/null; then
  ok "Claude Code found"
else
  warn "Claude Code not found. Install: brew install claude-code"
fi

echo ""

# ── Superpowers skills ──

info "Checking Superpowers skills..."

if [ -d "$HOME/.claude/skills/brainstorming" ] && [ -d "$HOME/.claude/skills/verification-before-completion" ]; then
  ok "Superpowers skills installed"
else
  warn "Superpowers skills not found."
  echo "  The SDLC skills build on the Superpowers methodology."
  echo "  Install in Claude Code:"
  echo "    /plugin install superpowers@claude-plugins-official"
  echo ""
  echo "  Or clone manually:"
  echo "    git clone https://github.com/obra/superpowers ~/.claude/superpowers"
  echo "    # Then symlink skills into ~/.claude/skills/"
  echo ""
fi

echo ""

# ── Init repo structure (if in a git repo) ──

if git rev-parse --git-dir &> /dev/null 2>&1; then
  REPO_ROOT=$(git rev-parse --show-toplevel)
  info "Git repo detected: $REPO_ROOT"
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PAYLOAD="$SCRIPT_DIR/init-payload"

  # A repo already on layout 1 (.ai/ or scripts/sdlc/) is migrated, not re-bootstrapped:
  # copying layout 2 next to it would leave two sets of SDLC files that disagree.
  if [ ! -f "$REPO_ROOT/.sdlc/config.yaml" ] && { [ -d "$REPO_ROOT/.ai" ] || [ -d "$REPO_ROOT/scripts/sdlc" ]; }; then
    warn "This repo is on SDLC layout 1 (.ai/ or scripts/sdlc/). Migrate it instead of re-running bootstrap:"
    echo "    node \"$SCRIPT_DIR/scripts/sdlc/migrate-layout.mjs\" --root \"$REPO_ROOT\" --dry-run"
    echo "  or run /sdlc-sync with the plugin installed (ADR-008)."
    exit 1
  fi

  # The layout-2 payload, the root-file merges and the AGENTS.md block, through the same
  # installer /sdlc-init uses, so both paths produce the same repo. It never overwrites a
  # file that exists. --contracts-in-skills: the skills tree copied below already holds
  # the review contracts, so config.yaml points the resolver at that copy.
  node "$SCRIPT_DIR/scripts/sdlc/install-payload.mjs" --root "$REPO_ROOT" --contracts-in-skills
  ok "Installed the .sdlc/ payload, workflows, root-file merges and the AGENTS.md block"

  # Skills: copied into .sdlc/skills/ (a bootstrapped repo has no plugin to load them
  # from), with Claude Code's .claude/skills as a SYMLINK so the two never drift. -L
  # dereferences any symlink inside the framework tree, which GNU cp -r would keep.
  mkdir -p "$REPO_ROOT/.sdlc/skills"
  for entry in "$SCRIPT_DIR/skills/"*; do
    name="$(basename "$entry")"
    [ -e "$REPO_ROOT/.sdlc/skills/$name" ] || cp -RL "$entry" "$REPO_ROOT/.sdlc/skills/$name"
  done
  if [ ! -e "$REPO_ROOT/.claude/skills" ]; then
    mkdir -p "$REPO_ROOT/.claude"
    ln -s ../.sdlc/skills "$REPO_ROOT/.claude/skills"
    ok "Linked .claude/skills → ../.sdlc/skills"
  else
    ok ".claude/skills already present"
  fi

  # Hooks travel with the repo here, with the path resolver in lib/ beside them: each
  # hook loads it from there when no plugin is installed (SPEC-009).
  mkdir -p "$REPO_ROOT/.claude/hooks/lib" "$REPO_ROOT/.claude/hooks/__tests__"
  for hook in "$SCRIPT_DIR/hooks/"*.mjs; do
    name="$(basename "$hook")"
    [ -f "$REPO_ROOT/.claude/hooks/$name" ] || cp "$hook" "$REPO_ROOT/.claude/hooks/$name"
  done
  for lib in "$SCRIPT_DIR/scripts/sdlc/lib/"*.mjs; do
    case "$lib" in *.test.mjs) continue ;; esac
    name="$(basename "$lib")"
    [ -f "$REPO_ROOT/.claude/hooks/lib/$name" ] || cp "$lib" "$REPO_ROOT/.claude/hooks/lib/$name"
  done
  # The goal leash is the one hook that BLOCKS. Its fixture tests are its only
  # mechanical bound, so a repo that gets the hook gets the tests too.
  for hook_test in "$SCRIPT_DIR/hooks/__tests__/"*.mjs; do
    name="$(basename "$hook_test")"
    [ -f "$REPO_ROOT/.claude/hooks/__tests__/$name" ] || cp "$hook_test" "$REPO_ROOT/.claude/hooks/__tests__/$name"
  done
  ok "Copied SDLC hooks and their lib/ to .claude/hooks/ (advisory by default; goal-leash tests in __tests__/)"

  # Reviewer agent definitions. The registry routes a lens to an agent NAME
  # (ADR-001), so without these files the routing resolves to nothing and the panel
  # cannot be dispatched. Their `tools:` line is also the independence mechanism:
  # a reviewer with no Edit/Write cannot fix what it grades.
  mkdir -p "$REPO_ROOT/.claude/agents"
  for agent in "$SCRIPT_DIR/agents/"*.md; do
    name="$(basename "$agent")"
    [ -f "$REPO_ROOT/.claude/agents/$name" ] || cp "$agent" "$REPO_ROOT/.claude/agents/$name"
  done
  ok "Copied reviewer agents to .claude/agents/ (no Edit/Write by design)"

  # Wire hooks via .claude/settings.json (do NOT clobber an existing one)
  if [ -f "$SCRIPT_DIR/.claude/settings.json" ]; then
    if [ ! -f "$REPO_ROOT/.claude/settings.json" ]; then
      cp "$SCRIPT_DIR/.claude/settings.json" "$REPO_ROOT/.claude/settings.json"
      ok "Copied .claude/settings.json — wires the SDLC hooks"
    else
      warn ".claude/settings.json already exists — NOT overwriting."
      echo "  Merge the \"hooks\" block from the reference into your settings.json manually:"
      echo "    $SCRIPT_DIR/.claude/settings.json"
      echo "  It wires PreToolUse (Bash, Edit|Write), UserPromptSubmit, Stop, and SubagentStop"
      echo "  to the .mjs hooks in .claude/hooks/."
      echo ""
    fi
  fi
else
  info "Not in a git repo — skipping repo structure setup"
  info "Run this script from within a git repo to set up specs/ and .sdlc/"
fi

echo ""
echo "========================================="
echo "  Setup complete"
echo "========================================="
echo ""
if [ "$LEGACY" = false ]; then
echo "════════════════════════════════════════════════════════"
echo "  The plugin is now the primary path"
echo "════════════════════════════════════════════════════════"
echo ""
echo "  This script still works and copies everything it always did."
echo "  But the framework now ships as a Claude Code plugin, and that"
echo "  path gets you engine updates automatically instead of never:"
echo ""
echo "    /plugin install sdlc@inflection-agents"
echo "    /sdlc-init      # scaffolds this repo and interviews for your constraints"
echo "    /sdlc-sync      # after a later plugin update, refreshes the repo-local half"
echo ""
echo "  What this script copies is copy-once. A repo bootstrapped today"
echo "  receives nothing from a future framework release without a manual"
echo "  diff. /sdlc-sync is how that stops being true."
echo ""
fi

echo "Next steps:"
echo "  1. Fill in the SDLC block in AGENTS.md (project context) and the workspaces in"
echo "     .sdlc/config.yaml (paths, test and build commands, agent eligibility, domain skills)"
echo "  2. Install Superpowers in Claude Code: /plugin install superpowers@claude-plugins-official"
echo "  3. Ensure Linear labels exist: claude-code, human"
echo "  4. Write your first spec: cp .sdlc/templates/spec.md specs/SPEC-001-name.md"
echo ""
echo "Configure the spine:"
echo "  5. Fill in .sdlc/review-constraints.yaml with your repo's real review"
echo "     lenses and invariants (it ships empty)"
echo "  6. Map workspaces to skill chains in .sdlc/config.yaml domain_routing. Add any"
echo "     phase or exempt skill of your own under extensions. .sdlc/state-machine.yaml"
echo "     is framework-owned, so do not edit it"
echo "  7. Hooks in .claude/hooks/ are ADVISORY by default (they warn, not block) —"
echo "     EXCEPT the delivery goal leash in stop-handoff.mjs, which blocks on Stop"
echo "     by design (bounded, fail-open; released by met/escalated or deleting the goal file)."
echo "     Review .claude/settings.json and tighten the others once you trust the flow."
echo "  8. Validate the spine: node .sdlc/scripts/validate-sdlc-config.mjs,"
echo "     node .sdlc/scripts/validate-state-machine.mjs and node .sdlc/scripts/check-review-constraint-globs.mjs"
echo "  9. If this repo uses vitest/jest: exclude .claude/hooks/__tests__/ from its config —"
echo "     those are node:test files (run via 'node --test'), not your test runner's."
echo ""
