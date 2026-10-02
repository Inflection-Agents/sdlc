---
id: SPEC-011
title: "Worktree lifecycle: when to create one, where it goes, and when it is removed"
status: draft
version: 1
supersedes:
initiative: INI-004
owner: franklin
created: 2026-10-02
updated: 2026-10-02
tags: [worktrees, spec-execution, hooks, multi-agent]
depends_on: [SPEC-002, SPEC-009]
linear_project:
---

## Problem

Worktrees in an SDLC repo have no prescribed location, naming or owner, so they accumulate. On 2026-10-01 the owner counted 23 worktrees in high-gear-apps across three kinds of location: 19 under `.claude/worktrees/`, 3 in sibling directories of `~/_code/`, and the main checkout (`specs/intents.md` > "Prescribe when to create worktrees, where they go, and when they are removed"). They have since been removed by hand. `git -C ~/_code/high-gear-apps worktree list` at `a81e3e51` shows 3, one of them on a detached HEAD (`specs/decisions/SPEC-011.md` > Research). Nothing stops the sprawl coming back.

Three creators make worktrees: the Agent tool's `isolation: "worktree"`, a session that enters a worktree, and a hand-run `git worktree add`. The framework's rules cover the first only. They say a writing subagent must use a worktree (`skills/spec-execution/SOP.md:146`) and that no worktree may linger after a step (`skills/spec-execution/SKILL.md:121`, ADR-003 decision 7). They do not say where a worktree goes, when a session should use one, or who removes an Agent-tool worktree that kept changes. A search of `skills/`, `agents/`, `docs/`, `hooks/`, `scripts/sdlc/`, `CLAUDE.md` and `init-payload/` at `c0ac336` finds no location rule (`specs/decisions/SPEC-011.md` > Research). A leftover worktree is a stale base that the next session can branch from.

Delivery today occupies the main checkout. `spec-execution` cuts `feat/spec-NNN` there (`SOP.md:16-23`), so a second session on the same repo shares the working tree with a run in flight. That is the condition behind the 2026-04-24 stash incident that `CLAUDE.md` records for subagents.

## Success criteria

- [ ] SC-1: One document, `docs/worktrees.md`, holds the location table and the removal duties for all three creators. Six places link to it, and none of them restates the table or a removal duty:
  - `CLAUDE.md`;
  - `agent-orchestration.md`;
  - `skills/spec-execution/SKILL.md`;
  - `skills/spec-execution/SOP.md`;
  - `docs/executor-brief.md`;
  - the `spec-execution` `exit_condition` in `.sdlc/state-machine.yaml`.
- [ ] SC-2: A delivery run leaves its own worktrees behind only when it says why. After `spec-execution` exits, through SOP §7.4 or §8, `git worktree list --porcelain` shows no `.claude/worktrees/spec-NNN` entry for that spec and no Agent-tool worktree the run spawned, unless the run's exit report names it as dirty and kept. This is measured on the first real delivery run after SPEC-011 ships and recorded at that spec's `spec-completion`.
- [ ] SC-3: Every stray of the five kinds the Design names that local refs can show is reported with its reason by `worktrees.mjs`, and `hooks/user-prompt-submit.mjs` surfaces them on the first prompt of a session, without reading `git worktree list` by hand.
- [ ] SC-4: Work inside a spec worktree acts on that worktree:
  - every SDLC script run from inside it resolves its root to the worktree;
  - the two repo walkers read no file under `.claude/worktrees/`;
  - the edit gate grades an edit inside it by that worktree's path and branch;
  - the Stop hook finds the run's goal file, and both hooks read the run's `_index.yaml`.

## Scope

### In scope

- `docs/worktrees.md`, the single statement of the rules, and ADR-009.
- `spec-execution` working in one spec worktree, `.claude/worktrees/spec-NNN`, from run start to run exit, with a resume form and an escalation path.
- Subagent worktrees during a run, which branch from the pushed integration tip.
- `scripts/sdlc/worktrees.mjs` and its payload copy.
- A once-per-session nudge in `hooks/user-prompt-submit.mjs`.
- A nested worktree treated as its own tree in four places:
  - `lib/sdlc-paths.mjs` > `resolveRoot`;
  - `check-stale-citations.mjs` and `check-review-constraint-globs.mjs`;
  - `hooks/pre-tool-use-edit-write.mjs`;
  - `hooks/stop-handoff.mjs` and `hooks/user-prompt-submit.mjs`, for the goal file and phase memory.
