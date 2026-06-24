# Completion report: SPEC-006 v1

**Spec:** Enforced plan-review gate and registry-driven reviewer routing
**Initiative:** INI-001 (sdlc-throughput) · **Closed:** 2026-06-23 · **Owner:** franklin

## Task summary
- Total tasks: 7 · Completed: 7 · Cancelled: 0
- TASK-205 (SPEC-001 prefix-table amendment), TASK-206 (plan_review schema+stamping), TASK-207 (`agent:` registry field), TASK-208 (engine: routing + fail-closed gate + tests), TASK-209 (naming/`review`→`code-review`), TASK-210 (prefix alignment + parity test), TASK-211 (back-fill).
- Delivered via integration PR #39 (merged to main); code review converged after one fix round (1 major: pr-reviewer grounding drift, fixed + guarded).

## Success criteria

| # | Criterion | Type | Evidence | Status |
|---|-----------|------|----------|--------|
| 1 | `execute-spec` cannot build a spec whose plan was not reviewed + owner-approved; structural, fail-closed | Integration | `planApproved(plan.plan_review)` HALT placed before `buildWaves`/executor dispatch in `execute-spec.js`; `scripts/sdlc/plan-gate.test.mjs` (5/5: absent/false/needs-rework→false, approved→true) | verified |
| 2 | Adding/re-routing a specialized reviewer is a one-line `review-constraints.yaml` edit, no engine change | Task + Integration | `agentForLens(constraints, lens)` resolves from the registry; `SPECIAL_REVIEWER`/`lensToAgent` removed (0 occurrences); `reviewer-routing.test.mjs` asserts add-`agent:`-reroutes with no engine change | verified |
| 3 | A reader of `skill-architecture.md` can name the three review moments, when each fires, and the owning skill | Manual + Task | "The three review moments" diagram + table (plan review / code review / integration review) in `skill-architecture.md` | verified |
| 4 | Grounding-prefix vocabulary defined once; PR-side sites agree; no prefix a skill instructs is rejected by the engine | Integration | `review-primitives.md` canonical PR-side table (SPEC-001 v1.2); `prefix-parity.test.mjs` asserts primitives ≡ `ALLOWED_PREFIX` ≡ schema `criterion`, plus a guard that `pr-reviewer` grounding cites the colon-form set with no legacy bare forms | verified |
| 5 | The engine's existing specs continue runnable (fail-closed gate not retroactive) | Task | `plan_review` blocks back-filled into SPEC-001..005 `_index.yaml` (approve-ready/approved) | verified |

## Acceptance criteria
All 16 ACs (groups A, B, B-clarity, prefix reconciliation, ADRs) implemented and confirmed during execution and the 3-lens code-review panel. ADR-001 (routing-as-data) and ADR-002 (gate-in-`_index.yaml`) authored with the spec.

## Integration evidence (on `main`)
```
node --check .claude/workflows/execute-spec.js            → OK
node --test scripts/sdlc/*.test.mjs                       → 11 pass / 0 fail
validate-state-machine.mjs · gen-handoffs.mjs --check     → OK
```

## Deferred / follow-ups (do NOT block completion)
- **`[deferred]`** Deterministic `review-spec.js` convergence loop (increment C) — separate intent in `specs/intents.md`.
- **`[backlog]`** SPEC-006 code-review test-hardening nits (real-registry routing check, coercion strictness, grouping coverage) — `specs/intents.md`.
- **Prerequisite done:** SPEC-001 amended to v1.2 (completed-spec extension pattern) for the canonical PR-side prefix table.

## Verdict: Ready to complete — 5/5 success criteria verified, 0 deferred.
