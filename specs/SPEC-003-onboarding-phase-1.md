---
id: SPEC-003
title: Onboarding simplification — Phase 1 (docs + bootstrap fix)
status: draft
version: 1
supersedes:
initiative: INI-002
owner: franklin
created: 2026-05-18
updated: 2026-05-18
tags: [onboarding, docs, bootstrap, refresh]
linear_project:
---

## Problem

The upstream sdlc framework's docs and `bootstrap.sh` have not been updated since SPEC-001 (graded review) and SPEC-002 (spec-execution orchestration) landed. The result has two parts:

1. **`bootstrap.sh` is functionally broken for new adopters.** It reads skills from `$SCRIPT_DIR/.claude/skills/` (wrong source — canonical is `.ai/skills/` per the 2026-05-01 sync) and copies to `$REPO_ROOT/.claude/skills/` as a directory (wrong target — should be a symlink to `.ai/skills/` so skills travel with the rest of the `.ai/` SDLC content). It also doesn't create `specs/baselines/` (declared by SPEC-001 AC-013) or copy an `initiatives.md` template (no template exists). The 4 new skills shipped under `.ai/skills/` (`review-primitives.md`, `pr-reviewer/`, `spec-reviewer/`, `spec-execution/`) would not propagate to a new repo via the current script.
2. **Reference docs describe the pre-SPEC-001 model.** `skills.md` and `skill-architecture.md` list 11 skills (missing the 4 new ones), reference the wrong `.claude/skills/` paths, and document `sdlc-code-review`'s old binary verdict that TASK-005 physically removed. `README.md` doesn't mention graded review, the new skills, `specs/baselines/`, `initiatives.md`, or the dogfooded `specs/` directory. `.ai/setup.md` was partially updated by PR #1 but its directory structure section is still incomplete.

This is INI-002 (sdlc-onboarding) territory and was user-flagged as priority. This spec is the **urgent Phase 1 subset** — fix what's actively broken or actively misleading. The broader onboarding redesign (`sdlc init` interactive wizard, "working spec in 10 minutes" experience, three-doors framing for greenfield / adopt-into-existing / joining-a-team) is explicitly deferred to a Phase 2 spec.

## Success criteria

- [ ] A new developer cloning a fresh repo can run a single `bootstrap.sh` and reach a working SDLC setup where all skills currently in `.ai/skills/` are discoverable by Claude Code via `.claude/skills/`.
- [ ] `bootstrap.sh` creates `specs/baselines/` and seeds `specs/initiatives.md` from a new template.
- [ ] `README.md`, `skills.md`, and `skill-architecture.md` accurately reflect the post-SPEC-001/002 state: list all 12 current skills (8 original + `pr-reviewer`, `spec-reviewer`, `spec-execution`, plus the `review-primitives.md` file), use `.ai/skills/` paths throughout, and reference the graded review and wave-based execution models with pointers to SPEC-001/002.
- [ ] `.ai/setup.md` directory structure section reflects current state (`specs/baselines/`, `intents.md`, `initiatives.md`, `_index.md`, `SPEC-NNN-*.md`, `tasks/`).
- [ ] A new adopter following only `README.md` → `.ai/setup.md` → `bootstrap.sh` reaches a working state without needing to consult other reference docs.

## Scope

### In scope

- `bootstrap.sh` rewrite: source from `.ai/skills/`, create `.claude/skills/` as a symlink to `.ai/skills/` (with cross-platform fallback to copy on Windows), create `specs/baselines/`, copy `templates/initiatives.md` to `specs/initiatives.md` if missing.
- New file: `templates/initiatives.md` (the template).
- `README.md` refresh: skills table, docs table, "what's the current state" pointer to SPEC-001/SPEC-002, mention of `specs/` directory as the framework's own dogfooding.
- `skills.md` refresh: add `review-primitives.md`, `pr-reviewer`, `spec-reviewer`, `spec-execution`; fix all `.claude/skills/` references to `.ai/skills/`; update `sdlc-code-review` entry to graded model.
- `skill-architecture.md` refresh: same skill additions in Layer 2 list and inventory table; fix all path references.
- `.ai/setup.md` refresh: directory structure section + daily workflow note acknowledging the new model.

### Out of scope

- `sdlc init` interactive wizard — Phase 2.
- `sdlc demo` end-to-end verification round-trip — Phase 2.
- Three-doors signposting (greenfield / adopt-into-existing / joining-a-team) as separate entry points — Phase 2.
- `playbook.md` full rewrite — minor staleness; out of scope for this phase. A small pointer at the top is acceptable but not required.
- Tier-3 docs (`agent-orchestration.md`, `sync.md`, `tooling.md`, `work-graph.md`, `roles.md`, `triage.md`) — minor staleness; separate cleanup if needed.
- Migration of high-gear's existing setup. High-gear already uses `setup-sdlc.sh` and symlinks; the bootstrap.sh changes here affect *new* adopters.

