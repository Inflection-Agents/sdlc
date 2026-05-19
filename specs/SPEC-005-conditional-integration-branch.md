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
tags: [integration-branch, orchestration, conditional, extends-spec-002]
linear_project:
depends_on: [SPEC-002]
---

## Problem

SPEC-002 AC-010 mandates `feat/spec-NNN` as the *only* merge target with direct task PRs to main forbidden — a hard rule. The SPEC-001/SPEC-002 bootstrap dispatch violated this rule pragmatically (10 task PRs went direct to main), and nothing broke. The bootstrap had clean per-task file boundaries, no atomic-deploy requirements, and the orchestrator (Claude with full context) made a sensible judgment call.

The user surfaced this directly: "I've found it very helpful to create a feature branch for a given spec so that all tasks for that spec get merged to that branch and only when it's completed, does the spec branch get merged. This helps with managing breaking changes, but I can also see it being overkill in some instances."

The hard rule is wrong in both directions:
- **Too strict for small specs.** Bootstrapping `feat/spec-NNN`, opening N task PRs against it, then opening an integration PR adds ceremony with no payoff when tasks are independent additions with clean boundaries.
- **Right for risky specs.** When tasks must land together (breaking changes, multi-workspace atomic deploys, cross-cutting refactors), the integration branch is real safety — partial deploys would break intermediate states.

The right shape is conditional: explicit author control with a sensible heuristic default.

### Reframing in iter-2: extending SPEC-002, not amending it

Iter-1 review flagged that "amend SPEC-002 to v2" violates `spec-schema.md`'s transition rules (no `completed → active` step). SPEC-002 is `status: completed`. This spec adopts the same pattern SPEC-004 introduced (per iter-1 cross-cutting insight): **completed specs are immutable**; the live artifacts (`spec-execution/SKILL.md`, `spec-schema.md`, `review-primitives.md`) get extended in place, and the completed spec gets a Changelog annotation pointing at the extension.

This spec extends `spec-execution/SKILL.md`'s integration-branch behavior to be conditional. SPEC-002 stays `status: completed v1` with a Changelog v1.1 entry. The AC-010 wording in SPEC-002 itself is not edited — it remains the historical record of what the spec said at completion time. The live skill behavior is what consumers actually invoke.

## Success criteria

- [ ] Spec frontmatter accepts an optional `integration_strategy: branch | direct` field. When set, `spec-execution` uses it verbatim.
- [ ] When the field is unset, `spec-execution` computes the strategy from observable spec properties via a documented heuristic (default direction errs toward `branch` for risky shapes, `direct` for small clean specs).
- [ ] `spec-execution` Phase 1 records the resolved strategy in the telemetry log (new event type) so the decision is auditable.
- [ ] On the first spec executed under the updated `spec-execution`, the strategy decision matches the owner's pre-registered expectation (see AC-009 for the protocol).
- [ ] SPEC-002 v1 stays `status: completed` and unchanged in its design body. A Changelog v1.1 entry on SPEC-002 documents the extension and points at SPEC-005.

## Scope

### In scope

- `spec-schema.md` extension: add optional `integration_strategy: branch | direct` field. Schema validation accepts unset or either of the two valid values.
- `.ai/skills/spec-execution/SKILL.md` extension:
  - Phase 1: new "resolve integration strategy" step after `status: active` verification, before branch creation.
  - Phase 2: per-task lifecycle parameterized by resolved strategy.
  - Phase 3: integration PR only in `branch` mode; in `direct` mode, spec-completion fires on the last task PR's merge.
  - Telemetry: new `integration_strategy_resolved` event type added to the schema; the worked example log fixture (`.ai/skills/spec-execution/examples/example-execution.log.jsonl`, which exists post-TASK-010) gains one such event at the start.
- Document the heuristic in one authoritative location: `.ai/skills/spec-execution/SKILL.md` Phase 1 step "resolve integration strategy". `spec-schema.md` and SPEC-002's Changelog annotation reference this single source.
- Changelog v1.1 annotation on SPEC-002 per the "completed specs are immutable" pattern (same convention introduced by SPEC-004).

### Out of scope

- **`spec-amendment` skill behavior changes for integration-strategy-aware amendments.** Removed from this spec per iter-1 F-003 (was AC-010 originally; it implied skill changes not enumerated in scope). Captured in intents.md as a follow-up.
- **Automated detection of "breaking" from code analysis.** The `breaking` tag is author-asserted via spec tags.
- **Mid-execution strategy switching.** The orchestrator commits to one strategy at Phase 1; cannot switch mid-execution.
- **Retroactive application to in-flight specs.** Specs already executing under the old behavior finish under the old rules.
- **Formal `completed → amendable` spec-schema transition.** This spec uses the extension pattern; formalization captured in intents.md.

