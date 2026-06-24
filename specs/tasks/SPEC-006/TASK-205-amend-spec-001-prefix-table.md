---
id: TASK-205
spec: SPEC-006
title: "Amend SPEC-001 — canonical PR-side grounding-prefix table in review-primitives.md"
status: pending
agent: human
workspace: sdlc
touches:
  - specs/SPEC-001-tiered-code-review.md
  - .ai/skills/review-primitives.md
risk: medium
tier: standard
verify_workspaces: [sdlc]
depends_on: []
blocks: [TASK-210]
linear_issue:
acceptance_criteria:
  - id: AC-205-1
    description: "Given review-primitives.md, when amended, then its Grounding rules section presents ONE canonical PR-side prefix table (pr-reviewer + Tier-2 specialists) enumerating every allowed prefix and its meaning, normalized to the engine-parseable lowercase `prefix:` colon form (ac:, adr:, std:<anchor> for sdlc-code-standards, monorepo:*, task:*, spec:*), and keeps the spec-side (spec-reviewer) set as a separate, unchanged table."
    status: pending
    evidence:
  - id: AC-205-2
    description: "Given SPEC-001, when amended, then its version is bumped and a Changelog entry records the prefix-table normalization (the extension/amendment pattern per review-primitives.md), naming SPEC-006 as the consumer that aligns the engine + schema to it."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

SPEC-006's PR-side prefix reconciliation aligns the engine (`ALLOWED_PREFIX`) and the review envelope
schema to a canonical prefix table. That table is a **SPEC-001-owned contract**; `review-primitives.md`
mandates prefix changes go through `spec-amendment` on SPEC-001 (or the extension pattern). This task is the
prerequisite amendment that establishes the canonical table; TASK-210 then aligns the engine + schema to it.

Routed `human` because it is judgment work (a `spec-amendment` on an active spec). Under the SPEC-006
autonomous run the owner has delegated this judgment, so the orchestrator may perform the amendment via the
`spec-amendment` skill.

## Requirements

1. Run `spec-amendment` on SPEC-001 (`specs/SPEC-001-tiered-code-review.md`). Classification: additive
   (normalizes/uni­fies an existing vocabulary; introduces no behavior change to severity or routing).
2. In `.ai/skills/review-primitives.md` → Grounding rules: consolidate the PR-side allowed prefixes into one
   canonical table. Normalize every legacy form to the lowercase `prefix:` colon convention the engine parses:
   - `AC-NNN` → `ac:AC-NNN`
   - `ADR-NNN` → `adr:ADR-NNN`
   - `sdlc-code-standards:<anchor>` → `std:<anchor>`
   - `monorepo:boundary` / `monorepo:workspace-scope` / `monorepo:verify-coverage` → unchanged (already colon form)
   - `task:blocks:<id>` / `task:scope` / `task:evidence-missing` → unchanged
   - `spec:ambiguous-ac` / `spec:contradictory-ac` / `spec:wrong-design` / `spec:missing-section` / `spec:gap` → unchanged
   Keep `inv:`, `design:`, `lens:` (engine/registry lens citations) in the canonical PR-side set.
3. Leave the **spec-side** (`spec-reviewer`) prefix table untouched (`spec-schema:`, `spec-authoring:`,
   `intent:`, `monorepo:workspaces`, `SPEC-NNN:`).
4. Bump SPEC-001 `version` and add a Changelog entry describing the normalization and naming SPEC-006 as the
   downstream consumer that aligns `execute-spec.js` `ALLOWED_PREFIX` and `review-envelope.schema.json`.

## Constraints

- Additive only: do not remove a real prefix's capability — every previously-citable defect must remain
  citable under the normalized name. Provide the old→new mapping in the Changelog so existing skill prose can
  be migrated by TASK-209/TASK-210.
- Do not edit `execute-spec.js` or the schema here — that is TASK-210's job (this task only sets the contract).
- Per `sdlc-code-standards`: no orphaned/duplicate prefix tables left behind; one canonical PR-side table.

## Verification

- Inspect `review-primitives.md`: exactly one canonical PR-side prefix table, lowercase colon form; spec-side
  table unchanged.
- Inspect SPEC-001 frontmatter: `version` incremented; Changelog entry present with the old→new mapping.
- New tests required: no (doc/contract change; TASK-210 adds the parity test that enforces alignment).
