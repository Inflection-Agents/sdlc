---
id: TASK-006
spec: SPEC-001
title: "Update spec-authoring + spec-amendment skills to invoke spec-reviewer"
status: done
agent: claude-code
depends_on: [TASK-002, TASK-004]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given the updated spec-authoring/SKILL.md, when read, then Phase 2 explicitly invokes spec-reviewer before the user sign-off gate, presents the graded findings to the owner, and loops on fixes until the owner approves OR overrides remaining findings"
    status: done
  - id: AC-002
    description: "Given the updated spec-amendment/SKILL.md, when read, then after producing the amended spec, the skill invokes spec-reviewer and presents the graded findings before the owner re-approves the amendment"
    status: done
  - id: AC-003
    description: "Given both updated skills, when read, then both reference the Owner override format (Design > Owner override format in SPEC-001) and explain how to write a spec_review_overrides entry"
    status: done
  - id: AC-004
    description: "Given both updated skills, when read, then both reference review-primitives.md for the routing policy (blockers/majors → fix_loop; nits/suggestions → spec_followups; empty → accept)"
    status: done
  - id: AC-005
    description: "Given the updated spec-authoring/SKILL.md, when read, then the Phase 2 step that previously asked the user to walk through sections manually is augmented (not replaced) with the spec-reviewer invocation — the owner remains the sign-off authority"
    status: done
created: 2026-05-18
updated: 2026-05-18
---

## Context

`spec-authoring` and `spec-amendment` are the two existing skills upstream that produce specs. SPEC-001 introduces `spec-reviewer` and requires both skills to invoke it before sign-off. This task wires the invocation into the existing flows without replacing the owner's authority — the reviewer makes findings systematic; the owner decides.

## Requirements

Update `/Users/franklin/_code/sdlc/.ai/skills/spec-authoring/SKILL.md`:

1. **Add a step to Phase 2** (the formalization phase) that invokes `spec-reviewer` BEFORE the user sign-off gate. Specifically:
   - After the author has written the full spec body but before "USER APPROVES SPEC" gate
   - Invoke spec-reviewer with the spec file, schema, this skill, intent, project.md, ADRs, and any upstream/downstream specs
   - Present the graded findings to the owner
   - If blockers or majors exist: loop with the author to fix or with the owner to override (per Owner override format in SPEC-001)
   - When no remaining blockers/majors (or all are owner-overridden), proceed to the sign-off gate
2. **Reference Owner override format** — link to SPEC-001 Design > Owner override format and show one example of a `spec_review_overrides:` entry.
3. **Reference review-primitives.md** for the routing policy.

Update `/Users/franklin/_code/sdlc/.ai/skills/spec-amendment/SKILL.md`:

1. **Add a step after the amendment is drafted** that invokes `spec-reviewer` on the amended spec — the same flow as spec-authoring's Phase 2 invocation.
2. **Reference Owner override format** for the same reason.
3. **Reference review-primitives.md** for the routing policy.

## Constraints

- Do not REPLACE the existing user-walks-through-sections review step in spec-authoring Phase 2; AUGMENT it. The spec-reviewer invocation comes alongside, not instead of, the human walkthrough.
- The owner remains the sign-off authority. The reviewer's recommendation is informational; only the owner approves.
- Do not duplicate the routing policy or severity ladder — reference review-primitives.md.
- The Owner override mechanism is for severity downgrades only, never silencing. State this explicitly in both skills.

## Verification

- Read each updated skill end to end; verify each AC.
- Confirm spec-authoring Phase 2 has the new spec-reviewer invocation step in the correct position (after body draft, before sign-off gate).
- Confirm spec-amendment has the equivalent step after the amendment is produced.
- Confirm both files reference the Owner override format with at least one YAML example.
