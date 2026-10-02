# SPEC-011 — authoring decision ledger

Written during `spec-authoring` Phase 1, as each decision is made and before the spec body exists.
`spec-authoring` Step 10a seeds this file to `spec-reviewer`, so the reviewer can see what was open,
what was decided, and what was left ambiguous on purpose, and does not reopen a settled question on
every round.

Lives at `specs/decisions/SPEC-011.md`. Append-only, in chronological order. One entry per question
that was open. A question with an obvious answer is not a decision and does not belong here.

**Name acceptance criteria by what they require, not by number.** This ledger is written before the
spec's AC list exists, and that list is renumbered as review rounds add and remove criteria.

Phase 1 Step 3's research protocol writes the `## Research` section below.

---

## Research

| Question | Command or path | Ref | Result |
|----------|-----------------|-----|--------|
| Which files state worktree rules today? | `rg -n -i worktree skills agents docs hooks scripts/sdlc CLAUDE.md init-payload agent-orchestration.md` | `c0ac336` | `CLAUDE.md` (8 lines), `skills/spec-execution/SOP.md` (10), `agent-orchestration.md` (7), `skills/spec-execution/SKILL.md` (3), `docs/executor-brief.md` (3), `docs/sdlc.md` (2), `docs/setup.md` (1). All are about subagent isolation and "nothing lingers". |
| Does any file say where a worktree goes? | same search, read each hit | `c0ac336` | 0 hits. No file names a location, a naming scheme, or who removes a worktree that kept changes. |
| Does any file govern session or hand-made worktrees? | same search | `c0ac336` | 0 hits. Every rule is scoped to a subagent `isolation: "worktree"` or to a step. |
| Which specs and ADRs govern the area? | `rg -l -i worktree specs` | `c0ac336` | SPEC-002 (completed: subagent isolation, the 2026-04-24 stash incident), ADR-003 (accepted: fan-out is the exception), SPEC-009 and ADR-008 (completed and accepted: the `.sdlc/` layout; neither names a worktree location). |
| Which active specs share workspaces? | `specs/spec-index.json`, `status: active` or `draft` | `c0ac336` | SPEC-007 only (active, monitoring), `workspaces: []`. Its `Changes:` overlap is `skills/spec-execution/SOP.md` in the past, nothing in flight. |
| How many worktrees does high-gear-apps have? | `git -C ~/_code/high-gear-apps worktree list` | `a81e3e51` | 3: the main checkout and 2 under `.claude/worktrees/` (`agent-a4ca2563…` detached, `agent-a5a3eda5…` on `claude/admin-authz-containment`). The intent recorded 23 on 2026-10-01, so the sprawl was cleaned by hand. |
| Where did the sprawl sit? | `specs/intents.md` > the intent; `~/_code/high-gear-apps/.gitignore:59-60` | `c0ac336`, `a81e3e51` | Three locations: `.claude/worktrees/` (19), sibling directories in `~/_code/` (3), the main checkout. `.gitignore` lists both `.worktrees/` and `.claude/worktrees/`. |
| Are the `~/_code/high-gear-apps-*` directories worktrees? | `git -C <dir> rev-parse --git-common-dir` | live | No. `high-gear-apps-ui-update` and `high-gear-apps-validation` each have their own `.git`, so they are separate clones. |
| Where does the Agent tool put a subagent worktree? | this session's simplify pass | live | `.claude/worktrees/agent-<id>`, on a branch `worktree-agent-<id>`, removed only when the agent made no change. |
| How does a script pick its repo root? | `scripts/sdlc/lib/sdlc-paths.mjs:71-76` | `c0ac336` | `CLAUDE_PROJECT_DIR` wins when set. A script run inside a nested worktree resolves to the main checkout. `probe-gates.mjs:75` works around it by setting `CLAUDE_PROJECT_DIR` to the worktree. |
| Which scripts walk the repo from its root? | `rg -n "walk\(ROOT\|readdirSync\(root" scripts/sdlc/*.mjs` | `c0ac336` | `check-stale-citations.mjs:178` walks `ROOT` and skips only `.git` and `node_modules` (line 139). `check-review-constraint-globs.mjs:57` skips `node_modules`, `.git`, `dist`, `build`, `.next`. Neither skips `.claude/worktrees/`. `scan-legacy-paths.mjs:37` uses `git ls-files`, which does not list a nested worktree's files. |
| How does the edit gate treat `.claude/`? | `hooks/pre-tool-use-edit-write.mjs:20,249` | `c0ac336` | Every path under `.claude/` is a process artifact and exempt. An edit inside `.claude/worktrees/<name>/src/…` therefore bypasses the gate. |
| How does a hook nudge once per session? | `hooks/user-prompt-submit.mjs:245-265` | `c0ac336` | A per-session marker file `.claude/.sdlc-layout-nudge-<session_id>`. The new nudge can follow the same shape. |
| How does an adopter's `.gitignore` get new lines? | `init-payload/.gitignore`; `scripts/sdlc/install-payload.mjs:6-9,32` | `c0ac336` | `.gitignore` is a merged root file: install adds only the missing lines. It carries `.claude/.sdlc-*` today and no worktree entry. |
| Is SPEC-010 free? | `rg -n SPEC-010`; `gh pr list --state all` | `c0ac336` | No. SPEC-009 (`:129`) and ADR-008 (`:63`) reserve it for ending the payload copy. This spec is SPEC-011, and no PR claims that id. |
| Next ADR number? | `ls specs/adrs` | `c0ac336` | ADR-008 is the highest, so this spec's ADR is ADR-009. |

