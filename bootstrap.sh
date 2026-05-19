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
warn()  { echo -e "${YELLOW}[warn]${NC}  $1" >&2; }
fail()  { echo -e "${RED}[fail]${NC}  $1" >&2; }

echo ""
echo "========================================="
echo "  AI-Native SDLC — Bootstrap"
echo "========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

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

if ! git rev-parse --git-dir &> /dev/null 2>&1; then
  info "Not in a git repo — skipping repo structure setup"
  info "Run this script from within a git repo to set up specs/ and .ai/"
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
info "Git repo detected: $REPO_ROOT"

# ── Copy .ai/ if not present ──

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

# ── Ensure .ai/skills/ exists in target repo ──
# Source is the canonical $SCRIPT_DIR/.ai/skills/

if [ ! -d "$REPO_ROOT/.ai/skills" ]; then
  if [ -d "$SCRIPT_DIR/.ai/skills" ]; then
    info "Copying .ai/skills/ from sdlc framework to repo..."
    cp -r "$SCRIPT_DIR/.ai/skills" "$REPO_ROOT/.ai/skills"
    ok "Copied .ai/skills/"
  else
    fail ".ai/skills/ not found in sdlc framework at $SCRIPT_DIR"
    exit 1
  fi
else
  ok ".ai/skills/ exists"
fi

# ── Install .claude/skills as a symlink to ../.ai/skills ──

mkdir -p "$REPO_ROOT/.claude"

SKILLS_LINK="$REPO_ROOT/.claude/skills"
SKILLS_TARGET="../.ai/skills"

# Compute a sorted sha256 manifest for a directory tree.
# Output: "<hash> <relative-path>" per file, sorted by relative path.
_manifest() {
  local dir="$1"
  find "$dir" -type f | sort | while read -r f; do
    local rel="${f#$dir/}"
    if command -v sha256sum &>/dev/null; then
      sha256sum "$f" | awk -v r="$rel" '{print $1, r}'
    else
      shasum -a 256 "$f" | awk -v r="$rel" '{print $1, r}'
    fi
  done
}

# Fall back to copying .ai/skills/ into .claude/skills/ with a warning.
_fallback_copy() {
  local reason="$1"
  warn "Symlink creation failed: $reason"
  warn "Falling back to recursive copy (.ai/skills/ → .claude/skills/). Future skill updates require re-running bootstrap."
  mkdir -p "$SKILLS_LINK"
  cp -r "$REPO_ROOT/.ai/skills/." "$SKILLS_LINK/"
}

# Try to create the symlink; fall back to copy on failure.
_install_skills_symlink() {
  # Detect symlink support by probing the TARGET filesystem (not $TMPDIR, which
  # may be on a different, symlink-capable volume from the repo — e.g. a repo
  # on exFAT while $TMPDIR is on APFS).
  local tmp_probe symlink_ok
  mkdir -p "$(dirname "$SKILLS_LINK")"
  tmp_probe="$(dirname "$SKILLS_LINK")/.symlink_probe_$$"
  symlink_ok=true

  if ! ln -s /dev/null "$tmp_probe" 2>/dev/null; then
    symlink_ok=false
  fi
  rm -f "$tmp_probe"

  if [ "$symlink_ok" = false ]; then
    _fallback_copy "filesystem does not support symbolic links"
    return
  fi

  # Attempt the real symlink
  if ln -s "$SKILLS_TARGET" "$SKILLS_LINK" 2>/dev/null; then
    ok ".claude/skills → ../.ai/skills (symlink created)"
    return
  fi

  # Capture the error message for the warning
  local ln_err
  ln_err=$(ln -s "$SKILLS_TARGET" "$SKILLS_LINK" 2>&1 || true)
  _fallback_copy "$ln_err"
}

if [ -L "$SKILLS_LINK" ]; then
  # Already a symlink — check if it's the correct target
  existing_target=$(readlink "$SKILLS_LINK")
  if [ "$existing_target" = "$SKILLS_TARGET" ]; then
    ok ".claude/skills is already the correct symlink → ../.ai/skills (no-op)"
  else
    warn ".claude/skills is a symlink but points to '$existing_target' instead of '$SKILLS_TARGET'"
    warn "Remove .claude/skills manually and re-run bootstrap to fix."
  fi
