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

---

## S6 — docs/worktrees.md, and every rule cites it

**Merged:** PR #97
**What changed:** docs/worktrees.md states every rule; SOP §1 creates or re-enters .claude/worktrees/spec-NNN and runs worktrees.setup; §7.4 and §8 remove it from CLAUDE_PROJECT_DIR and run worktrees --fetch --prune --own; subagents branch from origin/feat/spec-NNN; nothing-lingers narrowed to step worktrees in five places; goal paths absolute.

---

## Simplify pass, and a gap it found

**Merged:** 9043e8a (fast-forwarded onto `feat/spec-011`, per SOP §6.1), then a fix PR.
**What changed:** The simplify pass removed duplication in `worktrees.mjs` (one worktree listing per prune, one read per spec), `lib/sdlc-paths.mjs`, and both hooks, with no behaviour change: 467 of 467 tests passed before and after. It also reported that `user-prompt-submit.mjs` > `readSpecPhase` called `specIndexPaths()` unguarded. The hook's top-level catch kept that silent, but a throw there also suppressed every other block the hook prints, the worktree nudge included. The fix moves the call inside the existing guard. A regression test makes `.claude/worktrees` a file, which makes listing it throw: on the previous tip the hook printed nothing, and after the fix it routes.

---

## Gate round 1 — 4 reviewers, 7 distinct majors fixed at the root

**Panel:** `integration-reviewer`, `task-reviewer` (conventions, SDLC-GATE-TESTED), `security-reviewer`, `pr-reviewer` (adversarial). All four envelopes validated with `stamp-envelope`.

**Fixed:**
- **`spec-closed` read status from the main checkout only** (security, integration). When the main checkout was on a branch without the spec, a live spec worktree was pruned with its `.env.local`. Status is now read from the worktree's own tree first, and a spec that resolves nowhere is reported but never removed.
- **A live `spec-NNN` worktree is never a stray, whatever its branch** (adversarial nit, data-loss direction), so a step branch whose upstream is gone cannot get it pruned. This narrows `--prune` further, in the direction F-3e582b60 and D-015 set, and changes no AC.
- **Removing a candidate deleted worktrees nested inside it** (security). A candidate that holds another worktree is now kept. SOP §7.4 and §8 remove through `worktrees --own`, never a plain `git worktree remove`.
- **An unconditional `git worktree prune` orphaned hand-moved worktrees** (security, adversarial). It is gone, and `--own` skips prunable entries.
- **Subagents on `worktree-agent-<id>` were gated** (adversarial, integration). SOP §5 and §6.1, the executor brief and the doc now name the branches: `claude/SPEC-NNN-S<n>` for a fan-out step and `claude/SPEC-NNN-simplify` for the simplify pass, checked out before the first edit.
- **`CLAUDE_PROJECT_DIR` is unset in an executor's shell** (conventions suggestion, reproduced here: the Bash tool's environment does not carry it). `$CLAUDE_PROJECT_DIR/.claude/...` would have expanded to `/.claude/...`. SOP §1 and the doc now set it from `git rev-parse --git-common-dir` when it is unset, which keeps AC-004's text true.
- **An empty `worktrees.setup` was rejected though the schema example shows it** (conventions, adversarial). Empty now means unset, and only a non-string is rejected.
- **The nudge fired in a plain git repo** (conventions). It now requires an SDLC repo, so no marker and no message elsewhere.

**Nits fixed:**
- `agent` precedence is checked before `outside`.
- The nudge names the `run.mjs` form.
- Goal paths are absolute in `CLAUDE.md`, `agent-orchestration.md` and `docs/setup.md`.
- `sync-refresh --plan` lists the `.gitignore` lines it will add.
- A locked or refused removal is reported with git's reason, not as "dirty".
- The SOP §1 block handles a deleted worktree directory and a local-only branch. Both were run verbatim against a bare remote.
- `nestedWorktree` requires the project's git common dir, so an unrelated repo under `.claude/worktrees/` is never a root.
- The schema and the doc say `worktrees.setup` runs with the developer's credentials.
- New tests pin: list mode runs no `git status` (a PATH shim); `--force` never reaches git; an override recorded in the main checkout covers a worktree edit; a hand-moved worktree stays registered.

