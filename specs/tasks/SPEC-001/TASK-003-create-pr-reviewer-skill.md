---
id: TASK-003
spec: SPEC-001
title: "Create .ai/skills/pr-reviewer/SKILL.md"
status: done
agent: jules
depends_on: [TASK-002]
blocks: [TASK-005, TASK-007, TASK-009]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/pr-reviewer/SKILL.md exists, when read, then the frontmatter has name: pr-reviewer and a description that triggers on PR review requests"
    status: done
  - id: AC-002
    description: "Given the file, when read, then it contains the pr-reviewer prompt verbatim from SPEC-001 Appendix A (inputs, grounding rules, severity, carry-forward, cross-skill signals, output, decision-disclaimer)"
    status: done
  - id: AC-003
    description: "Given the file, when read, then it explicitly lists the allowed citation prefixes (AC-NNN; ADR-NNN; sdlc-code-standards:<anchor>; monorepo:boundary; task:blocks:<id>; task:scope; spec:ambiguous-ac; spec:contradictory-ac; spec:wrong-design; spec:missing-section) and matches review-primitives.md exactly"
    status: done
  - id: AC-004
    description: "Given the file, when read, then it contains the Tier 2 dispatch rules table verbatim from SPEC-001 Appendix B (six rows: cross_spec×2, adversarial, domain:dbt, domain:nextjs, domain:playwright)"
    status: done
  - id: AC-005
    description: "Given the file, when read, then it explicitly states the reviewer evaluates the Tier 2 dispatch rules and populates tier_2_dispatch_recommended in its output (orchestrator does not re-evaluate file globs)"
    status: done
  - id: AC-006
    description: "Given the file, when read, then the prompt explicitly forbids inventing requirements ('If you cannot ground a finding, do not raise it.')"
    status: done
  - id: AC-007
    description: "Given the file, when read, then it references review-primitives.md for severity ladder, output schema, and carry-forward contract (not duplicating them)"
    status: done
created: 2026-05-18
updated: 2026-05-18
---

## Context

This task creates the skill file that implements the PR-side reviewer defined by SPEC-001. It is the machine-parseable counterpart to the human-readable `sdlc-code-review` (which TASK-005 updates). The orchestrator in SPEC-002 calls this skill via the standard agent-dispatch path; the skill returns JSON the orchestrator routes.

## Requirements

Create `/Users/franklin/_code/sdlc/.ai/skills/pr-reviewer/SKILL.md`.

The file must contain:

1. **Frontmatter:**
   ```yaml
   ---
   name: pr-reviewer
   description: Use when reviewing a PR against its task file, spec, and ADRs — emits graded JSON findings (blocker/major/nit/suggestion) per SPEC-001 contract. Machine-parseable output for spec-execution orchestrator.
   ---
   ```

2. **Overview paragraph** — one paragraph stating this is the PR-side machine-parseable reviewer; the human-readable rendering is in `sdlc-code-review`.

3. **Prompt body** — copy verbatim from SPEC-001 Appendix A (`pr-reviewer prompt (draft)`). The full prompt block including inputs, grounding, severity, carry-forward, cross-skill signals, output, and decision-disclaimer.

4. **Tier 2 dispatch rules table** — copy verbatim from SPEC-001 Appendix B. Include the introductory sentence "This table is the source of truth for Tier 2 dispatch."

5. **Dispatch ownership note** — one paragraph stating: "The reviewer evaluates the Tier 2 dispatch rules against the task file's `blocks:` field and the PR diff, populating `tier_2_dispatch_recommended` in its output. The orchestrator trusts this list and does NOT re-evaluate file globs."

6. **Reference to review-primitives.md** — explicit cross-reference for severity ladder, output schema, and carry-forward contract (do not duplicate these — they live in `review-primitives.md`).

## Constraints

- Do not duplicate the severity ladder, output schema, or carry-forward contract — these live in `review-primitives.md` (created by TASK-002). Reference by relative path.
- The allowed citation prefixes listed in the prompt must match review-primitives.md exactly. If a discrepancy is found, fix the prompt to match primitives (primitives is the source of truth).
- The Tier 2 dispatch rules table must match SPEC-001 Appendix B byte-for-byte (six rows).
- Frontmatter `description` must include the word "PR" to trigger correctly on PR review requests.
- The prompt's decision-disclaimer at the bottom ("DECISION: you do not emit a decision. You grade.") is mandatory.

## Verification

- Read `/Users/franklin/_code/sdlc/.ai/skills/pr-reviewer/SKILL.md` end to end.
- Verify each AC by inspection against the rendered content.
- Cross-reference against `/Users/franklin/_code/sdlc/.ai/skills/review-primitives.md` (TASK-002 output) — the citation prefixes must match.
- Cross-reference against `/Users/franklin/_code/sdlc/specs/SPEC-001-tiered-code-review.md` Appendices A and B — the prompt and dispatch rules table must match.
- No automated test exists for skill content; verification is by inspection.
