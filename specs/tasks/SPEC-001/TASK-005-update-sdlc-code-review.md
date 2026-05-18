---
id: TASK-005
spec: SPEC-001
title: "Update sdlc-code-review/SKILL.md to consume graded pr-reviewer output"
status: pending
agent: claude-code
depends_on: [TASK-002, TASK-003]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given the updated sdlc-code-review/SKILL.md, when read, then all references to a binary 'approved | needs_fix' verdict are removed (not deprecated-in-place; physically deleted from the file)"
    status: pending
  - id: AC-002
    description: "Given the updated skill, when read, then the human-readable review comment template renders per-finding severity (blocker/major/nit/suggestion) for each finding from pr-reviewer's output"
    status: pending
  - id: AC-003
    description: "Given the updated skill, when read, then the merge/fix recommendation is derived from the SPEC-001 orchestrator severity→action policy (not freehand): 'fix_loop' if any blocker or major; 'batch_followup_and_accept' if only nits/suggestions; 'accept' if empty; 'escalate' if reviewer-contract violation"
    status: pending
  - id: AC-004
    description: "Given the updated skill, when read, then it references review-primitives.md for severity definitions and references pr-reviewer/SKILL.md for the JSON contract being consumed"
    status: pending
  - id: AC-005
    description: "Given a grep for 'approved' or 'needs_fix' in the file, when run, then no matches in policy / verdict context (the strings may appear as historical references in docstrings only, none as the operative verdict)"
    status: pending
created: 2026-05-18
updated: 2026-05-18
---

## Context

`sdlc-code-review` is the existing human-readable PR review skill in upstream sdlc. Today it emits a binary verdict (`approved | needs_fix`) in freehand markdown. SPEC-001 supersedes this with a graded model: pr-reviewer emits JSON; sdlc-code-review consumes that JSON and renders a human-readable comment with per-finding severity. The skill's old binary-verdict language must be physically removed, not feature-flagged.

## Requirements

Update `/Users/franklin/_code/sdlc/.ai/skills/sdlc-code-review/SKILL.md`:

1. **Remove binary-verdict language** — search for and delete all instances of `approved`, `needs_fix`, "request changes", and similar binary-decision phrasing that present this skill as the decision authority.

2. **Add the policy-derived recommendation logic** — somewhere visible in the skill, describe how the routing recommendation is computed from the graded findings (per SPEC-001 Design > Orchestrator severity→action policy). This skill RENDERS the recommendation; the policy IS the routing.

3. **Add the review comment template** — a new section showing the markdown shape of the rendered review comment, including per-finding severity badges/labels and the action recommendation. Example:
   ```markdown
   ## Review verdict: fix_loop (1 blocker, 2 majors, 3 nits)

   ### Blockers (1)
   - **[AC-003]** `apps/dealer-app/src/Foo.tsx:42` — Acceptance criterion not addressed in diff. Fix: implement the validation logic.

   ### Majors (2)
   - **[sdlc-code-standards:dry]** `apps/dealer-app/src/utils.ts:12-34` — Reimplements existing helper in @repo/shared. Fix: import from @repo/shared.
   - **[task:blocks:TASK-088]** `dbt/models/marts/dim_loans.sql:15` — Column rename breaks the contract this task is supposed to produce. Fix: revert column name or update TASK-088 spec.

   ### Nits (3)
   - [...]

   ### Action: fix_loop
   ```

4. **Reference review-primitives.md** for severity definitions.
5. **Reference pr-reviewer/SKILL.md** for the JSON contract this skill consumes.

## Constraints

- Old binary-verdict language is removed, not deprecated in place. The file should not contain the strings `approved` or `needs_fix` in any verdict context.
- Do not duplicate the severity ladder or routing policy — reference review-primitives.md.
- This skill is HUMAN-READABLE. It renders for humans. It does not return JSON. The JSON contract is pr-reviewer's job.
- Keep the existing skill structure (frontmatter, overview, critical gates, etc.) intact where it doesn't conflict with the graded model. Surgical edit, not full rewrite.

## Verification

- Run `grep -E "approved|needs_fix" /Users/franklin/_code/sdlc/.ai/skills/sdlc-code-review/SKILL.md`; confirm no matches in verdict-policy context (if any historical mentions remain, they must be clearly marked as descriptions of the old model that was removed).
- Read the updated skill end to end; verify each AC.
- Confirm the review comment template includes per-finding severity rendering and the action recommendation.