- The payload copies of every changed script, and the regenerated manifest.
- `.claude/worktrees/` in `init-payload/.gitignore`, and a `.gitignore` line merge on the layout-2 `/sdlc-sync` path (`sync-refresh.mjs`).
- The new nudge marker in this repo's own `.gitignore`.
- The rewording of the "nothing lingers" rule to step worktrees, in five places:
  - `CLAUDE.md`;
  - `skills/spec-execution/SKILL.md`;
  - `skills/spec-execution/SOP.md`;
  - `agent-orchestration.md`;
  - the `spec-execution` `exit_condition` in `.sdlc/state-machine.yaml` and its byte-identical payload copy `init-payload/.sdlc/state-machine.yaml`, whose generated handoff text is regenerated.

### Out of scope

- Judgment-phase branches (`spec/*`, `guide/*`, `sdlc/bookkeeping-*`). An interactive session cuts them one at a time in the main checkout, and they stay there (`specs/decisions/SPEC-011.md` > D-008).
- Separate clones, such as `~/_code/high-gear-apps-ui-update`. They are not worktrees, so `git worktree list` cannot see them (D-001).
- Moving the Agent tool's worktree location. The tool fixes it at `.claude/worktrees/`, and this spec adopts that location (D-004).
- A blocking Stop hook, or any check that refuses a session over a leftover worktree (D-005).
- CI enforcement. A CI runner cannot see a developer's local worktrees (D-005).
- Deleting branches. `worktrees.mjs --prune` removes worktrees and never deletes a branch, so branch cleanup stays with the SOP's existing step-branch rule (D-009).
- Removing a dirty worktree. `--prune` reports it and never forces a removal.
- One worktree per step branch (D-003).

## Design

Per ADR-009 and `specs/decisions/SPEC-011.md` > D-001 to D-012.

### When and where

Delivery runs, background subagents, and any session that works a repo while another session is using its main checkout each get one worktree per branch, under `.claude/worktrees/` (D-002, D-004, D-008):

| Creator | Path | Branch | Removed by, and when |
|---|---|---|---|
| `spec-execution` | `.claude/worktrees/spec-NNN` | `feat/spec-NNN` | the run, at exit (SOP §7.4) or escalation (SOP §8) |
| a session or a hand-run `git worktree add` | `.claude/worktrees/<branch-slug>` | that branch | its creator, when the branch is merged and deleted on the remote |
| the Agent tool (`isolation: "worktree"`) | `.claude/worktrees/agent-<id>`, set by the tool | `worktree-agent-<id>`, set by the tool | the tool when unchanged; otherwise the spawner, once the changes are merged |

`<branch-slug>` is the branch name with `/` replaced by `-`. We chose `.claude/worktrees/` over `.worktrees/` and sibling directories because the Agent tool writes there and cannot be redirected, so it is the only location all three creators can share (D-004). ADR-009 records that this adds `.claude/worktrees/` and its `.gitignore` line to the exceptions in ADR-008 decision 1.

### Delivery in a spec worktree

`spec-execution` SOP §1 creates or re-enters the spec worktree:

```bash
git fetch origin
if git worktree list --porcelain | grep -q "/.claude/worktrees/spec-NNN$"; then :        # resume: reuse it
elif git rev-parse -q --verify "refs/remotes/origin/feat/spec-NNN" >/dev/null; then
  git worktree add .claude/worktrees/spec-NNN feat/spec-NNN                          # resume: the branch exists
else
  git worktree add -b feat/spec-NNN .claude/worktrees/spec-NNN origin/main           # first run
  git -C .claude/worktrees/spec-NNN push -u origin feat/spec-NNN
fi
```

