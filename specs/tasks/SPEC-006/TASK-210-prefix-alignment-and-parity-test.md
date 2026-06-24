---
id: TASK-210
spec: SPEC-006
title: "PR-side prefix alignment — ALLOWED_PREFIX + schema criterion to the amended table + parity test"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - .claude/workflows/execute-spec.js
  - .ai/skills/review-envelope.schema.json
  - scripts/sdlc/prefix-parity.test.mjs
risk: medium
tier: fortified
verify_workspaces: [sdlc]
depends_on: [TASK-205, TASK-208]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-210-1
    description: "Given the canonical PR-side prefix table established in review-primitives.md by TASK-205, when execute-spec.js ALLOWED_PREFIX is updated, then it accepts the full PR-side set (so a code reviewer citing adr:/std:/monorepo:*/task:* as the pr-reviewer contract instructs is NOT rejected as ungrounded), and contains no spec-side-only prefixes (spec-schema:, intent:) the engine never legitimately sees."
    status: pending
    evidence:
  - id: AC-210-2
    description: "Given review-envelope.schema.json, when read, then its criterion description/enumeration matches the canonical PR-side table (same set as ALLOWED_PREFIX)."
    status: pending
    evidence:
  - id: AC-210-3
    description: "Given scripts/sdlc/prefix-parity.test.mjs, when run with node --test, then it parses the PR-side prefix set from review-primitives.md, execute-spec.js ALLOWED_PREFIX, and the schema criterion, and asserts the three are equal; node --check passes on execute-spec.js."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

With SPEC-001 amended to carry the canonical PR-side prefix table (TASK-205) and the engine refactor landed
(TASK-208), align the engine `ALLOWED_PREFIX` and the review-envelope schema `criterion` to that table and pin
them with a parity test. PR-side only — the spec-side vocabulary is untouched.

Depends on TASK-205 (the table to align to) and TASK-208 (which also edits `execute-spec.js`; sequential to
avoid a same-file collision).

## Requirements

1. **execute-spec.js `ALLOWED_PREFIX`** — update to the canonical PR-side set from `review-primitives.md`
   (TASK-205's normalized table): the union of `ac:`, `adr:`, `std:`, `inv:`, `design:`, `lens:`, `monorepo:`,
   `task:` (incl. `task:scope`), `spec:`. Use the same matching style the engine already uses
   (`criterion.startsWith(prefix)`). Do NOT add spec-side prefixes (`spec-schema:`, `spec-authoring:`,
   `intent:`, `monorepo:workspaces` is spec-side — keep the engine's `monorepo:` to the PR-side boundary
   citations). Match exactly the set TASK-205 published; if TASK-205's mapping differs, follow TASK-205.
2. **review-envelope.schema.json `criterion`** — update its description/enumeration to the same canonical
   PR-side set so the schema and engine agree.
3. **scripts/sdlc/prefix-parity.test.mjs** (`node --test`, no deps) — parse the PR-side prefix set from the
   three sources (a small parser over `review-primitives.md`'s canonical table, the `ALLOWED_PREFIX` array in
   `execute-spec.js`, and the schema `criterion`) and assert set-equality. Fail loudly on any divergence.

## Constraints

- **Source of truth is `review-primitives.md`** (set by TASK-205). This task aligns the engine + schema to it;
  it does not redefine the vocabulary. If unsure of a prefix, defer to TASK-205's table.
- Keep the change strictly PR-side; the engine must not start accepting spec-side prefixes.
- Do not regress the engine's escalate-on-ungrounded behavior (ungrounded blocking finding still escalates).
- `node --check` clean; no dead prefixes.

## Verification

- `node --check .claude/workflows/execute-spec.js`
- `node --test scripts/sdlc/prefix-parity.test.mjs`
- Cross-check: every prefix the `pr-reviewer` contract (review-primitives.md PR-side table) instructs is
  accepted by `ALLOWED_PREFIX`.
- New tests required: yes (`prefix-parity.test.mjs`).
