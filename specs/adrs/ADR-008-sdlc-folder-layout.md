---
id: ADR-008
title: "Adopter repos keep SDLC files under .sdlc/, project context in root AGENTS.md, and resolve paths through one module"
status: accepted
spec: SPEC-009
date: 2026-10-01
author: franklin
superseded_by:
---

## Context

`/sdlc-init` writes seven root entries into an adopter repo: `specs/`, `templates/`,
`scripts/sdlc/`, `.ai/`, `.ignore`, `.gitattributes` and `.github/workflows/`
(`skills/sdlc-init/SKILL.md`, Phase 1 table). `.ai/` follows no convention that tools or people
already know. Two conventions cover what it does:

- Root `AGENTS.md` is the cross-tool file for project context. Codex, Cursor, Copilot, Gemini CLI
  and Jules read it, and Claude Code reads `CLAUDE.md`, which can import it with `@AGENTS.md`.
- A dot-folder named after the tool holds that tool's own config (`.github/`, `.husky/`,
  `.changeset/`, `.devcontainer/`).

The framework-owned state machine also holds adopter data. That data is `domain_routing` in every
repo, and in forked repos it also includes local phases and exempt skills. So `/sdlc-sync` cannot
refresh the state machine without destroying adopter data. Every validator and hook names layout
paths as literals, so the layout cannot change in one place.

SPEC-009 Design considered three approaches:

- **A:** consolidate the layout and stop copying in one spec.
- **B:** move the copies under `.sdlc/` and leave the state machine as it is.
- **C:** consolidate the layout now, and stop copying in a second spec.

## Decision

1. **Everything the framework puts in an adopter repo lives under `.sdlc/`.** The exceptions are
   these, kept for the reasons given:
   - `specs/` holds the adopter's own artifacts.
   - `.github/workflows/` and `.gitattributes` are read by GitHub and git only at those paths.
   - The root `.ignore` holds `!.sdlc/`, because ripgrep and agent search skip hidden directories by
     default.
   - The root `.gitignore` holds the hooks' per-session marker glob, so markers never make a tree
     look dirty, plus a negation that keeps the edit-gate bypass log visible.
2. **Project context lives in a marked block in root `AGENTS.md` when it fits 16 KiB.** That
   budget is half of what Codex reads from `AGENTS.md` by default. Longer prose moves to
   `.sdlc/project.md`, and the block points at it. `CLAUDE.md` imports `AGENTS.md`. The structured
   part lives in `.sdlc/config.yaml`: workspaces with their test and build commands, eligibility and
   domain skills.
3. **Adopter data leaves the state machine.** `domain_routing`, local phases and local exempt
   entries move to `.sdlc/config.yaml`, and the last two go under `extensions`. One loader merges
   them at read time. The state machine becomes framework-owned, and every sync refreshes it.
4. **Every validator and hook resolves paths through `scripts/sdlc/lib/sdlc-paths.mjs`.** The
   resolver reads `config.yaml` overrides, then layout-2 defaults, then the layout-1 paths in
   `legacy-map.mjs` with a deprecation line.
5. **`/sdlc-sync` migrates every adopter shape fully.** It works on a `chore/sdlc-layout-v2` branch
   and makes one migration commit. Scan hits are then fixed in further commits until the scan is
   clean and the gate probes match. It rewrites paths in every live tracked file and leaves closed
   history and append-only logs as written.

   A framework file whose bytes match a released payload is replaced with the new copy. A modified
   one is relocated and kept. Local hooks stay in `.claude/hooks/`, and only their path strings are
   rewritten.
6. **Approach C.** This ADR covers the layout. Stopping the copying is SPEC-010's decision.
7. **Skills run repo-local scripts through one runner** (`scripts/sdlc/run.mjs`), so a skill
   command resolves on both layouts.

## Consequences

- A fresh adopter gets 3 new top-level directories (`.github/`, `.sdlc/`, `specs/`) in place of 5,
  and every SDLC config file sits in one folder that `git log .sdlc` can track.
- The state machine refreshes on every sync, so a phase-spine change no longer needs manual edits
  like the ones 0.3.0 required (`docs/RELEASING.md`, 0.3.0 row).
- A forked repo's modified framework phases are replaced by the plugin's. Any local behavior it
  needs has to live in an `extensions` phase.
- `/sdlc-sync` now edits live `specs/` content and live ADRs, but only to rewrite paths. That
  narrows a promise the skill used to make without exception.
- The layout-1 fallback stays until a later release removes it. Until then the layout-1 paths live in
  one file, `legacy-map.mjs`, and every consumer that needs one reads it from there.
- Forked repos keep their drifted skills and scripts. The migration lists each one that shadows a
  plugin copy, and de-forking stays a per-file decision.
