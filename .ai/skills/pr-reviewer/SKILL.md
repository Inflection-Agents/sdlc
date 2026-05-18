---
name: pr-reviewer
description: Use when reviewing a PR against its task file, spec, and ADRs — emits graded JSON findings (blocker/major/nit/suggestion) per SPEC-001 contract. Machine-parseable output for spec-execution orchestrator.
---

# pr-reviewer

This skill is the PR-side machine-parseable reviewer defined by SPEC-001. It grades a single PR against its task file, its parent spec, and the applicable ADRs, and emits the shared JSON envelope from `review-primitives.md`. The human-readable rendering of these findings — the actual review comment posted to the PR — lives in `sdlc-code-review` (updated by TASK-005). This skill emits structured findings; `sdlc-code-review` renders them.

## Prompt

```
You are reviewing a single PR against its task file, its parent spec, and the
applicable ADRs. Your output is machine-parseable JSON per the shared envelope
in review-primitives.md. You will not emit freehand prose outside the JSON
envelope.

INPUTS:
  - task_file: path to specs/tasks/SPEC-NNN/TASK-NNN-*.md
  - spec_file: path to specs/SPEC-NNN-*.md
  - pr_diff:   unified diff of the PR
  - previous_output: (optional, may be null on first iteration)

GROUNDING (per review-primitives.md):
  - Allowed citation prefixes: AC-NNN; ADR-NNN; sdlc-code-standards:<section-anchor>;
    monorepo:boundary; task:blocks:<id>; task:scope; spec:ambiguous-ac;
    spec:contradictory-ac; spec:wrong-design; spec:missing-section.
  - If you cannot ground a finding, do not raise it.

SEVERITY: apply the PR-side consequence catalog from review-primitives.md.

CARRY-FORWARD: if previous_output is non-null, carry forward any finding with
severity nit or suggestion whose `location` file does NOT appear in pr_diff.

CROSS-SKILL SIGNALS (raise these as blocker findings to trigger orchestration
hand-offs, per SPEC-002 Phase 2 cross-skill signals):
  - criterion = "task:scope" — PR scope reveals task decomposed wrong.
  - criterion = "spec:ambiguous-ac" / "spec:contradictory-ac" /
    "spec:wrong-design" / "spec:missing-section" — implementation reveals
    spec is wrong.

OUTPUT: the shared JSON envelope with `artifact: "pr"`, `tier: 1`, populated
`verification`, and `tier_2_dispatch_recommended` per Appendix B rules.

DECISION: you do not emit a decision. You grade. The orchestrator routes.
```

## Tier 2 PR dispatch rules

This table is the source of truth for Tier 2 dispatch. SPEC-002 consumes verbatim; consumers do not modify it. Future changes go through `spec-amendment` on SPEC-001.

```
| Specialist          | Triggers dispatch when …                                                     |
|---------------------|------------------------------------------------------------------------------|
| cross_spec          | Diff touches `packages/**` or `shared/**`                                    |
| cross_spec          | Task file declares any `blocks:` entry (regardless of file globs)            |
| adversarial         | Tier 1 returned 0 blockers AND pr_diff size > 150 lines added                |
| domain:dbt          | Diff touches `dbt/models/**` or `dbt/macros/**`                              |
| domain:nextjs       | Diff touches `apps/*/components/**` or `apps/*/app/**`                       |
| domain:playwright   | Task file declares `figma_frame:` OR diff touches `apps/*/app/**` page files |
```

Domain reviewers consume the domain skill listed in `.ai/project.md` for the workspace. If no domain skill exists, the specialist is not dispatched.

## Dispatch ownership

The reviewer evaluates the Tier 2 dispatch rules against the task file's `blocks:` field and the PR diff, populating `tier_2_dispatch_recommended` in its output. The orchestrator trusts this list and does NOT re-evaluate file globs.

## Shared primitives

See [`../review-primitives.md`](../review-primitives.md) for the authoritative definitions of:

- **Severity ladder** — the `blocker | major | nit | suggestion` spine and the PR-side consequence catalog this reviewer grades against.
- **Output schema** — the JSON envelope this skill emits, including per-field constraints for `artifact: "pr"` outputs.
- **Carry-forward contract** — the precise PR-side definition of "unaffected by the revision" (file does not appear in the new diff) and the `carried_forward_from_previous` semantics.

This skill does not redefine those contracts; drift between this file and `review-primitives.md` is a SPEC-001 contract violation.
