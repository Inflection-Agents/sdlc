---
spec: SPEC-011
spec_version: 2
---

## Steps

### S1: A nested worktree is its own root, and the walkers skip it
- Covers: AC-009, AC-010
- Changes: `scripts/sdlc/lib/sdlc-paths.mjs`, `scripts/sdlc/lib/sdlc-paths.test.mjs`, `scripts/sdlc/check-stale-citations.mjs`, `scripts/sdlc/check-stale-citations.test.mjs`, `scripts/sdlc/check-review-constraint-globs.mjs`, `scripts/sdlc/check-review-constraint-globs.test.mjs`, `init-payload/.sdlc/scripts/lib/sdlc-paths.mjs`, `init-payload/.sdlc/scripts/check-stale-citations.mjs`, `init-payload/.sdlc/scripts/check-review-constraint-globs.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_ROOT node --test .sdlc/scripts/lib/sdlc-paths.test.mjs .sdlc/scripts/check-stale-citations.test.mjs .sdlc/scripts/check-review-constraint-globs.test.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- Risk: high
- Notes: `resolveRoot` is imported by every script and hook, so its doc comment changes too, and the existing tests that assume `CLAUDE_PROJECT_DIR` always wins stay green for a start directory outside `.claude/worktrees/`. Detect a linked worktree with `git rev-parse --show-toplevel` from the start directory, never by path matching alone, and only trust it when it sits under `<CLAUDE_PROJECT_DIR>/.claude/worktrees/`. A real `git worktree add` fixture is required (SPEC-011 > Risks).

### S2: worktrees.mjs lists and prunes strays
- Covers: AC-005, AC-006, AC-007, AC-014
- Changes: `scripts/sdlc/worktrees.mjs`, `scripts/sdlc/worktrees.test.mjs`, `scripts/sdlc/cli-invocation.test.mjs`, `init-payload/.sdlc/scripts/worktrees.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_ROOT node --test .sdlc/scripts/worktrees.test.mjs .sdlc/scripts/cli-invocation.test.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S1
- Risk: high
- Notes: the fixture builds a real repo with a bare remote, so `branch-gone` is exercised by deleting the remote branch and fetching. Precedence is `agent` first, then the order the Design lists. `--prune` removes only `branch-gone` and `spec-closed` strays under `.claude/worktrees/` (D-015), and never passes `--force` or deletes a branch. List mode runs no `git status` (AC-008 relies on it).

### S3: The hooks treat a worktree as its own tree, and nudge once
- Covers: AC-008, AC-011, AC-012
- Changes: `hooks/pre-tool-use-edit-write.mjs`, `hooks/stop-handoff.mjs`, `hooks/user-prompt-submit.mjs`, `hooks/__tests__/*.test.mjs`, `.gitignore`, `scripts/sdlc/lib/sdlc-paths.mjs`, `init-payload/.sdlc/scripts/lib/sdlc-paths.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_ROOT node --test hooks/__tests__/*.test.mjs`
- After: S2
- Risk: high
- Notes: `.claude/hooks` is a symlink to `hooks/` in this repo. The edit gate maps a target under `.claude/worktrees/<name>/` to that worktree before classifying it and reads that worktree's branch (`git -C`). Both hooks read `_index.yaml` from `.claude/worktrees/spec-NNN/` when it exists. The nudge reuses the layout nudge's marker shape and calls `worktrees.mjs` list mode, failing silent. Add `.claude/.sdlc-worktree-nudge-*` to this repo's `.gitignore`.

### S4: worktrees.setup in the config schema
- Covers: AC-015
- Changes: `skills/sdlc-config-schema.md`, `scripts/sdlc/validate-sdlc-config.mjs`, `scripts/sdlc/validate-sdlc-config.test.mjs`, `init-payload/.sdlc/scripts/validate-sdlc-config.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_ROOT node --test .sdlc/scripts/validate-sdlc-config.test.mjs`, `node .sdlc/scripts/validate-sdlc-config.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`

### S5: The worktree ignore line reaches new and existing repos
- Covers: AC-013
- Changes: `init-payload/.gitignore`, `scripts/sdlc/sync-refresh.mjs`, `scripts/sdlc/sync-refresh.test.mjs`, `scripts/sdlc/install-payload.test.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `env -u CLAUDE_PROJECT_DIR -u CLAUDE_PLUGIN_ROOT node --test .sdlc/scripts/sync-refresh.test.mjs .sdlc/scripts/install-payload.test.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- Notes: reuse `install-payload.mjs` > `appendLines` for the merge, so a second sync writes nothing. The merge is the one root-file change on the layout-2 refresh path (SPEC-011 > Design, ADR-009).

### S6: docs/worktrees.md, and every rule cites it
- Covers: AC-001, AC-002, AC-003, AC-004
- Changes: `docs/worktrees.md`, `CLAUDE.md`, `agent-orchestration.md`, `skills/spec-execution/SKILL.md`, `skills/spec-execution/SOP.md`, `docs/executor-brief.md`, `.sdlc/state-machine.yaml`, `init-payload/.sdlc/state-machine.yaml`, `docs/sdlc.md`, `skills/*/SKILL.md`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `rg -n 'docs/worktrees.md' CLAUDE.md agent-orchestration.md skills/spec-execution/SKILL.md skills/spec-execution/SOP.md docs/executor-brief.md .sdlc/state-machine.yaml`, `rg -n 'spec worktree' CLAUDE.md agent-orchestration.md skills/spec-execution/SKILL.md skills/spec-execution/SOP.md .sdlc/state-machine.yaml`, `cmp .sdlc/state-machine.yaml init-payload/.sdlc/state-machine.yaml`, `node .sdlc/scripts/gen-handoffs.mjs --check`, `node .sdlc/scripts/validate-state-machine.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S2, S3, S4, S5
- Risk: medium
- Notes: `skills/*/SKILL.md` and `docs/sdlc.md` change only through `gen-handoffs.mjs`, which regenerates the handoff footers from the edited `exit_condition`. The doc names the commands the scripts from S2 to S5 accept, so it is written last. Every goal-file and block-counter path in the skill becomes `$CLAUDE_PROJECT_DIR/.claude/...` (AC-004).

## Owner decisions

None at sign-off.

## End-to-end validation

- Every `run:` step of `.github/workflows/sdlc-validate.yml`, locally on the integration tip, with `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` unset.
- A dry delivery in a scratch repo with a bare remote. SOP §1 creates `.claude/worktrees/spec-900` and runs a configured `worktrees.setup`. From inside the worktree, `resolveRoot` returns the worktree. An edit to `src/` there is allowed on a step branch. A goal file at `$CLAUDE_PROJECT_DIR/.claude/` blocks a Stop. §7.4 removes the worktree, and `worktrees.mjs` then reports nothing for `spec-900`.
- A strays fixture with one worktree of each kind: the first prompt prints the nudge once, and `--prune` removes only the clean `branch-gone` and `spec-closed` strays.
- A fresh `/sdlc-init` repo, and a layout-2 repo after `sync-refresh.mjs --apply`, each have `.claude/worktrees/` in `.gitignore`, and `scan-legacy-paths.mjs` reports 0 in both.