## Design

### Strategy resolution algorithm (canonical source)

The orchestrator resolves the strategy at Phase 1 step 1 (right after verifying `status: active`). The pseudocode here is the design-time source. **Once `spec-execution/SKILL.md` is updated, the SKILL is canonical and any divergence is a contract violation.**

```python
def resolve_integration_strategy(spec):
    # 1. Explicit field wins.
    if spec.frontmatter.get("integration_strategy") in ("branch", "direct"):
        return spec.frontmatter["integration_strategy"], "explicit"

    # 2. Heuristic fallback.
    task_count = len(spec.tasks)
    workspaces = spec.frontmatter.get("workspaces") or []
    tags = spec.frontmatter.get("tags") or []
    cross_workspace_blocks = any_cross_workspace_blocks(spec.tasks)

    if ("breaking" in tags
        or len(workspaces) > 1
        or task_count >= 5
        or cross_workspace_blocks):
        return "branch", "heuristic"
    return "direct", "heuristic"

def any_cross_workspace_blocks(tasks):
    """True iff some task T has a non-empty blocks entry pointing at task U
    such that T.workspace != U.workspace AND both fields are non-empty.
    If either workspace is missing on T or U, that pair does NOT count."""
    by_id = {t.id: t for t in tasks}
    for t in tasks:
        if not t.workspace:
            continue
        for u_id in (t.blocks or []):
            u = by_id.get(u_id)
            if u and u.workspace and u.workspace != t.workspace:
                return True
    return False
```

**Why these signals:**
- `breaking` tag → explicit author signal that partial deploy would harm consumers.
- `len(workspaces) > 1` → multi-workspace spec needs coordinated landing.
- `task_count >= 5` → bookkeeping overhead of a feature branch amortizes when there are ≥5 PRs.
- `cross_workspace_blocks` → producer-consumer contract crosses workspaces; verify contract in one place before main.

### Strategy semantics

**`branch` mode (existing behavior, unchanged):**
- Phase 1: create `feat/spec-NNN` off main.
- Phase 2: each task PR targets `feat/spec-NNN`. Let `target_branch = "feat/" + spec.id`.
- Phase 3: open integration PR `feat/spec-NNN → main` after all tasks done. Then invoke `spec-completion` against the integration PR's diff. On integration PR merge, archive the execution log alongside the spec.

**`direct` mode (new):**
- Phase 1: no integration branch created. The resolved strategy + signals event is logged.
- Phase 2: each task PR targets `main` directly. Let `target_branch = "main"`. The variable name `target_branch` is the canonical identifier — the spec-execution Appendix B pseudocode uses it.
- Phase 3 (anchored to concrete events):
  - When the *last* task in the spec transitions to `status: done` (the orchestrator detects this on the merge of the last task PR), invoke `spec-completion` against the current `main` HEAD as the comparison baseline.
  - On `spec-completion`'s `accept` return (or owner sign-off in the spec-side flow), archive the execution log to `specs/tasks/SPEC-NNN/_execution.log.jsonl` (the file already lives there; "archive" here means "freeze further writes and emit a final `spec_completed` event"). No integration PR exists; no integration-PR-merge event to trigger off.

### Telemetry extension