## Design

### Bootstrap rewrite

`bootstrap.sh` becomes idempotent — running it twice does no harm. Key changes:

1. **Skill installation strategy.** When the receiving repo has `.ai/skills/`, create `.claude/skills/` as a symlink pointing at `../.ai/skills`. If the symlink can't be created (Windows without admin privileges, FAT/exFAT filesystem), fall back to copy and emit a warning that future skill updates require re-running bootstrap.
2. **Repo bootstrap mode (when run inside a target repo's clone).** If `.ai/skills/` does not exist locally, copy from `$SCRIPT_DIR/.ai/skills/` (the sdlc framework's canonical location) into `$REPO_ROOT/.ai/skills/`, then create the symlink.
3. **New directories.** Create `specs/baselines/` if missing. Copy `templates/initiatives.md` to `specs/initiatives.md` if missing.
4. **Validation step at the end.** Verify the 12 expected skills are discoverable from `.claude/skills/` (via the symlink or copy). Print the list. If any are missing, exit non-zero with a clear error.
5. **Updated "Next steps" output** referencing the current skill names, the `specs/` directory convention, and a pointer to SPEC-001/SPEC-002 as the working model.

### `templates/initiatives.md`

A minimal template:

```markdown
# Initiatives

Initiatives group related specs under a shared goal. Every spec's `initiative:` field references an entry here.

| ID | Slug | Description |
|---|---|---|
| INI-001 | <slug> | <one-line description> |

New initiatives are added by editing this file as part of the spec that introduces them.
```

### `README.md` refresh

- **Docs table:** trim to 5-6 essential pointers (`spec-schema.md`, `task-schema.md`, `playbook.md`, `skills.md`, `skill-architecture.md`, plus the `specs/` dogfooded backlog). Reference but don't enumerate the agent config (`agent-orchestration.md`, `sync.md`, etc.) — those are deeper material.
- **New "Current state" section:** explicit "this framework is dogfooded — see `specs/SPEC-001-*.md` for graded review primitives and `specs/SPEC-002-*.md` for the orchestration model." Pointer to `specs/intents.md` for the live backlog.
- **`.ai/` directory table:** add `skills/` subdirectory.
- **Onboarding section:** unchanged in shape, but the `./bootstrap.sh` command now works correctly (per the rewrite above).
- **Distribution strategy section:** reference INI-002 onboarding initiative for the longer-term wizard work.

### `skills.md` refresh

Two surgical changes:

1. **Skill map** — add entries for `review-primitives.md` (note: it's a doc, not a `/skill`), `pr-reviewer`, `spec-reviewer`, `spec-execution`. Remove `jules-dispatch` from the map (it's described in `.ai/CLAUDE.md` but no skill file exists).
2. **Path correction** — every reference to `.claude/skills/` becomes `.ai/skills/`. The "Where skills physically live" diagram updates to show `.ai/skills/` as the canonical location and `.claude/skills/` as a symlink.
3. **`sdlc-code-review` section update** — remove "Approve / Request changes / Escalate" verdict language; describe the graded model (consumes pr-reviewer JSON, renders per-finding severity, derives action from SPEC-001 policy).

### `skill-architecture.md` refresh

Same shape as skills.md:
- Layer 2 list: add `review-primitives`, `pr-reviewer`, `spec-reviewer`, `spec-execution`.
- "Where skills physically live" diagram: `.ai/skills/` primary, `.claude/skills/` symlink.
- "Skill inventory for a typical monorepo" table: add 4 new rows.

### `.ai/setup.md` refresh

- §7 Directory structure: extend `specs/` to include `baselines/`, `intents.md`, `initiatives.md`, `_index.md`, `SPEC-NNN-*.md`, `tasks/`.
- §8 Daily workflow: add a brief note that spec review and PR review are now graded (severity-driven) — pointer to SPEC-001 for the model.

## Acceptance criteria

