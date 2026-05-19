---
id: TASK-024
spec: SPEC-004
title: "Update sdlc-code-review skill — workspace enforcement + evidence quality grading"
status: pending
agent: claude-code
depends_on: [TASK-022]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/sdlc-code-review/SKILL.md workspace-scope section, when read, then advisory 'if set, check' language is replaced with enforcement language. PR touches files outside declared workspace → `monorepo:workspace-scope` blocker. PR fails tests in any verify_workspaces → `monorepo:verify-coverage` blocker. The existing `monorepo:boundary` prefix is reserved for import-graph violations defined in `.ai/project.md` (semantic narrowing; three non-overlapping prefixes). Severity is assigned here in this AC, not duplicated in the skill body. (SPEC-004 AC-006)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given .ai/skills/sdlc-code-review/SKILL.md, when read, then it grades insufficient evidence content as `task:evidence-missing` major finding (Tier 1 quality check; Tier 0 presence check handled separately per SPEC-001/SPEC-004 Tier 0 extension). The skill describes what 'insufficient' means with at least one example (e.g., 'tests passed' with no output excerpt). (SPEC-004 AC-006 evidence portion)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given the updated skill, when read, then `grep -E 'if set,?\\s*check' .ai/skills/sdlc-code-review/SKILL.md` in the workspace-scope sections returns 0 matches (advisory language removed in favor of enforcement)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-006. Updates the live `sdlc-code-review` skill to: (a) enforce (not advise) workspace constraints using the 3 distinct monorepo prefixes; (b) grade evidence content quality as a Tier 1 major finding. Depends on TASK-022 for the new prefixes existing in `review-primitives.md`.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/sdlc-code-review/SKILL.md`:

1. **Workspace-scope section:** convert advisory wording to enforcement. The three prefixes have distinct semantics:
   - `monorepo:boundary` — **import-graph violation.** Files in workspace A import from workspace B against the documented dependency graph in `.ai/project.md`. Existing prefix; semantic narrowing happens here (used to be looser; now reserved for import-graph specifically).
   - `monorepo:workspace-scope` — **file-touch violation.** PR modifies files outside the declared `workspace` field regardless of import graph. New prefix from TASK-022.
   - `monorepo:verify-coverage` — **test-failure violation.** PR fails tests in any workspace listed in `verify_workspaces`. New prefix from TASK-022.
   - All three are **blocker** severity. Skill describes each with one sentence; severity is implicit (no duplication).

2. **Evidence content quality grading:** add a step in the per-PR review checklist that examines each AC's `evidence:` field. If content is insufficient (e.g., "tests passed" with no output excerpt, "verified" with no proof, empty after Tier 0 presence check somehow bypassed), raise `task:evidence-missing` as a major finding with a one-sentence explanation. Provide at least one example of "insufficient" in the skill text.

3. **Remove advisory language:** find every occurrence of "if set, check" or equivalent ("if present, verify", "if available, validate") in the workspace-scope context and replace with enforcement language ("Required check:", "Enforce:", "Verify:").

## Constraints

- Severity for the 3 monorepo prefixes is assigned in the AC table above (blocker for all three). Do not duplicate severity assignments in the skill body — reference the AC table or just describe the consequence.
- Tier 0 evidence presence (CI mechanical) is handled by the Tier 0 extension in TASK-022, not by this skill. This skill grades content quality only.
- The semantic narrowing of `monorepo:boundary` to import-graph-only is the key contract change captured in SPEC-001's v1.1 Changelog (TASK-030). Make sure the skill prose matches.
- Surgical edits — preserve existing skill structure (overview, critical gates, process, verdicts).

## Verification

- `grep -E 'if set,?\s*check' .ai/skills/sdlc-code-review/SKILL.md` returns 0 matches in the workspace-scope sections.
- The skill documents the 3 distinct monorepo prefixes with non-overlapping semantics.
- The skill describes `task:evidence-missing` Tier 1 grading with at least one example of insufficient content.
