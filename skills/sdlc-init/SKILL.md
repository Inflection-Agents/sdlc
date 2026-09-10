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
the adopter edits, are physically copied. Everything else — skills, agents, hooks, the
two review contracts — stays in the plugin and updates on its own.

---

## Phase 1 — Scaffold

Copy `${CLAUDE_PLUGIN_ROOT}/init-payload/` into `${CLAUDE_PROJECT_DIR}`:

| From payload | To repo | Note |
| --- | --- | --- |
| `scripts/sdlc/*.mjs` | `scripts/sdlc/` | the validators CI runs |
| `.github/workflows/*.yml` | `.github/workflows/` | skip if the repo uses different CI; say so |
| `templates/*.md` | `templates/` | |
| `.ignore` | `.ignore` | **append** if one exists, never overwrite |
| `sdlc-state-machine.yaml` | `specs/` | |
| `.ai/sdlc/review-constraints.stub.yaml` | `.ai/sdlc/review-constraints.yaml` | renamed on copy |

Create the empty tree the framework expects: `specs/`, `specs/adrs/`, `specs/tasks/`,
`specs/bugs/`.

`.gitattributes` gets `* text=auto eol=lf` appended if absent — the hooks and
validators are shell and `.mjs`, and a CRLF checkout parses several of them to zero
rows.

**Idempotency is the acceptance criterion.** Running init twice must leave the repo
byte-identical after the first run and report every file as already present. Verify it
rather than assuming: run it, run it again, `git status` must be clean the second time.

## Phase 2 — Interview

Generate `review-constraints.yaml` from what the adopter tells you. Ask about:

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

Every row needs a `cite` whose prefix is grounded — `inv:` for a registry invariant,
`std:` for a coding-standards anchor that actually exists, `adr:` for a real ADR.

## Phase 3 — Prove it

Before the file is final, run the framework's own gates against the adopter's tree:

```bash
node scripts/sdlc/check-review-constraint-globs.mjs --enforce
node --test scripts/sdlc/*.test.mjs
node scripts/sdlc/validate-state-machine.mjs
```

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
- The next step: `/sdlc:sync` after a plugin update, and their first spec via
  `spec-authoring`.
