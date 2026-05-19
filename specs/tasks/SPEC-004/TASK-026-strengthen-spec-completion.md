---
id: TASK-026
spec: SPEC-004
title: "Strengthen spec-completion skill — column rename, rigor, completion-report template"
status: pending
agent: claude-code
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-completion/SKILL.md deferred-verifications table, when read, then the columns are renamed: `Deadline` → `Trigger` (a trigger can be a date OR an observable condition), `How to check` → `Method` (SPEC-004 AC-012)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given the skill, when read, then it documents a rigor requirement: every measurement-class deferred criterion must have all three fields populated (owner, trigger, method); the skill emits a completion-blocking failure if any measurement-class criterion is missing any of them (SPEC-004 AC-012)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given templates/completion-report.md exists, when read, then it contains the structure from SPEC-004 Design > 3 > completion-report template (Task summary, Success criteria table, Deferred verifications table with Owner/Trigger/Method columns, Verdict section). The skill produces this template when generating reports (SPEC-004 AC-012)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-004 AC-012. The current `spec-completion` skill documents the four verification types and a deferred table, but with slightly different column names and without a rigor enforcement step. The completion reports used informally when closing SPEC-001/SPEC-002 demonstrated the better shape; this task formalizes it.

## Requirements

1. **Edit `/Users/franklin/_code/sdlc/.ai/skills/spec-completion/SKILL.md`:**

   a. **Step 5 (Handle measurement criteria) and Step 7 (Build the completion report):** rename table columns:
      - `Deadline` → `Trigger`
      - `How to check` → `Method`
      
      Add a note: "Trigger can be a calendar date (e.g., '2026-06-01') OR an observable condition (e.g., 'after next high-gear spec executes')."
   
   b. **Add a rigor requirement at the end of Step 5:** "Every measurement-class deferred criterion MUST have all three fields populated: Owner, Trigger, Method. The skill emits a completion-blocking failure (reports verdict: 'Blocked') if any measurement-class criterion is missing any of the three. No deferral without a clear path to verification."
   
   c. **Step 7 completion report template:** update to use the new column names. Reference `templates/completion-report.md` (created in this task) as the canonical shape — the skill produces this template at completion time.

2. **Create `/Users/franklin/_code/sdlc/templates/completion-report.md`:**

```markdown
## Completion report: SPEC-NNN v<version>

### Task summary
- Total: N | Done: N | Cancelled: N (reasons)

### Success criteria

| # | Criterion | Type | Evidence | Status |
|---|---|---|---|---|

### Deferred verifications

| Criterion | Owner | Trigger | Method |
|---|---|---|---|

### Verdict: [Ready to complete / Blocked / Needs discussion]
```

## Constraints

- Existing skill structure (Steps 1-9, hard gates, partial completion section) is preserved. This task surgically updates Steps 5 and 7 and adds the completion-blocking rigor check.
- The column rename is mechanical but consistent — replace every occurrence of `Deadline` (in the deferred-table context) with `Trigger`, and every `How to check` with `Method`. Do not rename other unrelated occurrences.
- The completion-report.md template is the canonical shape. Don't duplicate it in the skill text — reference it.

## Verification

- `grep -c "Trigger" .ai/skills/spec-completion/SKILL.md` returns ≥2 (column header + the trigger-can-be-date-or-condition note).
- `grep -c "Method" .ai/skills/spec-completion/SKILL.md` returns ≥2.
- `grep -c "Deadline" .ai/skills/spec-completion/SKILL.md` returns 0 in the deferred-table context (other unrelated `Deadline` mentions OK if not in tables).
- `[ -f /Users/franklin/_code/sdlc/templates/completion-report.md ]` returns 0.
- The template contains the 3 tables (Task summary, Success criteria, Deferred verifications) and the Verdict line.
