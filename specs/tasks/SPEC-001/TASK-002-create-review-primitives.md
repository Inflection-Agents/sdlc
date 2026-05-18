---
id: TASK-002
spec: SPEC-001
title: "Create .ai/skills/review-primitives.md (shared severity, grounding, schema, carry-forward, measurement, prompt variants)"
status: done
agent: claude-code
depends_on: [TASK-001]
blocks: [TASK-003, TASK-004, TASK-005, TASK-006, TASK-009]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given the file exists, when read, then it contains the shared severity spine table (blocker | major | nit | suggestion) with spine definitions verbatim from SPEC-001 Design > Severity spine"
    status: done
  - id: AC-002
    description: "Given the file, when read, then it contains the PR-side consequence catalog table matching SPEC-001 Design > Shared primitives > PR-side consequence catalog"
    status: done
  - id: AC-003
    description: "Given the file, when read, then it contains the spec-side consequence catalog table matching SPEC-001 Design > Shared primitives > Spec-side consequence catalog (this is the authoritative single source for spec-side severity)"
    status: done
  - id: AC-004
    description: "Given the file, when read, then it contains the grounding rules table with three rows (pr-reviewer, Tier 2 PR specialists, spec-reviewer) and allowed citation prefixes for each, matching SPEC-001 Design > Grounding rules"
    status: done
  - id: AC-005
    description: "Given the file, when read, then it contains the JSON output schema (pseudo-JSON code block) matching SPEC-001 Design > Output schema, with the artifact discriminator and per-artifact field constraints"
    status: done
  - id: AC-006
    description: "Given the file, when read, then it contains the carry-forward contract with both precise definitions (PR-side: location's file does not appear in pr_diff; spec-side: section's text bytes identical) and at least one example each of correct and incorrect behavior"
    status: done
  - id: AC-007
    description: "Given the file, when read, then it contains the orchestrator severity→action policy pseudocode (including the escalate guard) matching SPEC-001 Design > Orchestrator severity→action policy verbatim"
    status: done
  - id: AC-008
    description: "Given the file, when read, then it contains the AC-010 measurement protocol: two reviewer configurations (default + adversarial OR two different models), ≥10 intersection findings before computing, agreement = matching / intersection"
    status: done
  - id: AC-009
    description: "Given the file, when read, then both the default and the adversarial spec-reviewer prompt variants are concretely defined either inline or in a referenced sibling location (prompts/default.md and prompts/adversarial.md). Variants differ in framing (e.g., adversarial grades severities more aggressively and probes harder for cross-spec contradictions)"
    status: done
created: 2026-05-18
updated: 2026-05-18
---

## Context

This is the foundational shared-contracts file that both `pr-reviewer` and `spec-reviewer` reference. Without it, those skills would have to redefine the severity spine, grounding rules, output schema, and carry-forward semantics independently — which is the exact drift problem the spec is designed to prevent. SPEC-001 ACs 001, 002, 008, 010, and 014 are all satisfied by this file.

## Requirements

Create `/Users/franklin/_code/sdlc/.ai/skills/review-primitives.md`.

Structure (mirroring SPEC-001 Design section):

1. **Header / overview** — one paragraph: "Shared primitives consumed by pr-reviewer and spec-reviewer. Single source of truth for severity, grounding rules, output schema, and carry-forward semantics."
2. **Severity spine** (table) — verbatim from SPEC-001 Design > Severity spine.
3. **PR-side consequence catalog** (table) — verbatim from SPEC-001 Design > Shared primitives > PR-side consequence catalog.
4. **Spec-side consequence catalog** (table) — verbatim from SPEC-001 Design > Shared primitives > Spec-side consequence catalog. Note this is the authoritative single source for spec-side severity; spec-reviewer's gap catalog (Appendix C) references back here.
5. **Grounding rules** (table) — three rows for pr-reviewer, Tier 2 PR specialists, spec-reviewer with their allowed citation prefixes.
6. **Output schema** (pseudo-JSON code block) — verbatim from SPEC-001 Design > Output schema.
7. **Carry-forward contract** — both definitions verbatim, plus a worked example showing carry-forward (PR-side: nit on `foo.ts:42` carries forward when next diff doesn't touch `foo.ts`; spec-side: nit in `Success criteria > third bullet` carries forward when that section's bytes are unchanged) AND a worked example showing re-evaluation (the location IS touched).
8. **Orchestrator severity→action policy** — verbatim from SPEC-001 Design > Orchestrator severity→action policy, including the escalate guard for unrecognized criterion prefixes.
9. **Measurement protocol (AC-010)** — full procedure: dispatch reviewer twice with two different configurations, count intersection findings (same location across both outputs), agreement = matching_severity / total_intersection, threshold ≥10 intersection findings before computing.
10. **Prompt variants** — either inline OR a reference to `prompts/default.md` and `prompts/adversarial.md` siblings. The adversarial variant must differ from the default in concrete ways (e.g., "grade ambiguity-class findings one level more severe", "probe for cross-spec contradictions even when no depends_on edge exists", "raise grounding-citation concerns as findings even when the underlying defect is minor").

## Constraints

- Pull content from SPEC-001 by copy (not by reference) for the contract sections — the skill file must be self-contained so it can be opened independently.
- The adversarial prompt variant should be substantive enough to produce genuinely different findings (not just temperature variance). If unsure of the right framing, draft 3-5 specific differences from the default prompt (severity bias, citation strictness, gap-catalog emphasis) and document them at the top of the variant.
- Do not include the full pr-reviewer or spec-reviewer skill prompts — those live in their own skill files (TASK-003, TASK-004). Only the shared primitives.
- Use markdown tables for the spine, both catalogs, and the grounding rules — same shape as SPEC-001.

## Verification

- Read the file end to end; check each AC against the rendered content.
- Confirm no contradictions with SPEC-001 (the catalogs must match exactly).
- Visually confirm both prompt variants exist and the adversarial one differs from default beyond cosmetics.
- No automated test exists yet; verification is by inspection.
