---
id: TASK-022
spec: SPEC-004
title: "Extend review-primitives.md — Tier 0 evidence gate, 4 new pr-reviewer prefixes, extension-pattern authorization"
status: pending
agent: claude-code
depends_on: []
blocks: [TASK-024, TASK-028, TASK-030]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/review-primitives.md PR-side Tier 0 list, when read, then it includes 'every AC has a non-empty `evidence:` field' as a mechanical CI gate (presence check, not quality) (SPEC-004 AC-003)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given .ai/skills/review-primitives.md grounding rules table pr-reviewer row, when read, then it includes the 4 new prefixes: `task:evidence-missing`, `spec:gap`, `monorepo:workspace-scope`, `monorepo:verify-coverage`. The Tier 2 PR specialists row inherits these (per existing inheritance rule). spec:gap is NOT added to the spec-reviewer row (SPEC-004 AC-004 + AC-005)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given .ai/skills/review-primitives.md, when read, then the rule about adding new consequence rows / citation prefixes (any text equivalent to 'via spec-amendment on SPEC-001') is amended to read: 'New consequence rows and citation prefixes are added either via spec-amendment on SPEC-001 (while SPEC-001 is in an amendable state) OR via a subsequent spec that extends the live artifact and adds a Changelog v1.1 annotation to SPEC-001 (the extension pattern; see SPEC-004 for the originating use).' (SPEC-004 'Authorize the extension pattern' scope bullet)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-003, AC-004, AC-005, and the scope bullet authorizing the extension pattern. This is the foundational live-artifact change in SPEC-004 — every downstream skill update (TASK-024, TASK-028, TASK-030) depends on these prefixes existing and the extension-pattern rule being amended.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/review-primitives.md`:

1. **Tier 0 list (PR-side mechanical gates):** add a bullet "every AC has a non-empty `evidence:` field (presence check only; quality is Tier 1's job per `task:evidence-missing`)".

2. **Grounding rules table — pr-reviewer row:** add 4 new citation prefixes:
   - `task:evidence-missing` (Tier 1 major when AC evidence is populated but insufficient)
   - `spec:gap` (cross-skill signal routing to gap-capture per SPEC-004 Design > 2)
   - `monorepo:workspace-scope` (blocker — PR touches files outside declared workspace)
   - `monorepo:verify-coverage` (blocker — PR fails tests in any verify_workspaces)

3. **Grounding rules table — Tier 2 PR specialists row:** verify the existing "inherits pr-reviewer prefixes verbatim" rule covers the 4 new prefixes (it should, by inheritance — no additional edit needed unless the row explicitly enumerates).

4. **Grounding rules table — spec-reviewer row:** UNCHANGED. `spec:gap` is NOT added here per AC-005 (gap-capture handler lives in spec-execution Phase 2 which only fires on PR-side reviews; spec-reviewer has no consumer for the prefix).

5. **Extension-pattern authorization:** find the existing text equivalent to "New consequence rows are added via `spec-amendment` on SPEC-001" (the SPEC-001 contract that iter-1 review surfaced as contradicting SPEC-004's extension approach). Amend that text to:

```
New consequence rows and citation prefixes are added either via spec-amendment
on SPEC-001 (while SPEC-001 is in an amendable state) OR via a subsequent spec
that extends the live artifact and adds a Changelog v1.1 annotation to SPEC-001
(the extension pattern; see SPEC-004 for the originating use).
```

## Constraints

- review-primitives.md is the canonical contract — both reviewer skills reference it. Changes flow to all consumers automatically.
- The 4 new prefixes are additive to the pr-reviewer row; do not remove or rename existing prefixes.
- `monorepo:workspace-scope` and `monorepo:verify-coverage` are distinct from the existing `monorepo:boundary` (which stays scoped to import-graph violations per SPEC-004 AC-006). They are also distinct from `monorepo:workspaces` (which is spec-reviewer-scoped). The semantics are documented in SPEC-004 AC-006; TASK-024 (sdlc-code-review update) carries the prose distinction.
- The extension-pattern authorization clause must read literally as specified — TASK-030 (Changelog annotations) and AC-013 of SPEC-004 reference this exact wording.

## Verification

- `grep -c "task:evidence-missing" .ai/skills/review-primitives.md` returns ≥1.
- `grep -c "spec:gap" .ai/skills/review-primitives.md` returns ≥1.
- `grep -c "monorepo:workspace-scope" .ai/skills/review-primitives.md` returns ≥1.
- `grep -c "monorepo:verify-coverage" .ai/skills/review-primitives.md` returns ≥1.
- The Tier 0 list contains "evidence" as a check.
- The extension-pattern authorization clause contains both "spec-amendment on SPEC-001" and "subsequent spec that extends".
- The spec-reviewer row does NOT contain `spec:gap`.