Every later command of the run runs inside that worktree. That covers each step branch, the step loop, the self-review, the step PRs, end-to-end validation, the simplify pass, the integration PR and the panel fix loop through §7.3. The main checkout stays on `main` (D-003). The worktree is removed only at exit: after §7.3's last round at §7.4, or at §8 on escalation (D-010).

**At exit.** The exit and escalation commands run from `$CLAUDE_PROJECT_DIR`, the main checkout, because removing the worktree removes the shell's own directory otherwise. The run pushes `feat/spec-NNN` and runs `git worktree remove .claude/worktrees/spec-NNN`. If that refuses because the tree is dirty, the run keeps it and names it in its exit report. Then it runs `worktrees.mjs --fetch --prune --own spec-NNN`. That removes nothing but the spec worktree, and only if it is still there and clean, and it lists every other stray without touching it (D-011). Agent-tool worktrees the run spawned are already gone by then, because the spawner removes each one when it merges that agent's result (Subagents during a run, below). Changes requested later on the open integration PR are made by re-entering the worktree with §1's resume form.

**On escalation.** The run commits work in progress on the current step branch as `SPEC-NNN S<n>: WIP (escalated)`, pushes it, and then removes the worktree as at exit. A step whose state cannot be committed (a merge in progress) is left dirty and reported, never forced.

**Subagents during a run.** The spawner pushes `feat/spec-NNN` first. A fan-out subagent (SOP §5) or the simplify pass (SOP §6.1) then works in its Agent-tool worktree on a branch cut from `origin/feat/spec-NNN`, because git refuses to check out `feat/spec-NNN` itself while the spec worktree holds it. The spawner merges the result from inside the spec worktree and removes the agent worktree (D-012). `docs/executor-brief.md` says the same.

**The goal leash.** The skill writes the goal file by absolute path, `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-current`. A relative `.claude/` path would land inside the spec worktree, where the Stop hook never looks (`hooks/stop-handoff.mjs:144` binds to `CLAUDE_PROJECT_DIR`).

### Detection: `worktrees.mjs`

`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees [--json] [--fetch] [--prune] [--own spec-NNN]` reads `git worktree list --porcelain`. It reports each linked worktree that is a stray, with one reason (D-009):

1. `outside`: its path is not under the main checkout's `.claude/worktrees/`.
2. `branch-gone`: its branch has an upstream configured, and that upstream's remote-tracking ref no longer exists. This is the state a branch is in after its PR merges with `--delete-branch` and a fetch prunes it. A branch never pushed has no upstream, so it is never `branch-gone`. The rule does not depend on ancestry, so a squash merge and a branch with no commits yet are handled the same way.
3. `detached`: it has no branch.
4. `spec-closed`: it is named `spec-NNN`, and that spec's status is neither `draft` nor `active`, or the spec does not resolve.
5. `agent`: it is an Agent-tool worktree (`agent-<id>`) that still exists. The tool removes an unchanged one itself, and the spawner removes one that kept changes when it merges them, so one that remains was either forgotten or belongs to an agent still running. The tool's `worktree-agent-<id>` branch is never pushed, so no other kind would catch it. `--prune` never removes an `agent` stray, because a running agent's worktree can be clean. It is reported for the spawner to remove.

`--json` prints an array of `{ path, branch, reason }` records instead of lines. `--fetch` runs `git fetch --prune` first. Without it, `branch-gone` reflects the last fetch, so a hook run makes no network call. List mode reads only `git worktree list` and local refs. It never runs `git status` per worktree, which keeps the first-prompt check cheap in a large tree, and it prints one line per stray and exits 0. `--prune` checks each stray's cleanliness with `git status --porcelain`, removes the clean ones other than `agent` strays with `git worktree remove` (never `--force`), runs `git worktree prune`, and reports each dirty stray untouched. It deletes no branch. `--own spec-NNN` limits removal to `.claude/worktrees/spec-NNN` and only lists the rest, so a run's exit never removes another session's worktree.

### The once-per-session nudge

`hooks/user-prompt-submit.mjs` gains a worktree nudge shaped like its layout nudge (`:245-265`). It runs list mode once per session, behind a marker `.claude/.sdlc-worktree-nudge-<session_id>`. When there are strays it prints one line naming their count and the `worktrees --prune` command, and it prints nothing when there are none. It never blocks a prompt, and a failure inside the check prints nothing, because the nudge is advice, not a gate.

