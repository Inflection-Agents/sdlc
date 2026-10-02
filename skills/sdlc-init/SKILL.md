---
name: sdlc-init
description: Use when adopting the SDLC framework in a repo for the first time — "set up the SDLC", "initialise the SDLC", "adopt the SDLC here", or immediately after installing the sdlc plugin. Scaffolds the repo-local half, then interviews for this repo's real review constraints and proves each one against the actual tree before writing it.
---

# SDLC init

Bring a repo onto the SDLC. Three phases, in order, and the third is what stops the
second from producing confident nonsense.

**Never clobber.** Every file is written only if absent. An adopter re-running this
after an upgrade must not lose a single edit. Report what you skipped, by name.

## Why there is a payload at all

A plugin cannot create directories in someone's repo, and a GitHub Actions runner
checks out the repo rather than the plugin cache. So the parts CI reads, and the parts
the adopter edits, are physically copied. Everything else (skills, agents, hooks) stays
in the plugin and updates on its own.

---

## Phase 1 — Scaffold

**On a repo that is already on layout 1** (it has `.ai/` or `scripts/sdlc/` and no
`.sdlc/config.yaml`), stop: that repo is migrated by `/sdlc-sync`, not initialized.

Install the layout-2 payload (ADR-008) with the plugin's installer:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/install-payload.mjs" --root .
```

It copies `${CLAUDE_PLUGIN_ROOT}/init-payload/` into the repo root, renames each
`*.stub.*` file, and never overwrites a file that exists:

| Lands at | Note |
| --- | --- |
| `.sdlc/config.yaml` | from the stub: `layout: 2`, empty `workspaces`, `domain_routing`, `extensions` and `scan.allow`. Schema: `skills/sdlc-config-schema.md`. |
| `.sdlc/review-constraints.yaml` | from the stub. Phase 2 fills it. |
| `.sdlc/state-machine.yaml` | framework-owned; every `/sdlc-sync` replaces it. Do not edit it: routing and the adopter's own phases go in `config.yaml`. |
| `.sdlc/scripts/` | the validators CI runs, with `lib/`. |
| `.sdlc/templates/`, `.sdlc/contracts/` | templates, and the review primitives and envelope schema the gate grades against. |
| `.github/workflows/*.yml` | skip if the repo uses different CI, and say so. |
| `specs/adrs/`, `specs/bugs/`, `specs/tasks/` | the empty tree the framework expects. |

Five root files are merged, not copied, when they already exist:

- `AGENTS.md` gets the SDLC project-context block between `<!-- BEGIN SDLC -->` and
  `<!-- END SDLC -->`, after everything already there.
- `CLAUDE.md` gets the line `@AGENTS.md`.
- `.ignore` gets `!.sdlc/` (ripgrep skips hidden directories, so without it the SDLC files
  drop out of agent search) and `specs/archive/`.
- `.gitignore` gets the hooks' per-session marker glob and the bypass-log exception.
- `.gitattributes` gets the LF rules. The hooks and validators are shell and `.mjs`, and a
  CRLF checkout parses several of them to zero rows while every gate still reports green.

Each line goes in only when the file lacks it, and existing content is never rewritten.
Report what was created, kept and appended, by name. The installer prints all three.

**If the repo already has SDLC hooks wired in `.claude/settings.json`, offer to remove
that block.** Plugin hooks MERGE with project hooks rather than override them, so a repo
that ran `bootstrap.sh` and then installed the plugin runs every hook twice. That is not
cosmetic: the goal leash counts its own block lines, so a double-wired repo spends
`GOAL_MAX_BLOCKS` at twice the rate and the leash silently becomes half as long. Say
what you found, and let the adopter choose which path they are on.

**Idempotency is the acceptance criterion.** Running init twice must leave the repo
exactly as the first run left it, with every file reported as kept. Verify it rather
than assuming: run the installer again, and `git status --porcelain` must print the same
lines it printed after the first run.

## Phase 2 — Interview

Generate `.sdlc/review-constraints.yaml` from what the adopter tells you. Ask about:

1. **Workspaces.** What are the top-level units — apps, packages, services? Their real
   paths, not their names.
2. **Layer boundaries.** Is there a rule about what may import or read what? A data
   layer that must not reach upward, a pure core that must not do I/O.
3. **Security surfaces.** Which paths hold auth, sessions, permissions, migrations,
   credentials? These route to `security-reviewer`.
4. **Design surfaces.** Which paths render UI? These route to `design-fidelity-reviewer`
   and need the adopter's own browser tooling before that agent does anything.
5. **Anything already written down.** An existing ADR, a CONTRIBUTING rule, a lint rule
   with a comment explaining itself — those are constraints already, and transcribing
   one beats inventing one.

**Generate from the answers only.** Do not infer a constraint nobody stated. A law the
adopter did not ask for is worse than no law: it produces findings they cannot act on,
and it teaches them to ignore the reviewer.

**Fill the project context from the same answers.** The interview already asks for
workspaces, paths and stack. Write them in two places:

- `.sdlc/config.yaml` `workspaces`: one entry per workspace with `name`, `path`, `package`,
  `stack`, `test`, `build`, `agent_executable` (`yes`, `caution` or `human`) and `skills`.
  Rule 8 of `validate-guide.mjs`, the `Run by:` handling and the domain-skill routing read it.
- The SDLC block in `AGENTS.md`: what the product is, the layout, import boundaries,
  workspace interfaces and conventions. Keep the block within 16 KiB, which is half of
  what Codex reads from `AGENTS.md` by default. Longer prose goes in `.sdlc/project.md`
  with a one-line pointer in the block, and `paths.project: .sdlc/project.md` in the config.

Leaving either as the stub means the skills that read them resolve to placeholders.

Every row needs a `cite` whose prefix is grounded — `inv:` for a registry invariant,
`std:` for a coding-standards anchor that actually exists, `adr:` for a real ADR.

## Phase 3 — Prove it

Before the file is final, run the framework's own gates against the adopter's tree:

```bash
node .sdlc/scripts/validate-sdlc-config.mjs
node .sdlc/scripts/validate-constraints-registry.mjs
node .sdlc/scripts/check-review-constraint-globs.mjs --enforce
node .sdlc/scripts/validate-state-machine.mjs
```

The first grades the config's shape: workspace paths that exist, eligibility values on
the enum. The second grades the SHAPE of every row you generated — id, lens, check, a
`cite` whose prefix a reviewer can actually ground, a severity on the ladder. The third
grades whether each glob resolves against their real tree. Together they are the proof;
none alone is.

Do NOT substitute `node --test` here. The framework's test files grade the FRAMEWORK's
corpus and do not travel to an adopting repo, and `node --test` exits 0 on an unmatched
glob — so a Phase 3 built on it reports success having verified nothing. That was the
first version of this step.

- **A glob that resolves to nothing** is a rule that will never fire. Fix it with the
  adopter or drop the row. Do not leave it and move on.
- **A `cite` with an ungrounded prefix** is a finding a reviewer cannot ground. Same.
- **An `agent:` naming no shipped agent** cannot be dispatched. Same.

Read the OUTPUT of each command, not just its exit code. Several of these fail open by
design, and a silent pass is the failure mode this framework has been bitten by
repeatedly.

**What this does not catch:** a constraint that resolves cleanly and still encodes the
wrong rule. No gate can. That is why Phase 2 asks rather than infers, and why you
should tell the adopter plainly that the rows are theirs to review.

---

## Finish

Report:

- What was created, and what was skipped because it already existed.
- The constraint rows written, each with the answer it came from.
- Anything Phase 3 rejected and why.
- The next step: `/sdlc-sync` after a plugin update, and their first spec via
  `spec-authoring`.