Phase 1 emits a new event recording the resolved strategy. **This is added to the live `spec-execution/SKILL.md` telemetry schema list** (SPEC-002's telemetry schema in its spec body remains historical at 9 event types; the live skill list grows to 10 — per the "extend live artifacts, not completed specs" pattern):

```json
{"ts": "<iso8601>", "spec": "SPEC-NNN", "event": "integration_strategy_resolved", "strategy": "branch | direct", "source": "explicit | heuristic", "signals": {"breaking_tag": <bool>, "workspace_count": <int>, "task_count": <int>, "cross_workspace_blocks": <bool>}}
```

The worked example log fixture at `.ai/skills/spec-execution/examples/example-execution.log.jsonl` (created by TASK-010 and now live in main) gains this event at the start.

### `direct`-mode Phase 3 trigger detection

The orchestrator monitors task PRs in `direct` mode the same way it monitors them in `branch` mode (the task-status flip from `in-progress` to `done` is the same event in both modes). The only difference is the post-`done` trigger:

- `branch` mode: when all tasks reach `done`, open integration PR.
- `direct` mode: when all tasks reach `done`, invoke `spec-completion` directly (no PR to open).

This is documented in `spec-execution/SKILL.md` Phase 3 as two branches off the same trigger ("all tasks terminal").

### Pre-registered strategy for AC-009

To make the "matches owner's intent" success criterion measurable: before dispatching a spec under the updated orchestrator, the owner records the expected strategy in a temporary field `expected_integration_strategy: branch | direct` in the spec frontmatter. After Phase 1 resolves, AC-009 compares the resolved strategy to the pre-registered expectation. Match = pass. Mismatch = the owner either overrides (sets `integration_strategy:` explicitly) or accepts the heuristic's call. The temporary field is removed after the first dispatch — it's a measurement instrument, not a permanent schema addition.

### Changelog annotation on SPEC-002

SPEC-002 gains a `## Changelog` section per the convention introduced by SPEC-004:

```markdown
## Changelog

### v1 (2026-05-18) — initial
- Initial spec, completed 2026-05-18.

### v1.1 (2026-05-XX) — extensions via SPEC-005
- SPEC-005 added the following without modifying this spec's contracts:
  - Conditional integration-branch strategy in spec-execution: optional
    `integration_strategy: branch | direct` field with heuristic fallback.
  - `integration_strategy_resolved` event added to the live telemetry schema
    (10 event types in the skill; this spec's body documents 9).
- AC-010 of this spec (mandating `feat/spec-NNN` as ONLY merge pattern) is
  superseded in the live behavior by SPEC-005's conditional resolution.
  AC-010's wording in this spec body is preserved as historical record.
- See SPEC-005 for the rationale, heuristic, and full design.
```

## Acceptance criteria

- [ ] AC-001 — `spec-schema.md` declares `integration_strategy` as an optional frontmatter field with allowed values `branch` and `direct`. Validation accepts unset, `branch`, or `direct`; any other value fails validation.
- [ ] AC-002 — `.ai/skills/spec-execution/SKILL.md` Phase 1 includes a "resolve integration strategy" step that runs after `status: active` verification and before integration-branch creation. The step contains the `resolve_integration_strategy` and `any_cross_workspace_blocks` pseudocode from Design > Strategy resolution algorithm verbatim.
- [ ] AC-003 — When `integration_strategy` is set explicitly in the spec frontmatter, the orchestrator uses that value without invoking the heuristic. Verified by inspection of the `integration_strategy_resolved` telemetry event (`source: "explicit"`).
- [ ] AC-004 — When `integration_strategy` is unset, the orchestrator computes the strategy per the heuristic. Each of the four signals independently triggers `branch`; the absence of all four triggers `direct`. **Verification deliverable:** `.ai/skills/spec-execution/SKILL.md` Phase 1 worked-example section enumerates 5 cases (4 signals × 1 trigger each, plus the all-false → `direct` case) showing input spec shape and expected resolved strategy.
- [ ] AC-005 — `.ai/skills/spec-execution/SKILL.md` Phase 2 describes both flows. The per-task lifecycle pseudocode in Appendix B uses a `target_branch` variable resolved from the strategy: `target_branch = "feat/" + spec.id` in `branch` mode; `target_branch = "main"` in `direct` mode. The variable name `target_branch` is the canonical identifier.
- [ ] AC-006 — `.ai/skills/spec-execution/SKILL.md` Phase 3 describes both flows with explicit event anchors per Design > Strategy semantics > `direct` mode Phase 3. `branch` mode: integration PR opened after all tasks done, then spec-completion. `direct` mode: spec-completion invoked when the last task PR merges (the same all-tasks-terminal trigger), then log archive (freeze + final `spec_completed` event). No integration PR.
- [ ] AC-007 — `.ai/skills/spec-execution/SKILL.md` telemetry schema gains the `integration_strategy_resolved` event with the fields per Design > Telemetry extension. The live worked example log fixture (`.ai/skills/spec-execution/examples/example-execution.log.jsonl`) is updated to include this event at the start.
- [ ] AC-008 — SPEC-002 gains a `## Changelog` section per Design > Changelog annotation on SPEC-002. The annotation is a v1.1 entry; SPEC-002 frontmatter `status: completed` and `version: 1` are unchanged. The body of SPEC-002 (including AC-010's original wording) is unchanged.
- [ ] AC-009 — On the first spec executed under the updated orchestrator, the owner records `expected_integration_strategy: branch | direct` in the spec frontmatter before dispatch (a temporary field, removed after). After Phase 1 resolves, the resolved strategy from the `integration_strategy_resolved` event is compared to `expected_integration_strategy`. Pass: they match. Mismatch: documented as a heuristic-tuning signal (the owner either overrides explicitly or accepts the heuristic; either way the mismatch is recorded for the deferred-verifications follow-up).
- [ ] AC-010 — When the live `spec-execution/SKILL.md` is reverted to its pre-SPEC-005 state, specs that have `integration_strategy: direct` in their frontmatter and have already been dispatched into `direct` mode continue under the old behavior until their last task PR merges (the orchestrator does not abort in-flight specs); newly-dispatched specs with the field set will fail at Phase 1 (the reverted orchestrator doesn't recognize the field) — the recovery path is to simultaneously revert `spec-schema.md` to strip the field, treating future spec drafts as if the field were never introduced. This rollback behavior is documented in the Migration section.

## Risks & constraints

- **Heuristic miscalibration.** Four signals may misjudge edge cases. Mitigation: explicit field always wins; AC-009 measurement protocol catches misalignment on first use.
- **`breaking` tag is informal.** No enforcement that authors apply it correctly. Mitigation: convention only; rely on author discipline. Captured as a future intent for stricter detection.
- **`cross_workspace_blocks` requires reading all task files** — O(N_tasks × N_blocks). Fine for typical specs (≤30 tasks). The predicate is precisely defined in Design > Strategy resolution algorithm (only counts when both workspaces are non-empty and differ).
- **In-flight specs grandfather under old rule.** Specs that started under SPEC-002's branch-only behavior finish under that behavior even after this spec's live changes land. Mitigation: documented in Migration; consumers can see which behavior applied by reading the `integration_strategy_resolved` event (or its absence — pre-SPEC-005 dispatches have no such event).
- **`direct` mode loses the "all of spec lands together" guarantee** — but that's the whole point. Partial-merged specs are a real intermediate state in `direct` mode. Mitigation: heuristic catches the high-risk cases; explicit author control catches the rest. The owner pre-registration in AC-009 is the validation that the heuristic chose right on the first real use.
- **SPEC-002 is `status: completed`.** This spec extends its behavior without amending it — using the "extend live artifacts; annotate completed specs in Changelog" pattern introduced by SPEC-004. Mitigation: AC-008 enforces the unchanged status / version / body. The convention is also a deferred intent for future schema formalization.
- **Direct-mode rollback for in-flight specs is forward-only after first dispatch** (AC-010). Mitigation: documented explicitly.
- **`integration_strategy_resolved` event** is the only new telemetry event; SPEC-002's telemetry schema in its body remains at 9 events as a historical record (per the extension pattern); the live `spec-execution/SKILL.md` schema grows to 10 events.

## Migration

### Current state

- SPEC-002 AC-010 hard-requires integration-branch pattern (historical record).
- `.ai/skills/spec-execution/SKILL.md` implements only the `branch` flow.
- `spec-schema.md` has no `integration_strategy` field.
- SPEC-002 has no Changelog section.

### Target state

- `spec-schema.md` declares the optional field.
- `.ai/skills/spec-execution/SKILL.md` implements both flows behind the single resolution algorithm.
- Live telemetry schema (in the skill) records the resolved strategy on every execution.
- SPEC-002 has a Changelog v1.1 annotation pointing at SPEC-005.

### Migration strategy

1. Land the `spec-schema.md` extension (AC-001) — additive, no runtime impact.
2. Land the `.ai/skills/spec-execution/SKILL.md` extension (AC-002 through AC-007, AC-010) — the runtime change. Updates Phase 1, Phase 2 (pseudocode), Phase 3, telemetry schema list, and the worked example fixture.
3. Land the Changelog annotation on SPEC-002 (AC-008) — last, since it references the live changes that just landed.
4. Validate on the first spec executed under the updated orchestrator (AC-009).

### Rollback plan

- Each piece is independently revertable.
- The schema addition is additive (specs without the field still validate).
- Reverting `spec-execution/SKILL.md` restores `branch`-only behavior. **In-flight `direct` mode specs are not aborted** — the orchestrator continues them under the live state at dispatch time (per AC-010). The pre-SPEC-005 orchestrator binary, restored, will fail at Phase 1 for newly-dispatched specs with `integration_strategy: direct` — the recovery path is to also strip the field from `spec-schema.md` so future spec drafts don't include it.
- SPEC-002 Changelog annotation is revertable text deletion — no contract impact.