### A nested worktree is its own tree

These changes stop the tooling from acting on the main checkout while work happens in a worktree (D-007):

1. **Root resolution.** `resolveRoot` in `lib/sdlc-paths.mjs` returns the linked worktree that contains the start directory when that worktree sits under `<CLAUDE_PROJECT_DIR>/.claude/worktrees/`. Otherwise `CLAUDE_PROJECT_DIR` still wins, as it does today (`:76`), and an explicit `--root` still overrides both. This narrows SPEC-009 > Design > `resolveRoot`, where `CLAUDE_PROJECT_DIR` always wins, for the nested-worktree case only. The resolver's doc comment and `lib/sdlc-paths.test.mjs` change with it.
2. **Repo walkers.** `check-stale-citations.mjs` (`:139`) and `check-review-constraint-globs.mjs` (`:57`) skip `.claude/worktrees/`. These are the only two scripts the research found that walk the repo from its root without `git ls-files` (`specs/decisions/SPEC-011.md` > Research).
3. **The edit gate.** `hooks/pre-tool-use-edit-write.mjs` maps a target under `.claude/worktrees/<name>/` to that worktree. It classifies the path by its path within the worktree, so `src/a.ts` is graded as `src/a.ts`, not as a `.claude/` process artifact (`:249`). It reads the active-task branch from that worktree (`git -C <worktree> rev-parse --abbrev-ref HEAD`), not from `CLAUDE_PROJECT_DIR` (`:285`).
4. **Phase memory in the hooks.** `hooks/stop-handoff.mjs` (`:537`) and `hooks/user-prompt-submit.mjs` > `readSpecPhase` (`:169`) read `specs/tasks/SPEC-NNN/_index.yaml` from `.claude/worktrees/spec-NNN/` when that worktree exists, and from the main checkout otherwise. During a run, the phase block they read is the one the run commits on `feat/spec-NNN`.

### Where the rules are written, and what else changes

`docs/worktrees.md` holds:
- the location table;
- the removal duties;
- the delivery, resume and escalation commands;
- the subagent base rule;
- the stray kinds;
- the session commands (`git worktree add -b <branch> .claude/worktrees/<branch-slug>`, and `git worktree move` for migrating);
- a note to exclude `.claude/worktrees/` from a project's own tree-walking tools (D-006).

Six places link to it:
- `CLAUDE.md`;
- `agent-orchestration.md`;
- `skills/spec-execution/SKILL.md`;
- `skills/spec-execution/SOP.md`;
- `docs/executor-brief.md`;
- the `spec-execution` `exit_condition` in `.sdlc/state-machine.yaml`.

They keep only what is specific to them. The SOP keeps its literal §1 commands, and the subagent rule "every subagent gets `isolation: "worktree"`". ADR-003 decision 7 ("no worktree" after a step) is narrowed to step worktrees, and ADR-009 records that narrowing. The five places that state the rule are reworded:
- `CLAUDE.md:51`;
- `SKILL.md:121`;
- `agent-orchestration.md:43`;
- `SOP.md` > Nothing lingers;
- the state machine's `exit_condition`, in `.sdlc/state-machine.yaml` and its payload copy, whose generated handoff footers are regenerated.

`init-payload/.gitignore` gains `.claude/worktrees/`. `sync-refresh.mjs` merges any `.gitignore` line the payload has and the repo lacks, using `install-payload.mjs` > `appendLines`, so an existing layout-2 adopter receives the line on `/sdlc-sync`. Today `planRefresh` (`sync-refresh.mjs:72-78`) never touches `.gitignore`, so this extends SPEC-009's layout-2 sync contract by one root file. This repo's `.gitignore` gains `.claude/.sdlc-worktree-nudge-*`.

## Acceptance criteria

