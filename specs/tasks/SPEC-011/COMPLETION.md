## Completion report: SPEC-011 v2

Owner sign-off: franklin, 2026-10-06 ("yes"). Integration PR #99 merged to `main` as `0a6f91f`. Checks below ran on `main` at that commit.

### Step summary
- Total: 6 | Done: 6 | Cancelled or deferred: 0
- Owner decisions: none.

### Success criteria

| # | Criterion | Type | Evidence | Status |
|---|-----------|------|----------|--------|
| SC-1 | `docs/worktrees.md` holds the rules, and six places link to it without restating them | Step-covered (S1, S6) | `grep -c docs/worktrees.md` finds it in all six: `CLAUDE.md` 2, `agent-orchestration.md` 2, `SKILL.md` 2, `SOP.md` 1, `executor-brief.md` 1, `state-machine.yaml` 1. The round-3 integration reviewer found no restated table or removal duty. | verified |
| SC-2 | A delivery run leaves no worktrees behind unless it says why | Measurement | The SPEC-011 run started in the main checkout, before these rules, so it is not the measured run. It ended with 1 worktree, the main checkout. | deferred |
| SC-3 | `worktrees.mjs` reports every stray with its reason, and the first prompt shows them | Integration | 72 of 72 worktree, hook and path tests pass. Live: this repo 0 strays; high-gear-apps 2 `agent` strays. | verified |
| SC-4 | Work inside a spec worktree acts on that worktree | Integration | `resolveRoot`, both walkers, the edit gate, the goal file and phase memory each have tests. Full suite 485 of 485. | verified |

### Deferred verifications

| Criterion | Owner | Trigger | Method |
|-----------|-------|---------|--------|
| SC-2 | franklin | `spec-completion` of the next delivery run under SOP §1 | after §7.4 or §8, `git worktree list --porcelain` has no `spec-NNN` or run-spawned agent entry unless the exit report names it as kept (`specs/intents.md` > `[deferred-verify]` SPEC-011 SC-2) |

Step 5a does not apply: SPEC-011 changes developer tooling, not a production behavioral metric.

### Disclosed, not fixed
Three majors from integration-gate round 3, captured as the `[next]` intent "SPEC-011 gate survivors" in `specs/intents.md`.

### Amendment
v2 brings Design > Delivery in a spec worktree and Design > Detection in line with what shipped (see the spec's Changelog). No AC changed.

### Verdict: Ready to complete
