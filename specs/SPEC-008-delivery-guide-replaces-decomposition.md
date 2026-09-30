---
id: SPEC-008
title: "Delivery guide replaces task decomposition"
status: active
version: 1
supersedes:
initiative: INI-001
owner: franklin
workspaces: []
created: 2026-09-29
updated: 2026-09-30
tags: [task-decomposition, spec-execution, spec-authoring, throughput, state-machine]
depends_on: []
linear_project:
---

## Problem

A spec cannot reach delivery until a separate decomposition phase rewrites it into task files, and
those files are written for a reader the framework no longer has.

`skills/task-decomposition/SKILL.md:23` sizes each task file as "the entire brief" for an executor
and a reviewer "with zero prior context." ADR-003 removed both readers. One executor now implements
every task inline in the context that already holds the spec
(`specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:76`), and a task is gated by its own
tests plus a self-review with "no per-task reviewer subagent"
(`specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:83`). The integration reviewer grades
the spec's success criteria, "not per-task acceptance criteria" (`agents/integration-reviewer.md:3`).
So the task files restate the spec for an agent that has already read it.

The restatement is as long as the original. Across all six decomposed specs (SPEC-001 to SPEC-004
and SPEC-006 in `specs/tasks/`, SPEC-005 in `specs/archive/tasks/`):

- task words ÷ spec words = 22,013 ÷ 21,654 = 1.02
  (`cat <dir>/TASK-*.md | wc -w` per task directory, `wc -w` per spec file)
- SPEC-004, the largest: 6,025 task words for a 3,707-word spec

On top of the files, decomposition adds a second owner sign-off, a second PR
(`plan/SPEC-NNN-task-decomposition`, `skills/task-decomposition/SKILL.md` Step 10) and one Linear
issue per task (`skills/task-decomposition/SKILL.md:393`).

