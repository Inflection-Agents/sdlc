---
id: SPEC-005
title: Conditional integration-branch strategy for spec-execution
status: draft
version: 1
supersedes:
initiative: INI-001
owner: franklin
created: 2026-05-18
updated: 2026-05-18
tags: [spec-002-amendment, integration-branch, orchestration, conditional]
linear_project:
depends_on: [SPEC-002]
---

## Problem

SPEC-002 AC-010 mandates `feat/spec-NNN` as the *only* merge target with direct task PRs to main forbidden — a hard rule. The SPEC-001/SPEC-002 bootstrap dispatch violated this rule pragmatically (10 task PRs went direct to main), and nothing broke. The bootstrap had clean per-task file boundaries, no atomic-deploy requirements, and the orchestrator (Claude with full context) made a sensible judgment call. But it was an undocumented judgment call — the spec being executed forbade what we did.

The user surfaced this directly: "I've found it very helpful to create a feature branch for a given spec so that all tasks for that spec get merged to that branch and only when it's completed, does the spec branch get merged. This helps with managing breaking changes, but I can also see it being overkill in some instances."

The hard rule is wrong in both directions:
- **Too strict for small specs:** Bootstrapping `feat/spec-NNN`, opening N task PRs against it, then opening an integration PR adds ceremony with no payoff when tasks are independent additions with clean boundaries.
- **Right for risky specs:** When tasks must land together (breaking changes, multi-workspace atomic deploys, cross-cutting refactors), the integration branch is real safety — partial deploys would break intermediate states.

The right shape is conditional: explicit author control with a sensible heuristic default. This spec adds the conditional via a `spec-amendment` on SPEC-002 plus a cascading update to the `spec-execution` skill.

## Success criteria

- [ ] Spec frontmatter accepts an optional `integration_strategy: branch | direct` field. When set, the orchestrator uses it verbatim.
- [ ] When the field is unset, the orchestrator computes the strategy from observable spec properties via a documented heuristic (default direction errs toward `branch` for risky shapes, `direct` for small clean specs).
- [ ] `spec-execution` Phase 1 records the resolved strategy in the telemetry log so the decision is auditable.
- [ ] SPEC-002 AC-010 is amended from "ONLY merge pattern" to "default merge pattern, overrideable per spec."
- [ ] On the first spec executed under the updated orchestrator, the strategy decision matches the user's intent without manual intervention (verified by post-execution inspection on the first real spec).

## Scope

### In scope

- `spec-schema.md` amendment: add optional `integration_strategy: branch | direct` field. Define value semantics.
- `spec-execution/SKILL.md` Phase 1 update: read `integration_strategy` from spec frontmatter; if unset, compute via heuristic; persist the resolved value to telemetry; pass it to Phase 2 and Phase 3.
- `spec-execution/SKILL.md` Phase 2 + Phase 3 updates: per-task lifecycle merges to `feat/spec-NNN` or `main` per the resolved strategy. Phase 3 integration PR is only created in `branch` mode.
- SPEC-002 amendment via `spec-amendment` skill: AC-010 wording change; Migration section update; relevant Design subsections update.
- Document the heuristic (in a single place, referenced from both spec-schema and spec-execution).

### Out of scope

- **Automated detection of `breaking` from code analysis.** The `breaking` tag is author-asserted via spec tags; no static analysis. Captured as a future intent.
- **Mid-execution strategy switching.** The orchestrator commits to one strategy at Phase 1 init; cannot switch mid-execution. If conditions change (e.g., a spec-amendment introduces a breaking change), the next dispatch picks the new strategy.
- **Retroactive application to in-flight specs.** Specs already executing under the old orchestrator finish under the old rules; the new strategy applies to specs that begin under the updated orchestrator.
- **Strategy enforcement at task-decomposition time.** Decomposition does not check or set the strategy; the orchestrator alone resolves it.

## Design

### Strategy resolution algorithm

The orchestrator resolves the strategy at Phase 1 step 1 (right after verifying `status: active`):

