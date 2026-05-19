---
id: TASK-027
spec: SPEC-004
title: "Update spec-amendment skill — gap-or-amendment decision + clarification back-port step"
status: done
agent: claude-code
depends_on: [TASK-023]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given .ai/skills/spec-amendment/SKILL.md, when read, then it includes a 'Gap or amendment?' decision section near the top, using the enumerated rule table from SPEC-004 Design > 2 (NOT a heuristic — bright-line rules). The table covers word-level AC clarification, design workaround without AC change, missing ADR cross-link, version-bump changes, scope/AC/design semantic changes (SPEC-004 AC-010)"
    status: pass
    evidence: |
      grep -c "Gap or amendment" .ai/skills/spec-amendment/SKILL.md -> 1
      Section inserted after overview (line 26), before Step 1.
      Table has 5 bright-line rows matching SPEC-004 Design > 2 verbatim.
  - id: AC-002
    description: "Given the skill, when read, then it includes a new step (after the amendment is produced): 'Scan open `clarification` gaps for the parent spec; incorporate any that are still applicable; set their `back_ported_to: SPEC-NNN-v<new-version>` (or SPEC-NNN-v1.1 for the Changelog-annotation pattern per the extension rule) and `status: resolved`.' (SPEC-004 AC-010)"
    status: pass
    evidence: |
      grep -c "back_ported_to" .ai/skills/spec-amendment/SKILL.md -> 1
      Step inserted before Step 7, scoped to status:open + resolution:clarification.
      Includes back_ported_to, v1.1 pattern for completed specs, resolved_date/by fields.
created: 2026-05-18
updated: 2026-05-19
---

## Context

Per SPEC-004 AC-010. The `spec-amendment` skill is the entry point for changes to a spec. SPEC-004 introduces the lighter gap-capture path; the amendment skill must triage between them using a bright-line rule, and it must close the loop on clarification gaps by back-porting them into amendments.

## Requirements

Edit `/Users/franklin/_code/sdlc/.ai/skills/spec-amendment/SKILL.md`:

1. **Add a "Gap or amendment?" decision section** near the top (after the overview, before the existing classification of cosmetic/additive/breaking). Use this enumerated rule table verbatim:

```markdown
## Gap or amendment?

Before invoking spec-amendment, decide whether the change is small enough to be a gap (lighter weight, no version bump) or substantive enough to require an amendment.

| Change type | Path |
|---|---|
| Word-level AC clarification preserving semantics (e.g., wording tighten without changing what passes/fails) | gap-capture (use `templates/gap.md`; do not run this skill) |
| Design-section workaround that does not affect any AC's pass/fail | gap-capture |
| Cross-link to an ADR that should have been cited but wasn't (no design change) | gap-capture |
| Any change that would bump the spec version (per `spec-schema.md` version rules) | **spec-amendment** (this skill) |
| Any change to In/Out scope, AC pass/fail conditions, or design semantics | **spec-amendment** |

If the change qualifies as a gap, create a GAP-NNN-*.md file under `specs/gaps/` (template at `templates/gap.md`) and stop. Otherwise continue with the amendment process below. See SPEC-004 for the originating design.
```

2. **Add a new step (after the amendment is produced, before the user-approval gate):** "Scan open `clarification` gaps for the parent spec. For each gap whose `status: open` and `resolution: clarification`, incorporate its resolution into the amendment if still applicable; set its `back_ported_to: SPEC-NNN-v<new-version>` (or `SPEC-NNN-v1.1` if the parent spec is `status: completed` and uses the Changelog-annotation extension pattern from SPEC-004) and `status: resolved` in the gap file. List the back-ported gaps in the amendment's commit message."

## Constraints

- The "Gap or amendment?" decision is the bright-line rule (not a heuristic). Implementers should be able to classify with no ambiguity.
- The back-port step preserves the gap-capture path's value — clarification gaps don't dangle indefinitely; they close when the next amendment lands.
- Per the extension pattern (SPEC-004 Design > 5), `back_ported_to` for completed-but-extended specs uses the `v1.1` Changelog label, not a real version.

## Verification

- `grep -c "Gap or amendment" .ai/skills/spec-amendment/SKILL.md` returns ≥1.
- `grep -c "back_ported_to" .ai/skills/spec-amendment/SKILL.md` returns ≥1.
- The decision section uses table format (visual scan).
- The back-port step is in the amendment-production part of the skill (not the entry point).