The team already delivers without it. The last three framework PRs shipped from design,
implementation and delivery documents in `docs/plans/`, and none of them created a task file
(`git show --name-only --format= <sha> | grep -c '^specs/tasks/'` returns 0 for `e32a75f` #43,
`e1680af` #44 and `4a4446a` #45, checked on `main` at `a73eeb3`). That path skipped the plan gate,
the goal leash and the visible task list, because `spec-execution` refuses to start without
decomposed tasks (`skills/spec-execution/SKILL.md:28`). The process the team actually uses has no
guardrails, and the process with guardrails costs as much to plan as to specify.

## Success criteria

- [ ] SC-1: A spec moves from `active` to `spec-execution` with one owner sign-off and one PR. In
      `specs/sdlc-state-machine.yaml`, `spec-authoring.next_phase` is `spec-execution` and no
      `task-decomposition` phase exists.
- [ ] SC-2: The planning artifact costs less than the spec it plans. For SPEC-008,
      `wc -w specs/tasks/SPEC-008/GUIDE.md` ÷ `wc -w specs/SPEC-008-*.md` ≤ 0.30, against the 1.02
      baseline in `## Problem`. Measured at the integration gate.
- [ ] SC-3: The guardrails that decomposition carried still hold. `spec-execution` refuses to start
      a spec whose guide fails `validate-guide.mjs` or whose `plan_review` is unapproved, refuses to
      open the integration PR while an owner decision is pending, and every spec acceptance
      criterion maps to a guide step.
- [ ] SC-4: SPEC-008 is itself delivered from its own guide, ending in one open integration PR that
      is panel-clean or carries a `## Disclosed, not fixed` section (ADR-004).
- [ ] SC-5: One delivery path exists. No live doctrine file names `task-decomposition`,
      `task-schema` or `templates/task.md`, apart from the `retired_phases:` list that keeps old
      `_index.yaml` files valid (AC-001 and AC-011 define the checks).

## Scope

### In scope

- ADR-007, which removes the task-decomposition phase and makes the delivery guide the only plan
  artifact, plus a one-line pointer to ADR-007 in ADR-002 and ADR-003.
- The guide artifact (`specs/tasks/SPEC-NNN/GUIDE.md`), its schema (`skills/guide-schema.md`), its
  template (`templates/guide.md`) and its validator (`scripts/sdlc/validate-guide.mjs`).
- The kickoff prompt (`specs/tasks/SPEC-NNN/KICKOFF.md`) and its template (`templates/kickoff.md`,
  both copies), which the owner pastes to start delivery.
- The state machine, in both copies (`specs/` and `init-payload/`), and the regenerated handoff
  footers.
- The skills that produce or read a plan: `spec-authoring`, `spec-execution` (SKILL and SOP),
  `spec-amendment`, `spec-completion`, `sdlc-code-review`, `sdlc-code-standards`, `pr-reviewer`,
  `create-domain-skill`, plus `review-primitives.md` (both copies), `spec-schema.md` and the
  `pr-reviewer` agent.
- The review-constraints registry header comments, both copies (`.ai/sdlc/review-constraints.yaml`,
  `init-payload/.ai/sdlc/review-constraints.stub.yaml`), which match on "the task's workspace" and
  `task_has` (`.ai/sdlc/review-constraints.yaml:15-16`). No registry row uses either today.
- Deleting `skills/task-decomposition/`, `skills/task-schema.md` and both copies of
  `templates/task.md`.
- `templates/project.md`, `templates/decisions.md` (both copies of each), `init-payload/.ai/project.stub.md`,
  and the header comments and `--presence-only` error message of `plan-gate.mjs` (both copies;
  `scripts/sdlc/plan-gate.mjs:161` names `task-decomposition`).
- `validate-phase-memory.mjs` (both copies) and a `retired_phases:` list in both state-machine copies,
  so an adopter's `_index.yaml` that still says `current: task-decomposition` stays valid
  (Migration > Adopters).
- Deleting `scripts/sdlc/__fixtures__/review-primitives-examples/test-fixtures/`, a task-file
  evidence fixture that no test or CI step runs (`rg -l "empty-evidence-task" --glob '!specs/**'`
  finds only that directory).
- Docs that describe the phase shape or task files: `README.md`, `playbook.md`, `skills.md`,
  `skill-architecture.md`, `roles.md`, `agent-orchestration.md`, `sync.md`, `triage.md`,
  `tooling.md`, `work-graph.md`, `specs/_index.md`, `.ai/*.md`.
- The plugin: the description in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`,
  the version bump to `0.3.0`, a pre-1.0 versioning rule and the shipped-contract row in
  `docs/RELEASING.md` (see Migration > Adopters).
- CI: `sdlc-validate.yml`, both copies, runs `validate-guide.mjs`.

### Out of scope

- **Rewriting closed history.** Task files and `_index.yaml` files under
  `specs/tasks/SPEC-00{1,2,4,6}` and `specs/archive/`, the bodies of the completed specs SPEC-001,
  SPEC-002, SPEC-004 to SPEC-006, and ADR-001 to ADR-006 apart from the pointer lines above stay as
  written. Closed specs are immutable (`specs/sdlc-state-machine.yaml:137`).
- **Amending SPEC-003 and SPEC-007.** Both are open (active and draft) and so amendable, and both
  need changes after SPEC-008 lands (see `## Risks & constraints`). Each change goes through its own
  spec's amendment or authoring, not through this spec's delivery.
- **Renaming the `specs/tasks/` directory, the `task:` review prefixes or the registry's `task_has`
  key.** They are wired into hooks, CI, the review envelope and the prefix-parity test
  (`scripts/sdlc/prefix-parity.test.mjs`). They keep their names and ground on guide steps
  (Design > Where each task field goes).
- **Changing the per-step loop.** Branch per step, PR into `feat/spec-NNN`, merge before the next
  step: SOP §2 stays as it is, with a guide step as its unit.
- **SPEC-007's spec-review changes.** SPEC-008 does not change how `spec-reviewer` grades a spec.

## Design

### The phase shape

```
intent-triage → spec-authoring (spec + guide, one sign-off) │ spec-execution → spec-completion
spec-amendment ─────────────────────────────────────────────┘ (updates the guide, re-approves)
```

The task-decomposition phase is deleted from the state machine, and its skill is deleted from the
tree. Git history keeps it, the same way ADR-003 handled the `execute-spec` Workflow
(`specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:72`).

### Alternatives considered

- **Keep both paths and let each spec choose.** Rejected. The plan gate and the phase-memory hooks
  read only `plan_review:` and `phase:`, but seven consumers read the task layout itself:
  spec-completion Steps 1-2, SOP §2 and §5, spec-amendment's cascade, `sdlc-code-review`, the `task:`
  and `monorepo:` rows of `review-primitives.md`, and the registry's `when` matching. Each would
  have to handle and test two layouts. ADR-003 rejected the same shape for the same reason: "A
  dormant second path drifts and rots"
  (`specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:72`). A per-spec choice also adds a
  new owner question to every spec.
- **Let the executor write its plan at run start.** `spec-execution` already surfaces a ≤10-line
  plan and starts immediately (`skills/spec-execution/SKILL.md` §1). Rejected as the whole answer,
  because it drops the owner's approval of the plan, which ADR-002 makes a fail-closed gate. The
  guide keeps that approval and moves it to the spec sign-off.
- **Put the guide inside the spec as a section.** Rejected. `spec-reviewer` grades the whole spec
  file, and SPEC-007 records 10-15 rounds on spec content alone
  (`specs/SPEC-007-spec-review-convergence.md:18`). A separate file keeps the guide out of that loop.

### The guide

`specs/tasks/SPEC-NNN/GUIDE.md` sits next to `_index.yaml` and `DECISIONS.md`, so the hooks, scripts
and CI globs that read `specs/tasks/SPEC-NNN/` keep their paths. Shape:

```markdown
---
spec: SPEC-NNN
spec_version: 1
---

## Steps

### S1: <title>
- Covers: AC-001, AC-004
- Changes: `scripts/sdlc/foo.mjs`, `skills/bar/**`
- Verify: `node --test scripts/sdlc/foo.test.mjs`
- Workspace: <name>     (required when `.ai/project.md` defines workspaces)
- Risk: low | medium | high     (optional; default low)
- After: S1     (optional; default is every earlier step)
- Run by: <role>     (optional; a step only a human can perform, such as a credentialed run)
- Notes: <optional; a contract a later step must match, or a pointer to a brief>

## Owner decisions
- D1: <question>. Decided by <role>.

## End-to-end validation
- <what SOP §6 runs for this spec>
```

`_index.yaml` keeps `plan_review:` and `phase:` as they are, and replaces `tasks:` with two lists:

```yaml
spec: SPEC-NNN
plan_review:
  status: approve-ready
  approved: false
  reviewed: YYYY-MM-DD
steps:
  - id: S1
    status: pending    # pending | in_progress | done | blocked | deferred | cancelled
    reason:            # required for blocked, deferred, cancelled
decisions:
  - id: D1
    status: pending    # pending | decided
    decided:           # one line, required when decided
phase: { ... }
```

The step statuses stay because SOP §2 step 6 depends on them for crash-safe resume
(`skills/spec-execution/SOP.md:53`). A cancelled step stays in both files with its reason, so the
record survives. `plan-gate.mjs` reads only `plan_review:` (`scripts/sdlc/plan-gate.mjs:9`), so it
needs no logic change, only new wording in its comments and one error message.

Spec acceptance criteria and success criteria carry ids (`AC-001:`, `SC-1:`). `Covers:` names AC
ids only; SC ids are what the integration PR maps its evidence to (SOP §7.1). `skills/spec-schema.md` makes the ids required and `templates/spec.md` shows them.
SPEC-007 already uses them (`specs/SPEC-007-spec-review-convergence.md:95`, `:418`). SPEC-001 to
SPEC-004 write `AC-NNN —` (`specs/SPEC-003-onboarding-phase-1.md:114`), and the validator accepts
that form too. An open spec whose AC lines carry no id (any spec written from today's template) gets ids before its
guide is written. An id-only edit (adding an id to the front of an existing AC line and changing
nothing else on it) is a Cosmetic change under `spec-amendment` (`skills/spec-amendment/SKILL.md:58`):
no version bump and no re-review. It travels in the PR that carries the guide: the spec PR for a new
spec, or a `guide/SPEC-NNN` PR when the guide step runs alone on an active spec, and that PR's body
lists each edit.

A guide over 10 steps means the spec is too big, so the spec is split in `spec-authoring`.
SPEC-004, the largest decomposed spec, had 10 tasks (`ls specs/tasks/SPEC-004 | grep -c TASK`).

### Where each task field goes

| Task field | Guide disposition | Consumer that changes |
|---|---|---|
| `depends_on` | Step order, plus optional `After:` | SOP §5 fan-out criterion (a) reads `After:`: two steps qualify only if neither is in the other's `After:` closure |
| `blocks` | Dropped; step order carries it | `task:blocks:<id>` grounds on a `Notes:` contract that step `<id>` must match |
| `touches` | `Changes:` (required) | SOP §4 changed-path audit and SOP §5 criteria (b) and (c) read `Changes:` |
| (task scope) | `Changes:` compared with the step's diff | `task:scope` grounds on a diff that leaves the step's `Changes:`, and routes to the in-place guide re-plan in Design > Changing the guide during a run |
| `workspace` | `Workspace:` | `monorepo:workspace-scope` grounds on it; the registry's `when.workspace` matches it |
| `verify_workspaces` | `Verify:` must include each consuming workspace's command | `monorepo:verify-coverage` grounds on `Verify:` |
| `risk` | `Risk:` | The panel-composing agent reads the highest `Risk:` in the guide (ADR-003's tier row, `specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md:288`) |
| `tier` | Dropped | The registry already sets the gate's rigor, and "a declared `tier: express` never shrinks the gate panel" (same line) |
| `agent: human` (a decision) | `## Owner decisions` + `decisions:` | spec-execution §6 refuses to open the integration PR while any decision is `pending` |
| `agent: human` (work a human performs) | A step with `Run by: <role>` | The executor does not run it. It stays `pending` until the human reports it done, and §6 treats it like any other open step |
| `figma_frame` | Dropped | `pr-reviewer`'s `domain:playwright` row keeps its diff-path trigger (`skills/pr-reviewer/SKILL.md:139`) |
| Per-AC `evidence:` | Each step's PR body carries evidence for every AC in its `Covers:` | `task:evidence-missing` grounds on the step PR body; the self-review checks presence (`skills/review-primitives.md:25-35`) |
| `task_has` (registry key) | Keeps its name, matched against step fields | Registry header comments only; no row uses it today |
| Linear issue per task | None; the spec's Linear project stays | `sync.md` |

### `validate-guide.mjs`

A dependency-free Node script, like the other `scripts/sdlc/` validators. It finds the spec by
globbing `specs/SPEC-NNN-*.md` from the guide's `spec:` field and fails unless exactly one file
matches. It reads spec AC ids only from checkbox lines (`- [ ]` or `- [x]`) under
`## Acceptance criteria` that start with `AC-NNN` followed by `:` or ` —`, so cross-references
elsewhere in the spec are ignored. It exits 1 and names
the problem when:

1. an AC id in the spec is covered by no step whose status is not `cancelled`, so the ACs of a
   cancelled step must be re-covered by another step;
2. a `Covers:` id does not exist in the spec;
3. a step lacks `Changes:` or `Verify:`;
4. the step ids, or the decision ids, in `GUIDE.md` and `_index.yaml` differ;
5. `spec_version` in the guide differs from `version` in the spec (the guide is stale after an
   amendment);
6. a checkbox line under `## Acceptance criteria` carries no `AC-NNN` id in either form;
7. an `After:` id names no step, or names a step that is not earlier in the guide;
8. `.ai/project.md` defines workspaces and a step has no `Workspace:`.

Otherwise it exits 0. CI runs it on every `specs/tasks/*/GUIDE.md`. `spec-execution` runs it before
`plan-gate.mjs`. `guide-schema` joins the state machine's `exempt:` list, as `task-schema` is today
(`specs/sdlc-state-machine.yaml:177`).

### Who writes the guide, and when

`spec-authoring` gains a step after Step 10a. Once the spec review has converged, the author:

1. writes `GUIDE.md` and `_index.yaml` with `plan_review.approved: false`;
2. runs `validate-guide.mjs`;
3. runs the cross-spec collision check that task-decomposition used to run
   (`skills/task-decomposition/SKILL.md:56-79`): compare this guide's `Changes:` globs with the
   guide of every other `active` or `draft` spec, or, when it has no guide yet, with the `touches` in
   its `TASK-*.md` frontmatter (`skills/task-schema.md:47`), falling back to its `_index.yaml`
   `tasks:` list, and asking the owner when neither declares any, and put any overlap to the owner with the same three options (proceed with awareness,
   sequence, coordinate);
4. on exit, writes the full `phase:` block: `current: spec-authoring`, `next_action: spec-execution`,
   `next_trigger: 'execute SPEC-NNN'`, `exit_condition_met: true` and `updated: <date>`, then sets
   `handoff_surfaced: true` after surfacing the handoff, since `stop-handoff.mjs` never writes it. `spec-amendment` writes the same block with
   `current: spec-amendment`. `spec-execution` accepts `spec-authoring`, `spec-amendment` or
   `spec-execution` (resuming) as `phase.current` on entry.

5. at sign-off, writes `specs/tasks/SPEC-NNN/KICKOFF.md` from `templates/kickoff.md` and shows it to
   the owner in full.

`spec-reviewer` is not dispatched on the guide. The validator covers the mechanical part, and the
owner judges the rest. The owner reviews spec and guide together and, in one sign-off, sets the spec
to `active` and `plan_review.approved: true`. One spec PR carries both.

The same step runs on its own for a spec that is already `active` but has no guide, triggered by
"write the guide for SPEC-NNN". That covers SPEC-003 and every adopter spec decomposed before this
change. The owner approves that guide by setting `plan_review.approved: true`.

### The kickoff prompt

Every spec that becomes ready for delivery gets a kickoff prompt, so the owner starts the run by
pasting one prompt and does not have to write it. The prompt is at most 3,800 characters, the owner's
limit for the prompt that arms a goal (`wc -c` on `KICKOFF.md`). It carries:

- the trigger `execute SPEC-NNN` and the spec's title;
- the goal statement, one sentence taken from the spec's Problem;
- the exit criteria in the shape of the `spec-execution` goal file (`skills/spec-execution/SKILL.md`
  §1): every step done or deferred with a decided owner decision, end-to-end validation run with
  evidence, and one integration PR open and panel-reviewed;
- the paths the executor reads first (spec, guide, `_index.yaml`, the SOP);
- any `pending` owner decisions, so the run knows what it cannot close alone;
- the standing limits: never merge or push to `main`, stop and escalate on the `spec-execution` §8
  triggers.

`spec-authoring` writes it at sign-off, and the standalone guide step writes it when it runs alone.
`spec-amendment` rewrites it at re-approval, because a changed guide or AC set changes the prompt.
`KICKOFF.md` is generated output. Each writer rewrites it whole, nobody hand-edits it, and
`spec-execution` does not read it.

### Changing the guide during a run

The executor may reorder, split, merge, add or cancel steps, or add an owner decision, when no spec
AC, scope item or design decision changes. A new owner decision starts `pending`, and the executor
surfaces it to the owner at once and keeps burning down the steps that do not depend on it. It
escalates under `spec-execution` §8 only when every remaining step depends on the decision. It edits `GUIDE.md` and `_index.yaml` in one commit on `feat/spec-NNN`, re-runs
`validate-guide.mjs`, and logs it in `DECISIONS.md` under the heading
`## EXECUTIVE DECISION — guide change: <summary>`. The run does not pause for
re-approval. The integration PR body carries a `## Guide changes` section that lists every such
change with its `DECISIONS.md` heading, so the owner reviews them with the PR. ADR-007 records this
as a narrowing of what ADR-002's approval attests.

Any change to an AC, the scope or the design routes to `spec-amendment`, as it does today. A
`task:scope` blocker from the panel triggers the same in-place guide re-plan, in place of a trip to a
decomposition phase. A re-plan during the integration gate does not reset ADR-004's round count.

`spec-amendment` updates the guide in the same commit as the spec: it re-maps `Covers:`, adds or
cancels steps, bumps `spec_version`, and resets `plan_review.approved` to `false` for the owner to
re-approve at the amendment's existing sign-off. Its `next_phase` becomes `spec-execution`. An
amendment to an active spec that has no guide yet (SPEC-003) has nothing to cascade into, so it hands
off to "write the guide for SPEC-NNN".

### What blocks the integration PR

spec-execution §6 refuses to open the integration PR while any of these holds: a `decisions:` entry
is `pending`; a step is `pending`, `in_progress` or `blocked`, including a `Run by:` step the human
has not reported done; or a step is `deferred` and its `reason:` does not name a `decided` owner
decision (`D<n>`) accepting the deferral. This keeps ADR-003's rule that a pending human-routed task
blocks the gate (`skills/spec-execution/SKILL.md` §6).

### What `spec-completion` reads

Step 1 checks `steps:` and `decisions:` in place of task statuses. The "Task-covered" verification
type becomes "Step-covered", and it points at the evidence for that step's ACs in the step PR and the
integration PR.

### `DECISIONS.md` headings

`## S<n> — <title>` replaces `## TASK-NNN — <title>`, and `## Cross-step values` replaces
`## Cross-task values`, in `skills/spec-schema.md` and `templates/decisions.md`
(`skills/spec-schema.md:264-270`).

### Delivering SPEC-008 with the process it creates

Today's `spec-execution` refuses a spec without decomposed tasks (`skills/spec-execution/SKILL.md:28`).
SPEC-008 is delivered from its own guide anyway, under these rules:

1. `specs/tasks/SPEC-008/GUIDE.md` and `_index.yaml` (with `plan_review.approved: false`) ship in the
   same PR as this spec, and the owner approves them in the same sign-off.
2. `validate-guide.mjs` does not exist yet at sign-off, so the author checks the guide against the
   eight rules above by hand and says so in the spec PR body.
3. Step S1 lands `validate-guide.mjs` and `skills/guide-schema.md`, then runs the validator on
   SPEC-008's own guide. The result goes in `DECISIONS.md`.
4. At run start the executor logs an `EXECUTIVE DECISION` recording that the owner's sign-off
   authorized delivering from a guide in place of the current skill's task precondition. This is a
   departure from the skill, not from the spec, so it is not a `SPEC DEVIATION`
   (`skills/spec-schema.md:268`).

5. From run start, the run follows this spec's design where it differs from the current skill:
   Design > Changing the guide during a run (a `task:scope` blocker re-plans the guide, since the
   decomposition phase it would route to is being deleted), branches named `claude/SPEC-008-S<n>`,
   the new `DECISIONS.md` headings, the `## Guide changes` PR section, and Design > What blocks the
   integration PR. Where the current skill reads a task field, the run reads the guide field that
   Design > Where each task field goes names: a task-list entry per step, `Changes:` for `touches`,
   and the step PR body for `evidence:`. Entry accepts `phase.current: spec-authoring` per Design >
   Who writes the guide, step 4. Until the step that rewrites the state machine merges, the Stop
   hook still reads today's machine and suggests "decompose SPEC-008"; the owner ignores it.

Every other rule of the current `spec-execution` SKILL and SOP applies unchanged: goal leash, task
list, integration branch, end-to-end validation, capped panel, PR left open for the owner.

## Acceptance criteria

- [ ] AC-001: Given `specs/sdlc-state-machine.yaml` and `init-payload/sdlc-state-machine.yaml`, when
      read, then neither names `task-decomposition` or `task-schema` anywhere, including the header
      diagram and `exempt:` (the `retired_phases:` list is the one exception); both list
      `guide-schema` under `exempt:`; `spec-authoring` and
      `spec-amendment` both have `next_phase: spec-execution` and `next_trigger: 'execute SPEC-NNN'`;
      and `node scripts/sdlc/validate-state-machine.mjs` and `node scripts/sdlc/gen-handoffs.mjs --check`
      exit 0.
- [ ] AC-002: Given the `spec-execution` phase in the state machine, when its preconditions are read,
      then they require `GUIDE.md` to pass `validate-guide.mjs` and the plan gate to pass, and name no
      decomposed tasks; and `spec-authoring`'s entry triggers include `write the guide for`.
- [ ] AC-003: Given `scripts/sdlc/validate-guide.test.mjs`, when run with `node --test`, then it
      proves exit 1, naming the offending id, line or version, for each of the eight failure cases, including an AC
      covered only by a cancelled step, in Design >
      `validate-guide.mjs`, exit 1 when zero or two spec files match, and exit 0 for a valid guide
      whose spec also contains prose references to other specs' AC ids, both for a spec written
      `AC-NNN:` and for one written `AC-NNN —`.
      `init-payload/scripts/sdlc/validate-guide.mjs` is byte-identical to
      `scripts/sdlc/validate-guide.mjs`.
- [ ] AC-004: Given both copies of `sdlc-validate.yml`, when read, then each has a step that runs
      `validate-guide.mjs` over `specs/tasks/*/GUIDE.md`, and on a repo with no guide that step exits 0.
- [ ] AC-005: Given `templates/` and `init-payload/templates/`, when listed, then each has `guide.md`
      and neither has `task.md`; both copies of `spec.md` show `SC-1:` and `AC-001:` prefixes; and
      `skills/spec-schema.md` states that success and acceptance criteria require those ids.
- [ ] AC-006: Given `skills/spec-authoring/SKILL.md`, when read, then a step after Step 10a writes
      `GUIDE.md` and `_index.yaml` with `plan_review.approved: false`, runs `validate-guide.mjs`, and
      runs the cross-spec collision check on `Changes:` globs; it states that `spec-reviewer` is not
      dispatched on the guide; the sign-off sets `status: active` and `plan_review.approved: true`
      together; the collision check falls back to task `touches` for a spec with no guide; the step
      writes the `phase:` block in Design > Who writes the guide; and the step can run alone on an
      `active` spec with no guide, making any id-only edits first and opening a `guide/SPEC-NNN` PR.
- [ ] AC-007: Given `skills/spec-execution/SKILL.md` and `SOP.md`, when read, then §1 refuses to
      start unless `validate-guide.mjs` and `plan-gate.mjs` both exit 0; the loop's unit is a guide
      step on branch `claude/SPEC-NNN-S<n>`; SOP §5 reads `After:` and `Changes:`; §6 refuses to open
      the integration PR under every condition in Design > What blocks the integration PR; entry
      accepts the `phase.current` values in Design > Who writes the guide; the integration PR body template
      has a `## Guide changes` section; and the guide-change rule, the `task:scope` routing and the
      ADR-004 round count match Design > Changing the guide during a run.
- [ ] AC-008: Given `skills/spec-amendment/SKILL.md`, when read, then its Cosmetic class names the
      id-only edit, and its cascade updates `GUIDE.md`,
      bumps `spec_version`, resets `plan_review.approved` to `false`, and hands off to
      `spec-execution`, or to "write the guide for SPEC-NNN" when the spec has no guide.
- [ ] AC-009: Given `skills/spec-completion/SKILL.md`, when read, then Step 1 reads `steps:` and
      `decisions:` statuses and the verification-type table has "Step-covered" and no "Task-covered".
- [ ] AC-010: Given the tree, when listed, then `skills/guide-schema.md` exists and documents the
      guide fields, the `steps:` and `decisions:` lists, the plan-review block, the phase-memory block
      and the 10-step split rule; and `skills/task-schema.md` and `skills/task-decomposition/` do not
      exist.
- [ ] AC-011: Given this search, run from the repo root:
      `rg -n --hidden "task-decomposition|task-schema|templates/task\.md|task file" skills agents hooks scripts templates init-payload .ai .claude-plugin README.md playbook.md skills.md skill-architecture.md roles.md agent-orchestration.md tooling.md triage.md sync.md work-graph.md specs/_index.md --glob '!**/sdlc-state-machine.yaml'`,
      when run, then it prints nothing. (Specs, ADRs, task directories and `docs/plans/` are history
      and are excluded on purpose. The two state machines are excluded because AC-001 checks them
      with the `retired_phases:` exception.)
- [ ] AC-012: Given `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, when read,
      then neither description says "tasks"; and `plugin.json`'s `version` is `0.3.0`.
- [ ] AC-013: Given `specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md`, when read, then
      it names the ADR-003 precondition and the ADR-003 tier-resolution row (`tier:` as a task
      input) it supersedes, the ADR-002 gate it keeps, and the narrowed
      attestation from mid-run guide changes; and ADR-003 and ADR-002 each carry a one-line note
      pointing to ADR-007.
- [ ] AC-014: Given `specs/tasks/SPEC-008/`, when the run ends, then `GUIDE.md` passes
      `validate-guide.mjs`; every `steps:` entry is `done`, `deferred` or `cancelled` with a reason;
      `DECISIONS.md` records the bootstrap `EXECUTIVE DECISION` and the S1 validator result; and the
      integration PR body's `## Guide changes` section matches the guide-change entries in
      `DECISIONS.md` (Design > Changing the guide during a run) one for one, or says "none".
- [ ] AC-015: Given the full suite, when `node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs`
      runs on the integration branch tip, then it exits 0.
- [ ] AC-016: Given `skills/review-primitives.md` (both copies), `skills/sdlc-code-review/SKILL.md`
      and both copies of the review-constraints registry header, when read, then `task:blocks:<id>`,
      `task:scope`, `task:evidence-missing`, `monorepo:workspace-scope` and `monorepo:verify-coverage`
      each ground on the guide field named in Design > Where each task field goes, and
      `node --test scripts/sdlc/prefix-parity.test.mjs` exits 0.
- [ ] AC-017: Given `docs/RELEASING.md`, when read, then it states that before `1.0.0` a change the
      bump table classes as major bumps the minor version; and its shipped-contract table has a
      `0.3.0` row naming the removed skill and phase, the `_index.yaml` `steps:` and `decisions:`
      lists, the AC-id requirement with the id-only edit, the adopter action for an in-flight
      decomposed spec, and the four adopter actions in Migration > Adopters, starting with
      `/sdlc-sync`.
- [ ] AC-018: Given `skills/spec-schema.md` and both copies of `templates/decisions.md`, when read, then the
      `DECISIONS.md` headings are `## S<n> — <title>`, `## EXECUTIVE DECISION`, `## SPEC DEVIATION`
      and `## Cross-step values`; the guide-change heading form in Design > Changing the guide
      during a run is named; and neither file names `TASK-NNN`.
- [ ] AC-019: Given an `_index.yaml` whose `phase:` block names `task-decomposition` in `current` or
      in `next_action`, when `validate-phase-memory.mjs` runs, then it exits 0 and prints a warning
      naming the retired id; a test covering both fields in `scripts/sdlc/` proves it, building its fixture from
      the state machine's `retired_phases:` list so the test source holds no literal retired id; and
      `init-payload/scripts/sdlc/validate-phase-memory.mjs` is byte-identical to the repo copy.

- [ ] AC-020: Given `skills/spec-authoring/SKILL.md` and `skills/spec-amendment/SKILL.md`, when read,
      then both write `specs/tasks/SPEC-NNN/KICKOFF.md` from `templates/kickoff.md` at sign-off or
      re-approval and show it to the owner; `templates/kickoff.md` exists in both copies,
      byte-identical, and names every item in Design > The kickoff prompt; and
      `wc -c < specs/tasks/SPEC-008/KICKOFF.md` prints 3800 or less.

## Risks & constraints

- **SPEC-003 needs an amendment.** SPEC-003 is `active` with 7 pending tasks
  (`specs/tasks/SPEC-003/_index.yaml`). Two of its ACs become unsatisfiable once SPEC-008 lands:
  AC-005 requires `bootstrap.sh` to find a `task-decomposition` skill directory, and AC-007 requires
  README's Documents table to list `task-schema.md` (`specs/SPEC-003-onboarding-phase-1.md:114`,
  `:116`). A guide cannot change a spec's ACs, so SPEC-003 goes through `spec-amendment`: drop
  `task-decomposition` from AC-005's list and its counts (11 directories, 12 entries), make the same
  change to the 11 names in AC-012, and replace `task-schema.md` with `guide-schema.md` in AC-007.
  Its ACs already carry ids in the `AC-NNN —` form, so it needs no id-only edit. It then gets its
  guide from the standalone guide step. Its task files can serve as step briefs
  through `Notes:`. Its pending tasks also rewrite `README.md`, `skills.md`,
  `skill-architecture.md` and `.ai/setup.md`, which SPEC-008 edits, so it runs after SPEC-008.