---

## D-001 — The rules cover every worktree creator

**Date:** 2026-10-02
**Question:** Govern only what the SDLC itself creates (subagent isolation, the simplify pass), or also session worktrees and hand-run `git worktree add`?
**Decided:** All three creators: Agent-tool subagents, session worktrees (`EnterWorktree`, the `using-git-worktrees` skill), and hand-run `git worktree add`.
**Rejected:** Agent-spawned only, which leaves the sibling-directory worktrees the intent recorded unguided. Agents and sessions but not manual, which leaves the same gap.
**Deliberately deferred:** Separate clones (`~/_code/high-gear-apps-ui-update`). They are not worktrees, so git cannot list them and this spec does not govern them.
**Raised by:** owner

---

## D-002 — One worktree per branch of active work

**Date:** 2026-10-02
**Question:** Create a worktree only when two writers share one checkout at once, or for every branch of active work?
**Decided:** One worktree per branch of active work, even when the work is serial.
**Rejected:** Concurrent writers only (the author's recommendation). The owner chose isolation over fewer worktrees. Developer's choice with rules only on location, which keeps the "when" unprescribed, and the intent's complaint is that it is unprescribed.
**Deliberately deferred:** Nothing.
**Raised by:** owner

---

## D-003 — During delivery, one worktree per spec

**Date:** 2026-10-02
**Question:** Under D-002, does a delivery run get one worktree for `feat/spec-NNN` or one per step branch?
**Decided:** One per spec. `spec-execution` creates `.claude/worktrees/spec-NNN` on `feat/spec-NNN` at run start, cuts, commits and merges every step branch inside it, and removes it when the integration PR opens or the run escalates. A background subagent keeps its own Agent-tool worktree as today.
**Rejected:** One per step branch: 8 to 11 create-and-remove cycles a spec (SPEC-007 cut 8 step branches and 3 fix branches). Per spec plus nested subagent worktrees: the Agent tool chooses its own path, so nesting cannot be prescribed.
**Deliberately deferred:** Nothing.
**Raised by:** owner

---

## D-004 — Every worktree goes under `.claude/worktrees/`

**Date:** 2026-10-02
**Question:** Where do worktrees go: `.claude/worktrees/`, `.worktrees/` at the root, or sibling directories?
**Decided:** `.claude/worktrees/`. Spec worktrees are named `spec-NNN`, session and hand-made ones `<branch-slug>`, and the Agent tool's keep their `agent-<id>` names. `/sdlc-init` and `/sdlc-sync` gitignore the directory.
**Rejected:** `.worktrees/`, because the Agent tool still writes to `.claude/worktrees/` and cannot be redirected, which would make two locations. Sibling directories, because they scatter across `~/_code` and a repo-local check cannot see them as belonging to the repo.
**Deliberately deferred:** Nothing.
**Raised by:** owner

---

## D-005 — Strays are found by a script and nudged by an advisory hook

**Date:** 2026-10-02
**Question:** Catch leftovers with a blocking Stop hook, an advisory hook, or documentation only?
**Decided:** A `worktrees.mjs` script lists strays and `--prune` removes the clean ones, reporting dirty ones only. The session-start prompt hook runs it and nudges once per session, and `spec-execution` runs `--prune` at exit.
**Rejected:** A blocking Stop hook, which would block a session over leftovers the developer may want to keep. Documentation only, which is today's state, and the sprawl happened under it.
**Deliberately deferred:** CI enforcement. CI cannot see a developer's local worktrees.
**Raised by:** owner

---

## D-006 — The rules live in one new doc with an ADR

**Date:** 2026-10-02
**Question:** Put the rule text in a new `docs/worktrees.md`, or fold it into `agent-orchestration.md` and the SOP?
**Decided:** A new `docs/worktrees.md` with ADR-009. `CLAUDE.md`, `agent-orchestration.md`, the `spec-execution` skill and SOP, and the executor brief cite it instead of restating it. This also covers the backlog intent "Worktree isolation rule as a standalone doc".
**Rejected:** Folding into existing files, which keeps the rule near delivery but leaves session and manual worktrees with no home.
**Deliberately deferred:** Nothing.
**Raised by:** owner, on the author's recommendation

---

## D-007 — A nested worktree must not be mistaken for the main checkout

**Date:** 2026-10-02
**Question:** D-004 puts worktrees inside the repo. Research found three places that would then act on the wrong tree: root resolution (`CLAUDE_PROJECT_DIR` wins), repo walkers that do not skip `.claude/worktrees/`, and the edit gate, which exempts all of `.claude/`. Fix them in this spec, or document them as caveats?
**Decided:** Fix all three in this spec. Root resolution prefers a linked worktree under `.claude/worktrees/` when the working directory is inside one. The walkers skip `.claude/worktrees/`. The edit gate classifies a path inside a worktree by its path relative to that worktree.
**Rejected:** Documenting them as caveats. D-003 makes the spec worktree the normal place delivery runs, so a caveat would be hit on every run.
**Deliberately deferred:** Nothing.
**Raised by:** author, from the research
