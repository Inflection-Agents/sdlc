# Spec execution — standard operating procedure

The detailed procedures behind the `spec-execution` skill. The skill is the short version and the
authority on _policy_; this file is the authority on _how_. Read it once at the start of a run; do
not re-read it per step.

**The shape of a run, in one line:** cut an integration branch → burn the guide's steps down one at a time
behind a visible task list, each landing on that branch before the next starts → validate end-to-end
once → open one integration PR and review it hard → leave it open for the human.

> This SOP ships generic. Replace the placeholder commands in §3 and §6 with this repo's real ones
> (each workspace's `test` and `build` in `.sdlc/config.yaml` are the source), and delete the rows that do not apply.

---

## 1. The integration branch

Every spec gets exactly one, cut from `main` before the first step, in its own spec worktree (where
worktrees go, and who removes them: [`docs/worktrees.md`](../../docs/worktrees.md)). From the main
checkout, create it or re-enter it.

`$CLAUDE_PROJECT_DIR` in these instructions means the main checkout's absolute path. Hooks receive it as a variable, but an executor's shell does not, and a variable set in one shell call is gone by the next. So print the path once, before arming the goal, and write that literal path wherever these instructions say `$CLAUDE_PROJECT_DIR`:

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

When the worktree was just added and `.sdlc/config.yaml` sets `worktrees.setup`, run that command
inside it before the first step. A failing setup command stops the run's start. Every later command of
the run runs inside `.claude/worktrees/spec-NNN` through §7.3, and the main checkout stays on `main`.
Write the goal file by absolute path, `$CLAUDE_PROJECT_DIR/.claude/.sdlc-goal-current`.

**Nothing from a spec reaches `main` except by merging this branch.** No direct commits to `main`,
no step PR targeting `main`, no cherry-picks. If a spec needs an urgent fix on `main` that cannot
wait for the integration PR, that is a separate bug spec, not a shortcut through this branch.

---

## 2. The step loop

One guide step at a time, in guide order. Serial is the default — see §5 before considering anything
else. Flip the task-list entry to `in_progress` before item 1 below and to `completed` only after
item 6.

```bash
# 1. Always branch off the CURRENT integration tip
git fetch origin && git checkout feat/spec-NNN && git pull --ff-only
git checkout -b claude/SPEC-NNN-S<n>

# 2. Implement. The spec is the brief; the step's Covers:, Changes: and Notes: bound it.

# 3. Verify: the step's own Verify: commands (§3)

# 4. Self-review (§4), fix what it finds

# 5. Land it
git push -u origin claude/SPEC-NNN-S<n>
gh pr create --base feat/spec-NNN --title "SPEC-NNN S<n>: <title>" --body "<evidence per AC in Covers:>"
# wait for CI green, then:
gh pr merge <n> --squash --delete-branch

# 6. Flip the step's status: done in specs/tasks/SPEC-NNN/_index.yaml and append its
#    ## S<n> entry to DECISIONS.md — then COMMIT AND PUSH both to feat/spec-NNN
#    immediately, before starting the next step.
#
#    The retired engine wrote the merge and the status flip in one commit, so a crash
#    always left a consistent index. Two steps cannot be atomic — so close the window
#    rather than widening it. A run interrupted between them leaves a merged step still
#    reading `pending`, and a resumed run will try to do it again.
```

**Do not start step N+1 until step N is merged into `feat/spec-NNN`.** Every later step branches off
that tip, so an unmerged step means the next one is built on a base that is missing it — a consumer
cannot see its producer's interface, two steps edit the same file from stale bases, and the
integration diff stops matching the sum of what was built.

### Nothing lingers

After a step is done there is **no** open PR for it, **no** remote branch, **no** local branch, and
**no step worktree**. The spec worktree lives until run exit (§7.4, §8). `--delete-branch` handles the
remote; clean the rest, inside the spec worktree:

```bash
git checkout feat/spec-NNN && git branch -D claude/SPEC-NNN-S<n>
```

A stale branch or worktree is how a later step gets cut from the wrong base.

### When a step cannot land

Do not leave it open and move on. Either fix the root cause, or mark the step `blocked` in
`_index.yaml` with the reason, leave its task-list entry open with that reason, and escalate. A step
PR that sits open is the single most expensive failure in this loop.

---

## 3. Per-step verification: the step's `Verify:` commands

A step needs its own `Verify:` commands green and nothing more. The table below is what a good
`Verify:` line holds for each kind of workspace. No reviewer subagent, no envelope, no fix-loop
ceremony — those live at the integration gate now.

| Workspace kind          | The equivalent of "unit tests"                                                          |
| ----------------------- | --------------------------------------------------------------------------------------- |
| app / service           | the workspace's own test command + its build                                            |
| shared library          | its own tests **and** the tests of every consumer it changes                            |
| data / transform layer  | build + test the models the step touched; re-run the generator check if a generator ran |
| infrastructure          | the stack's unit tests + a plan/synth that must produce no unintended diff              |
| database migrations     | apply to a local/dev database and run the step's own probes                             |
| docs / specs only       | the relevant `.sdlc/scripts/*.mjs` validator                                             |

Whole-pipeline runs, the browser, and performance measurement are **not** per-step work — §6.

If a step genuinely has no meaningful test (a pure doc edit, a config line), say so in the PR body
rather than inventing one.

---

## 4. Self-review before opening the step PR

The implementing agent reviews its own work at step level. This is a deliberate trade: independence
is expensive, and it is bought back in full at the integration gate (§7), where every verdict comes
from a separately dispatched reviewer.

Read your own diff and check:

- **The step's `Covers:` ACs** — each one actually satisfied, with its evidence written into the PR
  body under the AC id. That PR body is where `task:evidence-missing` looks.
- **The step's `Changes:`** — run the changed-path audit (`git diff --name-only`) against it. A path
  outside it is either a guide change (log it, §4 of the skill) or scope creep (take it out).
- **Scope** — nothing in the diff the step did not ask for. Unrelated drive-by fixes belong in their
  own step.
- **`sdlc-code-standards`** — no dead code, no commented-out blocks, no skipped tests, no deprecated
  stub left "for later". Delete outright. Check the Behavior Preservation gate: no silent
  scope/behavior expansion beyond what the step asked for.
- **Generated artifacts** — if a generator ran, the diff matches the step's `Changes:` and nothing in
  its denylist moved.
- **The obvious failure mode** — for the thing you just changed, what breaks it? Check that case.

Fix what this finds before opening the PR. If it surfaces something the guide or the spec got wrong,
escalate rather than silently widening scope.

---

## 5. Parallel execution — the exception

**Serial is the norm.** Parallelism is for a genuinely large spec where several steps have no
overlap in files, no dependency edge, and no shared generated artifact. It is not a default and not
a speed trick — it costs a fresh context per agent, which is the expense this process exists to
avoid.

If you do fan out:

- Every agent gets `isolation: "worktree"` — **mandatory, no exceptions.** Without it a subagent
  shares your working tree and its `git checkout` / `stash` / `reset` silently discards your
  in-flight edits.
- Push `feat/spec-NNN` first, then name the base and the branch in the prompt: _"fetch, then
  `git checkout -b claude/SPEC-NNN-S<n> origin/feat/spec-NNN` before your first edit; open your PR
  against `feat/spec-NNN`."_ Git refuses to check out `feat/spec-NNN` itself while the spec
  worktree holds it, and the edit gate grades an Agent-tool worktree by its branch, so the
  agent's default `worktree-agent-<id>` branch would be gated.
- The merge discipline is unchanged: **each step merges into `feat/spec-NNN` as it is accepted**, and
  any step that depends on it waits for that merge. Parallel does not mean batch-merge at the end.
- The task list still shows every dispatched step as `in_progress` and each one is closed as it
  merges — fan-out never makes the run less visible.
- Merge each agent's result from inside the spec worktree, then remove that agent's worktree and
  delete its local branch.

Two steps qualify for concurrent worktree-isolated execution iff all four hold: (a) neither step
appears in the other's `After:` transitive closure (a step with no `After:` needs every earlier step,
so the guide author must write `After:` to make a pair eligible at all); (b) both steps declare a
non-empty `Changes:` — an empty one is unknown scope, treated as not disjoint (stays serial), never as
vacuously disjoint; (c) with both `Changes:` sets non-empty, they are disjoint under a bidirectional glob-overlap test — a
narrowly declared concrete path on one side and a broad `**` glob on the other can still cover the
same files, so test both directions, not just a literal string match; (d) if the spec is
contract-managed (step PRs declare `produces`/`consumes`), neither step `produces` a contract the
other `consumes`. Any pair failing any one of the four stays serial.