- **SPEC-007 edits the same files.** SPEC-007 (draft, uncommitted) edits
  `skills/spec-authoring/SKILL.md`, `skills/spec-schema.md`, `skills/review-primitives.md` and
  `skills/spec-amendment/SKILL.md` (`grep -o "skills/[a-z-]*[/.a-zA-Z]*" specs/SPEC-007-spec-review-convergence.md`).
  SPEC-008 edits all four. The owner chose to deliver SPEC-008 first, so SPEC-007 rebases onto it.
- **Mid-run guide changes are reviewed late.** Task-decomposition's re-planning mode ended with
  owner review (`skills/task-decomposition/SKILL.md` Step R4). Under this design the owner sees a
  mid-run guide change in the integration PR's `## Guide changes` section, after the work is done.
  The owner chose this over pausing the run. ADR-002's approval therefore attests the guide as
  approved, not the guide as executed.
- **A thin guide moves judgment into the run.** Decomposition forced boundary decisions (interface
  names, types, ordering) before code. A guide can skip them. `Notes:` carries any contract a later
  step must match, `DECISIONS.md` records what the executor decided, and the integration panel
  grades the result. Revisit trigger: if either of the next two specs delivered from a guide gets a
  `task:scope` or `spec:*` blocker at its integration gate, the owner reopens ADR-007.