```python
def resolve_integration_strategy(spec):
    # 1. Explicit field wins.
    if spec.frontmatter.get("integration_strategy") in ("branch", "direct"):
        return spec.frontmatter["integration_strategy"]

    # 2. Heuristic fallback.
    task_count = len(spec.tasks)
    workspaces = spec.frontmatter.get("workspaces") or []
    tags = spec.frontmatter.get("tags") or []
    any_cross_workspace_blocks = any(
        task.crosses_workspace_boundary_in_blocks() for task in spec.tasks
    )

    if ("breaking" in tags
        or len(workspaces) > 1
        or task_count >= 5
        or any_cross_workspace_blocks):
        return "branch"
    return "direct"
```

**Why these signals:**
- `breaking` tag → explicit author signal that partial deploy would harm consumers.
- `len(workspaces) > 1` → multi-workspace spec means coordinated landing matters; integration branch lets the full spec be verified before any of it goes to main.
- `task_count >= 5` → bookkeeping overhead of a feature branch is amortized when there are ≥5 PRs to coordinate.
- `any task.blocks` crossing workspace boundary → a producer-consumer contract crosses workspaces; verify the contract holds in one place before main.

### Strategy semantics

**`branch` mode (existing SPEC-002 behavior):**
- Phase 1: create `feat/spec-NNN` off main.
- Phase 2: each task PR targets `feat/spec-NNN`.
- Phase 3: open integration PR `feat/spec-NNN → main` after all tasks done and `spec-completion` passes.

**`direct` mode (new):**
- Phase 1: no integration branch created.
- Phase 2: each task PR targets `main` directly.
- Phase 3: no integration PR. `spec-completion` runs against `main` (verifies success criteria against the merged state).

### Telemetry

Phase 1 emits a new event recording the resolved strategy:

```json
{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "integration_strategy_resolved", "strategy": "branch | direct", "source": "explicit | heuristic", "signals": {"breaking_tag": <bool>, "workspace_count": <int>, "task_count": <int>, "cross_workspace_blocks": <bool>}}
```

The `source` field records whether the explicit field or the heuristic decided. The `signals` field records the heuristic inputs so post-hoc tuning is possible.

### SPEC-002 amendment

`spec-amendment` skill runs on SPEC-002. Changes:

- AC-010 rewrites from "Integration branch ... ONLY merge pattern. Direct task PRs to main are forbidden" → "Default merge pattern is integration-branch (`feat/spec-NNN`); spec frontmatter may set `integration_strategy: direct` to bypass and merge task PRs directly to main. See SPEC-005 for the resolution algorithm and heuristic."
- Phase 1 description gains step "resolve integration strategy" referencing SPEC-005.
- Phase 3 description gains conditional: integration PR only created in `branch` mode.
- Migration section note: existing in-flight specs grandfather under the old rule; new specs follow the conditional.
- Version bump: SPEC-002 → v2.

### Heuristic source-of-truth location

The heuristic itself lives in **one place only**: `spec-execution/SKILL.md` Phase 1 step "resolve integration strategy". Both SPEC-002 (amended) and `spec-schema.md` reference it. This avoids the drift problem the SPEC-001/SPEC-002 review loop demonstrated (where the same content in multiple places drifted across iterations).

## Acceptance criteria

