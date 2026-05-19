---
id: TASK-020
spec: SPEC-005
title: "Add Changelog v1.1 annotation to SPEC-002"
status: pending
agent: jules
depends_on: [TASK-019]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given specs/SPEC-002-spec-execution-orchestration.md, when read, then it has a `## Changelog` section appended to its body (after Migration > Rollback plan, before any appendices). Frontmatter `status: completed` and `version: 1` are UNCHANGED (SPEC-005 AC-008)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given the Changelog section, when read, then it contains a v1 entry (initial completion, 2026-05-18) and a v1.1 entry (YYYY-MM-DD — extensions via SPEC-005) enumerating: (a) conditional integration-branch strategy with optional integration_strategy field + heuristic fallback; (b) integration_strategy_resolved event added to live telemetry (10 event types in skill); (c) AC-010 of SPEC-002 superseded in live behavior by SPEC-005's conditional resolution — AC-010 wording in the spec body preserved as historical record. See SPEC-005 for full design."
    status: pending
    evidence:
  - id: AC-003
    description: "Given the body of SPEC-002 above the Changelog section, when read, then it is UNCHANGED from the pre-SPEC-005 state (especially the AC-010 wording, Design > PR side > Tier 0 mandate of integration branch, etc.). The Changelog is the ONLY addition."
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-005 AC-008. Implements the "completed specs are immutable; annotate via Changelog only" pattern (introduced by SPEC-004; used here too). Documents that the live `spec-execution` skill behavior has been extended by SPEC-005 while preserving SPEC-002 v1's historical record.

## Requirements

Edit `/Users/franklin/_code/sdlc/specs/SPEC-002-spec-execution-orchestration.md`:

1. **Append a `## Changelog` section** at the end of the spec body, after the `## Migration` section's `### Rollback plan` and before any appendices (`## Appendix A`, `## Appendix B`).

2. **Content of the Changelog section:**

```markdown
## Changelog

### v1 (2026-05-18) — initial
- Initial spec, completed 2026-05-18.

### v1.1 (YYYY-MM-DD) — extensions via SPEC-005
- SPEC-005 added the following without modifying this spec's contracts:
  - Conditional integration-branch strategy in spec-execution: optional `integration_strategy: branch | direct` frontmatter field on specs with a heuristic fallback (branch if `breaking` tag, multi-workspace, ≥5 tasks, or any task `blocks:` crosses workspace boundary; else direct).
  - `integration_strategy_resolved` event added to the live `spec-execution/SKILL.md` telemetry schema (the live schema now has 10 event types; this spec body documents 9 as historical record).
  - Live direct-mode Phase 3 sequence: spec-completion invoked on all-tasks-terminal (if ≥1 task done; skipped if all cancelled); execution log archived by appending sentinel comment `# spec_completed: <iso8601>` (not a new event type).
- AC-010 of this spec (mandating `feat/spec-NNN` as the ONLY merge pattern) is superseded in the live behavior by SPEC-005's conditional resolution. AC-010's wording in this spec body is preserved as historical record.
- See SPEC-005 for the rationale, heuristic, and full design.
```

3. **Replace `YYYY-MM-DD`** with the actual date when this task lands (the implementing agent fills it in with `date -u +%Y-%m-%d`).

4. **Do NOT modify anything else.** Frontmatter `status: completed`, `version: 1`, `completed: 2026-05-18` stay exactly as they are. The body sections (Problem, Success criteria, Scope, Design, Acceptance criteria, Risks, Migration) are byte-identical to their pre-SPEC-005 state.

## Constraints

- This is an append-only edit on the spec body. The frontmatter is read-only.
- The Changelog content matches SPEC-005 Design > Changelog annotation on SPEC-002 verbatim (with the date placeholder resolved).
- Per the spec-schema convention, `## Changelog` is an allowed appended section even for completed specs (it's documented in spec-schema as "added on first amendment" but extended via SPEC-004 and SPEC-005 to also cover the extension pattern).

## Verification

- `git diff specs/SPEC-002-spec-execution-orchestration.md` shows ONLY additions in the Changelog area, no other lines modified.
- The frontmatter `status: completed` is unchanged: `grep "^status:" specs/SPEC-002-spec-execution-orchestration.md` returns `status: completed`.
- The frontmatter `version: 1` is unchanged.
- The new Changelog section contains both the v1 and v1.1 entries with the SPEC-005 enumeration.