- **No behavioral-metric guardrail.** This spec changes framework doctrine and tooling. It changes
  no production behavioral metric (prompt, scoring, gating threshold or retrieval input in a running
  product), so the guardrail requirement in `spec-authoring` Step 9 does not apply.

## Migration

### Current state

Five phases run in order, with `task-decomposition` between `spec-authoring` and `spec-execution`
(`specs/sdlc-state-machine.yaml:78-81`). `spec-execution` refuses a spec without decomposed tasks
(`skills/spec-execution/SKILL.md:28`).

### Target state

Four phases on the main line. `spec-authoring` produces the spec and its guide under one sign-off,
and `spec-execution` burns guide steps down using the unchanged SOP loop.

### Migration strategy

SPEC-008 is delivered on one integration branch, in the order its guide sets. The new tooling
(validator, schema, template) lands first, the skills next, the state machine after the skills it
points at, and the docs and deletions last, so the full suite stays green at every step.

### Adopters

Removing a skill is a major bump (`docs/RELEASING.md:28`), and a change to the state-machine phase
spine needs a release note (`docs/RELEASING.md:27`). `docs/RELEASING.md` has no rule for versions
before `1.0.0`, and its one precedent shipped a breaking change as `0.1.0` to `0.2.0`
(`docs/RELEASING.md:34`). This spec writes that precedent down as a rule and ships as `0.3.0`.

