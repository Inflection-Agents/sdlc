---
id: TASK-030
spec: SPEC-004
title: "Add Changelog v1.1 annotations to SPEC-001 and SPEC-002"
status: done
agent: jules
depends_on: [TASK-022, TASK-023, TASK-028]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given specs/SPEC-001-tiered-code-review.md, when read, then it has a `## Changelog` section appended (after Migration > Rollback plan, before any appendices). Frontmatter `status: completed`, `version: 1`, and the spec body above the Changelog are UNCHANGED. The v1.1 entry enumerates: (a) four new pr-reviewer prefixes (`task:evidence-missing`, `spec:gap`, `monorepo:workspace-scope`, `monorepo:verify-coverage`) and their scoping (pr-reviewer + Tier 2 specialists only); (b) new Tier 0 mechanical gate (evidence presence); (c) amendment to the 'New consequence rows...via spec-amendment' rule in review-primitives.md authorizing the extension pattern; (d) semantic narrowing of `monorepo:boundary` to import-graph violations only. (SPEC-004 AC-013)"
    status: pass
    evidence: |
      SPEC-001: Changelog section added after Rollback plan (line 327), before Appendix A.
      v1 (initial) + v1.1 (SPEC-004 extensions): 4 prefixes, Tier 0 gate, extension-pattern authorization, monorepo:boundary narrowing.
      git diff shows +13 lines, 0 deletions, only in Changelog area.
  - id: AC-002
    description: "Given specs/SPEC-002-spec-execution-orchestration.md, when read, then it has a `## Changelog` section appended. (If SPEC-005 also lands its v1.1 annotation, this task appends a v1.2 entry instead; otherwise v1.1.) The entry enumerates: (a) spec-execution Phase 2 cross-skill handler extension routing `spec:gap` to gap-capture (does NOT increment amendment counter); (b) per-spec gap rate-limit (max 5 open) and its `spec:wrong-design` escalation path via criterion-rewrite at handoff; (c) two new telemetry event types added to the live spec-execution schema: `gap_dispatched` and `gap_resolved`. Frontmatter and body above Changelog UNCHANGED. (SPEC-004 AC-013)"
    status: pass
    evidence: |
      SPEC-002: v1.2 entry appended to existing Changelog (v1 + v1.1 from SPEC-005 already present).
      v1.2 enumerates: spec:gap gap-capture handler, 5-gap rate-limit + spec:wrong-design rewrite, gap_dispatched/gap_resolved events (schema grows +2 types).
      git diff shows +7 lines, 0 deletions, only in Changelog area.
created: 2026-05-18
updated: 2026-05-19
---

## Context

Per SPEC-004 AC-013. The "completed specs are immutable; annotate via Changelog only" pattern in action. Each annotation documents what live behavior has been added since the spec completed without modifying the spec's contracts. Depends on TASK-022 (prefixes added), TASK-023 (GAP infrastructure), TASK-028 (spec-execution gap-capture handler + events).

## Requirements

1. **Edit `/Users/franklin/_code/sdlc/specs/SPEC-001-tiered-code-review.md`:**

   Append a `## Changelog` section after `## Migration` > `### Rollback plan` and before any appendices. Content:

```markdown
## Changelog

### v1 (2026-05-18) — initial
- Initial spec, completed 2026-05-18.

### v1.1 (YYYY-MM-DD) — extensions via SPEC-004
- SPEC-004 added the following without modifying this spec's contracts:
  - Four new citation prefixes in live `review-primitives.md`, scoped to pr-reviewer (Tier 1) and Tier 2 PR specialists (NOT spec-reviewer): `task:evidence-missing`, `spec:gap`, `monorepo:workspace-scope`, `monorepo:verify-coverage`.
  - New Tier 0 mechanical gate: every AC has a non-empty `evidence:` field (presence check only; content quality graded at Tier 1 via `task:evidence-missing`).
  - Amendment to the "New consequence rows are added via spec-amendment on SPEC-001" rule in `review-primitives.md`, now authorizing two paths: (a) spec-amendment while SPEC-001 is amendable, OR (b) a subsequent spec that extends the live artifact and adds a Changelog v1.1 annotation (the extension pattern; this entry is the originating use).
  - Semantic narrowing of `monorepo:boundary` to import-graph violations only (per `.ai/project.md` workspace dependency rules). The new `monorepo:workspace-scope` and `monorepo:verify-coverage` prefixes carve out the file-touch and test-failure cases respectively.
- See SPEC-004 for the full design and rationale.
```

2. **Edit `/Users/franklin/_code/sdlc/specs/SPEC-002-spec-execution-orchestration.md`:**

   Check if a Changelog section already exists from SPEC-005 TASK-020 (a v1.1 annotation). 
   
   **If SPEC-005 has not yet landed** (no Changelog section yet): append a fresh Changelog section with v1 + v1.1 entries (v1.1 covers SPEC-004's contributions only).
   
   **If SPEC-005 already landed** (Changelog section exists with v1 and v1.1 from SPEC-005): append a new `### v1.2 (YYYY-MM-DD) — extensions via SPEC-004` entry after the v1.1 entry.
   
   Either way, the SPEC-004 entry content:

```markdown
- SPEC-004 added the following without modifying this spec's contracts:
  - `spec-execution/SKILL.md` Phase 2 cross-skill handler extension: `criterion == "spec:gap"` blocker findings route to a new gap-capture handler (creates GAP-NNN-*.md from `templates/gap.md`, does NOT increment the per-spec amendment counter).
  - Per-spec gap rate-limit: max 5 open gaps per spec at any time. When the limit is exceeded, the orchestrator REWRITES the finding's criterion from `spec:gap` to `spec:wrong-design` at handoff time and falls through to the amendment-counter path — no new prefix introduced.
  - Two new telemetry event types added to the live `spec-execution/SKILL.md` schema: `gap_dispatched` (at gap-capture handoff, with open_count) and `gap_resolved` (at GAP file status flip). The live schema grows by 2 event types.
- See SPEC-004 for the full design.
```

3. **Replace `YYYY-MM-DD`** with the actual date when this task lands (`date -u +%Y-%m-%d`).

4. **Do NOT modify anything else.** Frontmatter `status: completed`, `version: 1`, `completed: 2026-05-18` stay exactly as they are on both files. The bodies (above the Changelog) are byte-identical to their pre-SPEC-004 state.

## Constraints

- Append-only edits on both spec bodies. Frontmatter is read-only.
- The Changelog content matches SPEC-004 Design > 5 verbatim (with date placeholders resolved).
- Per the spec-schema convention extended by SPEC-004's authorization clause (TASK-022), `## Changelog` is an allowed appended section on completed specs.
- Check SPEC-002's current state for an existing Changelog (from SPEC-005 TASK-020) and append v1.2 if so; otherwise create the section with v1.1.

## Verification

- `git diff specs/SPEC-001-tiered-code-review.md` shows ONLY additions in the Changelog area, no other lines modified.
- `git diff specs/SPEC-002-spec-execution-orchestration.md` shows ONLY additions in the Changelog area (either a new section with v1 + v1.1, or a v1.2 entry appended to an existing section).
- Both frontmatters have `status: completed` and `version: 1` unchanged.
- The Changelog content on each spec enumerates the bullets listed in AC-001/AC-002 above.
