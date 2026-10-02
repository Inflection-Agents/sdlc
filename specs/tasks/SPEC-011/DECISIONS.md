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
