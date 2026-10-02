# Worktrees

Every git worktree an SDLC repo uses goes under the main checkout's `.claude/worktrees/`. It has one
creator, and that creator removes it when its work is over. This page is the one statement of those
rules (SPEC-011, ADR-009). `CLAUDE.md`, `agent-orchestration.md`, the `spec-execution` skill and
SOP, the executor brief, and the state machine link here instead of restating them.

## When a worktree exists

A worktree is one per branch of active work, for three kinds of work:
- a delivery run, which gets one per spec;
- a background subagent that writes files;
- a session that works the repo while another session uses the main checkout.

Judgment-phase branches (`spec/*`, `guide/*`, `sdlc/bookkeeping-*`) stay in the main checkout. An
interactive session cuts them one at a time and they hold documents only.

## Where it goes, and who removes it

| Creator | Path | Branch | Removed by, and when |
|---|---|---|---|
| `spec-execution` | `.claude/worktrees/spec-NNN` | `feat/spec-NNN` | the run, at exit (SOP §7.4) or escalation (SOP §8) |
| a session or a hand-run `git worktree add` | `.claude/worktrees/<branch-slug>` | that branch | its creator, when the branch is merged and deleted on the remote |
| the Agent tool (`isolation: "worktree"`) | `.claude/worktrees/agent-<id>`, set by the tool | `worktree-agent-<id>`, set by the tool | the tool when unchanged; otherwise the spawner, once the changes are merged |

`<branch-slug>` is the branch name with `/` replaced by `-`. `.claude/worktrees/` is the one location
all three can share, because the Agent tool writes there and cannot be redirected. The directory is
gitignored: `/sdlc-init` adds the line, and `/sdlc-sync` adds it to a repo that lacks it.

A session or hand-made worktree:

```bash
git worktree add -b <branch> .claude/worktrees/<branch-slug>    # new branch
git worktree add .claude/worktrees/<branch-slug> <branch>        # existing branch
git worktree list                                               # first: nothing may be registered under the one you remove
git worktree remove .claude/worktrees/<branch-slug>              # when the branch is merged and deleted
```

## A delivery run

SOP §1 creates or re-enters the spec worktree from the main checkout. `$CLAUDE_PROJECT_DIR` is the
main checkout's absolute path. Hooks receive it as a variable, but an executor's shell does not, and
a variable set in one shell call is gone by the next. So print it once and write the literal path
wherever these commands say `$CLAUDE_PROJECT_DIR`:

```bash
git worktree list --porcelain | sed -n '1s/^worktree //p'
```

```bash
git fetch origin
if git worktree list --porcelain | grep -q "/.claude/worktrees/spec-NNN$" && [ -d .claude/worktrees/spec-NNN ]; then :   # resume: reuse it
elif git rev-parse -q --verify "refs/heads/feat/spec-NNN" >/dev/null || git rev-parse -q --verify "refs/remotes/origin/feat/spec-NNN" >/dev/null; then
  git worktree remove .claude/worktrees/spec-NNN 2>/dev/null || true                 # clear only this spec's stale registration
  git worktree add .claude/worktrees/spec-NNN feat/spec-NNN                          # resume: the branch exists
  git -C .claude/worktrees/spec-NNN pull --ff-only 2>/dev/null || true               # catch up with the remote, if it has the branch
  git -C .claude/worktrees/spec-NNN push -u origin feat/spec-NNN                     # sets the upstream; a no-op once pushed
else
  git worktree add -b feat/spec-NNN .claude/worktrees/spec-NNN origin/main           # first run
  git -C .claude/worktrees/spec-NNN push -u origin feat/spec-NNN
fi
```

A new worktree holds tracked files only. When `.sdlc/config.yaml` sets `worktrees.setup` (one shell
command, run inside the new worktree before the first step), §1 runs it to restore what builds and
tests need, such as `node_modules/` or `.env.local`. Empty means unset. A repo whose builds need
gitignored files sets it before its first delivery run after `/sdlc-sync`, because the sync does not
write it. The value runs as a shell command with the developer's credentials, so review a change to
it the way you would review a build script.

