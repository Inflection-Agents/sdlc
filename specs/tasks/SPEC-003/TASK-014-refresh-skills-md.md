---
id: TASK-014
spec: SPEC-003
title: "Refresh skills.md — add 4 new entries; .claude/skills/ → .ai/skills/ path migration; sdlc-code-review graded model"
status: pending
agent: claude-code
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given skills.md, when read, then the skill map and details sections include entries for review-primitives, pr-reviewer, spec-reviewer, spec-execution (SPEC-003 AC-008)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given skills.md, when read, then every canonical reference to `.claude/skills/` is replaced with `.ai/skills/`; references to `.claude/skills/` as the symlink target are permitted only in the 'Where skills physically live' diagram with explicit symlink callout (SPEC-003 AC-008)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given skills.md sdlc-code-review section, when read, then it describes the graded model (per-finding severity blocker/major/nit/suggestion rendered; merge/fix recommendation derived from SPEC-001 policy); the three original verdict labels (**Approve:**, **Request changes:**, **Escalate:**) are removed — verified by `grep -E '^\\s*-\\s*\\*\\*(Approve|Request changes|Escalate):\\*\\*' skills.md` returning 0 matches (SPEC-003 AC-009)"
    status: pending
    evidence:
  - id: AC-004
    description: "Given skills.md, when read, then jules-dispatch is removed from the skill map (it doesn't actually exist as a skill file — only described in .ai/CLAUDE.md per current state)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-008 + AC-009. `skills.md` currently lists 11 skills (missing the 4 new ones from SPEC-001/002) and references `.claude/skills/` throughout. It also still documents `sdlc-code-review`'s old binary verdict (Approve/Request changes/Escalate), which TASK-005 of SPEC-001 physically removed from the live skill.

## Requirements

Edit `/Users/franklin/_code/sdlc/skills.md`:

1. **Skill map** (the ASCII tree near the top): add entries for `review-primitives` (note: it's a doc, not a `/skill`), `pr-reviewer`, `spec-reviewer`, `spec-execution`. Remove `jules-dispatch` (doesn't exist as a skill file).

2. **Path migration:** every reference to `.claude/skills/` as the *canonical* skill location is replaced with `.ai/skills/`. References to `.claude/skills/` *as the symlink target* are permitted ONLY in:
   - The "Where skills physically live" diagram (must explicitly note the symlink relationship)
   - The accompanying explanatory paragraph (must explicitly state .claude/skills is a symlink to .ai/skills per bootstrap.sh)
   All other appearances become `.ai/skills/`.

3. **`sdlc-code-review` section update:**
   - Add a sentence: "Per-finding severity (blocker/major/nit/suggestion) is rendered in the review comment."
   - Add a sentence: "The merge/fix recommendation is derived from the SPEC-001 orchestrator severity→action policy (consumes pr-reviewer's JSON output)."
   - Remove the three Verdict labels (`**Approve:**`, `**Request changes:**`, `**Escalate:**` as bulleted headers). The Verdicts subsection becomes a description of the four routing actions (`fix_loop` / `batch_followup_and_accept` / `accept` / `escalate`) per the SPEC-001 policy.

4. **Add detail sections** for the 4 new entries (review-primitives, pr-reviewer, spec-reviewer, spec-execution): each ~3-5 sentences describing trigger, what it does, key rules, what it interacts with — same shape as existing skill entries.

5. **Three-layer model:** the Layer 2 list of SDLC skills gains the 4 new entries.

## Constraints

- Surgical edits; preserve the document's overall structure, the three-layer model framing, and the implementation-order list.
- The skills.md file is reference material; precision matters. Do NOT introduce paraphrases that drift from the live skill content.
- Path migration is mechanical for canonical references but careful for the symlink callout — don't accidentally strip it from the diagram.

## Verification

- `grep -c "\.claude/skills/" skills.md` returns a small number (≤3) — all in the symlink callout area.
- `grep -E "^\s*-\s*\*\*(Approve|Request changes|Escalate):\*\*" skills.md` returns 0 matches.
- Visual inspection: the 4 new skills have detail sections; skill map shows them.