- [ ] AC-001 — `spec-schema.md` declares `integration_strategy` as an optional frontmatter field with allowed values `branch` and `direct`. Schema validation accepts specs that omit the field or set it to either valid value; specs that set it to any other value fail validation.
- [ ] AC-002 — `spec-execution/SKILL.md` Phase 1 includes a "resolve integration strategy" step that runs after `status: active` verification and before integration-branch creation. The step contains the pseudocode from Design > Strategy resolution algorithm verbatim.
- [ ] AC-003 — When `integration_strategy` is set explicitly in the spec frontmatter, the orchestrator uses that value without invoking the heuristic. Verified by inspection of the resolved value in the telemetry event (`source: "explicit"`).
- [ ] AC-004 — When `integration_strategy` is unset, the orchestrator computes the strategy per the heuristic. The four signals (`breaking_tag`, `workspace_count >= 2`, `task_count >= 5`, `cross_workspace_blocks`) each independently trigger `branch`; the absence of all four triggers `direct`. Verified by 4+1 test cases in the spec-execution worked example.
- [ ] AC-005 — `spec-execution/SKILL.md` Phase 2 describes both flows: in `branch` mode task PRs target `feat/spec-NNN`; in `direct` mode task PRs target `main`. The per-task lifecycle pseudocode in Appendix B uses a `target_branch` variable resolved from the strategy.
- [ ] AC-006 — `spec-execution/SKILL.md` Phase 3 describes both flows: in `branch` mode an integration PR `feat/spec-NNN → main` is opened after spec-completion passes; in `direct` mode no integration PR is opened and spec-completion runs against `main`.
- [ ] AC-007 — Telemetry schema includes the `integration_strategy_resolved` event with all fields per Design > Telemetry. The worked example log fixture (`spec-execution/examples/example-execution.log.jsonl`) is updated to include one such event at the start.
- [ ] AC-008 — SPEC-002 is amended to v2 via `spec-amendment` skill. AC-010 wording matches Design > SPEC-002 amendment. The version bump and changelog entry are present.
- [ ] AC-009 — On the first spec executed under the updated orchestrator, the strategy decision matches the user's intent. Verified by post-execution inspection: read the `integration_strategy_resolved` event and confirm the resolved strategy matches what the user would have chosen manually.
- [ ] AC-010 — `spec-amendment` skill, when run on a spec that has `integration_strategy: direct`, applies its changes via standard task-PR flow (no integration branch); when run on a spec with `integration_strategy: branch`, the amendment PR may target either main or `feat/spec-NNN` depending on whether the integration branch still exists. Behavior documented in spec-amendment skill.

## Risks & constraints

- **Heuristic miscalibration.** Four signals may misjudge edge cases — e.g., a 4-task spec with subtle ordering risk gets routed `direct` when it should be `branch`. Mitigation: explicit field always wins; first real-spec validation (AC-009) catches misalignment.
- **`breaking` tag is informal.** No enforcement that authors apply it correctly. Mitigation: convention only; document well; relies on author discipline. Captured as a future intent for stricter detection.
- **`cross_workspace_blocks` signal computation** requires the orchestrator to read all task files and analyze their `blocks:` field against workspace assignments. This is O(N_tasks × N_blocks) — fine for typical specs (≤30 tasks), worth noting.
- **In-flight specs grandfather under old rule.** If a spec started under SPEC-002 v1 (branch-only) is still executing when v2 lands, it continues under v1 rules. Mitigation: telemetry records the orchestrator version; consumers can see which rules applied.
- **`direct` mode loses the "all of spec lands together" guarantee.** This is the whole point — but it means a partial-merged spec is now a real intermediate state. Mitigation: heuristic catches the high-risk cases; explicit author control catches the rest.
- **spec-amendment on SPEC-002** cascades to the `spec-execution` skill (TASK-009 of SPEC-002 must be updated). This is a within-bundle cross-task dependency.
- **`integration_strategy_resolved` event** is the only new telemetry event; the existing 9 event types remain unchanged.

## Migration

### Current state

- SPEC-002 AC-010 hard-requires integration-branch pattern.
- `spec-execution/SKILL.md` implements only the `branch` flow.
- `spec-schema.md` has no `integration_strategy` field.
- Bootstrap dispatch (this session) violated AC-010 by going direct-to-main; nothing broke but the violation was undocumented.

### Target state

- SPEC-002 amended to v2 with conditional AC-010.
- `spec-schema.md` declares the optional field.
- `spec-execution/SKILL.md` implements both flows behind a single resolution algorithm.
- Telemetry records the resolved strategy on every execution.

### Migration strategy

1. Land the schema amendment first (AC-001) — additive, no runtime impact.
2. Land the SPEC-002 amendment via `spec-amendment` skill (AC-008) — version bump, AC wording change.
3. Land the `spec-execution` skill updates (AC-002 through AC-007, AC-010) — the runtime change.
4. Validate on the first spec executed under the updated orchestrator (AC-009).

### Rollback plan

- Each piece is independently revertable.
- The schema addition is additive (specs without the field still validate).
- Reverting the spec-execution skill restores `branch`-only behavior; specs with `integration_strategy: direct` would then fail at Phase 1 (orchestrator wouldn't recognize the field). Mitigation: revert the schema validation simultaneously, treat the field as unknown.
- SPEC-002 amendment revertable via `spec-amendment` v3 if needed.