The release note covers four adopter actions, in this order.

1. **Run `/sdlc-sync`.** It is the only way an adopter's repo-local `scripts/sdlc/*.mjs`, workflows
   and templates are refreshed (`skills/sdlc-sync/SKILL.md:16`). It brings in `validate-guide.mjs`,
   the retired-id-aware `validate-phase-memory.mjs`, `templates/guide.md` and the new
   `sdlc-validate.yml`. Without it the plugin's `spec-execution` calls a `validate-guide.mjs` that
   does not exist.
2. **Update the state machine.** `sdlc-sync` writes an adopter's `specs/sdlc-state-machine.yaml`
   only when it is absent, because the file belongs to the adopter
   (`skills/sdlc-sync/SKILL.md:39-41`), and the plugin's hooks read that copy. The adopter replaces
   the `phases:` and `exempt:` blocks with the ones in `init-payload/sdlc-state-machine.yaml`, adds
   its `retired_phases:` list, keeps their own `domain_routing:`, and runs
   `validate-state-machine.mjs`. Until then the Stop hook still suggests "decompose SPEC-NNN".
3. **Handle a decomposed spec in flight.** Either finish it on `0.2.x`, or make any id-only edits to
   its AC lines, write its guide with "write the guide for SPEC-NNN", and point each step's `Notes:`
   at the existing task brief.
4. **Nothing for closed specs.** An `_index.yaml` that names `task-decomposition` in `current` or
   `next_action` stays
   valid before the update (the old machine still defines the phase) and after it (the id is in
   `retired_phases:`, which `validate-phase-memory.mjs` accepts with a warning, AC-019).
   `plan-gate.mjs` reads only `plan_review:`, and `validate-guide.mjs` runs only where a `GUIDE.md`
   exists.

### Rollback plan

Revert the integration merge commit on `main` and publish `0.4.0`, since restoring a skill and a
phase and removing the guide validator is itself major-class under the `0.3.0` rule. The deleted
skill, template and schema come back intact, because this spec deletes them in the same merge that
replaces them. No closed spec or task file is edited, so no history needs restoring.

A spec authored with a guide in the meantime has no task files, so the restored `spec-execution`
refuses it. The rollback release note tells its owner to stay on `0.3.x` until the spec closes, or to
decompose it. It also tells every adopter to run `/sdlc-sync`, restore the `0.2.x` `phases:` and
`exempt:` blocks in their own `specs/sdlc-state-machine.yaml`, and re-run `validate-state-machine.mjs`.