- [ ] AC-001: Given `docs/worktrees.md`, then it states, for each of the three creators, the path, the naming, the branch, and who removes the worktree and when, matching the Design's table, and it holds the §1 delivery and resume commands and the subagent base rule.
- [ ] AC-002: Given `CLAUDE.md`, `agent-orchestration.md`, `skills/spec-execution/SKILL.md`, `skills/spec-execution/SOP.md`, `docs/executor-brief.md` and the `spec-execution` `exit_condition` in `.sdlc/state-machine.yaml`, then each links to `docs/worktrees.md`. None of them contains the location table, or states where a session, hand-made or Agent-tool worktree goes or who removes it. Three things are excepted by name:
  - SOP §1's commands;
  - SOP §7.4's and §8's commands;
  - AC-004's sentence that no step worktree lingers and the spec worktree lives until run exit.
- [ ] AC-003: Given `skills/spec-execution/SOP.md`, then:
  - §1 holds the three-branch create-or-re-enter block from the Design;
  - §7.4 and §8 run from `$CLAUDE_PROJECT_DIR`, remove the spec worktree without `--force`, name a kept dirty worktree in the exit report, and run `worktrees.mjs --fetch --prune --own spec-NNN`;
  - §8 first commits work in progress as `SPEC-NNN S<n>: WIP (escalated)` and pushes it.
- [ ] AC-004: Given `CLAUDE.md`, `skills/spec-execution/SKILL.md`, `SOP.md`, `agent-orchestration.md` and the state machine's `exit_condition`, then each states that no step worktree lingers and that the spec worktree lives until run exit. `init-payload/.sdlc/state-machine.yaml` is byte-identical to `.sdlc/state-machine.yaml`, and `node .sdlc/scripts/gen-handoffs.mjs --check` exits 0.
- [ ] AC-005: Given a repo with one linked worktree of each stray kind (`outside`, `branch-gone`, `detached`, `spec-closed`, `agent`), when `worktrees.mjs` runs, then it reports exactly those five strays, each with its reason, and exits 0. With `--json`, it prints the same five as `{ path, branch, reason }` records. With `--fetch`, a branch whose remote was deleted after the last fetch is reported as `branch-gone`. The same repo also holds three non-strays, and none of them is reported:
  - a live `spec-NNN` worktree;
  - a worktree on a branch with no commits and no upstream;
  - a worktree on a pushed branch whose upstream still exists.
- [ ] AC-006: Given a clean stray, a dirty stray and a clean `agent` stray, when `worktrees.mjs --prune` runs, then:
  - the clean stray is removed without `--force`;
  - the dirty stray and the `agent` stray are still present and are reported;
  - the main worktree and every non-stray are untouched;
  - no branch is deleted.
- [ ] AC-007: Given a clean `.claude/worktrees/spec-NNN` and two clean strays belonging to other sessions, an `agent-<id>` worktree and a `detached` one, when `worktrees.mjs --prune --own spec-NNN` runs, then only `spec-NNN` is removed and both other strays are listed and left in place.
- [ ] AC-008: Given a session whose repo has strays, when two prompts are submitted, then `user-prompt-submit.mjs` prints the worktree nudge on the first and not on the second. Given a repo with no strays, it prints nothing. In neither case does it block the prompt, and list mode runs no `git status`.
- [ ] AC-009: Given `CLAUDE_PROJECT_DIR=<repo>` and a start directory inside `<repo>/.claude/worktrees/spec-011/`, when `resolveRoot` runs without `--root`, then it returns `<repo>/.claude/worktrees/spec-011`. Given a start directory outside every worktree, then it returns `<repo>`.
- [ ] AC-010: Given a repo whose `.claude/worktrees/x/` holds a copy of its files, when `check-stale-citations.mjs` and `check-review-constraint-globs.mjs` run, then neither reads or counts a file under `.claude/worktrees/`.
- [ ] AC-011: Given `CLAUDE_PROJECT_DIR` on `main` and `.claude/worktrees/spec-011` on `claude/SPEC-011-S1`, when `pre-tool-use-edit-write.mjs` grades an edit to `.claude/worktrees/spec-011/src/a.ts`, then it is graded as an implementation edit with an active task and allowed without an override. Given the same worktree on a branch that names no task, the edit is gated exactly as an edit to `src/a.ts` on that branch would be in the main checkout.
- [ ] AC-012: Given an armed goal file at `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-current`, written while the executor works inside `.claude/worktrees/spec-NNN`, when the session tries to stop, then `stop-handoff.mjs` blocks it. Given a phase block committed only on `feat/spec-NNN` inside that worktree, then the hook reads that block.
- [ ] AC-013: Given `init-payload/.gitignore`, then it contains `.claude/worktrees/`. A fresh `install-payload.mjs` run adds the line to a repo's `.gitignore` that lacks it, and so does `sync-refresh.mjs --apply` on a layout-2 repo.
- [ ] AC-014: Given every script this spec changes or adds under `scripts/sdlc/`, then each payload copy under `init-payload/.sdlc/scripts/` is byte-identical, `node .sdlc/scripts/gen-released-payloads.mjs --check` exits 0, and `worktrees.mjs` guards direct invocation with `isMain()`.

