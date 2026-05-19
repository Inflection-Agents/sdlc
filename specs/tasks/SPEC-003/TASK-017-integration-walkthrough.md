---
id: TASK-017
spec: SPEC-003
title: "Integration walkthrough verification on fresh clone (AC-012 + AC-013)"
status: pending
agent: human
depends_on: [TASK-012]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given a fresh clone of upstream sdlc in a temp directory, when `./bootstrap.sh` runs, then for each of the 11 expected skill names N, `[ -f .claude/skills/N/SKILL.md ]` returns 0, and `[ -f .claude/skills/review-primitives.md ]` returns 0. Record temp-dir path, bootstrap log, assertion log (SPEC-003 AC-012)"
    status: pending
    evidence:
  - id: AC-002
    description: "Collision-handling byte-match upgrade: copy .ai/skills/ to .claude/skills/ (identical contents); run bootstrap; assert .claude/skills/ is now a symlink to ../.ai/skills (SPEC-003 AC-013(a))"
    status: pending
    evidence:
  - id: AC-003
    description: "Collision-handling divergent refusal: copy .ai/skills/ to .claude/skills/, then introduce a one-byte difference in any file under .claude/skills/; run bootstrap; assert exit code non-zero, stderr names the divergent file path, and .claude/skills/ is unchanged (still a directory, not a symlink) (SPEC-003 AC-013(b))"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

## Context

Per SPEC-003 AC-012 + AC-013. This task verifies the bootstrap rewrite (TASK-012) actually works end-to-end on a fresh clone and that the collision-handling behavior is correct. Routed `human` because it requires running bootstrap in a clean environment and inspecting the result — automation would require CI infrastructure not yet in place.

## Requirements

Three test scenarios on a fresh clone of `github.com/Inflection-Agents/sdlc`:

1. **Happy path (AC-001):**
   - `cd /tmp && rm -rf sdlc-bootstrap-test && git clone https://github.com/Inflection-Agents/sdlc sdlc-bootstrap-test && cd sdlc-bootstrap-test`
   - `./bootstrap.sh 2>&1 | tee /tmp/bootstrap.log`
   - For each name in `{create-domain-skill,intent-triage,pr-reviewer,sdlc-code-review,sdlc-code-standards,spec-amendment,spec-authoring,spec-completion,spec-execution,spec-reviewer,task-decomposition}`: `[ -f .claude/skills/$n/SKILL.md ] || echo "MISSING: $n"`
   - `[ -f .claude/skills/review-primitives.md ] || echo "MISSING: review-primitives.md"`
   - Record results in spec-completion evidence.

2. **Collision: byte-match upgrade (AC-002):**
   - On a fresh clone, remove the symlink and replace with a copy: `rm .claude/skills && cp -r .ai/skills .claude/skills`
   - Verify contents byte-match: `diff -r .ai/skills .claude/skills` returns clean.
   - Run `./bootstrap.sh`.
   - Assert: `[ -L .claude/skills ] && [ "$(readlink .claude/skills)" = '../.ai/skills' ]` returns 0.

3. **Collision: divergent refusal (AC-003):**
   - Same setup as scenario 2 (copy `.ai/skills/` to `.claude/skills/` as a directory).
   - Modify one file: `echo "divergent" >> .claude/skills/create-domain-skill/SKILL.md`.
   - Run `./bootstrap.sh` — capture exit code and stderr.
   - Assert: exit code is non-zero; stderr names `create-domain-skill/SKILL.md` (or the specific divergent path); `.claude/skills/` is still a directory (not a symlink); the modified content is preserved.

## Constraints

- Use a temp directory; do not run this against the upstream sdlc repo's own working copy.
- Record the exact commands run + outputs in the evidence section for each AC.
- If any AC fails, the bootstrap rewrite (TASK-012) needs revision — file as a `task:scope` blocker finding referring back to TASK-012.

## Verification

- All 3 scenarios pass per their assertions.
- Evidence sections of each AC contain the actual command output (not just "passed").
