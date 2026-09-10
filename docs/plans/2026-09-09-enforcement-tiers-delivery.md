# Enforcement tiers and review-loop convergence — delivery record

Branch `sdlc/enforcement-tiers-design`, 30+ commits, 54 files. Tests 107 → 174, all green. Every gate green. **Not merged; left open for review.**

Design: [`2026-09-09-enforcement-tiers-design.md`](2026-09-09-enforcement-tiers-design.md)
Plan: [`2026-09-09-enforcement-tiers-implementation.md`](2026-09-09-enforcement-tiers-implementation.md)

---

## What shipped

| Milestone | Delivered |
| --- | --- |
| M0 | Spec index reconciled with frontmatter; ADR-001/002 flipped `proposed` → `accepted` |
| M1 | **ADR-004** caps the integration gate at 3 rounds, survivors disclosed; state machine + generated text; 5 hand-written sites; `altitude` reconciled into `review-primitives.md`; panel folded by resolved agent; `DECISIONS.md` template + schema entry |
| M2 | Write-time constraint injection: `globToRe` + `applicableConstraints` + registry enrichment, wired into the `Edit`/`Write` hook, with a canary |
| M3 | `archive-specs.mjs` + `resolve.mjs` + `.ignore` fences, armed (SPEC-005 archived) |
| M4 | `check-stale-citations.mjs` and `archive-specs --check` corpus-wide in CI; `complete-spec.mjs`; merge-time grading workflow |

## Success criteria, mapped to evidence

| Criterion | Evidence |
| --- | --- |
| The gate terminates | ADR-004 + `sdlc-state-machine.yaml` exit condition; every doctrine site carries the cap; `gen-handoffs --check` green |
| A law reaches the author before the code is written | `pre-tool-use-edit-write.mjs` emits `additionalContext`; proven end-to-end against a real path in `edit-write-constraint-injection.test.mjs` |
| Injection cannot fail silently | Canary asserts the shipped registry matches a real path; verified to go red when a glob is broken |
| Expired documents leave the default search path | SPEC-005 archived; all four `rg` forms miss it; `resolve.mjs` and `--no-ignore` reach it. **Verified in a fresh consuming repo**, not just here |
| Archiving is reversible and lossless | `git mv` renames scored 0/0; `--check` detects both directions; history preserved |
| Gates grade the whole corpus, not the diff | Two CI steps with no `if:` scope |
| A shipped spec cannot be silently ungraded | `complete-spec.mjs` refuses on empty/missing criteria; merge-time workflow comments the verdict |

## Review record — ADR-004 dogfooded on its own branch

Four rounds, folded by resolved agent per the SOP change this branch makes.

| Round | Findings | Outcome |
| --- | --- | --- |
| 1 | 3 blockers, 2 majors, 4 nits | all closed |
| 2 | 1 blocker, 6 majors, 5 nits | all closed |
| 3 | 1 blocker, 5 majors, 1 nit | all closed |
| 4 | 5 majors, 4 nits (owner-requested, post-cap) | all closed |

**The cap held.** No *autonomous* round 4 was dispatched. Round 4 was requested by
the repo owner before pushing — which is precisely the decision ADR-004 hands to the
human rather than to the agent.

Round 4 found the deepest instance: **M3 and M4 were built and proven at their own
sites, and their propagation sites were never updated.** In a repo that copied the
framework, archiving was a plain `git mv` with no fence, the merge-time workflow was
never copied, and the framework's own spec ids pinned four numbers as permanently
unarchivable. Every one verified by building a consuming repo from scratch.

The three blockers were each a case of the doctrine not landing where it was read:
the cap was verified by grepping for a deleted *phrase* rather than for the
instruction it replaced, so six sites still said "loop until none survive"; ADR-004's
"exactly one row" claim was false because ADR-003 states the same rule twice; and the
`SPEC-001` changelog cited a spec id that does not exist.

Round 2's blocker was sharper: all four new CLIs regressed the `isMain()` realpath
guard **this repo had already fixed once and built `cli-invocation.test.mjs` to
hold.** Two are wired into CI, where a silent exit-0 reads as a passing gate.

## Disclosed, not fixed

Nothing is disclosed as unfixed. Two disclosures about *verification*, not defects:

1. **Rounds 3 and 4 were fixed after the agent's cap, so those fixes carry no
   independent panel verification.** ADR-004 caps rounds, not fixes; each was a
   one-clause edit and disclosing something that cheap would have been the cap's
   first bad application. The fixes are covered by the 171-test suite and every gate,
   but no reviewer graded them.

2. **The merge-time workflow is unproven by construction.** Nothing in a local
   session can execute a GitHub Actions workflow. Verification is static: property
   names (`pull_request.head.ref`, not `head_ref`), permissions, absence of a
   lockfile-dependent cache, and a dry-run of the id-derivation shell. It stays
   unproven until a spec actually merges.

## Known limits, stated plainly

- **Archiving moved one spec, not two.** The citation clause is a token scan over
  `.ai/skills/**`, so it also protects SPEC-004 and three ids that do not exist here.
  Over-protection is the safe direction for an operation ending in `git mv`.
- **The stale-citation gate is green because it has nothing to grade.** No ADR
  carries a `superseded_by`; ADR-003 is row-superseded, and no automated check can
  tell which row a citation relies on. Its FAIL branch is exercised by fixture.
- **Injection fires on a narrow set of paths here.** The hook exempts process
  artifacts before matching, and this repo is mostly process artifacts. The value is
  in consuming repos; the canary is what stops it rotting unnoticed.
- **A consuming repo inherits the framework's own skill citations.** The denylist now
  filters to ids the repo actually has, but a spec a consuming repo's OWN skills mention
  in passing is still protected. Safe direction for `git mv`.
- **`specs/spec-index.json` is referenced by four skills and does not exist.**
  Pre-existing, out of scope, worth its own fix.

## Ported back from the source project mid-flight

Six fixes landed downstream after this analysis began. Two applied and were folded
in: an empty `## Success criteria` section auto-completing a spec, and a companion
sub-document dragging its live parent's task tree behind the fence. Four could not
apply here — no `spec-index.json`, no prettier step, and CI globs directly rather
than diffing changed paths.

One correction back upstream: their audit recommends deleting
`specs/definition-of-ready.md` because "Zero skill references it." Three skills
reference it.
