---
id: TASK-007
spec: SPEC-001
title: "Worked examples for both reviewers (1 blocker + 1 major + 2 nits each)"
status: done
agent: jules
depends_on: [TASK-003, TASK-004]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/pr-reviewer/examples/ exists, when read, then it contains a worked example showing a fictional PR with the JSON output from pr-reviewer containing exactly 1 blocker, 1 major, and 2 nits, plus the expected orchestrator action ('fix_loop' per SPEC-001 policy)"
    status: done
  - id: AC-002
    description: "Given .ai/skills/spec-reviewer/examples/ exists, when read, then it contains a worked example showing a fictional draft spec with the JSON output from spec-reviewer containing exactly 1 blocker (untestable AC), 1 major (workspace coverage gap), and 2 nits, plus the expected orchestrator action"
    status: done
  - id: AC-003
    description: "Given both example files, when read, then every finding has a grounded citation that matches the allowed prefixes for the corresponding reviewer (per review-primitives.md grounding rules)"
    status: done
  - id: AC-004
    description: "Given the pr-reviewer example, when read, then it includes a populated tier_2_dispatch_recommended field (non-empty) demonstrating how the reviewer would recommend specialist dispatch based on file globs"
    status: done
  - id: AC-005
    description: "Given both examples, when read, then they include the full JSON output envelope per the shared schema (artifact, artifact_id, spec_id, pr_number, tier, findings, verification, tier_2_dispatch_recommended)"
    status: done
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-001 AC-007, worked examples are required to make the reviewer contracts concrete. Without them, an implementer reading the skill prompts has no anchor for what good output looks like. These examples serve as both documentation and regression test fixtures.

## Requirements

1. **Create `/Users/franklin/_code/sdlc/.ai/skills/pr-reviewer/examples/example-graded-pr.md`** containing:
   - A short prose section describing a fictional PR: imagine a PR against high-gear's dealer-app, ~120 lines, touching `apps/dealer-app/src/components/InventoryList.tsx`, claiming to address TASK-088 AC-003 (a filtering feature).
   - The full JSON output that pr-reviewer would emit:
     - `artifact: "pr"`, `artifact_id: "TASK-088"`, `spec_id: "SPEC-042"`, `pr_number: 142`, `tier: 1`
     - Exactly 4 findings: 1 blocker (citing AC-NNN — feature doesn't actually filter; broken), 1 major (citing sdlc-code-standards:dry — duplicates existing helper), 2 nits (citing sdlc-code-standards:naming and similar)
     - `verification`: populated with realistic commands and pass/fail
     - `tier_2_dispatch_recommended`: non-empty (e.g., `["domain:nextjs"]` because the diff touches `apps/*/components/**`)
   - A short prose section after the JSON: "Expected orchestrator action per SPEC-001 policy: `fix_loop` (1 blocker). The orchestrator invokes the fix agent with the findings as `previous_output`; on next iteration the reviewer carries forward the 2 nits IF the files they cite are not touched by the fix."

2. **Create `/Users/franklin/_code/sdlc/.ai/skills/spec-reviewer/examples/example-graded-spec.md`** containing:
   - A short prose section describing a fictional draft spec: imagine SPEC-099 — a draft for "add metrics export to admin-app" — with one untestable AC ("the dashboard should feel fast"), one missing workspace declaration (touches `shared/` but `workspaces:` is empty), and a few minor wording issues.
   - The full JSON output that spec-reviewer would emit:
     - `artifact: "spec"`, `artifact_id: "SPEC-099"`, `spec_id: "SPEC-099"`, `pr_number: null`, `tier: 1`
     - Exactly 4 findings: 1 blocker (citing spec-authoring:testable-acceptance-criteria; the "feel fast" AC), 1 major (citing monorepo:workspaces; workspace-coverage gap), 2 nits (citing spec-authoring:wording or similar)
     - `verification: null`
     - `tier_2_dispatch_recommended: []`
   - A short prose section: "Expected orchestrator action: `fix_loop` (1 blocker, 1 major). The owner can override the blocker via `spec_review_overrides:` if intentional, but the recommended path is to revise the AC to be measurable."

## Constraints

- **Findings must be grounded.** Every `criterion` field must match an allowed prefix from review-primitives.md (which TASK-002 produces). For pr-reviewer: AC-NNN; ADR-NNN; sdlc-code-standards:<anchor>; monorepo:boundary; task:blocks:<id>; task:scope; spec:*. For spec-reviewer: spec-schema:<field|section>; spec-authoring:<section-anchor>; ADR-NNN; intent:<id>; monorepo:workspaces; SPEC-NNN:<section>.
- The JSON in both files must be VALID JSON (parseable, no trailing commas, no comments).
- The examples are fictional but plausible — file paths and AC IDs should look like the real conventions.
- Each example file should be self-contained: a reader can open it without needing other context.

## Verification

- Read both example files end to end; verify each AC.
- Run `python3 -c "import json; json.load(open('<path>'))"` extracted JSON to confirm validity (or paste the JSON into any JSON validator).
- Cross-reference every `criterion` value against the grounding rules in review-primitives.md (TASK-002 output) — must be in the allowed list.
- Confirm the pr-reviewer example has a non-empty `tier_2_dispatch_recommended` and the spec-reviewer example has `tier_2_dispatch_recommended: []`.
