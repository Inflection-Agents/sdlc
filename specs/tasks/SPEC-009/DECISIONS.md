# SPEC-009 — decision log

One entry per guide step, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION`
heading goes in the moment it happens, not batched at the end.

This log is what makes the narrow escalation bar safe. `spec-execution` escalates on four
checkable triggers and decides everything else; without a written record that trade is
invisible, and a reader cannot reconstruct why a run diverged. Entries are append-only and
in chronological order.

---

## EXECUTIVE DECISION — SPEC-003 is superseded, not completed

**Date:** 2026-10-02
**Question:** D1 says SPEC-003 is closed through `spec-completion` before S1. The step PRs of SPEC-003 merged into `feat/spec-003`, which never merged to `main`, so no success criterion holds on `main`.
**Decided:** set SPEC-003 to `superseded`, with a changelog entry naming the stranded branch and the work that replaced each criterion. `spec-completion` names `superseded` as the status for a spec that another spec replaces.
**Why:** `completed` would claim criteria that are not true on `main`. `deprecated` would say the work was abandoned, but later work replaced it.
**Reversal path:** set SPEC-003 back to `active` and restore its task tree from `specs/archive/`.

---

## EXECUTIVE DECISION — no session task-list tool

**Date:** 2026-10-02
**Question:** the skill asks for a visible task list through a todo surface, and this session has none.
**Decided:** step status lives in `_index.yaml`, in this log, and in a status line the executor reports after each step merges.
**Why:** those three surfaces already have to agree, and none of them can drift from a todo list that does not exist.
**Reversal path:** none needed.

`archive-specs.mjs --dry-run` reports nothing to archive. Denylist clause 1 holds SPEC-003 in the live corpus: `skills/spec-schema.md:236` and `skills/intent-triage/SKILL.md:103` use "SPEC-003" as example text. This is the false positive the backlog item "Denylist clause 1 pins a consuming repo's specs on the framework's own example numbers" describes, and it is left alone here.

---

## EXECUTIVE DECISION — guide change: S1 adds a YAML subset parser and registers the config schema doc

**Date:** 2026-10-02
**Question:** S1's `Changes:` did not list a parser, but `config.yaml` is nested (maps inside lists, flow lists), and every existing script hand-parses only the slice of YAML it needs. `validate-state-machine.mjs` also counts every `skills/*.md` file as a skill, so the new `skills/sdlc-config-schema.md` fails it unless the doc is registered.
**Decided:** add `scripts/sdlc/lib/mini-yaml.mjs` and its test, a dependency-free subset parser and emitter that throws on any shape it does not support. Add `sdlc-config-schema` under `exempt:` in both state machines, next to `guide-schema`. S1's `Changes:` now lists these files.
**Why:** a dependency would break the bare-`node` CI the payload relies on. A fifth hand-rolled parser would be one more reader that disagrees with the others. S4 and S6 reuse this one.
**Reversal path:** delete the two files and the two `exempt:` lines.

---

## S1 — Resolver, legacy map, runner and config validator

**Merged:** PR #60
**What changed:** added `lib/sdlc-paths.mjs` (`sdlcPaths`, `resolveRoot`, `readConfig`, `detectLayout`, `takeRootArg`), `lib/legacy-map.mjs`, `lib/mini-yaml.mjs`, `run.mjs`, `validate-sdlc-config.mjs`, the fixture builder at `__fixtures__/layouts/build.mjs`, and `skills/sdlc-config-schema.md`.
**Anything a later step must match:** validators take `--root` through `takeRootArg(argv)`. Hooks call `sdlcPaths(root, { quiet: true })`, because they nudge once per session rather than print the stderr line. `pluginRoot()` is `CLAUDE_PLUGIN_ROOT` or the plugin-source repo, and null in an adopter's copy. Tests delete `CLAUDE_PROJECT_DIR` before calling `resolveRoot`, because a Claude session sets it.

---

## EXECUTIVE DECISION — guide change: S2 touches a hook test fixture, the CI test glob and the shared fixture

**Date:** 2026-10-02
**Question:** porting the validators broke two things outside S2's `Changes:`. A hook test copies `reviewer-routing.mjs` into a fixture repo without the `lib/` it now imports, and CI's test step globs `scripts/sdlc/*.test.mjs`, which skips the new `lib/*.test.mjs`.
**Decided:** the hook fixture copies `lib/`. The CI test step adds `scripts/sdlc/lib/*.test.mjs`. The shared fixture machine gains the fields a valid phase needs, so the `--root` test can run `validate-state-machine.mjs` against it.
**Why:** without the fixture copy, the hook test stays red for a reason unrelated to the hooks. Without the glob, the resolver's own tests never run in CI.
**Reversal path:** revert the three hunks.
