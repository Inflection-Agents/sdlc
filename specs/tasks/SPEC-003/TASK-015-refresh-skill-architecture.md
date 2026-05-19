---
id: TASK-015
spec: SPEC-003
title: "Refresh skill-architecture.md — Layer 2 additions + Skill inventory; path migration"
status: pending
agent: claude-code
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given skill-architecture.md, when read, then the Layer 2 list includes review-primitives, pr-reviewer, spec-reviewer, spec-execution (SPEC-003 AC-010)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given skill-architecture.md, when read, then the 'Skill inventory for a typical monorepo' table includes rows for the 4 new entries (SPEC-003 AC-010)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given skill-architecture.md, when read, then canonical references to `.claude/skills/` are replaced with `.ai/skills/`; symlink references are permitted only in the 'Where skills physically live' diagram with explicit callout (SPEC-003 AC-010)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-010. Companion to TASK-014 but for `skill-architecture.md`. The three-layer model diagram, "Where skills physically live" section, and "Skill inventory" table all reference `.claude/skills/` and miss the 4 new skills.

## Requirements

Edit `/Users/franklin/_code/sdlc/skill-architecture.md`:

1. **Three layers ASCII diagram (top of file):** keep the 3-layer framing. Update Layer 2's example list to include `review-primitives`, `pr-reviewer`, `spec-reviewer`, `spec-execution` alongside the existing entries.

2. **"Where skills physically live" section:** the example file tree currently shows `.claude/skills/` as the canonical location. Update to show `.ai/skills/` as canonical with `.claude/skills/` noted as a symlink (per bootstrap.sh). Add a brief paragraph explaining the symlink — same pattern as TASK-014 for skills.md.

3. **"Skill inventory for a typical monorepo" table:** add 4 new rows for `review-primitives` (Layer 2), `pr-reviewer` (Layer 2), `spec-reviewer` (Layer 2), `spec-execution` (Layer 2). Use the same column shape (Skill | Layer | Scope).

4. **Path migration:** same rule as TASK-014 — canonical `.claude/skills/` → `.ai/skills/`; symlink callouts permitted in the dedicated diagram + explanation only.

## Constraints

- Preserve the document's framing (three layers, precedence rules, cross-workspace section).
- Don't introduce content that contradicts the live skill files — when in doubt, check `.ai/skills/<name>/SKILL.md` for the live source.

## Verification

- `grep -c "\.claude/skills/" skill-architecture.md` returns a small number (≤3) — all in the symlink callout area.
- Visual inspection: the 4 new skills appear in both the diagram example and the inventory table.
- The three-layer model description is unchanged in spirit.
