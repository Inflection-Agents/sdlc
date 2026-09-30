# Guide schema

A spec's plan is a **delivery guide**: a short, ordered list of steps at
`specs/tasks/SPEC-NNN/GUIDE.md`, written at the end of `spec-authoring` and approved by the owner in
the same sign-off that makes the spec `active` (ADR-007). `spec-execution` burns the steps down one at
a time. The guide replaces the separate decomposition phase and its per-task briefs.

The guide is not graded by `spec-reviewer`. Everything mechanical about it is checked by
[`scripts/sdlc/validate-guide.mjs`](../scripts/sdlc/validate-guide.mjs), which CI runs on every guide.

## Files

| File | Written by | Read by |
| --- | --- | --- |
| `GUIDE.md` | `spec-authoring` (or `spec-amendment`); edited mid-run by the executor | the executor, the validator |
| `_index.yaml` | the same writers; step statuses flipped by the executor | the validator, `plan-gate.mjs`, the hooks |
| `KICKOFF.md` | `spec-authoring` at sign-off, `spec-amendment` at re-approval | the owner, who pastes it to start the run |
| `DECISIONS.md` | the executor, from run start | the owner, the integration panel |

All four sit together in `specs/tasks/SPEC-NNN/`.

## `GUIDE.md`

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
- Workspace: <name>
- Risk: low
- After: S1
- Run by: <role>
- Notes: <a contract a later step must match, or a pointer to a brief>

## Owner decisions

- D1: <question>. Decided by <role>.

## End-to-end validation

- <what SOP §6 runs for this spec>
```

| Field | Required | Meaning |
| --- | --- | --- |
| `spec_version` | yes | The spec `version` this guide was written against. A mismatch means the guide is stale after an amendment. |
| `Covers:` | yes | The spec AC ids this step delivers. AC ids only; SC ids are what the integration PR maps its evidence to. |
| `Changes:` | yes | The paths or globs the step may change. The self-review changed-path audit (SOP §4) and the fan-out test (SOP §5) read it. |
| `Verify:` | yes | The commands that gate the step. For a change to shared code, include each consuming workspace's command. |
| `Workspace:` | when `.ai/project.md` defines workspaces | The one workspace the step changes. `monorepo:workspace-scope` grounds on it. |
| `Risk:` | no (default `low`) | `low`, `medium` or `high`. The agent composing the integration panel reads the highest `Risk:` in the guide; the registry can only raise rigor. |
| `After:` | no (default: every earlier step) | The earlier steps this one needs. SOP §5 lets two steps fan out only if neither is in the other's `After:` closure. |
| `Run by:` | no | A step only a human can perform, such as a credentialed run. The executor does not run it; it stays `pending` until the human reports it done. |
| `Notes:` | no | The one thing the executor cannot read from the spec: a contract a later step must match (`task:blocks:<id>` grounds on it), or a pointer to an existing brief. |

**Owner decisions** list the questions the run cannot close alone. A pending one blocks the
integration PR.

**Split rule.** A guide over 10 steps means the spec is too big. Split the spec in `spec-authoring`.

## `_index.yaml`

```yaml
spec: SPEC-NNN
title: "Spec title"
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
phase:
  current: spec-authoring
  next_action: spec-execution
  next_trigger: 'execute SPEC-NNN'
  exit_condition_met: true
  handoff_surfaced: true
  updated: YYYY-MM-DD
```

The executor flips a step to `done` and pushes that commit to the integration branch as soon as the
step's PR merges, so a resumed run reads `_index.yaml` and continues at the first unfinished step. A
cancelled step stays in both files with its reason, and its ACs must be re-covered by another step.

Specs decomposed before ADR-007 keep their `tasks:` lists. They are history, and nothing rewrites
them.

### Plan-review block

The top-level `plan_review:` block is the durable verdict of the plan-review gate (ADR-002): the
owner's approval of the spec and its guide before any code is written.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | enum | `approve-ready`, `approve-after-fixes` or `needs-rework`. |
| `approved` | boolean | Owner sign-off. The writer stamps `false`; the owner sets `true` in the same sign-off that makes the spec `active`. |
| `reviewed` | ISO date | When the plan review was recorded. |

The gate fails closed. `node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml` exits 0
only when `approved` is `true` and `status` is not `needs-rework`, and a missing block halts like an
unapproved one. `spec-execution` runs it before a run starts. CI runs `--presence-only` repo-wide,
because enforcing approval on every PR would fail PRs that touch a spec still awaiting sign-off.
`spec-amendment` resets `approved` to `false` for the owner to re-approve.

### Phase-memory block

The optional top-level `phase:` block makes the SDLC resumable. Each phase's owner skill reads it on
entry and writes it on exit. `spec-authoring` writes `current: spec-authoring` and `spec-amendment`
writes `current: spec-amendment`, each with `next_action: spec-execution`; `spec-execution` accepts
either, or `spec-execution` when resuming. `handoff_surfaced` is set to `true` only after the handoff
is surfaced, because `stop-handoff.mjs` reads it and never writes it. The allowed ids and triggers are
defined once in `specs/sdlc-state-machine.yaml`; a retired id listed under `retired_phases:` there is
accepted with a warning.

## `KICKOFF.md`

The prompt the owner pastes to start delivery. **It holds at most 3,800 characters**, counted as
Unicode characters, not bytes. Validator rule 9 enforces this on every approved guide. It is generated
from `templates/kickoff.md`, rewritten whole by each writer, and never hand-edited. `spec-execution`
does not read it.

## Validator rules

`validate-guide.mjs` exits 1 and names the problem when:

1. an AC id in the spec is covered by no step whose status is not `cancelled`;
2. a `Covers:` id does not exist in the spec;
3. a step lacks `Changes:` or `Verify:`;
4. the step ids, or the decision ids, in `GUIDE.md` and `_index.yaml` differ;
5. `spec_version` differs from the spec's `version`;
6. a checkbox under `## Acceptance criteria` carries no `AC-NNN` id (`AC-NNN:` and the legacy
   `AC-NNN —` both count);
7. an `After:` id names no step, or a step that is not earlier;
8. `.ai/project.md` defines workspaces and a step has no `Workspace:`;
9. `plan_review.approved` is `true` and `KICKOFF.md` is missing or over 3,800 characters.
