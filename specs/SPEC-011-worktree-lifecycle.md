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

Worktrees in an SDLC repo have no prescribed location, naming or owner, so they accumulate. On 2026-10-01 the owner counted 23 worktrees in high-gear-apps across three kinds of location: 19 under `.claude/worktrees/`, 3 in sibling directories of `~/_code/`, and the main checkout (`specs/intents.md` > "Prescribe when to create worktrees, where they go, and when they are removed"). They have since been removed by hand: `git -C ~/_code/high-gear-apps worktree list` at `a81e3e51` shows 3, one of them on a detached HEAD (`specs/decisions/SPEC-011.md` > Research). Nothing stops the sprawl coming back.

Three creators make worktrees: the Agent tool's `isolation: "worktree"`, a session that enters a worktree, and a hand-run `git worktree add`. The framework's rules cover the first only. They say a writing subagent must use a worktree (`skills/spec-execution/SOP.md:146`) and that none may linger after a step (`skills/spec-execution/SKILL.md:121`). They do not say where a worktree goes, when a session should use one, or who removes an Agent-tool worktree that kept changes. A search of `skills/`, `agents/`, `docs/`, `hooks/`, `scripts/sdlc/`, `CLAUDE.md` and `init-payload/` at `c0ac336` finds no location rule (`specs/decisions/SPEC-011.md` > Research). A leftover worktree is a stale base that the next session can branch from.

Placing worktrees inside the repo also exposes three places where the tooling would act on the wrong tree. `lib/sdlc-paths.mjs:76` lets `CLAUDE_PROJECT_DIR` win, so a script run inside a nested worktree resolves to the main checkout. `check-stale-citations.mjs:178` walks the repo from its root and skips only `.git` and `node_modules` (`:139`), so it would read every nested checkout. `hooks/pre-tool-use-edit-write.mjs:249` exempts every path under `.claude/`, so an edit to implementation code inside a worktree would bypass the edit gate.

## Success criteria

- [ ] SC-1: One document, `docs/worktrees.md`, states when a worktree is created, where it goes, how it is named and who removes it, for all three creators. `CLAUDE.md`, `agent-orchestration.md`, the `spec-execution` skill and SOP, and `docs/executor-brief.md` link to it, and none of them states a location or a removal rule of its own.
- [ ] SC-2: A delivery run leaves no worktree behind: after `spec-execution` exits, through either the integration PR or an escalation, `worktrees.mjs` reports no stray in that repo.
- [ ] SC-3: Every stray of the four kinds the Design names is found without reading `git worktree list` by hand. `worktrees.mjs` reports each with its reason, and the session-start hook surfaces them once per session.
- [ ] SC-4: Work inside a spec worktree acts on that worktree. Every SDLC script run from inside it resolves its root to the worktree, no repo walker reads a nested worktree's files, and the edit gate grades an implementation edit inside it as it would in the main checkout.

## Scope

### In scope

- `docs/worktrees.md`, the single statement of the rules, and ADR-009.
- `spec-execution` working in one spec worktree, `.claude/worktrees/spec-NNN`, from run start to exit.
- `scripts/sdlc/worktrees.mjs`, with a list mode and `--prune`, and its payload copy.
- A once-per-session nudge in `hooks/user-prompt-submit.mjs`.
- Root resolution, the repo walkers and the edit gate treating a nested worktree as its own tree.
- `.claude/worktrees/` in the payload's `.gitignore`.
- Citations to `docs/worktrees.md` in place of the restated rules.

### Out of scope

- Separate clones, such as `~/_code/high-gear-apps-ui-update`. They are not worktrees, so `git worktree list` cannot see them (`specs/decisions/SPEC-011.md` > D-001).
- Moving the Agent tool's worktree location. The tool fixes it at `.claude/worktrees/`, and this spec adopts that location (D-004).
- A blocking Stop hook, or any check that refuses a session over a leftover worktree (D-005).
- CI enforcement. A CI runner cannot see a developer's local worktrees (D-005).
- Removing a dirty worktree automatically. `--prune` reports it and never forces a removal.
- One worktree per step branch (D-003).

## Design

Per ADR-009 and `specs/decisions/SPEC-011.md` > D-001 to D-007.

### When and where

Every branch of active work gets one worktree under `.claude/worktrees/` (D-002, D-004):

| Creator | Path | Branch | Removed by, and when |
|---|---|---|---|
| `spec-execution` | `.claude/worktrees/spec-NNN` | `feat/spec-NNN` | the run, when the integration PR opens or the run escalates |
| a session or a hand-run `git worktree add` | `.claude/worktrees/<branch-slug>` | that branch | its creator, when the branch merges or is deleted |
| the Agent tool (`isolation: "worktree"`) | `.claude/worktrees/agent-<id>`, set by the tool | `worktree-agent-<id>`, set by the tool | the tool when unchanged; otherwise the spawner, once the changes are merged |