## Risks & constraints

- **Hooks and scripts resolve different trees.** The hooks resolve `CLAUDE_PROJECT_DIR`, the main checkout, while the run's commands execute in `.claude/worktrees/spec-NNN`. The changes in Design > A nested worktree is its own tree cover the four places the research found: root resolution, the walkers, the edit gate, and the Stop hook. A script called with `--root <main checkout>` explicitly still acts on the main checkout, so the SOP's commands pass no `--root`.
- **A second copy of the tree lives inside the repo.** A tool that walks the tree and does not honour `.gitignore` sees every file twice. This spec fixes the SDLC's own walkers. A project's own tooling (a linter configured without ignore files, a test runner globbing from the root) can still descend into it, and `docs/worktrees.md` says to exclude `.claude/worktrees/` there.
- **`branch-gone` lags the remote.** List mode reads local refs. A branch deleted on the remote after the last fetch is reported only after a fetch, which the run's exit command performs (`--fetch`) and the nudge does not.
- **The nudge is advisory.** A developer can ignore it, and a stray can survive a session. The spec accepts this (D-005), because a blocking hook would stop sessions over worktrees the developer means to keep.
- **A dirty worktree can survive a run.** `git worktree remove` without `--force` refuses a dirty tree, and the run never forces it. SC-2 counts such a worktree as met only when the exit report names it.
- **One worktree per run means a second full checkout on disk.** In high-gear-apps that is a large tree for the length of a delivery run, bounded because the run removes it at exit.
- **An agent worktree is reported, not removed.** An `agent` stray may belong to a subagent still running, so `--prune` leaves every `agent` stray to its spawner. A spawner that forgets one is told so on each session's first prompt, until it removes it.
- **This narrows two completed contracts.** ADR-003 decision 7 and SPEC-009 > Design > `resolveRoot` are both closed records in force. ADR-009 records each narrowing, and the closed records are not edited.

## Migration

### Current state

There is no location rule, so worktrees are spread across `.claude/worktrees/`, sibling directories in `~/_code/`, and the main checkout. `spec-execution` works in the main checkout on `feat/spec-NNN`.

### Target state

Every worktree is under `.claude/worktrees/`. Each delivery run has a spec worktree, and strays are reported once per session.

### Migration strategy

Nothing moves automatically. On the first session after an adopter syncs, `worktrees.mjs` reports every existing worktree outside `.claude/worktrees/` as `outside`. The developer moves a live one with `git worktree move <path> .claude/worktrees/<branch-slug>`, or removes a finished one, and `docs/worktrees.md` gives both commands. The `.gitignore` line arrives with the sync through the new merge in `sync-refresh.mjs`. A delivery run that is in flight when the change lands holds `feat/spec-NNN`, or a step branch, in the main checkout. Git refuses to check out a branch another worktree holds, so before its next resume the run must free the branch: commit and push the main checkout's work, then `git checkout main` there. Only then does it run §1's resume form. `docs/worktrees.md` gives the same three commands.

### Rollback plan

Revert the integration commit. `spec-execution` returns to working in the main checkout, and the nudge and the script disappear. Worktrees created under `.claude/worktrees/` remain valid git worktrees, and `git worktree remove` clears them.
