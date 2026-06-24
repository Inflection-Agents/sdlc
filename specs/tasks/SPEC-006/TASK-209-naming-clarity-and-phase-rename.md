---
id: TASK-209
spec: SPEC-006
title: "Naming clarity — rename review->code-review phase, regen handoffs, review-moments diagram"
status: pending
agent: claude-code
workspace: sdlc
touches:
  - specs/sdlc-state-machine.yaml
  - skill-architecture.md
  - .ai/sdlc.md
  - .ai/skills/spec-execution/SKILL.md
  - .ai/skills/pr-reviewer/SKILL.md
  - skills.md
  - README.md
risk: medium
tier: standard
verify_workspaces: [sdlc]
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-209-1
    description: "Given specs/sdlc-state-machine.yaml, when read, then the former `review` phase id is `code-review` (owner_skill pr-reviewer), every internal reference to the old id (e.g. spec-execution.next_phase) is updated, and scripts/sdlc/validate-state-machine.mjs passes."
    status: pending
    evidence:
  - id: AC-209-2
    description: "Given the generated `## Handoff` footers, when regenerated via scripts/sdlc/gen-handoffs.mjs, then they reflect the code-review phase id, and gen-handoffs.mjs --check passes (no drift)."
    status: pending
    evidence:
  - id: AC-209-3
    description: "Given skill-architecture.md, when read, then it contains a review-moments diagram/table naming plan review, code review, and integration review, each mapped to its trigger and owning skill/workflow."
  - id: AC-209-4
    description: "Given a repo-wide grep of the SDLC prose docs, when run after this task, then 'plan review' denotes the pre-code gate and 'code review' the per-task PR review, with no remaining use of 'spec review' for the pre-code gate in the files this task owns (skill-architecture.md, .ai/sdlc.md, spec-execution/SKILL.md, pr-reviewer/SKILL.md, skills.md, README.md). Occurrences in TASK-205/TASK-206-owned files are out of scope here."
    status: pending
    evidence:
created: 2026-06-23
updated: 2026-06-23
---

## Context

The state machine's `review` phase is actually *code* review (owner `pr-reviewer`). Renaming it to
`code-review` and adding a review-moments map to `skill-architecture.md` resolves the naming collision SPEC-006
B-clarity targets. Independent of the engine/schema work.

## Requirements

1. **Rename the phase** in `specs/sdlc-state-machine.yaml`: `- id: review` → `- id: code-review`. Update every
   reference to the old phase id within the state machine (notably `spec-execution`'s `next_phase: review` →
   `next_phase: code-review`, and any `next_action`/trigger strings that name it). Keep `owner_skill:
   pr-reviewer`.
2. **Regenerate handoffs**: run `node scripts/sdlc/gen-handoffs.mjs` so the `## Handoff` footers in the owner
   skills are rebuilt from the renamed state machine. Only footers whose content changed will change (expected:
   `spec-execution/SKILL.md` "Next step" and `pr-reviewer/SKILL.md` phase line). Then `node
   scripts/sdlc/gen-handoffs.mjs --check` must pass.
3. **Review-moments map** in `skill-architecture.md`: add a short section + table naming the three moments —
   **plan review** (spec + decomposition, before code; spec-reviewer + task-decomposition gate), **code
   review** (per-task PR, during execute-spec; pr-reviewer → sdlc-code-review), **integration review** (end;
   integration-reviewer) — each with trigger and owner. Update the line that calls the reviewer of record "the
   LLM multi-lens panel (pr-reviewer grades → sdlc-code-review renders)" to use "code review" terminology.
4. **Terminology** in the files this task owns (`spec-execution/SKILL.md`, `pr-reviewer/SKILL.md`,
   `skill-architecture.md`, `.ai/sdlc.md`): use "plan review" for the pre-code gate and "code review" for the
   per-task PR review; do not call the pre-code gate "spec review".

## Constraints

- **Scope boundary:** terminology in `task-schema.md`/`spec-schema.md` is TASK-206's; in `review-primitives.md`
  is TASK-205's; do NOT edit those files here (keeps `touches` disjoint).
- Do not hand-edit text between the `<!-- sdlc:handoff:start -->` markers — regenerate via the script.
- Renaming must not break `validate-state-machine.mjs` (phase ids referenced elsewhere must stay consistent).

## Verification

- `node scripts/sdlc/validate-state-machine.mjs`
- `node scripts/sdlc/gen-handoffs.mjs --check`
- `grep -rn "id: review\b" specs/sdlc-state-machine.yaml` → no match (renamed); `grep -n "code-review"` → present.
- `grep -n "review-moments\|plan review\|code review" skill-architecture.md` → diagram/table present.
- New tests required: no (covered by the existing state-machine/handoff validators).
