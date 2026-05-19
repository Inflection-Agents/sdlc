---
id: TASK-016
spec: SPEC-003
title: "Refresh .ai/setup.md — directory structure + daily workflow graded-review note"
status: pending
agent: jules
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/setup.md §7 directory structure, when read, then it includes specs/baselines/, intents.md, initiatives.md, _index.md, SPEC-NNN-*.md, tasks/ (SPEC-003 AC-011)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given .ai/setup.md §8 daily workflow, when read, then it has a one-line note about the graded review model (spec review and PR review use severity-driven outputs per SPEC-001) (SPEC-003 AC-011)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-011. `.ai/setup.md` was mostly updated by PR #1 sync but its directory structure section is incomplete (missing the dogfooded specs/ contents) and doesn't mention the new graded review model.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/setup.md`:

1. **§7 Directory structure:** extend the `specs/` block to include:
   - `baselines/` (per-spec baseline metric files; new in SPEC-001)
   - `intents.md` (raw backlog)
   - `initiatives.md` (initiative registry)
   - `_index.md` (spec listing)
   - `SPEC-NNN-*.md` (the actual spec files)
   - `tasks/` (per-spec task decomposition; already shown in the existing structure but make explicit)

2. **§8 Daily workflow:** add ONE line at the end of step 5 or as a new step 6: "Spec authoring and amendment invoke `spec-reviewer` (graded JSON output); PR review consumes `pr-reviewer` (graded JSON); both drive routing via the SPEC-001 severity→action policy. See `specs/SPEC-001-*.md` for the model."

## Constraints

- Surgical edits only. Preserve the rest of setup.md's numbered structure, prerequisite list, agent configuration, and troubleshooting table.
- Do not duplicate skill content that lives in skills.md or skill-architecture.md.
- The graded-review note is informational; it doesn't change the workflow steps.

## Verification

- `grep -c "baselines" .ai/setup.md` returns ≥1 (in §7).
- `grep -c "intents.md" .ai/setup.md` returns ≥1 (in §7).
- §8 daily workflow has a sentence mentioning graded review and pointing at SPEC-001.
