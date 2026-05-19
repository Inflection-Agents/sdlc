---
id: TASK-013
spec: SPEC-003
title: "Refresh README.md — docs table to exactly 6, current-state pointer, .ai/skills/ subdirectory"
status: pending
agent: claude-code
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given README.md, when read, then the Documents table lists exactly 6 entries: spec-schema.md, task-schema.md, playbook.md, skills.md, skill-architecture.md, specs/_index.md (SPEC-003 AC-007)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given README.md, when read, then a new 'Current state' section references SPEC-001 and SPEC-002 by filename pointing to the framework's own dogfooded specs (SPEC-003 AC-007)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given README.md, when read, then the `.ai/` directory table includes a `skills/` subdirectory row (SPEC-003 AC-007)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-007. The current README.md lists 11 docs (loading too much upfront for new adopters) and doesn't mention the dogfooded `specs/` directory or the graded review model.

## Requirements

Edit `/Users/franklin/_code/sdlc/README.md`:

1. **Documents table:** trim to exactly 6 essential pointers. Remove entries for `sync.md`, `agent-orchestration.md`, `work-graph.md`, `triage.md`, `roles.md`, `tooling.md` (those are deeper material). The remaining 6: `spec-schema.md`, `task-schema.md`, `playbook.md`, `skills.md`, `skill-architecture.md`, and a new entry `specs/_index.md` (the dogfooded backlog).

2. **Add a "Current state" section** (above or near the Documents table) — one paragraph that says the framework is dogfooded on itself; references `specs/SPEC-001-*.md` (graded review primitives) and `specs/SPEC-002-*.md` (orchestration model); points at `specs/intents.md` for the live backlog.

3. **`.ai/` directory table:** add a `skills/` row noting it holds the SDLC + domain skills (sourced from this framework, symlinked into `.claude/skills/` by bootstrap.sh).

4. **"Onboarding a new developer" section:** unchanged in shape, but the `./bootstrap.sh` command now works correctly per TASK-012.

5. **"Distribution strategy" section:** add a brief mention that INI-002 (sdlc-onboarding) tracks the longer-term wizard / `sdlc init` work; this Phase 1 spec fixes what's actively broken.

## Constraints

- Surgical edits; don't rewrite the README. Preserve existing tone, principles section, status.
- The 6 docs in the trimmed table must match exactly the list in AC-007 of SPEC-003 (and in TASK-013 AC-001 here).
- Do NOT remove the deeper docs from the repo — only from the prominent README table. They remain discoverable for advanced users.

## Verification

- Read the updated README.md end-to-end.
- `grep -c "^| .*md.*|" README.md` in the Documents table region should match exactly 6 (or visual count).
- Confirm the Current state section exists and links to SPEC-001/SPEC-002.
- Confirm the .ai/ table has a skills/ row.