Every later command of the run runs inside the worktree, through §7.3: each step branch, the step
loop, the self-review, the step PRs, end-to-end validation, the simplify pass, the integration PR and
the panel fix loop. The main checkout stays on `main`. Scripts follow the worktree on their own:
`resolveRoot` prefers a linked worktree under `.claude/worktrees/` that contains the working
directory. The hooks grade an edit inside it by its path and branch there, and read its `_index.yaml`
phase block there.

The goal file lives in the main checkout, written by absolute path:
`$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-current`. A relative `.claude/` path would land inside the
worktree, where the Stop hook never looks.

**At exit (SOP §7.4).**
1. Inside the worktree, commit and push the exit `phase:` block.
2. From `$CLAUDE_PROJECT_DIR`:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees --fetch --prune --own spec-NNN
   ```

It removes the spec worktree without `--force`. It keeps the worktree when it is dirty or holds
another worktree, because a plain `git worktree remove` would delete a nested worktree with it, and
the exit report names a kept one and the reason. A change
requested later on the open integration PR re-enters the worktree with §1's resume form.

**On escalation (SOP §8).** Inside the worktree, commit the work in progress on the current step
branch as `SPEC-NNN S<n>: WIP (escalated)` and push it. Then remove the worktree as at exit. A state
that cannot be committed, such as a merge in progress, is left dirty and reported, never forced.

**A subagent during a run.** First push `feat/spec-NNN`. Before its first edit, the subagent runs
`git checkout -b claude/SPEC-NNN-S<n> origin/feat/spec-NNN` in its Agent-tool worktree. The
simplify pass uses `claude/SPEC-NNN-simplify` instead. Git refuses to check out `feat/spec-NNN`
itself while the spec worktree holds it. The edit gate grades a worktree by its branch, and the
tool's default `worktree-agent-<id>` names no task. Merge the result from inside the spec worktree,
then remove the agent worktree.

**A run that started before these rules.** That run holds `feat/spec-NNN`, or a step branch, in the
main checkout. Free the branch before its next resume, then run §1:

```bash
git add -A && git commit -m "SPEC-NNN: WIP before moving to the spec worktree" && git push
git checkout main
# then SOP §1's resume form
```

## Strays

`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees` lists every linked worktree that is a stray, with one reason.
`agent` wins over every other reason, and the rest apply in this order:

| Reason | Meaning | `--prune` |
|---|---|---|
| `agent` | an Agent-tool worktree (`agent-<id>`) that still exists | never removes it: the agent may still be running |
| `outside` | not under `.claude/worktrees/` | never removes it: move a live one with `git worktree move <path> .claude/worktrees/<branch-slug>` |
| `branch-gone` | its branch had an upstream, and the upstream no longer exists | removes it when clean |
| `detached` | it has no branch | never removes it: inspect it first |
| `spec-closed` | it is `spec-NNN`, and that spec is neither `draft` nor `active`, or does not resolve | removes it when clean and the spec resolved |

A `spec-NNN` worktree of a live spec is never a stray, whatever its branch. Its status is read from
its own tree first, because the main checkout may be on a branch that predates the spec. Only the
run's `--own` exit removes it.

List mode reads only `git worktree list` and local refs. `--fetch` runs `git fetch --prune` first, so
`branch-gone` sees branches deleted on the remote since the last fetch. `--json` prints
`{ path, branch, reason }` records. `--prune` never passes `--force` and never deletes a branch. It keeps a candidate that holds
another worktree, and it never runs `git worktree prune`, which would deregister a worktree that was
moved by hand.
Removing a worktree deletes its gitignored files too, which `git status` does not list, and that is
why only the two kinds whose work is over are ever removed. `--own spec-NNN` removes that spec
worktree when it is clean, and only lists the rest.

The first prompt of each session prints one line when strays exist, and never blocks.

## Your own tools

A worktree under `.claude/worktrees/` is a full second checkout inside the repo. The SDLC's own
scripts skip it. Exclude `.claude/worktrees/` from any tool of yours that walks the tree without
honouring `.gitignore`, such as a linter configured without ignore files or a test runner globbing
from the root.