`<branch-slug>` is the branch name with `/` replaced by `-`. We chose `.claude/worktrees/` over `.worktrees/` and sibling directories because the Agent tool writes there and cannot be redirected, so it is the only location all three creators can share (D-004).

### Delivery in a spec worktree

`spec-execution` SOP §1 changes from `git checkout -b feat/spec-NNN` in the main checkout to:

```bash
git fetch origin
git worktree add -b feat/spec-NNN .claude/worktrees/spec-NNN origin/main
git -C .claude/worktrees/spec-NNN push -u origin feat/spec-NNN
```

Every step branch is cut from `feat/spec-NNN` inside that worktree. The step loop, the self-review and the step PRs are unchanged. The main checkout stays on `main`, so another session can use it while the run is in flight (D-003). At exit (SOP §7.4) and on escalation (SOP §8), the run removes its worktree with `git worktree remove`, after the integration branch is pushed, and then runs `worktrees.mjs --prune`. The goal leash file stays in the main checkout's `.claude/`, because the hooks resolve the session's project directory.

### Detection: `worktrees.mjs`

`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees [--json] [--prune]` reads `git worktree list --porcelain` and reports each linked worktree that is a stray, with one reason:

1. `outside` — its path is not under the main checkout's `.claude/worktrees/`.
2. `branch-gone` — its branch no longer exists on the remote, or is merged into `origin/main`.
3. `detached` — it has no branch.
4. `spec-closed` — it is named `spec-NNN` and that spec's status is neither `draft` nor `active`, or the spec does not resolve.

A worktree is never a stray for being dirty. Dirtiness is reported beside the reason, because it decides what `--prune` may do. List mode prints one line per stray and exits 0, so a hook can run it. `--prune` runs `git worktree remove` (never `--force`) on each clean stray, runs `git worktree prune`, deletes the stray's local branch only when it is merged into `origin/main`, and reports every dirty stray untouched. Before a `branch-gone` check it runs `git fetch --prune` only when asked (`--fetch`), so list mode makes no network call from a hook.

### The once-per-session nudge

`hooks/user-prompt-submit.mjs` gains a worktree nudge shaped like its existing layout nudge (`:245-265`): run the stray check once per session, behind a marker `.claude/.sdlc-worktree-nudge-<session_id>`, and print one line naming the count of strays and the `--prune` command when there are any. It prints nothing when there are none, and it never blocks a prompt. A failure inside the check prints nothing, because the nudge is advice and not a gate.

### A nested worktree is its own tree

Three fixes stop the tooling from acting on the main checkout while work happens in a worktree (D-007):

1. **Root resolution.** `resolveRoot` in `lib/sdlc-paths.mjs` returns the linked worktree that contains the working directory when that worktree sits under `<CLAUDE_PROJECT_DIR>/.claude/worktrees/`. Otherwise `CLAUDE_PROJECT_DIR` still wins, as it does today (`:76`). An explicit `--root` still overrides both.
2. **Repo walkers.** `check-stale-citations.mjs` and `check-review-constraint-globs.mjs` skip `.claude/worktrees/`, and so does any other script that walks the repo from its root without `git ls-files`.
3. **The edit gate.** `hooks/pre-tool-use-edit-write.mjs` strips a leading `.claude/worktrees/<name>/` from the path before it classifies an edit, so an edit to `src/` inside a worktree is graded as an edit to `src/`.

### Where the rules are written

`docs/worktrees.md` holds the table, the delivery commands, the removal duties, the stray kinds and the session commands (`git worktree add -b <branch> .claude/worktrees/<branch-slug>`) (D-006). The files that state worktree rules today cite it and keep only what is specific to them:
- `CLAUDE.md`;
- `agent-orchestration.md`;
- `skills/spec-execution/SKILL.md`;
- `skills/spec-execution/SOP.md`;
- `docs/executor-brief.md`.

For example, the SOP keeps "every subagent gets `isolation: "worktree"`" and links to the doc for location and removal. `init-payload/.gitignore` gains `.claude/worktrees/`, so `/sdlc-init` adds it and the merge in `install-payload.mjs` adds it to an existing repo's `.gitignore` on sync (`install-payload.mjs:6-9`).

## Acceptance criteria