**Accepted:** recording SC-2's trigger as a `[deferred-verify]` intent, which belongs to spec-completion.

---

## Gate round 2 — 6 distinct majors, all from round 1's fixes, fixed at the root

**Panel:** the same four reviewers, each seeded with its round-1 envelope. All four envelopes are valid. Every round-1 finding is closed. All six round-2 majors are regressions or gaps the round-1 fixes introduced.

**Fixed:**
- **SOP §1's resume ran a repo-wide `git worktree prune`** (all four reviewers). It brought back the orphaning round 1 removed from the script. It now runs `git worktree remove .claude/worktrees/spec-NNN 2>/dev/null || true`, which clears only that spec's stale registration. The same change is in `docs/worktrees.md`.
- **Own-tree-first status hid a finished spec's leftover worktree** (integration, adversarial). Status now comes from three sources: the default branch through git (`origin/HEAD`, then `origin/main`, then `main`, archive included), the worktree's own tree, and the main checkout. Because a status only moves forward, a terminal status in any source wins.
- **`export CLAUDE_PROJECT_DIR` does not survive between shell calls** (adversarial, conventions nit). The skill, the SOP and the doc now print the main checkout's path once, with `git worktree list --porcelain | sed -n '1s/^worktree //p'`, before arming the goal, and write it literally wherever `$CLAUDE_PROJECT_DIR` appears.
- **The nested-worktree guard missed a differently-cased path on macOS** (security). Paths are now compared through `realpathSync.native`.

**Nits fixed:**
- An unresolved `spec-NNN` is never removable, whatever its branch.
- An unparsable `.sdlc/config.yaml` in one worktree no longer stops the script.
- The §1 resume fast-forwards to the remote before pushing.
- §5 and §6.1 delete the subagent's local branch after removing its worktree.
- The nudge names the absolute path of the script it ran and "docs/worktrees.md in the SDLC plugin".
- A refused removal reports git's `fatal:` line.
- The hand-made worktree recipe checks `git worktree list` before removing.
- The `.gitignore` line filter is shared as `install-payload.mjs` > `missingLines`.
- New tests pin `--own` skipping a prunable entry, the hand-moved branch-gone case, and `--plan` printing the `.gitignore` lines.

**Carried forward and accepted:** recording SC-2's trigger as a `[deferred-verify]` intent, at spec-completion.

---

## SPEC DEVIATION — the shipped prune and exit are narrower than the spec's Design text

**Date:** 2026-10-02
**What the spec says:**
- Design > Detection: `--prune` "runs `git worktree prune`".
- Design > Delivery in a spec worktree: the exit runs `git worktree remove` and then `worktrees.mjs --fetch --prune --own`.
- The Design gives no source tree for a spec's status.

**What shipped, after gate rounds 1 and 2:**
- No `git worktree prune` anywhere: it deregisters hand-moved worktrees.
- The exit is the single `worktrees --own` command, which also refuses to remove a tree that holds another worktree.
- A live `spec-NNN` is never a stray, and an unresolved one is never removable.
- Status comes from the default branch, the worktree and the main checkout, with a terminal status winning.

**Why this is not an amendment now:** every change removes fewer worktrees than the Design text allows, in the direction F-3e582b60 and D-015 set. No AC changes: AC-003's "remove without `--force` … and run `worktrees.mjs --fetch --prune --own`" holds for the single command. The spec's Design text should be brought in line by a cosmetic amendment at spec-completion.

---

## Gate round 3 — at the ADR-004 cap; three majors disclosed, not fixed

**Panel:** the same four reviewers, seeded with their round-2 envelopes. All four envelopes are valid. Every round-2 finding is closed. Integration and conventions found no blocker or major.

**Disclosed in the PR body under `## Disclosed, not fixed`.** All three are data-loss paths, each reproduced and each with a named fix:
1. "A terminal status wins" lets a stale main checkout override a reopened live spec (`worktrees.mjs` > `specStatus`).
2. A pushed tag named `origin/HEAD` shadows the remote ref in `statusOnDefaultBranch`.
3. A symlinked `.claude/worktrees` makes SOP §1's resume `git worktree remove` delete a live worktree.

**Accepted as follow-ups:** the round-3 nits listed in the PR body.
