---
id: TASK-004
spec: SPEC-001
title: "Create .ai/skills/spec-reviewer/SKILL.md (incl. gap catalog)"
status: pending
agent: jules
depends_on: [TASK-002]
blocks: [TASK-006, TASK-007]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-reviewer/SKILL.md exists, when read, then the frontmatter has name: spec-reviewer and a description that triggers on spec review requests (end of spec-authoring Phase 2, after spec-amendment, or on-demand)"
    status: pending
  - id: AC-002
    description: "Given the file, when read, then it contains the spec-reviewer prompt verbatim from SPEC-001 Appendix C (inputs including upstream_specs and downstream_specs paths, grounding rules, gap catalog, severity reference to review-primitives.md, carry-forward, output, decision-disclaimer)"
    status: pending
  - id: AC-003
    description: "Given the file, when read, then it explicitly lists the allowed citation prefixes (spec-schema:<field|section>; spec-authoring:<section-anchor>; ADR-NNN; intent:<id>; monorepo:workspaces; SPEC-NNN:<section> usable for upstream OR downstream cross-spec contradictions) and matches review-primitives.md exactly"
    status: pending
  - id: AC-004
    description: "Given the file, when read, then it contains the gap catalog with all 9 categories (workspace-coverage, untestable AC, contradictory AC, missing required section, cross-spec contradiction, missing migration plan, unstated cross-workspace impact, unscoped scope, risk surface omission) WITHOUT re-specifying severity (severity is determined by review-primitives.md's spec-side consequence catalog)"
    status: pending
  - id: AC-005
    description: "Given the file, when read, then the prompt explicitly forbids inventing requirements ('If you cannot ground a finding, do not raise it.')"
    status: pending
  - id: AC-006
    description: "Given the file, when read, then it references review-primitives.md for severity ladder, output schema, and carry-forward contract"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

This task creates the skill file that implements the spec-side reviewer defined by SPEC-001. It is invoked by `spec-authoring` at the Phase 2 sign-off gate, by `spec-amendment` after every amendment, and on-demand by the owner.

## Requirements

Create `/Users/franklin/_code/sdlc/.ai/skills/spec-reviewer/SKILL.md`.

The file must contain:

1. **Frontmatter:**
   ```yaml
   ---
   name: spec-reviewer
   description: Use when reviewing a draft spec or spec amendment — emits graded JSON findings (blocker/major/nit/suggestion) per SPEC-001 contract. Invoked automatically by spec-authoring at the sign-off gate and by spec-amendment after every amendment; also invocable on demand.
   ---
   ```

2. **Overview paragraph** — one paragraph: "Spec-side machine-parseable reviewer. Grades a draft spec against the schema, authoring conventions, originating intent, ADRs, and cross-spec contracts. Output is JSON consumed by the spec-authoring / spec-amendment routing policy."

3. **Prompt body** — copy verbatim from SPEC-001 Appendix C (`spec-reviewer prompt and gap catalog`). The full prompt block including all input paths (spec_file, spec_schema, authoring, intent, project, adrs, upstream_specs, downstream_specs, previous_output), grounding rules, gap catalog, severity reference, carry-forward, output, decision-disclaimer.

4. **Gap catalog** (within the prompt) — list all 9 categories per SPEC-001 Appendix C, WITHOUT re-specifying severity. Add an explanatory note: "Severity for each gap category is determined by the spec-side consequence catalog in review-primitives.md; this catalog only lists categories to actively check."

5. **Reference to review-primitives.md** — explicit cross-reference for severity ladder, output schema, and carry-forward contract.

## Constraints

- The gap catalog must NOT re-specify severity per category — that contradicts the iter-3 fix (F-017 in the spec-review loop). Severity comes from the spec-side consequence catalog in review-primitives.md.
- The allowed citation prefixes listed in the prompt must match review-primitives.md exactly.
- Include both `upstream_specs` and `downstream_specs` in the input list (per iter-3 fix F-016 — `SPEC-NNN:<section>` citations are bidirectional).
- The prompt's decision-disclaimer at the bottom ("DECISION: you do not emit a decision. You grade.") is mandatory.

## Verification

- Read `/Users/franklin/_code/sdlc/.ai/skills/spec-reviewer/SKILL.md` end to end.
- Verify each AC by inspection.
- Cross-reference against `/Users/franklin/_code/sdlc/.ai/skills/review-primitives.md` (TASK-002 output) — the citation prefixes must match.
- Cross-reference against `/Users/franklin/_code/sdlc/specs/SPEC-001-tiered-code-review.md` Appendix C — the prompt must match.
- Confirm the gap catalog does NOT include severity labels per category.
- No automated test exists for skill content; verification is by inspection.
