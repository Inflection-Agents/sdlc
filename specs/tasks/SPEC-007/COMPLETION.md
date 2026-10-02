## Completion report: SPEC-007 v1

SPEC-007 stays `active`, in monitoring, until its behavioral guardrail has a first real measurement. Four of six success criteria are verified. SC-2 and SC-3 are measurements that need specs reviewed under the new loop, and none has run yet.

### Step summary
- Total: 8 | Done: 8 | Cancelled or deferred: 0
- Integration PR #86 merged to `main` as `6a1604e` after 3 panel rounds (ADR-004), with three majors disclosed in its body under "Disclosed, not fixed".

### Success criteria

| # | Criterion | Type | Evidence | Status |
|---|-----------|------|----------|--------|
| SC-1 | The spec-side loop ends at a bounded round count, and survivors are disclosed | Step-covered | `SPEC_REVIEW_ROUND_CAP = 4` and `disclose_and_accept` in `review-primitives.md` (S1, #78). The #86 dry review routes a round-4 blocker to `disclose_and_accept`. | verified |
| SC-2 | First-appearance findings per reviewer do not increase from round to round | Measurement | `specs/review-logs/SPEC-NNN.json` records `first_round` and each round's reviewers (S5). No spec has been reviewed under the new loop yet. | deferred |
| SC-3 | Zero round-1 findings fall in the validator's categories | Measurement | Step 10a gates dispatch on `validate-spec` (S3), and the review log is what gets counted. No measured review exists yet. | deferred |
| SC-4 | An owner ruling holds across rounds, by stable id | Integration | Content-addressed ids (S4). `review-log apply` routing (S5, #88, #89). In the #86 dry review, a verbatim repeat keeps `F-8fc5508f` and routes at the owner's `nit`. | verified |
| SC-5 | Every reviewer input resolves or is marked optional | Step-covered | S8 (#85) audited the Step 10a input list. `AGENTS.md` is marked optional, and every other named path resolves. | verified |
| SC-6 | Every spec review leaves a durable trace | Integration | `review-log append` is required each round (Step 10a), and the dry review wrote a log. A missing log is not detected mechanically, as #86 discloses. | verified |

### Deferred verifications

| Criterion | Owner | Trigger | Method |
|-----------|-------|---------|--------|
| SC-2 | franklin | at the `spec-completion` of each spec reviewed under the new loop, until two multi-round reviews exist | first-appearance findings (`first_round == r`) divided by reviewers dispatched in round r, from `specs/review-logs/SPEC-NNN.json` |
| SC-3 | franklin | the same window as SC-2 | count round-1 findings in each window spec's review log whose `criterion` names a check `validate-spec` performs; the target is 0 |
| behavioral-guardrail | franklin | baseline: the first spec run end to end under the new loop; then the two specs delivered after it | metric: `spec:*` findings in the spec's integration-gate envelopes plus `GAP-NNN` files filed during its delivery. Threshold: either window spec above the baseline. Rollback: revert the `round` input and the `disclose_and_accept` branch in `review-primitives.md` > Orchestrator severity→action policy. The trigger is owner-evaluated, a deviation the spec declares in Risks & constraints. |

### Verdict: Blocked (monitoring)

Two things stand between this spec and `completed`:
1. **First exposure.** Step 5a requires a realized measurement of the guardrail on the first real exposure. That exposure is the next spec authored and delivered under this loop. Its review log and integration-gate envelopes supply the baseline.
2. **The trigger substitution.** The spec's Risks & constraints says that closing SPEC-007 requires the owner to record, explicitly, that owner evaluation at `spec-completion` stands in for an automatic trigger.

Re-run `close out SPEC-007` after the baseline spec completes.
