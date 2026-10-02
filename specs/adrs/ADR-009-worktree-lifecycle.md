---
id: ADR-009
title: "One worktree per branch of active work, all under .claude/worktrees/, removed by the creator and found by a script"
status: proposed
spec: SPEC-011
date: 2026-10-02
author: franklin
superseded_by:
---

## Context

Three creators make worktrees in an SDLC repo: the Agent tool's `isolation: "worktree"`, a session that enters a worktree (`EnterWorktree`, the `using-git-worktrees` skill), and a developer or agent running `git worktree add` by hand. The framework prescribes only the first, and only that it must be used (`CLAUDE.md`, `skills/spec-execution/SOP.md:146`) and must not linger after a step (`skills/spec-execution/SKILL.md:121`). Nothing names a location, a naming scheme, or who removes an Agent-tool worktree that kept changes. The Agent tool deletes a worktree only when it made no change, and otherwise leaves the path with whoever spawned it (`specs/decisions/SPEC-011.md` > Research).

The result was the sprawl the owner recorded on 2026-10-01: 23 worktrees in high-gear-apps across three kinds of location, 19 under `.claude/worktrees/` and 3 in sibling directories (`specs/intents.md`). A leftover worktree is a stale base the next session can branch from.

Four options were weighed for location and lifecycle: govern only what the SDLC creates; one worktree only for concurrent writers; one per branch of active work; and leaving the "when" to the developer (`specs/decisions/SPEC-011.md` > D-001 to D-005).

## Decision

1. **When.** One worktree per branch of active work. During delivery that is one per spec: `spec-execution` works in `.claude/worktrees/spec-NNN` on `feat/spec-NNN`, and every step branch is cut, committed and merged inside it. The main checkout stays on `main`. A background subagent that writes files keeps its own Agent-tool worktree.
2. **Where.** Every worktree goes under `.claude/worktrees/`: `spec-NNN` for a spec, `<branch-slug>` for a session or hand-made worktree, and the Agent tool's own `agent-<id>`. The directory is gitignored. It is the Agent tool's fixed location, which cannot be moved, so one location for all three creators means adopting it.
3. **Removal.** The creator removes its worktree. A spec worktree goes when the integration PR opens or the run escalates. A session worktree goes when its branch merges or is deleted. An Agent-tool worktree that kept changes is removed by the spawner once those changes are merged.
4. **Detection.** `worktrees.mjs` lists strays: a worktree outside `.claude/worktrees/`, one whose branch is merged or gone, one on a detached HEAD, and a `spec-NNN` worktree whose spec is no longer live. `--prune` removes clean strays and only reports dirty ones. The session-start prompt hook nudges once per session; nothing blocks.
5. **A nested worktree is its own repo to the tooling.** Root resolution prefers the linked worktree the working directory is in, the repo walkers skip `.claude/worktrees/`, and the edit gate classifies a path inside a worktree by its path within that worktree.

## Consequences

- Delivery no longer occupies the main checkout, so a second session on the same repo can work on `main` while a run is in flight.
- `.claude/worktrees/` now holds full checkouts inside the repo. Any tool that walks the tree and does not honour `.gitignore` must skip it, which is why point 5 is part of the decision and not a caveat.
- Detection is advisory. A developer can still leave a stray, but it is reported once per session with its reason, and a clean one is one command from removal.
- Separate clones are not worktrees and stay outside these rules.