Two steps that change the same file are not parallel candidates, whatever `After:` says.

---

## 6. End-to-end validation — once, before the gate

These run **once per spec**, after the last step has merged and before the integration PR is
reviewed. Not per step. Start from the guide's `## End-to-end validation` list. Attach the output as evidence; never claim one ran without it.

- **Repo-wide build and full test suite** — the whole workspace graph, not just the touched ones.
- **The real pipeline, for any spec that touches a data/transform layer** — a full (non-incremental)
  run plus whatever publish/ship step follows it. Record pass/warn/error counts.
- **The app driven in a real browser, for any user-visible change** — navigate every surface the
  spec touched, screenshot it, and verify against the design reference at a matched viewport with
  computed-style measurement. Pixel-level verification is the bar; "the page loaded" is not.
- **Performance**, when the user named it or the change plausibly moves a hot path: measure before
  and after, report the numbers.

If a validation is genuinely not runnable, name it and say why in the PR body. Do not silently skip.

---

### 6.1 Simplify pass — once, before the gate

After the last step merges and §6's end-to-end validation passes, and before the panel's first
dispatch (§7.2) — not on every §7.3 fix-loop iteration — push `feat/spec-NNN` and dispatch a
code-simplification agent (`isolation: "worktree"`, mandatory — a shared working tree risks the
agent's `git checkout` / `stash` / `reset` discarding in-flight edits) that runs
`git checkout -b claude/SPEC-NNN-simplify origin/feat/spec-NNN` before its first edit. After its
commit is on the integration branch, remove the agent's worktree and delete that local branch.

If the pass makes any change, fast-forward (or cherry-pick) that single commit onto the integration
branch from inside the spec worktree, then remove the agent's worktree. No step branch, no step PR, no
self-review-then-PR cycle.

When it does, re-run whichever §6 checks that change could have affected — at minimum the
repo-wide build, any data/transform pipeline check for a dbt-touching (or equivalent) spec, and
the browser-driven pixel-level verification for any spec touching a user-visible surface — on the
post-simplify tip, before the panel's first dispatch.

If no code-simplification agent is available in a given executing session, skip the step and say
so in the integration PR body — the same "genuinely not runnable" fallback §6 already uses.

---

## 7. The integration gate

This is where all the rigor now lives.

### 7.1 Open the PR

`feat/spec-NNN` → `main`, with a body that carries:

- Every spec **success criterion**, mapped to how it was verified.
- The §6 evidence: build output, pipeline counts, screenshots, perf numbers.
- The steps with each step's PR number.
- A `## Guide changes` section listing every `## EXECUTIVE DECISION — guide change:` entry in
  `DECISIONS.md`, one for one, or "none".

### 7.2 Dispatch the adversarial panel

Collect every lens that fires across the whole diff — this is the one place
`review-constraints.yaml` is evaluated in full — and read the highest `Risk:` in the guide as the
panel's intensity hint (the registry can only raise it). Resolve each lens to its reviewer with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs reviewer-routing <lens>` (ADR-001: routing is registry data).

**Fold by resolved agent, per [`../review-primitives.md`](../review-primitives.md) > Panel fold
rule.** That section is the single statement of the rule; this one does not restate it.

Naming a specialist here instead would rebuild the hardcoded map ADR-001 deleted, and the two
copies would drift. They already had: this section named `security-reviewer` for the security lens
while the registry routed it to an `invariants-reviewer` that no repo defined. The registry now
routes that lens to the shipped `security-reviewer`, and a test holds every target resolvable.

Always in the panel regardless of which lenses fire:

- `integration-reviewer` — grades the spec's holistic success criteria and every `scope: integration`
  constraint in the registry.
- At least one **adversarial** pass over the whole diff.

Dispatch concurrently, in one message, each with a clean context.

**Independence is structural, not instructed.** Every reviewer is defined in `agents/`, and
its `tools:` line omits `Edit`/`Write`. "You grade, you never fix" is an instruction a model can
talk itself out of; an absent tool is not. A registry `agent:` that names no file there fails
`reviewer-routing.test.mjs`, so the routing cannot silently point at nothing.

**Every verdict comes from a dispatched reviewer, never from you.** Validate each returned envelope
with `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs stamp-envelope <file>` — exit `0` fold the findings, `2`
abstained (escalate), `3` malformed or absent (re-dispatch or escalate). A malformed envelope is
never a clean review. Severity → action is `review-primitives.md`; do not freehand it.

### 7.3 Loop until merge-ready — at most three rounds

Fix blockers and majors at the root, then **re-dispatch the panel** — not a spot-check of the fix.
Repeat until no blocker or major survives, or until round 3 completes.

**The cap is three rounds (ADR-004).** A fourth round is not run. Whatever blocker or major
survives round 3 goes into a `## Disclosed, not fixed` section of the integration PR body: one
line per finding, naming its criterion, its location, and why it was not closed. The PR is still
left open for the human, who now decides with the survivors visible rather than after an
unbounded grind.

If a round reveals the spec itself is wrong, that is a `spec:*` finding and routes to
`spec-amendment`, not to another round.

Nits and suggestions can be recorded in the PR body and accepted.

### 7.4 Stop

**Leave the integration PR open.** The human reviews and merges it. Do not merge to `main`, do not
push to `main`, do not self-approve. Close out the task list and hand off to `spec-completion`.

Then remove the spec worktree. Inside it, commit and push the exit `phase:` block. From
`$CLAUDE_PROJECT_DIR`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees --fetch --prune --own spec-NNN
```

It removes `.claude/worktrees/spec-NNN` without `--force`, and keeps it when it is dirty or holds
another worktree. A plain `git worktree remove` would delete a nested worktree with it. If it keeps
the worktree, name it and its reason in the exit report.

---

## 8. Escalate instead of spinning

Set the goal file to `status: escalated`, put the reason in `reason`, surface it, stop. Escalate on:

- Security, data-loss or payment risk — hard stop.
- A decision that is the owner's (priority, scope, a tradeoff the spec does not settle) and that every
  remaining step depends on.
- Amendment cap: `spec.version − 1 ≥ 3`.
- A step that cannot land and cannot be fixed at the root.

A crisp question early beats a step burned on a guess.

Before stopping, inside the spec worktree, commit the work in progress on the current step branch as
`SPEC-NNN S<n>: WIP (escalated)` and push it. Then remove the worktree as at §7.4, from
`$CLAUDE_PROJECT_DIR`. A state that cannot be committed (a merge in progress) is left dirty and named
in the exit report, never forced.

---

## 9. Optional: run telemetry

The delivery run is otherwise uninstrumented. Where it is cheap, append per-step events to
`specs/tasks/SPEC-NNN/_execution.log.jsonl` (JSONL, append-only, restart-safe): `step_started`,
`step_merged`, `validation`, `panel_round`, `escalated`. See `examples/example-execution.log.jsonl`.
This is a recommendation, not a gate — no step in this SOP blocks on it.
