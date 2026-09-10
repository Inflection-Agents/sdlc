---
name: sdlc-sync
description: Use after updating the sdlc plugin to refresh the repo-local half — "sync the SDLC", "update the SDLC scripts", "pull the new validators", or when a plugin update mentions new gates. Copies new and updated validators, workflows and templates into the repo without touching any configuration.
---

# SDLC sync

A plugin update refreshes the skills, agents and hooks on its own. It cannot touch the
repo-local half — the validators CI runs, the workflows, the templates — because a
plugin cannot write outside its own directory. This is that half.

## What it will and will not touch

| | |
| --- | --- |
| **Refreshes** | `scripts/sdlc/*.mjs`, `.github/workflows/*.yml`, `templates/*.md` |
| **Adds if absent** | `.ignore`, `specs/sdlc-state-machine.yaml` |
| **Never touches** | `.ai/sdlc/review-constraints.yaml`, `domain_routing`, `.ai/project.md`, anything under `specs/` |

That last row is the whole point. Those files hold the adopting repo's own decisions,
and an update that overwrote them would destroy the adoption it is meant to serve.

## Procedure

1. **Show the diff before writing anything.** For each payload file that differs from
   its counterpart in the repo, show what changes. An adopter who has locally edited a
   validator needs to see that before it is replaced, not after.

2. **Copy the engine-side files.** Validators, workflows and templates are framework
   artifacts — refresh them. If the adopter has modified one, say so explicitly and let
   them decide; do not silently overwrite a local fix.

3. **Add, never replace, the seeded files.** `.ignore` gets appended to if it exists.
   `sdlc-state-machine.yaml` is only written when absent, because `domain_routing`
   inside it is the adopter's.

4. **Run the gates afterwards.** A new validator may grade something the repo has never
   been graded on:

    ```bash
    node --test scripts/sdlc/*.test.mjs
    node scripts/sdlc/validate-state-machine.mjs
    node scripts/sdlc/check-review-constraint-globs.mjs
    ```

    Read the output. A new gate going red on first run is usually the gate working, not
    the sync failing — report what it found rather than reverting it.

5. **Report.** What was refreshed, what was added, what was skipped and why, and
   anything a new gate now flags.

## If a new gate fails

Say what it found and leave it failing. Weakening a gate to make a sync look clean is
how a repo ends up with checks that pass and catch nothing.