- [ ] AC-001: Given `docs/worktrees.md`, then it states, for each of the three creators, the path, the naming, the branch, and who removes the worktree and when, matching the Design's table.
- [ ] AC-002: Given `CLAUDE.md`, `agent-orchestration.md`, `skills/spec-execution/SKILL.md`, `skills/spec-execution/SOP.md` and `docs/executor-brief.md`, when each is searched for `worktree`, then each links to `docs/worktrees.md`, and none names a worktree location other than by that link.
- [ ] AC-003: Given `skills/spec-execution/SOP.md` §1, then it creates the integration branch with `git worktree add -b feat/spec-NNN .claude/worktrees/spec-NNN origin/main`, and §7.4 and §8 remove that worktree and run `worktrees.mjs --prune`.
- [ ] AC-004: Given a repo with linked worktrees of each stray kind (`outside`, `branch-gone`, `detached`, `spec-closed`) and one live `spec-NNN` worktree, when `worktrees.mjs` runs, then it reports exactly the four strays, each with its reason, does not report the live one, and exits 0.
- [ ] AC-005: Given a clean stray and a dirty stray, when `worktrees.mjs --prune` runs, then the clean one is removed without `--force`, the dirty one is still present and is reported, the main worktree and every non-stray are untouched, and a stray's local branch is deleted only when it is merged into `origin/main`.
- [ ] AC-006: Given a session whose repo has strays, when two prompts are submitted, then `user-prompt-submit.mjs` prints the worktree nudge on the first and not on the second. Given a repo with no strays, it prints nothing. In neither case does it block the prompt.
- [ ] AC-007: Given `CLAUDE_PROJECT_DIR=<repo>` and a working directory inside `<repo>/.claude/worktrees/spec-011/`, when an SDLC script resolves its root without `--root`, then the root is `<repo>/.claude/worktrees/spec-011`. Given a working directory outside every worktree, then the root is still `<repo>`.
- [ ] AC-008: Given a repo whose `.claude/worktrees/x/` holds a copy of its files, when `check-stale-citations.mjs` and `check-review-constraint-globs.mjs` run, then neither reads or counts a file under `.claude/worktrees/`.
- [ ] AC-009: Given an edit to `.claude/worktrees/spec-011/src/a.ts` with no active task context, when `pre-tool-use-edit-write.mjs` grades it, then it is classified exactly as an edit to `src/a.ts` would be, and not as a process artifact.
- [ ] AC-010: Given `init-payload/.gitignore`, then it contains `.claude/worktrees/`, and a fresh `install-payload.mjs` run adds that line to a repo's existing `.gitignore` that lacks it.
- [ ] AC-011: Given `scripts/sdlc/worktrees.mjs`, then a byte-identical copy exists at `init-payload/.sdlc/scripts/worktrees.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check` exits 0, and the script guards direct invocation with `isMain()`.

## Risks & constraints

- **Delivery runs in a directory other than the session's.** Hooks resolve `CLAUDE_PROJECT_DIR`, the main checkout, while the executor's commands run in `.claude/worktrees/spec-NNN`. The root-resolution fix (Design > A nested worktree is its own tree) is what makes the scripts follow the executor. A script that is called with `--root <main checkout>` explicitly would still act on the main checkout, so the SOP's commands do not pass `--root`.
- **A full checkout lives inside the repo.** Any tool that walks the tree and does not honour `.gitignore` sees every file twice. This spec fixes the SDLC's own walkers. A project's own tooling (a linter configured without ignore files, a test runner globbing from the root) can still descend into it, and `docs/worktrees.md` says to exclude `.claude/worktrees/` there.
- **The `branch-gone` check depends on the remote.** A branch that was never pushed has no remote counterpart. The check reports a branch as gone only when it was pushed and is now deleted, or is merged into `origin/main`, so a local-only branch in progress is not a stray.
- **The nudge is advisory.** A developer can ignore it, and a stray can survive a session. The spec accepts this (D-005), because a blocking hook would stop sessions over worktrees the developer means to keep.
- **One worktree per branch means more checkouts on disk.** A spec worktree is a full checkout of the repo for the length of a delivery run. In high-gear-apps that is a large tree. The cost is bounded because each one is removed at run exit.

## Migration

### Current state

No location rule, so worktrees are spread across `.claude/worktrees/`, `.worktrees/` and sibling directories. `spec-execution` works in the main checkout on `feat/spec-NNN`.

### Target state

Every worktree under `.claude/worktrees/`, a spec worktree per delivery run, strays reported once per session.

### Migration strategy

Nothing moves automatically. On the first session after an adopter syncs, `worktrees.mjs` reports every existing worktree outside `.claude/worktrees/` as `outside`. The developer moves a live one with `git worktree move <path> .claude/worktrees/<branch-slug>`, or removes a finished one. `docs/worktrees.md` gives both commands. The `.gitignore` line arrives with the sync.

### Rollback plan

Revert the integration commit. `spec-execution` returns to working in the main checkout, and the nudge and the script disappear. Worktrees created under `.claude/worktrees/` remain valid git worktrees, and `git worktree remove` clears them.
