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

# ── Jules CLI (optional — falls back to Claude Code if not available) ──

info "Checking Jules CLI (optional)..."

JULES_AVAILABLE=false

if command -v jules &> /dev/null; then
  ok "Jules CLI installed"
  JULES_AVAILABLE=true
else
  info "Jules CLI not found. To install (optional):"
  echo "    npm install -g @google/jules && jules login"
  echo ""
fi

if [ -n "${JULES_API_KEY:-}" ]; then
  ok "JULES_API_KEY is set"
  # Verify it works
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "X-Goog-Api-Key: $JULES_API_KEY" \
    https://julius.googleapis.com/v1alpha/sources 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "Jules API key is valid"
    JULES_AVAILABLE=true
  else
    warn "Jules API returned HTTP $HTTP_CODE — key may be invalid"
  fi
else
  info "JULES_API_KEY not set. To configure (optional):"
  echo "    1. Go to https://jules.google.com/settings#api"
  echo "    2. Generate an API key"
  echo "    3. echo 'export JULES_API_KEY=\"your-key\"' >> ~/.zshrc && source ~/.zshrc"
  echo ""
fi

if [ "$JULES_AVAILABLE" = false ]; then
  warn "Jules not available — jules-labeled tasks will fall back to Claude Code execution."
  echo "  The SDLC works fully without Jules. You lose parallel cloud execution but"
  echo "  the same task files, acceptance criteria, and review process apply."
  echo ""
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
echo "  3. Customize .ai/CLAUDE.md with Jules source IDs for your repo"
echo "  4. Ensure Linear labels exist: jules, claude-code, human"
echo "  5. Write your first spec: cp specs/templates/spec.md specs/SPEC-001-name.md"
echo ""
