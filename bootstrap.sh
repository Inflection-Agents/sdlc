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

  # Wire Claude Code's skill dir as a SYMLINK to .ai/skills (the canonical location),
  # so the two never drift. (.ai/ — including skills/ — was copied above.)
  if [ ! -e "$REPO_ROOT/.claude/skills" ]; then
    if [ -d "$REPO_ROOT/.ai/skills" ]; then
      info "Linking .claude/skills → ../.ai/skills ..."
      mkdir -p "$REPO_ROOT/.claude"
      ln -s ../.ai/skills "$REPO_ROOT/.claude/skills"
      ok "Linked .claude/skills → ../.ai/skills — Claude Code loads skills from .ai/skills"
    fi
  else
    ok ".claude/skills already present"
  fi

  # ── Spine: state machine, hooks, review contracts, validators + gates ──

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
    # The goal leash is the one hook that BLOCKS. Its fixture tests are its only
    # mechanical bound, so a repo that gets the hook must get the tests too.
    if [ -d "$SCRIPT_DIR/.claude/hooks/__tests__" ]; then
      mkdir -p "$REPO_ROOT/.claude/hooks/__tests__"
      for hook_test in "$SCRIPT_DIR/.claude/hooks/__tests__/"*.mjs; do
        [ -e "$hook_test" ] || continue
        test_name="$(basename "$hook_test")"
        # Same "only if absent" rule as the hooks themselves. Copying unconditionally
        # would drop NEW fixtures next to an OLD hook on a re-run — the red,
        # partial-upgrade state the warning below tells the user to avoid.
        if [ ! -f "$REPO_ROOT/.claude/hooks/__tests__/$test_name" ]; then
          cp "$hook_test" "$REPO_ROOT/.claude/hooks/__tests__/$test_name"
        fi
      done
    fi
    if [ "$HOOKS_COPIED" = true ]; then
      ok "Copied SDLC hooks to .claude/hooks/ (advisory by default; goal-leash tests in __tests__/)"
    else
      ok ".claude/hooks/ already populated"
    fi
  fi

  # Reviewer agent definitions. The registry routes a lens to an agent NAME
  # (ADR-001), so without these files the routing resolves to nothing and the panel
  # cannot be dispatched. Their `tools:` line is also the independence mechanism:
  # a reviewer with no Edit/Write cannot fix what it grades, which is enforcement
  # rather than instruction.
  if [ -d "$SCRIPT_DIR/.claude/agents" ]; then
    mkdir -p "$REPO_ROOT/.claude/agents"
    for agent in "$SCRIPT_DIR/.claude/agents/"*.md; do
      [ -f "$agent" ] || continue
      agent_name=$(basename "$agent")
      if [ ! -f "$REPO_ROOT/.claude/agents/$agent_name" ]; then
        cp "$agent" "$REPO_ROOT/.claude/agents/$agent_name"
      fi
    done
    ok "Copied reviewer agents to .claude/agents/ (no Edit/Write by design)"
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

  # ── Upgrading an existing bootstrap ──
  #
  # Every copy step above is guarded by "only if absent", so re-running this script on
  # a repo bootstrapped from an OLDER version of the framework changes nothing — it
  # keeps its old hooks and skills. That is deliberate (never clobber local edits), but
  # it means an upgrade is a manual, deliberate act. Detect the most consequential
  # mismatch and say so loudly.
  if [ -f "$REPO_ROOT/.claude/workflows/execute-spec.js" ]; then
    warn "This repo still has .claude/workflows/execute-spec.js — the RETIRED execution engine (ADR-003)."
    echo "  You are on a pre-ADR-003 bootstrap. To upgrade:"
    echo "    1. rm .claude/workflows/execute-spec.js   (git history keeps it)"
    echo "    2. Replace .ai/skills/spec-execution/ with this framework's SKILL.md + SOP.md"
    echo "    3. Replace .claude/hooks/stop-handoff.mjs (it now carries the goal leash) and"
    echo "       copy .claude/hooks/__tests__/ alongside it"
    echo "    4. Copy the new scripts/sdlc/ gates: plan-gate.mjs, reviewer-routing.mjs,"
    echo "       validate-review-envelope.mjs, check-review-constraint-globs.mjs"
    echo "    5. Remove the code-review phase from specs/sdlc-state-machine.yaml and re-run"
    echo "       node scripts/sdlc/gen-handoffs.mjs"
    echo ""
    echo "  Partial upgrades are the dangerous case: the new skill arms a goal file that an"
    echo "  OLD stop-handoff.mjs never reads, so the run has no persistence enforcement while"
    echo "  the docs say it does. Upgrade the skill and the hook together."
    echo ""
  fi

  # Copy the CI workflow that runs the gates. Without it, a consuming repo has the
  # validators but nothing runs them — and the "and by CI" half of every re-homed
  # guarantee (ADR-002, ADR-003) would be true only in the upstream framework.
  # EVERY workflow, not just the validator one. A workflow added upstream but not
  # listed here never reaches a consuming repo, which is how the merge-time completion
  # check shipped as "delivered" while running nowhere but the framework itself.
  if [ -d "$SCRIPT_DIR/.github/workflows" ]; then
    mkdir -p "$REPO_ROOT/.github/workflows"
    for wf in "$SCRIPT_DIR/.github/workflows/"*.yml; do
      [ -f "$wf" ] || continue
      wf_name=$(basename "$wf")
      if [ ! -f "$REPO_ROOT/.github/workflows/$wf_name" ]; then
        cp "$wf" "$REPO_ROOT/.github/workflows/$wf_name"
        ok "Copied .github/workflows/$wf_name"
      else
        ok ".github/workflows/$wf_name exists"
      fi
    done
  fi

  # The ripgrep fence for archived specs. archive-specs.mjs writes the per-directory
  # fences itself, but the root file carries the rationale and the escape hatches, and
  # a reader who greps and finds nothing needs it.
  if [ -f "$SCRIPT_DIR/.ignore" ] && [ ! -f "$REPO_ROOT/.ignore" ]; then
    cp "$SCRIPT_DIR/.ignore" "$REPO_ROOT/.ignore"
    ok "Copied .ignore — hides archived specs from default search (still tracked in git)"
  fi

  # Per-session SDLC state must never be committed: a goal file carries the run's
  # statement and exit criteria, and an unkeyed one readable by another session is an
  # unauthenticated directive channel into an autonomous loop (ADR-003).
  IGNORE_FILE="$REPO_ROOT/.gitignore"
  if ! grep -q "\.sdlc-goal" "$IGNORE_FILE" 2>/dev/null; then
    info "Adding .claude/.sdlc-* ignore rules..."
    {
      printf '\n# Per-session SDLC state written by the hooks (goal leash, counters, overrides)\n'
      printf '.claude/.sdlc-goal*\n.claude/.sdlc-goalblocks-*\n.claude/.sdlc-override*\n.claude/.sdlc-handoff-*\n'
    } >> "$IGNORE_FILE"
    ok "Added .claude/.sdlc-* ignore rules to .gitignore"
  else
    ok ".gitignore already ignores .claude/.sdlc-* state"
  fi

  # Copy SDLC validators into scripts/sdlc/ — per file, "only if absent". A
  # whole-directory guard (only copy if scripts/sdlc/ doesn't exist AT ALL) left a
  # pre-ADR-003 repo with NONE of the new gates: the directory already existed with
  # just the older validators, so the new plan-gate.mjs / reviewer-routing.mjs /
  # validate-review-envelope.mjs / check-review-constraint-globs.mjs were silently
  # skipped — while .github/workflows/ and .claude/hooks/__tests__/ (below) WERE
  # copied, since those directories were genuinely new. That combination shipped a
  # CI workflow invoking gates that were not there. Copying per file closes the gap
  # without ever overwriting a repo's own edits to an existing file.
  if [ -d "$SCRIPT_DIR/scripts/sdlc" ]; then
    mkdir -p "$REPO_ROOT/scripts/sdlc"
    SDLC_SCRIPTS_COPIED=false
    for sdlc_file in "$SCRIPT_DIR/scripts/sdlc/"*; do
      [ -f "$sdlc_file" ] || continue
      sdlc_name="$(basename "$sdlc_file")"
      if [ ! -f "$REPO_ROOT/scripts/sdlc/$sdlc_name" ]; then
        cp "$sdlc_file" "$REPO_ROOT/scripts/sdlc/$sdlc_name"
        SDLC_SCRIPTS_COPIED=true
      fi
    done
    if [ "$SDLC_SCRIPTS_COPIED" = true ]; then
      ok "Copied scripts/sdlc/ validators + delivery gates (state machine, phase memory, handoffs, plan gate, reviewer routing, envelope validation, registry globs)"
    else
      ok "scripts/sdlc/ already has every file this bootstrap ships"
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
echo "Configure the spine:"
echo "  5. Fill in .ai/skills/review-constraints.yaml with your repo's real review"
echo "     lenses and invariants (the shipped constraints are generic examples)"
echo "  6. Customize specs/sdlc-state-machine.yaml domain_routing to map your"
echo "     repo's workspaces to owners/reviewers"
echo "  7. Hooks in .claude/hooks/ are ADVISORY by default (they warn, not block) —"
echo "     EXCEPT the delivery goal leash in stop-handoff.mjs, which blocks on Stop"
echo "     by design (bounded, fail-open; released by met/escalated or deleting the goal file)."
echo "     Review .claude/settings.json and tighten the others once you trust the flow."
echo "  8. Validate the spine: node scripts/sdlc/validate-state-machine.mjs"
echo "     and check the registry rows resolve: node scripts/sdlc/check-review-constraint-globs.mjs"
echo "  9. If this repo uses vitest/jest: exclude .claude/hooks/__tests__/ from its config —"
echo "     those are node:test files (run via 'node --test'), not your test runner's."
echo ""
