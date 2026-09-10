# Plugin distribution — delivery record

Branch `sdlc/plugin-distribution`. Tests 176 → 194, every gate green.
**Not merged; left open for review.**

Design: [`2026-09-09-plugin-distribution-design.md`](2026-09-09-plugin-distribution-design.md)
Plan: [`2026-09-09-plugin-distribution-implementation.md`](2026-09-09-plugin-distribution-implementation.md)

---

## What shipped

| Phase | Delivered |
| --- | --- |
| 0 | Registry moved to `.ai/sdlc/`, out of plugin-owned space; hooks resolve the repo before their own location |
| 1 | `skills/`, `agents/` real at the root with symlinks back; the stale-citation gate taught the new locations; 29 live references migrated |
| 2 | `hooks/` moved; `.claude-plugin/plugin.json`; `hooks/hooks.json` on `${CLAUDE_PLUGIN_ROOT}`; a manifest gate |
| 3 | `init-payload/`; `/sdlc:init` (scaffold → interview → prove); `/sdlc:sync` |
| 4 | README install path, LICENSE, `marketplace.json`, `docs/RELEASING.md`; bootstrap points at the plugin |

## Success criteria, mapped to evidence

| Criterion | Evidence |
| --- | --- |
| An adopter receives engine updates automatically | Plugin ships skills, agents, hooks; `RELEASING.md` states version-bump-or-nothing |
| An adopter's own configuration survives every update | Registry, `domain_routing`, `.ai/project.md` and `specs/` are repo-local; `/sdlc:sync` forbidden from touching them |
| The restructure breaks nothing | 44 immutable references still resolve through the symlinks; `git ls-files -s` shows mode `120000` on all four |
| A fresh clone works | Cloned the branch to a scratch dir: all four symlinks reconstructed, 194/194 tests pass |
| **The payload works where it ships** | Built a scratch consuming repo from `init-payload/` and ran the shipped workflow's steps verbatim under bash, each in its own shell as Actions runs them — all pass |
| The manifest cannot dangle | `validate-plugin-manifest.mjs` in CI; verified to go red on a ghost hook path |
| The payload cannot drift | Byte-identity test against `scripts/sdlc/`; verified to go red on a one-line change |

## What the consuming-repo test caught

Building a real adopting repo, rather than reasoning about one, found three defects — all
the same class that produced the worst findings in the previous piece of work here: a
feature proven at its own site whose propagation site was never checked.

1. **`validate-state-machine.mjs` hard-failed on day one.** It resolves owner skills under
   `skills/`, and a consuming repo's skills live in the plugin cache — a plugin cannot
   write a directory into someone's repo. The adopter's CI runs that validator, so every
   adopter would have been red immediately.
2. **`validate-plugin-manifest.mjs` shipped in the payload.** A consuming repo consumes a
   plugin; it does not ship one, so there was no manifest to grade.
3. **The payload shipped the framework's OWN CI workflow verbatim.** It ran
   `node --test` on globs a consuming repo cannot match (node passes the literal
   pattern and fails) and called `validate-plugin-manifest.mjs`, which the payload
   correctly does not ship. An adopter's very first PR would have been red on two
   steps. The payload now carries its own workflow, and every step of it was run in a
   scratch consuming repo under bash.
4. **`reviewer-routing --list` printed nothing** against the empty registry an adopter
   starts with — indistinguishable from the broken read it exists to reveal.

## What the independent review caught

A doctrine reviewer graded the branch and found three blockers the consuming-repo test
had not, because it exercised the payload's CONTENTS rather than the artifacts that
actually run:

1. **The payload workflow invoked a validator the payload does not ship.** Fixed, and
   closed with a gate — every `node scripts/sdlc/*.mjs` in a payload workflow must
   resolve to a file in the payload. Verified to bite.
2. **`/sdlc:init` Phase 3 verified nothing.** It ran `node --test` on a glob no adopting
   repo matches, and `node --test` exits 0 on an unmatched glob — so the step that
   justifies the entire generated-config interview reported success having checked
   nothing. Replaced with `validate-constraints-registry.mjs`, which grades row shape
   and groundable citations and fails loudly on an empty or absent registry. Shipping
   the framework's own test files instead was tried and reverted: six of them fail in a
   consuming repo because they grade THIS repo's corpus.
3. **`.ai/project.md` was never created**, while thirty plugin-shipped skills read it.
   `project.stub.md` now ships and the interview fills it from answers it already has.

Also fixed: `bootstrap.sh` gained the `--legacy` flag Task 13 specified rather than
just an advisory echo; a plugin-shipped skill named `.claude/hooks/stop-handoff.mjs`, a
path that does not exist in an adopter's tree; and the README's lower half still
described the world bootstrap built.

## Disclosed, not fixed

1. **The `/sdlc:init` interview can generate a rule that resolves cleanly and is still
   wrong.** Phase 3 proves every glob resolves, every `cite` is grounded and every `agent:`
   is dispatchable — but no gate can tell whether the rule itself is correct. Mitigated by
   asking rather than inferring, and by saying so in the skill.
2. **`/sdlc:init` and `/sdlc:sync` are unexecuted.** They are skill prose, and nothing in a
   local session installs a plugin and runs them end to end. The payload they copy is
   verified; the copying itself is not.
3. **`hooks.json` is unproven.** No local session loads a plugin manifest. It is checked
   statically — every command path resolves, `${CLAUDE_PLUGIN_ROOT}` form, event names
   mirroring `.claude/settings.json`.

## Known limits

- **Plugin hooks merge with project hooks rather than override.** A repo that ran
  `bootstrap.sh` and then installs the plugin gets both wired. Both are advisory or
  fail-open, so the effect is duplicate warnings rather than double-blocking — but it is
  untested, and the honest answer is to pick one path.
- **This repo had no `.gitattributes` while telling adopters to add one.** Fixed: the
  file now exists here and in the payload, pinning LF for `.sh` and `.mjs`. The framework
  had already been bitten by a CRLF registry parsing to zero rows with every gate green.
- **44 references under `specs/` and `docs/plans/` still name `.ai/skills`.** Correct:
  they are completed specs and shipped plans, immutable here, describing the world as it
  was. The symlink keeps them resolving.
