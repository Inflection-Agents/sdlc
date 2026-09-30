# Releasing

## The one rule

**A user receives an update only when `version` in `.claude-plugin/plugin.json` changes.**

Push a hundred commits without bumping it and every installed copy stays exactly where
it was. This is by design, and it is the whole reason the framework became a plugin:
before, `bootstrap.sh` was copy-once and an adopting repo received nothing, ever.

## What a bump costs an adopter

Their plugin cache is re-extracted. **Any local modification to a plugin-shipped file
is destroyed.** That is why nothing an adopter edits ships in the plugin — the registry,
`domain_routing`, `.ai/project.md` and `specs/` are all repo-local, and `/sdlc-sync` is
forbidden from touching them.

If you ever find yourself wanting to ship an editable file, that is the signal it
belongs in `init-payload/` instead.

## Which bump

| Change | Bump | Why |
| --- | --- | --- |
| A skill's prose, an agent's wording, a hook's message | patch | Behaviour under the same contract |
| A new skill, agent, gate, or validator | minor | Adopters gain something; nothing they have breaks |
| `review-primitives.md`, `review-envelope.schema.json`, or the state-machine phase spine | **minor at least, with a note** | These are contracts. A repo's specs, delivery guides and review envelopes are written against them, so a change ripples into artifacts the adopter owns and cannot regenerate. |
| Removing or renaming a skill, agent, or lens | major | A registry `agent:` or a skill invocation in their docs stops resolving |

**Before `1.0.0`, a change this table classes as major bumps the minor version** (`0.x.0`), and a
minor-class change bumps the patch. The `0.2.0` breaking change below set that precedent; `0.3.0`
writes it down.

**Shipped contract changes:**

| Version | Change | Impact on adopters |
| --- | --- | --- |
| `0.2.0` | `reviewed_by` added to `review-envelope.schema.json`, OPTIONAL | **Breaking for stored envelopes.** An envelope carrying a `blocker` or `major` must declare a dispatched reviewer; absent is read as `inline` and rejected. So a 0.1.0 envelope that carries a blocking finding — which is every envelope anyone kept — now exits 3 on re-validation. Add `reviewed_by` or re-grade. Nits and suggestions are unaffected. **The field is self-declared**, so this catches the honest omission, not a determined self-grader: an inline pass can write an agent value. The real enforcement is the reviewer agents' absent `Edit`/`Write` plus the dispatch discipline in the calling skills. |
| `0.3.0` | ADR-007 (SPEC-008): the `task-decomposition` skill and phase are removed, along with `skills/task-schema.md` and `templates/task.md`. A spec is planned by a delivery guide (`specs/tasks/SPEC-NNN/GUIDE.md`) approved with the spec; `_index.yaml` lists `steps:` and `decisions:` instead of `tasks:`; spec ACs and SCs require ids (`AC-001:`, `SC-1:`; the older `AC-NNN —` form is accepted; adding an id is a Cosmetic id-only edit); an approved guide needs a `KICKOFF.md` of at most 3,800 characters (`validate-guide.mjs` rule 9). | **Breaking for in-flight decomposed specs.** Four actions, in order: (1) run `/sdlc-sync` to pull `validate-guide.mjs`, the retired-id-aware `validate-phase-memory.mjs`, `templates/guide.md`, `templates/kickoff.md` and the new `sdlc-validate.yml` step, then delete `templates/task.md` and copy `init-payload/.ai/skills/review-primitives.md` over `.ai/skills/review-primitives.md` (sync neither deletes files nor refreshes that copy); (2) in your own `specs/sdlc-state-machine.yaml` (which sync never overwrites), replace the `phases:` and `exempt:` blocks with those in `init-payload/sdlc-state-machine.yaml`, add its `retired_phases:` list, keep your `domain_routing:`, and run `validate-state-machine.mjs`; (3) for each decomposed spec still in flight, either finish it on `0.2.x`, or make any id-only edits and run "write the guide for SPEC-NNN", pointing each step's `Notes:` at the existing task brief; (4) closed specs need nothing: an `_index.yaml` naming `task-decomposition` stays valid with a warning. |

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

**Then actually install it.** Every blocker in the first review round — a string
`author` that blocked installation, a `hooks.json` whose events sat at the top level so
zero hooks fired, a README naming a slash command that does not exist — would have been
caught by these three lines, and none was caught by any static check:

```bash
claude plugin marketplace add .
claude plugin install sdlc@inflection-agents
claude plugin list          # must read: enabled, Hooks (4), Skills (n)
```

A manifest that parses is not a manifest that loads.

Then confirm by hand:

- `init-payload/` carries no absolute path and no path into this repo's `specs/` tree.
  (Spec ids appearing in a validator's comments are fine — they explain why a rule
  exists. A `specs/SPEC-…md` PATH is not.)
- The payload's validators match `scripts/sdlc/` — a drifted payload ships an adopter a
  gate this repo no longer runs.
- `.claude-plugin/plugin.json` version differs from the last release.

## The dogfooding check

This repo runs the framework on itself. Before releasing, its own gates must be green
**against its own corpus**, not just against fixtures. A gate the reference cannot pass
is a gate no adopter should be asked to run.
