# Spec execution — standard operating procedure

The detailed procedures behind the `spec-execution` skill. The skill is the short version and the
authority on _policy_; this file is the authority on _how_. Read it once at the start of a run; do
not re-read it per task.

**The shape of a run, in one line:** cut an integration branch → burn the tasks down one at a time
behind a visible task list, each landing on that branch before the next starts → validate end-to-end
once → open one integration PR and review it hard → leave it open for the human.

> This SOP ships generic. Replace the placeholder commands in §3 and §6 with this repo's real ones
> (the workspace table in `.ai/project.md` is the source), and delete the rows that do not apply.

---

## 1. The integration branch

Every spec gets exactly one, cut from `main` before the first task:

```bash
git fetch origin && git checkout main && git pull --ff-only
git checkout -b feat/spec-NNN && git push -u origin feat/spec-NNN
```

**Nothing from a spec reaches `main` except by merging this branch.** No direct commits to `main`,
no task PR targeting `main`, no cherry-picks. If a spec needs an urgent fix on `main` that cannot
wait for the integration PR, that is a separate bug spec, not a shortcut through this branch.

---

## 2. The task loop

One task at a time. Serial is the default — see §5 before considering anything else. Flip the task
list entry to `in_progress` before step 1 and to `completed` only after step 6.

```bash
# 1. Always branch off the CURRENT integration tip
git fetch origin && git checkout feat/spec-NNN && git pull --ff-only
git checkout -b claude/SPEC-NNN-TASK-NNN

# 2. Implement. Read the task file's Requirements, Constraints, Verification.

# 3. Verify: the task's own Verification section, at minimum its unit tests (§3)

# 4. Self-review (§4), fix what it finds

# 5. Land it
git push -u origin claude/SPEC-NNN-TASK-NNN
gh pr create --base feat/spec-NNN --title "SPEC-NNN TASK-NNN: <title>" --body "<evidence>"
# wait for CI green, then:
gh pr merge <n> --squash --delete-branch

# 6. Mark status: done in specs/tasks/SPEC-NNN/_index.yaml, then start the next task
```

**Do not start task N+1 until task N is merged into `feat/spec-NNN`.** Every later task branches off
that tip, so an unmerged task means the next one is built on a base that is missing it — a consumer
cannot see its producer's interface, two tasks edit the same file from stale bases, and the
integration diff stops matching the sum of what was built.

### Nothing lingers

After a task is done there is **no** open PR for it, **no** remote branch, **no** local branch, and
**no** worktree. `--delete-branch` handles the remote; clean the rest:

```bash
git checkout feat/spec-NNN && git branch -D claude/SPEC-NNN-TASK-NNN
git worktree list && git worktree prune          # if a worktree was used at all
```

A stale branch or worktree is how a later task gets cut from the wrong base.

### When a task cannot land

Do not leave it open and move on. Either fix the root cause, or mark the task `blocked` in
`_index.yaml` with the reason, leave its task-list entry open with that reason, and escalate. A task
PR that sits open is the single most expensive failure in this loop.

---

## 3. Per-task verification: unit tests or the equivalent

A task needs its own tests green and nothing more. No reviewer subagent, no envelope, no fix-loop
ceremony — those live at the integration gate now.

| Workspace kind          | The equivalent of "unit tests"                                                          |
| ----------------------- | --------------------------------------------------------------------------------------- |
| app / service           | the workspace's own test command + its build                                            |
| shared library          | its own tests **and** the tests of every consumer it changes                            |
| data / transform layer  | build + test the models the task touched; re-run the generator check if a generator ran |
| infrastructure          | the stack's unit tests + a plan/synth that must produce no unintended diff              |
| database migrations     | apply to a local/dev database and run the task's own probes                             |
| docs / specs only       | the relevant `scripts/sdlc/*.mjs` validator                                             |

Whole-pipeline runs, the browser, and performance measurement are **not** per-task work — §6.

If a task genuinely has no meaningful test (a pure doc edit, a config line), say so in the PR body
rather than inventing one.

---

## 4. Self-review before opening the task PR

The implementing agent reviews its own work at task level. This is a deliberate trade: independence
is expensive, and it is bought back in full at the integration gate (§7), where every verdict comes
from a separately dispatched reviewer.

Read your own diff and check:

- **The task's acceptance criteria** — each one actually satisfied, with the evidence you will paste
  into the PR body. Populate `evidence:` in the task file.
- **The task's declared `touches` and Constraints** — every "do not touch" respected. Run the
  changed-path audit (`git diff --name-only`) against the declared set.
- **Scope** — nothing in the diff the task did not ask for. Unrelated drive-by fixes belong in their
  own task.
