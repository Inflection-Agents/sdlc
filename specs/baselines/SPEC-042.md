# SPEC-042 baseline

Captured: 2026-05-18
the reference implementation snapshot: `601b605532ea1dcdb1cb97d57fae0b6f8210c917`
upstream sdlc snapshot: `6c1c0d786eae9f384db0dd67d0656b8991267f7f`

## Context

SPEC-042 in the reference implementation (pipeline consolidation v3) executed 20 merged task PRs across the dates 2026-05-17 to 2026-05-18 under the legacy 4-reviewer always-on fan-out orchestrator. These metrics establish the baseline against which SPEC-001's success criteria (AC-011 / sixth Success-criteria bullet) are measured on subsequent specs.

SPEC-042's decomposition declared 22 tasks across 11 waves (TASK-414 through TASK-435). At the time of this snapshot, 20 task PRs had merged (TASK-414, -415, -416, -417, -418, -419, -420, -421, -422, -423, -424, -425, -426, -427, -428, -429, -430, -431, -432, -433). TASK-434/435/436 were not yet merged through the SPEC-042-titled PR set as of the snapshot — TASK-435's work appears in commit `601b6055` on `main` but was not the subject of this PR-level analysis.

Hot-fix amendments were tracked outside the task-PR set as either dedicated `fix/spec-042-*` PRs (PR #738, PR #749) or as embedded GAP fixes folded into the task commit itself.

## Metrics

| Metric | Value | Methodology |
|---|---|---|
| Mean fix-loop iterations per PR | 0.45 (strict) / 0.60 (loose) | See "Methodology details" below; reported as a range because the heuristic boundary is fuzzy |
| Hot-fix amendment commits | 2 dedicated + 4 embedded (6 total related to SPEC-042) | `git log --grep="SPEC-042: hot-fix" --grep="GAP-"` filtered for SPEC-042 commits with actual gap fixes; see false-positive list below |
| Total task PRs | 20 | `gh pr list --search "SPEC-042 in:title" --state merged` filtered to titles containing `TASK-4NN` |
| Date range | 2026-05-17 to 2026-05-18 | first task-PR merge (PR #737, 2026-05-17T16:28Z) to last (PR #758, 2026-05-18T22:31Z) |

## Methodology details

### Metric 1: Mean fix-loop iterations per PR

**Repo:** `<consumer-repo-path>` at commit `601b605532ea1dcdb1cb97d57fae0b6f8210c917`.

**Data source:** PR commit counts via `gh pr view <N> --json commits`, run for each task PR.

**Command:**

```bash
# Step 1: enumerate task PRs
gh pr list --search "SPEC-042 in:title" --state merged --limit 100 \
  --json number,title,headRefName,mergedAt

# Step 2: per-PR commit headlines
for pr in 737 739 740 741 742 743 744 745 746 747 748 750 751 752 753 754 755 756 757 758; do
  gh pr view $pr --json commits | jq -r '.commits[] | .messageHeadline'
done
```

**Why no `_execution.log.jsonl`:** That telemetry format is specified by SPEC-002 (orchestration) which has not landed in the reference implementation. SPEC-042 predates the format, so commit history is the only available signal.

**Heuristics:** Two independent counts were taken and reported as a range.

- **Strict heuristic (0.45):** Count commits whose subject contains the token "fix" (matching `fix R1`, `fix R4`, `fix review`, `fix R4 HIGH`, etc.). 9 such commits across 20 PRs → 9/20 = 0.45.
- **Loose heuristic (0.60):** Count `total_commits - 1` per PR (treating every commit after the first as a fix-loop iteration), with the explicit correction for PR #747 (see Edge cases). 12 such commits across 20 PRs → 12/20 = 0.60.

**Per-PR breakdown:**

| PR | Task | Commits | "fix" markers | strict | loose |
|---|---|---|---|---|---|
| 737 | TASK-414 | 3 | 1 ("fix review (R1+R4)") | 1 | 2 |
| 739 | TASK-415 | 1 | 0 | 0 | 0 |
| 740 | TASK-428 | 2 | 1 ("fix R4 finding #1") | 1 | 1 |
| 741 | TASK-426 | 1 | 0 | 0 | 0 |
| 742 | TASK-416 | 1 | 0 | 0 | 0 |
| 743 | TASK-420 | 2 | 1 ("fix R4") | 1 | 1 |
| 744 | TASK-432 | 1 | 0 | 0 | 0 |
| 745 | TASK-425 | 2 | 1 ("fix R1+R2+R4") | 1 | 1 |
| 746 | TASK-417 | 1 | 0 | 0 | 0 |
| 747 | TASK-418 | 5 | 0 | 0 | 0 (see Edge cases) |
| 748 | TASK-419 | 1 | 0 | 0 | 0 |
| 750 | TASK-429 | 1 | 0 | 0 | 0 |
| 751 | TASK-423 | 3 | 1 ("fix R4 CRITICAL") | 1 | 2 |
| 752 | TASK-421 | 2 | 1 ("fix R4") | 1 | 1 |
| 753 | TASK-433 | 3 | 1 ("fix R4 HIGH") | 1 | 2 |
| 754 | TASK-422 | 1 | 0 | 0 | 0 |
| 755 | TASK-430 | 1 | 0 | 0 | 0 |
| 756 | TASK-424 | 2 | 1 ("fix R4 F1+F2+F3") | 1 | 1 |
| 757 | TASK-431 | 3 | 1 ("fix R4") | 1 | 2 |
| 758 | TASK-427 | 1 | 0 | 0 | 0 |
| **Total** | | **37** | **9** | **9** | **12** |

**Edge cases:**

- **PR #747 (TASK-418) has 5 commits, but 4 are SPEC-042 bookkeeping commits that were unrelated to the task itself** (bookkeeping for previously-merged TASK-417, TASK-416, TASK-420, TASK-428, TASK-426, TASK-432, TASK-425). They were accidentally folded onto the branch before the actual `TASK-418` commit. Counting these as fix iterations would distort the metric upward; they were excluded from the loose count.
- **PRs #757 and #753 each include a "regenerate" commit** (regenerating dbt usedBy YAML refs / per-metric lineage). These are not strictly review fixes but are post-initial-commit iterations the reviewer would have required. The loose heuristic counts them; the strict heuristic does not.
- **PR #751 includes a "file GAP-013" commit** which is a bookkeeping/spec-amendment action, not a code fix. The strict heuristic excludes it; the loose heuristic counts it.

**Best estimate: 0.45 - 0.60 fix iterations per PR.** Use 0.55 as a single midpoint if forced; pair the metric with the range for honest comparison. The strict heuristic likely undercounts (silent fixes without "fix" in the subject); the loose heuristic likely overcounts (non-fix iterations like regenerations and bookkeeping). The truth sits between.

### Metric 2: Hot-fix amendment commits

**Repo:** `<consumer-repo-path>` at commit `601b605532ea1dcdb1cb97d57fae0b6f8210c917`.

**Command:**

```bash
git log --grep="SPEC-042: hot-fix" --grep="GAP-" --oneline
```

**Raw match count:** 16 commits.

**Classification:**

**True dedicated hot-fix amendment commits (matching `SPEC-042: hot-fix`):** 2
- `b440e5ab` SPEC-042: hot-fix GAP-011 — inventory-aging-chart uses _pct distribution keys
- `6a0056c2` SPEC-042: hot-fix GAP-008 — avg_vehicle_age_years_financed _weighted_ column rename

**Embedded GAP-fix amendments folded into task commits (SPEC-042 task commits that include a same-spec GAP fix):** 4
- `0b708a64` TASK-431 + GAP-016/017
- `612c0d37` TASK-424 + GAP-015 (also includes review R4 fix)
- `d0142bbd` TASK-423 + GAP-012 fix + GAP-013 filed
- `601b6055` TASK-435 — references GAP-007 baseline in body
- `d102976e` TASK-427 — references GAP-007 baseline in body (false positive: refers to a SPEC-021 follow-on, not a fix landed in this commit)

After dropping the SPEC-021 reference (`d102976e` body mentions GAP-007 in context, no fix landed) the count is 4 embedded.

**Total amendment-style fixes attributable to SPEC-042:** **6** (2 dedicated + 4 embedded).

**False positives in the raw grep result (10 of 16):**

| Commit | Subject | Why false positive |
|---|---|---|
| 8930497c | SPEC-042: bookkeeping — Wave 4 done | bookkeeping note, no fix |
| 865f5051 | SPEC-042: bookkeeping — TASK-418/419 done; GAP-011 hot-fix landed | bookkeeping note about an already-counted hot-fix |
| d5785fd1 | SPEC-042: bookkeeping — TASK-414 done; ... GAP-009 | bookkeeping note about a deferred gap |
| ce47dd88 | SPEC-042: TASK-422 | task commit; GAP- match is in body discussing unrelated context |
| 45317bc0 | SPEC-042: TASK-433 | task commit; GAP- match is in body |
| 1bf59fd9 | SPEC-042: TASK-418 | task commit; GAP- match in body |
| 7d2dee26 | SPEC-042: TASK-414 | task commit; GAP- match in body |
| d102976e | SPEC-042: TASK-427 | body references GAP-007 baseline, no fix landed in this commit |
| 3c5582a0 | SPEC-033: PR-A | unrelated spec; body says "No GAP-NNN: no new spec gap discovered" |
| 1afa3f58 | TASK-237 / SPEC-021 | unrelated spec |

## Notes

- **Reporting unit ambiguity:** "Hot-fix amendment commits per spec" can mean either the strict pattern (`SPEC-042: hot-fix`) → **2**, or the broader notion (any commit that fixed a discovered GAP-NNN for this spec, whether dedicated or folded) → **6**. The downstream comparison in SPEC-001 should pick a consistent definition. Recommend using the broader **6** for like-for-like comparisons since future specs may bundle GAP fixes into task PRs rather than break them out.
- **Sample size is small (n=20 PRs):** The mean fix-loop number is sensitive to a few outliers. PR #747's bookkeeping anomaly alone moved the loose mean by 0.20.
- **SPEC-042 was still in flight at the time of capture.** TASK-434, TASK-435 (visible on main as commit `601b6055`), and TASK-436 had not yet merged through SPEC-042-titled PRs. A later re-capture once SPEC-042 fully closes would give a more complete picture; record any delta in a follow-up entry rather than mutating this snapshot.
- **Heuristic limitation:** The "fix" keyword heuristic misses any silent fix-up commits (commits whose subject does not include "fix"). The reference implementation's commit conventions for SPEC-042 are reasonably disciplined — the `fix R<reviewer-id>` pattern is the dominant marker — so the strict count is plausibly close to ground truth, but it is not provable without manual classification of all 37 commits or telemetry that did not exist.
- **No SPEC-002 telemetry available** (`_execution.log.jsonl`). SPEC-002 was not deployed at the time SPEC-042 ran. Future spec baselines (post-SPEC-002 landing) should prefer the telemetry-based `fix_loop_iteration` count over this commit-history heuristic for precision.
