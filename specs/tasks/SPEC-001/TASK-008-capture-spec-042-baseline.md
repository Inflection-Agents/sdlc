---
id: TASK-008
spec: SPEC-001
title: "Capture SPEC-042 baseline metrics into specs/baselines/SPEC-042.md"
status: pending
agent: human
depends_on: [TASK-001]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given specs/baselines/SPEC-042.md exists in the upstream sdlc repo, when read, then it captures the mean fix-loop iterations per PR for SPEC-042's tasks (computed from high-gear's spec-execution log or commit history)"
    status: pending
  - id: AC-002
    description: "Given the file, when read, then it captures the total count of hot-fix amendment commits per spec for SPEC-042 (commits matching pattern 'SPEC-042: hot-fix' or 'GAP-NNN' in high-gear's git history)"
    status: pending
  - id: AC-003
    description: "Given the file, when read, then it captures the date range of the SPEC-042 execution and the total task count for context"
    status: pending
  - id: AC-004
    description: "Given the file, when read, then the methodology used to compute each metric is documented (which command was run against which repo, how edge cases were handled) so the measurement can be reproduced"
    status: pending
  - id: AC-005
    description: "Given the file, when read, then it explicitly notes the high-gear repo path/commit SHA at the time of capture (frozen snapshot, not a live reference)"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-001 AC-011 and Success criterion (sixth bullet), the success of SPEC-001 is measured by whether two metrics improve vs. SPEC-042's baseline on subsequent specs. Without capturing the baseline now, the comparison is unverifiable later — git history erodes, conventions drift, the "what was SPEC-042 like?" question becomes harder to answer over time. This task is routed to `human` because: (a) it requires cross-repo access (upstream sdlc + high-gear) that the orchestrator doesn't have in standard dispatch; (b) edge cases in commit-history analysis require judgment that's not worth automating for a one-shot measurement.

## Requirements

Capture two baseline metrics from high-gear's SPEC-042 execution and write them to `/Users/franklin/_code/sdlc/specs/baselines/SPEC-042.md`.

### Metric 1: Mean fix-loop iterations per PR

For SPEC-042's executed tasks in high-gear:

1. List all task PRs that merged under SPEC-042 (use `gh pr list --search "SPEC-042" --state merged --limit 100`).
2. For each PR, count the number of pushed commits that look like fix iterations (commits after the first non-trivial commit). Heuristic: commits whose message starts with "fix:", "review fix:", "address review:", or similar; OR count the difference between total commits and 1 if no clear marker exists.
3. Compute the mean. Document edge cases (PRs with no fixes count as 0; PRs squashed before merge count by best-available estimate).

If high-gear's `_execution.log.jsonl` exists (per SPEC-002's telemetry — unlikely for SPEC-042 since SPEC-002 isn't deployed yet), use `fix_loop_iteration` event counts instead — that's the precise measure.

### Metric 2: Hot-fix amendment commits per spec

For SPEC-042:

1. Run `git log --grep="SPEC-042: hot-fix" --grep="GAP-" --oneline` in the high-gear repo (note the `--all-match` is NOT used — either pattern qualifies).
2. Count the matching commits. Document any commits that pattern-matched but were not actually hot-fixes (false positives).

### Output format

Write `/Users/franklin/_code/sdlc/specs/baselines/SPEC-042.md`:

```markdown
# SPEC-042 baseline

Captured: 2026-MM-DD
high-gear snapshot: <commit SHA at time of capture>
upstream sdlc snapshot: <commit SHA at time of capture>

## Context

SPEC-042 in high-gear executed N tasks across the dates YYYY-MM-DD to YYYY-MM-DD under the legacy 4-reviewer always-on fan-out orchestrator. These metrics establish the baseline against which SPEC-001's success criteria are measured.

## Metrics

| Metric | Value | Methodology |
|---|---|---|
| Mean fix-loop iterations per PR | X.X | [describe how computed] |
| Hot-fix amendment commits | N | [describe how computed] |
| Total task PRs | N | gh pr list output |
| Date range | YYYY-MM-DD to YYYY-MM-DD | first and last task PR merge dates |

## Methodology details

[For each metric: exact command run, repo path, commit SHA, how edge cases were handled.]

## Notes

[Any caveats, false positives, or interpretive judgments made during capture.]
```

## Constraints

- This task DEPENDS on TASK-001 (the spec-schema amendment that declares `specs/baselines/` as a valid subdirectory). Do not create the file until TASK-001 is merged.
- The baseline is a FROZEN snapshot. Record the high-gear commit SHA at capture time so the measurement is reproducible.
- If a metric is genuinely uncomputable from the available data (e.g., no telemetry exists and PR commits don't distinguish fix iterations cleanly), record "Best estimate: X.X ± Y" and document the uncertainty in the Notes section. Do not invent precision.
- Do not modify high-gear's repo; this is read-only analysis.

## Verification

- Confirm the file exists at `/Users/franklin/_code/sdlc/specs/baselines/SPEC-042.md`.
- Confirm both metric values are populated (not "TBD").
- Confirm methodology is documented for each metric.
- Confirm high-gear commit SHA is recorded.
- Confirm the file validates against the amended spec-schema (i.e., `specs/baselines/` is now a declared subdirectory).