elif [ -d "$SKILLS_LINK" ]; then
  # Existing regular directory — check for collision
  info "Existing .claude/skills/ directory found — checking for divergence..."

  manifest_ai=$(_manifest "$REPO_ROOT/.ai/skills")
  manifest_claude=$(_manifest "$SKILLS_LINK")

  if [ -z "$manifest_ai" ] || [ -z "$manifest_claude" ]; then
    fail "manifest computation failed — refusing to modify .claude/skills/"
    exit 1
  fi

  if [ "$manifest_ai" = "$manifest_claude" ]; then
    info "Byte-identical contents — removing directory and replacing with symlink..."
    rm -rf "$SKILLS_LINK"
    if ln -s "$SKILLS_TARGET" "$SKILLS_LINK" 2>/dev/null; then
      ok ".claude/skills upgraded: directory replaced by symlink → ../.ai/skills"
    else
      ln_err=$(ln -s "$SKILLS_TARGET" "$SKILLS_LINK" 2>&1 || true)
      _fallback_copy "$ln_err"
    fi
  else
    # Divergent — print divergent files and exit non-zero; do NOT modify
    fail ".claude/skills/ exists with contents that differ from .ai/skills/ — refusing to modify."
    echo "" >&2
    # Files in .claude/skills that differ from .ai/skills (by hash)
    comm -23 \
      <(echo "$manifest_claude" | sort) \
      <(echo "$manifest_ai"    | sort) | while IFS= read -r _line; do
        echo "  divergent (in .claude/skills): ${_line#* }" >&2
      done
    # Files present in .ai/skills but absent from .claude/skills
    comm -13 \
      <(echo "$manifest_claude" | sort) \
      <(echo "$manifest_ai"    | sort) | while IFS= read -r _line; do
        echo "  missing from .claude/skills: ${_line#* }" >&2
      done
    echo "" >&2
    echo "Resolve manually: delete .claude/skills/ if safe to do so, then re-run bootstrap." >&2
    exit 1
  fi
else
  # No .claude/skills at all — create the symlink (or fall back to copy)
  _install_skills_symlink
fi

echo ""

# ── Directory + template setup ──

info "Setting up specs/ structure..."

# specs/baselines/ (AC-003)
mkdir -p "$REPO_ROOT/specs/baselines"
ok "specs/baselines/ ready"

# specs/initiatives.md — copy from template only if missing (no overwrite) (AC-004)
if [ ! -f "$REPO_ROOT/specs/initiatives.md" ]; then
  if [ -f "$SCRIPT_DIR/templates/initiatives.md" ]; then
    cp "$SCRIPT_DIR/templates/initiatives.md" "$REPO_ROOT/specs/initiatives.md"
    ok "Copied templates/initiatives.md → specs/initiatives.md"
  else
    warn "templates/initiatives.md not found in $SCRIPT_DIR — skipping"
  fi
else
  ok "specs/initiatives.md already exists (no overwrite)"
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
    mkdir -p "$REPO_ROOT/specs/templates"
    cp "$SCRIPT_DIR/templates/"*.md "$REPO_ROOT/specs/templates/"
    ok "Copied spec templates"
  fi
else
  ok "Spec templates exist"
fi

echo ""

# ── Validation ──

info "Validating skill installation..."

EXPECTED_SKILLS=(
  create-domain-skill
  intent-triage
  pr-reviewer
  sdlc-code-review
  sdlc-code-standards
  spec-amendment
  spec-authoring
  spec-completion
  spec-execution
  spec-reviewer
  task-decomposition
)

MISSING=0
VALIDATED=0

for skill in "${EXPECTED_SKILLS[@]}"; do
  if [ -f "$REPO_ROOT/.claude/skills/$skill/SKILL.md" ]; then
    VALIDATED=$((VALIDATED + 1))
  else
    echo "[fail]  Missing skill: $skill (expected .claude/skills/$skill/SKILL.md)" >&2
    MISSING=$((MISSING + 1))
  fi
done

# Check review-primitives.md (shared primitives doc, not a skill directory)
if [ -f "$REPO_ROOT/.claude/skills/review-primitives.md" ]; then
  VALIDATED=$((VALIDATED + 1))
else
  echo "[fail]  Missing: review-primitives.md (expected .claude/skills/review-primitives.md)" >&2
  MISSING=$((MISSING + 1))
fi

TOTAL=$((${#EXPECTED_SKILLS[@]} + 1))

if [ "$MISSING" -gt 0 ]; then
  fail "$MISSING of $TOTAL expected entries missing from .claude/skills/"
  exit 1
fi

ok "Validated $VALIDATED/$TOTAL skill entries in .claude/skills/"

echo ""
echo "========================================="
echo "  Setup complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Fill in .ai/project.md with your repo's structure, commands, and conventions"
echo "  2. Install Superpowers in Claude Code: /plugin install superpowers@claude-plugins-official"
echo "  3. Customize .ai/CLAUDE.md with project-specific context for your agents"
echo "  4. Ensure Linear labels exist: jules, claude-code, human"
echo "  5. Write your first spec using the SPEC-001/SPEC-002 model as a working example:"
echo "       cp specs/templates/spec.md specs/SPEC-NNN-name.md"
echo "  6. Skills now available in .claude/skills/:"
for skill in "${EXPECTED_SKILLS[@]}"; do
  echo "       - $skill"
done
echo "       - review-primitives.md (shared review doc)"
echo ""
echo "  See specs/SPEC-001-*.md and specs/SPEC-002-*.md for the graded-review and"
echo "  wave-based orchestration models your team will use."
echo ""
