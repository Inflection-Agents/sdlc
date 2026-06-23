#!/bin/bash
set -euo pipefail

# AI-Native SDLC Bootstrap
# Run this to set up a new developer machine or onboard a new repo.

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
  ok "Node.js $(node --version)"
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

  # Create specs directory
  if [ ! -d "$REPO_ROOT/specs" ]; then
    info "Creating specs/ directory..."
    mkdir -p "$REPO_ROOT/specs/adrs" "$REPO_ROOT/specs/bugs" "$REPO_ROOT/specs/templates"
    ok "Created specs/ structure"
  else
    ok "specs/ directory exists"
  fi

  # Copy .ai/ if not present
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  if [ ! -d "$REPO_ROOT/.ai" ]; then
    if [ -d "$SCRIPT_DIR/.ai" ]; then
      info "Copying .ai/ agent config to repo..."
      cp -r "$SCRIPT_DIR/.ai" "$REPO_ROOT/.ai"
      ok "Copied .ai/ — customize AGENTS.md with your project's setup commands"
    else
      warn ".ai/ templates not found in $SCRIPT_DIR"
    fi
  else
    ok ".ai/ directory exists"
  fi

  # Copy project.md template if not present
  if [ ! -f "$REPO_ROOT/.ai/project.md" ]; then
    if [ -f "$SCRIPT_DIR/templates/project.md" ]; then
      info "Copying project.md template to .ai/..."
      cp "$SCRIPT_DIR/templates/project.md" "$REPO_ROOT/.ai/project.md"
      ok "Copied .ai/project.md — fill in your project's structure, commands, and conventions"
    fi
  else
    ok ".ai/project.md exists"
  fi

  # Copy spec templates if not present
  if [ ! -f "$REPO_ROOT/specs/templates/spec.md" ]; then
    if [ -d "$SCRIPT_DIR/templates" ]; then
      info "Copying spec templates..."
      cp "$SCRIPT_DIR/templates/"*.md "$REPO_ROOT/specs/templates/"
      ok "Copied spec templates"
    fi
  else
    ok "Spec templates exist"
  fi

  # Copy project-level Claude skills if not present
  if [ ! -d "$REPO_ROOT/.claude/skills" ]; then
    if [ -d "$SCRIPT_DIR/.claude/skills" ]; then
      info "Copying project-level Claude skills..."
      mkdir -p "$REPO_ROOT/.claude/skills"
      cp -r "$SCRIPT_DIR/.claude/skills/"* "$REPO_ROOT/.claude/skills/"
      ok "Copied SDLC skills to .claude/skills/ — Claude Code will load them automatically"
    fi
  else
    ok ".claude/skills/ directory exists"
  fi

  # ── Spine + engine: state machine, workflow, hooks, review contracts, validators ──

  # Copy the SDLC state machine (single source of truth for phases/handoffs)
  if [ ! -f "$REPO_ROOT/specs/sdlc-state-machine.yaml" ]; then
    if [ -f "$SCRIPT_DIR/specs/sdlc-state-machine.yaml" ]; then
      info "Copying SDLC state machine..."
      cp "$SCRIPT_DIR/specs/sdlc-state-machine.yaml" "$REPO_ROOT/specs/sdlc-state-machine.yaml"
      ok "Copied specs/sdlc-state-machine.yaml — customize domain_routing for your workspaces"
    fi
  else
    ok "specs/sdlc-state-machine.yaml exists"
  fi

  # Copy the deterministic execution Workflow engine
  if [ ! -f "$REPO_ROOT/.claude/workflows/execute-spec.js" ]; then
    if [ -f "$SCRIPT_DIR/.claude/workflows/execute-spec.js" ]; then
      info "Copying spec-execution Workflow engine..."
      mkdir -p "$REPO_ROOT/.claude/workflows"
      cp "$SCRIPT_DIR/.claude/workflows/execute-spec.js" "$REPO_ROOT/.claude/workflows/execute-spec.js"
      ok "Copied .claude/workflows/execute-spec.js — the deterministic execution engine"
    fi
  else
    ok ".claude/workflows/execute-spec.js exists"
  fi

  # Copy advisory hooks (must travel with the repo, hence .claude/hooks/)
  if [ -d "$SCRIPT_DIR/.claude/hooks" ]; then
    mkdir -p "$REPO_ROOT/.claude/hooks"
    HOOKS_COPIED=false
    for hook in "$SCRIPT_DIR/.claude/hooks/"*.mjs; do
      [ -e "$hook" ] || continue
      hook_name="$(basename "$hook")"
      if [ ! -f "$REPO_ROOT/.claude/hooks/$hook_name" ]; then
        cp "$hook" "$REPO_ROOT/.claude/hooks/$hook_name"
        HOOKS_COPIED=true
      fi
    done
    if [ "$HOOKS_COPIED" = true ]; then
      ok "Copied SDLC hooks to .claude/hooks/ (advisory by default)"
    else
      ok ".claude/hooks/ already populated"
    fi
  fi

  # Wire hooks via .claude/settings.json (do NOT clobber an existing one)
  if [ -f "$SCRIPT_DIR/.claude/settings.json" ]; then
    mkdir -p "$REPO_ROOT/.claude"
    if [ ! -f "$REPO_ROOT/.claude/settings.json" ]; then
      info "Copying .claude/settings.json (hook wiring)..."
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

  # Copy review contracts into .ai/skills/
  if [ -d "$SCRIPT_DIR/.ai/skills" ]; then
    mkdir -p "$REPO_ROOT/.ai/skills"
    CONTRACTS_COPIED=false
    for contract in review-constraints.yaml review-envelope.schema.json review-primitives.md; do
      if [ -f "$SCRIPT_DIR/.ai/skills/$contract" ] && [ ! -f "$REPO_ROOT/.ai/skills/$contract" ]; then
        cp "$SCRIPT_DIR/.ai/skills/$contract" "$REPO_ROOT/.ai/skills/$contract"
        CONTRACTS_COPIED=true
      fi
    done
    if [ "$CONTRACTS_COPIED" = true ]; then
      ok "Copied review contracts to .ai/skills/ — fill in review-constraints.yaml with your lenses/invariants"
    else
      ok "Review contracts already present in .ai/skills/"
    fi
  fi

  # Copy SDLC validators into scripts/sdlc/
  if [ -d "$SCRIPT_DIR/scripts/sdlc" ]; then
    if [ ! -d "$REPO_ROOT/scripts/sdlc" ]; then
      info "Copying SDLC validators..."
      mkdir -p "$REPO_ROOT/scripts/sdlc"
      cp -r "$SCRIPT_DIR/scripts/sdlc/"* "$REPO_ROOT/scripts/sdlc/"
      ok "Copied scripts/sdlc/ validators (state machine, phase memory, handoffs)"
    else
      ok "scripts/sdlc/ directory exists"
    fi
  fi
else
  info "Not in a git repo — skipping repo structure setup"
  info "Run this script from within a git repo to set up specs/ and .ai/"
fi

echo ""
echo "========================================="
echo "  Setup complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Fill in .ai/project.md with your repo structure, commands, and conventions"
echo "  2. Install Superpowers in Claude Code: /plugin install superpowers@claude-plugins-official"
echo "  3. Ensure Linear labels exist: claude-code, human"
echo "  4. Write your first spec: cp specs/templates/spec.md specs/SPEC-001-name.md"
echo ""
echo "Configure the spine + engine:"
echo "  6. Fill in .ai/skills/review-constraints.yaml with your repo's real review"
echo "     lenses and invariants (the shipped constraints are generic examples)"
echo "  7. Customize specs/sdlc-state-machine.yaml domain_routing to map your"
echo "     repo's workspaces to owners/reviewers"
echo "  8. Hooks in .claude/hooks/ are ADVISORY by default (they warn, not block)."
echo "     Review .claude/settings.json and tighten them once you trust the flow."
echo "  9. Validate the spine: node scripts/sdlc/validate-state-machine.mjs"
echo ""
