# SPEC-011 — decision log

One entry per guide step, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION`
heading goes in the moment it happens, not batched at the end.

This log is what makes the narrow escalation bar safe. `spec-execution` escalates on four
checkable triggers and decides everything else; without a written record that trade is
invisible, and a reader cannot reconstruct why a run diverged. Entries are append-only and
in chronological order.

---

## EXECUTIVE DECISION — no session task-list tool

**Date:** 2026-10-02
**Question:** spec-execution asks for a visible session task list, and this session exposes no task-list tool.
**Decided:** the run's status surface is `_index.yaml`, which each step flips as it merges, together with this log and a short report as each step merges.
**Why:** it is the substitute SPEC-007's and SPEC-009's runs used, and it keeps the three status records in agreement.

---

## EXECUTIVE DECISION — the run stays in the main checkout

**Date:** 2026-10-02
**Question:** SPEC-011 introduces the spec-worktree procedure, and it lands only in S6. Does this run adopt it?
**Decided:** no. The run follows the SOP as it stands at the run's start and works in the main checkout, as `KICKOFF.md` instructs. Changing procedure mid-run would mean an S1-S5 checkout and an S6 checkout that differ.

---

## S1 — A nested worktree is its own root, and the walkers skip it

**Merged:** PR #92
**What changed:** resolveRoot prefers a linked worktree under CLAUDE_PROJECT_DIR/.claude/worktrees/ that contains the start directory (git decides, not the path); check-stale-citations and check-review-constraint-globs skip .claude/worktrees/. Later steps import nestedWorktree() and WORKTREES_REL from lib/sdlc-paths.mjs.

---

## S2 — worktrees.mjs lists and prunes strays

**Merged:** PR #93
**What changed:** worktrees.mjs reports agent, outside, branch-gone (upstream gone), detached and spec-closed strays from local refs; --fetch prunes remote refs first; --prune removes only clean branch-gone and spec-closed strays under .claude/worktrees/, never forces, never deletes a branch; --own spec-NNN removes only that spec worktree. Exports findStrays() for the S3 nudge.

---

## EXECUTIVE DECISION — guide change: S3 puts the phase-memory lookup in lib/sdlc-paths.mjs

**Date:** 2026-10-02
**Question:** Both hooks must read a spec's `_index.yaml` from its spec worktree when one exists. The hooks share code only through `lib/sdlc-paths.mjs`, which they already import, and S3's `Changes:` did not list it.
**Decided:** add `specIndexPaths()` to `lib/sdlc-paths.mjs`, used by both hooks. S3's `Changes:` gains that file, its payload copy and the manifest. No AC, scope or design changes.

---

## S3 — The hooks treat a worktree as its own tree, and nudge once

**Merged:** PR #94
**What changed:** The edit gate grades a target under .claude/worktrees/<name>/ by its path and branch inside that worktree; both hooks read a spec's _index.yaml from its spec worktree via lib/sdlc-paths.mjs specIndexPaths(); the prompt hook nudges once per session from worktrees.mjs --json. Guide change: lib/sdlc-paths.mjs added to S3.

---

## S4 — worktrees.setup in the config schema

**Merged:** PR #95
**What changed:** validate-sdlc-config.mjs rule 5 accepts worktrees.setup only as one non-empty command string; sdlc-config-schema.md documents it. S6's SOP §1 reads this key.

---

## EXECUTIVE DECISION — guide change: S5 has no payload copy of sync-refresh.mjs

**Date:** 2026-10-02
**Question:** S5's `Changes:` listed `init-payload/.sdlc/scripts/sync-refresh.mjs`, but that script is plugin-only (its header says "Usage (plugin-only)", and `git ls-files` shows no payload copy), because `/sdlc-sync` runs the plugin's copy against the adopter.
**Decided:** drop the payload path from S5's `Changes:`. The `.gitignore` merge reaches adopters through the plugin's `sync-refresh.mjs` and the payload's `.gitignore`. No AC, scope or design changes. AC-014 covers the payload copies of the scripts that have one.

---

## S5 — The worktree ignore line reaches new and existing repos

**Merged:** PR #96
**What changed:** init-payload/.gitignore gains .claude/worktrees/; sync-refresh.mjs applyRefresh merges missing .gitignore lines through install-payload appendLines, idempotently. Guide change: no payload copy of the plugin-only sync-refresh.mjs.
