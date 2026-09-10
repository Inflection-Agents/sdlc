# Releasing

## The one rule

**A user receives an update only when `version` in `.claude-plugin/plugin.json` changes.**

Push a hundred commits without bumping it and every installed copy stays exactly where
it was. This is by design, and it is the whole reason the framework became a plugin:
before, `bootstrap.sh` was copy-once and an adopting repo received nothing, ever.

## What a bump costs an adopter

Their plugin cache is re-extracted. **Any local modification to a plugin-shipped file
is destroyed.** That is why nothing an adopter edits ships in the plugin — the registry,
`domain_routing`, `.ai/project.md` and `specs/` are all repo-local, and `/sdlc:sync` is
forbidden from touching them.

If you ever find yourself wanting to ship an editable file, that is the signal it
belongs in `init-payload/` instead.

## Which bump

| Change | Bump | Why |
| --- | --- | --- |
| A skill's prose, an agent's wording, a hook's message | patch | Behaviour under the same contract |
| A new skill, agent, gate, or validator | minor | Adopters gain something; nothing they have breaks |
| `review-primitives.md`, `review-envelope.schema.json`, or the state-machine phase spine | **minor at least, with a note** | These are contracts. A repo's specs, task files and review envelopes are written against them, so a change ripples into artifacts the adopter owns and cannot regenerate. |
| Removing or renaming a skill, agent, or lens | major | A registry `agent:` or a skill invocation in their docs stops resolving |

A contract change is the one to slow down on. Everything else an adopter can absorb
without reading the diff.

## Before tagging

```bash
node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs
node scripts/sdlc/validate-plugin-manifest.mjs
node scripts/sdlc/validate-state-machine.mjs
node scripts/sdlc/gen-handoffs.mjs --check
node scripts/sdlc/archive-specs.mjs --check
node scripts/sdlc/check-stale-citations.mjs
```

Then confirm by hand:

- `init-payload/` carries no absolute path and no reference to this repo's own specs.
- The payload's validators match `scripts/sdlc/` — a drifted payload ships an adopter a
  gate this repo no longer runs.
- `.claude-plugin/plugin.json` version differs from the last release.

## The dogfooding check

This repo runs the framework on itself. Before releasing, its own gates must be green
**against its own corpus**, not just against fixtures. A gate the reference cannot pass
is a gate no adopter should be asked to run.
