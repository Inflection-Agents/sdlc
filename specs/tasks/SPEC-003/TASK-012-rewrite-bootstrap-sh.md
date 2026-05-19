---
id: TASK-012
spec: SPEC-003
title: "Rewrite bootstrap.sh — canonical .ai/skills source, symlink target, baselines/initiatives setup, validation"
status: pending
agent: claude-code
depends_on: [TASK-011]
blocks: [TASK-017]
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given bootstrap.sh runs on a platform supporting symlinks, when complete, then `.claude/skills` is a symlink to `../.ai/skills` and `[ -L .claude/skills ] && [ \"$(readlink .claude/skills)\" = '../.ai/skills' ]` returns 0 (SPEC-003 AC-001)"
    status: pending
    evidence:
  - id: AC-002
    description: "Given a platform without symlink support detected, when bootstrap runs, then it falls back to a recursive copy `.ai/skills/ → .claude/skills/` and prints a stderr warning naming the detected reason (SPEC-003 AC-002)"
    status: pending
    evidence:
  - id: AC-003
    description: "Given `specs/baselines/` does not exist, when bootstrap runs, then it is created; given it already exists, no error (SPEC-003 AC-003)"
    status: pending
    evidence:
  - id: AC-004
    description: "Given `specs/initiatives.md` does not exist, when bootstrap runs, then `templates/initiatives.md` is copied to `specs/initiatives.md`; given it already exists, no overwrite (SPEC-003 AC-004)"
    status: pending
    evidence:
  - id: AC-005
    description: "Given bootstrap completes, when validation runs, then for each of the 11 skill names (create-domain-skill, intent-triage, pr-reviewer, sdlc-code-review, sdlc-code-standards, spec-amendment, spec-authoring, spec-completion, spec-execution, spec-reviewer, task-decomposition), `[ -f .claude/skills/<name>/SKILL.md ]` returns 0, and `[ -f .claude/skills/review-primitives.md ]` returns 0; any missing entry exits non-zero with the entry name in stderr (SPEC-003 AC-005)"
    status: pending
    evidence:
  - id: AC-006
    description: "Given a repo where `.claude/skills/` exists as a regular directory with byte-identical contents to `.ai/skills/`, when bootstrap runs, then `.claude/skills/` is removed and replaced by the symlink; given divergent contents, bootstrap exits non-zero, prints divergent file path(s) to stderr, and `.claude/skills/` is unchanged (SPEC-003 AC-013, collision-handling)"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-001/002/003/004/005/013. The current bootstrap.sh reads from `.claude/skills/` (wrong source — canonical is `.ai/skills/` per the 2026-05-01 sync) and creates `.claude/skills/` as a directory copy (wrong target convention). This rewrite makes the script functional for new adopters and idempotent.

## Requirements

Rewrite `/Users/franklin/_code/sdlc/bootstrap.sh`. The script must:

1. **Skill installation:**
   - Source from `$SCRIPT_DIR/.ai/skills/` (the canonical location in the sdlc framework).
   - In the target repo, ensure `.ai/skills/` exists (copy from source if missing).
   - Create `.claude/skills` as a symlink to `../.ai/skills` (relative symlink so the target is repo-relative).
   - On symlink failure (Windows without admin, FAT/exFAT, etc.): detect the failure reason, fall back to a recursive copy `.ai/skills/ → .claude/skills/`, and print a stderr warning containing the detected reason and the note "future skill updates require re-running bootstrap."

2. **Collision handling (AC-006):**
   - If `.claude/skills/` already exists as a regular directory: compute a hash/diff between its contents and `.ai/skills/`.
   - If byte-identical: remove `.claude/skills/` and create the symlink.
   - If divergent: print to stderr the divergent file path(s), exit non-zero, do NOT modify `.claude/skills/`.
   - If `.claude/skills/` is already the correct symlink: no-op (idempotent).

3. **Directory + template setup:**
   - Create `specs/baselines/` if missing (`mkdir -p`).
   - Copy `templates/initiatives.md` to `specs/initiatives.md` if the target does NOT already exist (no overwrite).

4. **Validation step (at the end):**
   - For each of the 11 expected skill names: check `[ -f .claude/skills/<name>/SKILL.md ]`.
   - Check `[ -f .claude/skills/review-primitives.md ]`.
   - Any missing entry: print the entry name to stderr, exit non-zero.
   - On success: print the count of entries validated to stdout.

5. **Updated "Next steps" output** at the end (only on success): reference the current skill names, `specs/` directory convention, and SPEC-001/SPEC-002 as the working model.

## Constraints

- Idempotent: running bootstrap twice on the same repo must produce no harm and no errors.
- Preserve the existing Jules CLI check and Claude Code check (they're still relevant).
- The 11 expected skill names list is canonical; if SPEC-004 ships later and adds gap-capture skill, that list will need updating in a separate task.
- Use `set -euo pipefail` for safety.
- Cross-platform check: detect symlink support via `ln -s` test (create a temp symlink; if it fails, fall back).

## Verification

- Run on a fresh clone in a temp dir: `cd /tmp && git clone https://github.com/Inflection-Agents/sdlc test-bootstrap && cd test-bootstrap && ./bootstrap.sh && [ -L .claude/skills ] && for n in create-domain-skill intent-triage pr-reviewer sdlc-code-review sdlc-code-standards spec-amendment spec-authoring spec-completion spec-execution spec-reviewer task-decomposition; do [ -f .claude/skills/$n/SKILL.md ] || echo "MISSING: $n"; done && [ -f .claude/skills/review-primitives.md ] || echo "MISSING: review-primitives.md"`
- Run a second time on the same repo to verify idempotency (no errors, no changes).
- Construct synthetic collision tests for AC-006 (byte-match + divergent variants) — TASK-017 covers this end-to-end.

## Followups (batch_followup_and_accept — 2026-05-19)

Deferred nits from pr-reviewer fix-loop iter-1 re-review:

- **F-002:** A file with divergent content (same name, different hash) is reported twice in the `comm` divergent/missing blocks — once as "divergent" via `comm -23` and once as "missing" via `comm -13`, because `comm` operates on full `<hash> <filename>` strings. Add a comment above the `comm -13` block clarifying this behavior, or restructure to deduplicate by filename. (bootstrap.sh ~line 268)
- **F-A4:** PR #21 body's acceptance-criteria table labels the collision-handling row "AC-006" but it maps to SPEC-003 AC-013. No code impact; update PR description if re-opened or note in TASK-017 context.