- **`sdlc-code-standards`** — no dead code, no commented-out blocks, no skipped tests, no deprecated
  stub left "for later". Delete outright. Check the Behavior Preservation gate: no silent
  scope/behavior expansion beyond what the task asked for.
- **Generated artifacts** — if a generator ran, the diff matches the task's allowlist and nothing in
  its denylist moved.
- **The obvious failure mode** — for the thing you just changed, what breaks it? Check that case.

Fix what this finds before opening the PR. If it surfaces something the task or the spec got wrong,
escalate rather than silently widening scope.

---

## 5. Parallel execution — the exception

**Serial is the norm.** Parallelism is for a genuinely large spec where several tasks have no
overlap in files, no dependency edge, and no shared generated artifact. It is not a default and not
a speed trick — it costs a fresh context per agent, which is the expense this process exists to
avoid.

If you do fan out:

- Every agent gets `isolation: "worktree"` — **mandatory, no exceptions.** Without it a subagent
  shares your working tree and its `git checkout` / `stash` / `reset` silently discards your
  in-flight edits.
- Name the base explicitly in the prompt: _"branch from the current tip of `feat/spec-NNN` (fetch
  first); open your PR against `feat/spec-NNN`."_
- The merge discipline is unchanged: **each task merges into `feat/spec-NNN` as it is accepted**, and
  any task that depends on it waits for that merge. Parallel does not mean batch-merge at the end.
- The task list still shows every dispatched task as `in_progress` and each one is closed as it
  merges — fan-out never makes the run less visible.
- Clean up every worktree when the group finishes.

Two tasks that touch the same file are not parallel candidates, whatever the dependency graph says.

---

## 6. End-to-end validation — once, before the gate

These run **once per spec**, after the last task has merged and before the integration PR is
reviewed. Not per task. Attach the output as evidence; never claim one ran without it.

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

## 7. The integration gate

This is where all the rigor now lives.

### 7.1 Open the PR

`feat/spec-NNN` → `main`, with a body that carries:

- Every spec **success criterion**, mapped to how it was verified.
- The §6 evidence: build output, pipeline counts, screenshots, perf numbers.
- The task list with each task's PR number.

### 7.2 Dispatch the adversarial panel

Concurrently, in one message, each with a clean context and no `Edit`/`Write`:

- `integration-reviewer` — grades the spec's holistic success criteria and every `scope: integration`
  constraint in the registry.
- At least one **adversarial** `task-reviewer`.
- `security-reviewer` if the spec touched auth, sessions, permissions, migrations or any other
  security surface.
- `design-fidelity-reviewer` if it touched a user-visible surface.
- Add the lens for **every** registry constraint that fires across the whole diff — this is the one
  place `review-constraints.yaml` is evaluated in full. Resolve each lens to its reviewer with
  `node scripts/sdlc/reviewer-routing.mjs <lens>` (ADR-001: routing is registry data).

**Every verdict comes from a dispatched reviewer, never from you.** Validate each returned envelope
with `node scripts/sdlc/validate-review-envelope.mjs <file>` — exit `0` fold the findings, `2`
abstained (escalate), `3` malformed or absent (re-dispatch or escalate). A malformed envelope is
never a clean review. Severity → action is `review-primitives.md`; do not freehand it.

### 7.3 Loop until merge-ready

Fix blockers and majors at the root, then **re-dispatch the panel** — not a spot-check of the fix.
Repeat until no blocker or major survives. Nits and suggestions can be recorded in the PR body and
accepted.

There is no fix-round cap here; the cap is judgment. If the same finding survives two rounds, or a
round reveals the spec itself is wrong, escalate instead of grinding.

### 7.4 Stop

**Leave the integration PR open.** The human reviews and merges it. Do not merge to `main`, do not
push to `main`, do not self-approve. Close out the task list and hand off to `spec-completion`.

---

## 8. Escalate instead of spinning

Set the goal file to `status: escalated`, put the reason in `reason`, surface it, stop. Escalate on:

- Security, data-loss or payment risk — hard stop.
- A decision that is the owner's: priority, scope, a tradeoff the spec does not settle.
- The same integration finding surviving two full panel rounds.
- Amendment cap: `spec.version − 1 ≥ 3`.
- A task that cannot land and cannot be fixed at the root.

A crisp question early beats a wave burned on a guess.

---

## 9. Optional: run telemetry

The delivery run is otherwise uninstrumented. Where it is cheap, append per-task events to
`specs/tasks/SPEC-NNN/_execution.log.jsonl` (JSONL, append-only, restart-safe): `task_started`,
`task_merged`, `validation`, `panel_round`, `escalated`. See `examples/example-execution.log.jsonl`.
This is a recommendation, not a gate — no step in this SOP blocks on it.