- [ ] AC-001 — `bootstrap.sh` creates `.claude/skills/` as a symlink to `../.ai/skills` when the platform supports symlinks. On a fresh clone, after running bootstrap, `readlink .claude/skills` returns `../.ai/skills` (or the same path is reachable via both `.claude/skills/spec-execution/SKILL.md` and `.ai/skills/spec-execution/SKILL.md`).
- [ ] AC-002 — When the platform does not support symlinks (Windows without admin, FAT/exFAT), `bootstrap.sh` falls back to copying and prints a warning that future skill updates require re-running bootstrap. The warning includes the platform reason detected.
- [ ] AC-003 — `bootstrap.sh` creates `specs/baselines/` if missing. No error if already present.
- [ ] AC-004 — `bootstrap.sh` copies `templates/initiatives.md` to `specs/initiatives.md` if missing. No overwrite if already present.
- [ ] AC-005 — `bootstrap.sh` validates that all 12 expected skills (`create-domain-skill`, `intent-triage`, `pr-reviewer`, `sdlc-code-review`, `sdlc-code-standards`, `spec-amendment`, `spec-authoring`, `spec-completion`, `spec-execution`, `spec-reviewer`, `task-decomposition`, plus the `review-primitives.md` file) are discoverable from `.claude/skills/`. Missing skill exits non-zero with the skill name printed.
- [ ] AC-006 — `templates/initiatives.md` exists with the structure shown in Design > `templates/initiatives.md`.
- [ ] AC-007 — `README.md` "Documents" table lists the 5-6 essential pointers (not 11). A new "Current state" section references SPEC-001 and SPEC-002 by filename. The `.ai/` directory table includes `skills/`.
- [ ] AC-008 — `skills.md` skill map and details section include `review-primitives`, `pr-reviewer`, `spec-reviewer`, `spec-execution`. A grep for `.claude/skills/` in `skills.md` returns zero matches (all replaced with `.ai/skills/`).
- [ ] AC-009 — `skills.md` `sdlc-code-review` entry describes the graded model (per-finding severity, action derived from SPEC-001 policy). A grep for `Approve / Request changes` in the section returns zero matches.
- [ ] AC-010 — `skill-architecture.md` Layer 2 list and "Skill inventory" table include the 4 new skills. A grep for `.claude/skills/` returns zero matches (all replaced with `.ai/skills/`); explanatory text may reference `.claude/skills/` as "the symlink" but not as the canonical location.
- [ ] AC-011 — `.ai/setup.md` §7 directory structure includes `specs/baselines/`, `intents.md`, `initiatives.md`, `_index.md`, `SPEC-NNN-*.md`, `tasks/`. §8 daily workflow has a one-line note about the graded review model.
- [ ] AC-012 — A new adopter following only `README.md` → `.ai/setup.md` → `bootstrap.sh` (no other docs) reaches a state where Claude Code can invoke any of the 12 SDLC skills by name. Verified by an integration walkthrough on a fresh clone before this spec moves to completed.

## Risks & constraints

- **Symlink portability.** Windows without admin privileges and some filesystem types don't support symlinks. Mitigation: detect at runtime, fall back to copy with a clear warning. The fallback degrades correctness (skill updates require re-bootstrap) but not functionality.
- **README simplification risks losing context** for advanced users who want depth. Mitigation: link to `skills.md`, `skill-architecture.md`, `playbook.md` for depth; the trimmed table doesn't remove the docs, it stops front-loading them.
- **`playbook.md` staleness** is not addressed by this spec. It's noted in scope as out-of-scope; readers will encounter the older phase-based model until a follow-up spec or until INI-002 Phase 2 addresses it.
- **Bootstrap idempotency** means re-running on a partially-set-up repo must not destroy state. Mitigation: check before creating; do not overwrite existing files.
- **High-gear's existing setup** uses `setup-sdlc.sh` and symlinks. The bootstrap.sh changes don't affect high-gear. New consumers will use the upstream bootstrap.

## Migration

### Current state

- `bootstrap.sh` exists but is broken (wrong source path, wrong target convention, missing baselines/initiatives).
- Reference docs (`README.md`, `skills.md`, `skill-architecture.md`, `.ai/setup.md`) describe the pre-SPEC-001 model.
- `.ai/skills/` and `.claude/skills/` both exist in the upstream repo as separate directories with identical content (transition artifact).

### Target state

- `bootstrap.sh` is functional and idempotent.
- Reference docs reflect the post-SPEC-001/002 state.
- New repos get `.claude/skills/` as a symlink to `.ai/skills/` (or copy on platforms without symlink support).
- Upstream repo can also have its duplicate `.claude/skills/` directory replaced by a symlink (a small follow-up cleanup task in the decomposition).

### Migration strategy

1. Land `templates/initiatives.md` first (zero dependencies; enables the bootstrap.sh change).
2. Land the docs refresh (README, skills.md, skill-architecture.md, setup.md) — parallel-safe, no runtime impact.
3. Land the bootstrap.sh rewrite last so the docs accurately describe what it does.
4. As a follow-up bookkeeping task: replace the upstream repo's own duplicate `.claude/skills/` directory with a symlink to `.ai/skills/`.

### Rollback plan

- Each doc change is independently revertable.
- `bootstrap.sh` rewrite is a single-file change; revert restores the broken-but-known behavior.
- The symlink/copy is the only runtime change; reverting is `rm .claude/skills && cp -r .ai/skills .claude/skills` or vice versa.
- No data migration required.
