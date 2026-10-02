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

---

## S2 — Validators resolve through the module

**Merged:** PR #61
**What changed:** every payload validator takes `--root` and resolves its paths through `sdlcPaths`. The `init-payload/scripts/sdlc/` copies include `lib/`.
**Anything a later step must match:** `check-stale-citations.mjs` exports `blastRadius(rel, alsoLoaded)` and `classify(files, superseded, alsoLoaded)`. `validate-state-machine.mjs` still reads `domain_routing` from the machine file; S4 moves that read to `loadMachine`.

---

## EXECUTIVE DECISION — guide change: S3 adds the nudge marker to this repo's .gitignore

**Date:** 2026-10-02
**Question:** the once-per-session nudge writes `.claude/.sdlc-layout-nudge-<session>`, and this repo, which stays on layout 1 until S10, lists each hook marker glob in `.gitignore` by name.
**Decided:** append `.claude/.sdlc-layout-nudge-*` to `.gitignore` in S3. The payload's broader `.claude/.sdlc-*` line lands in S5.
**Why:** without it, every session in this repo leaves an untracked file behind.
**Reversal path:** delete the line.

---

## S3 — Hooks resolve through the module

**Merged:** PR #62
**What changed:** the three hooks import `sdlc-paths.mjs` (and the edit gate also imports `legacy-map.mjs`) from the plugin's `scripts/sdlc/lib/`, or from `lib/` beside a repo-local hook. The root walk uses `isSdlcRoot`. The edit gate reads constraints through `sdlcPaths(root).scripts` and `.constraints`. The prompt hook nudges once per session on layout 1.
**Anything a later step must match:** S5's `bootstrap.sh` must copy `scripts/sdlc/lib/` to `.claude/hooks/lib/` next to the hooks it installs. The nudge marker is `.claude/.sdlc-layout-nudge-<session>`.

---

## S4 — State-machine loader, extensions, domain_routing and the YAML fix

**Merged:** PR #63
**What changed:** added `loadMachine(root, { machineFile })` to `lib/sdlc-paths.mjs`. Every machine reader now goes through it, and each one's private parser is gone. The line-99 quote is escaped in both machines. The payload machine no longer carries `domain_routing:`.
**Anything a later step must match:** `loadMachine` throws on a layout-2 machine that has a `domain_routing:` key, even an empty one, so S6's migration must cut the whole block out of the machine. `gen-handoffs.mjs` names the generator through `GENERATOR_LABEL`, still `scripts/sdlc/gen-handoffs.mjs`. S10 switches it to the `${CLAUDE_PLUGIN_ROOT}` form when it regenerates the footers.

---

## EXECUTIVE DECISION — guide change: S5 adds one payload installer shared by sdlc-init and bootstrap.sh

**Date:** 2026-10-02
**Question:** the spec has `/sdlc-init` and `bootstrap.sh` install the same payload, with the same never-overwrite copies, the same root-file appends and the same `AGENTS.md` block insert. Written once as skill instructions and once in bash, those would drift, and AC-009 (exactly three new directories, a second run writes nothing, existing root files keep every byte) would only be checkable by hand.
**Decided:** add `scripts/sdlc/install-payload.mjs` (plugin-only) and its test. `sdlc-init` Phase 1 runs it, and `bootstrap.sh` runs it with `--contracts-in-skills`. S6's migration reuses its `appendLines`, `insertAgentsBlock` and `ensureClaudeImport`.
**Why:** one implementation makes AC-009 a test, and makes the migration's merges match init's exactly.
**Reversal path:** inline the copy in both callers and delete the two files.

---

## S5 — Layout-2 payload, sdlc-init and bootstrap.sh

**Merged:** PR #64
**What changed:** `init-payload/` mirrors the layout-2 tree. `install-payload.mjs` installs it for `/sdlc-init` and `bootstrap.sh`. `bootstrap.sh` refuses to run on a layout-1 repo.
**Anything a later step must match:** the payload's validators live at `init-payload/.sdlc/scripts/`, and the parity test compares them with `scripts/sdlc/`. S6 adds `scan-legacy-paths.mjs` and a CI step for it in `init-payload/.github/workflows/sdlc-validate.yml`. The workflow-script test requires each script the workflow names to be in the payload. The block stub is `init-payload/AGENTS.sdlc-block.md`.

---

## EXECUTIVE DECISION — guide change: S6 touches the YAML emitter, the parity test and two workflows

**Date:** 2026-10-02
**Question:** the migration surfaced four needs outside S6's `Changes:`:
- `emitYaml` wrote `package: @fx/web` unquoted, and a plain YAML scalar cannot start with `@`.
- The parity test required every `lib/` file in the payload, including the plugin-only manifest.
- The payload's CI had no step running the new scan.
- This repo's CI checkout is shallow, so the manifest's `--check` cannot read history there.
**Decided:**
- quote a scalar that starts with an indicator character;
- limit the `lib/` parity check to `.mjs` modules;
- add a `scan-legacy-paths.mjs` step to the payload's `sdlc-validate.yml`;
- set `fetch-depth: 0` in this repo's checkout;
- add `lib/legacy-map.test.mjs` to pin the matching rules.
**Why:** without each fix, either the migration writes a config that does not parse, or a gate the spec relies on never runs.
**Reversal path:** revert those hunks.

---

## EXECUTIVE DECISION — the scan recovers the migration's moves from git

**Date:** 2026-10-02
**Question:** the `'..'`-join check applies to a file whose directory depth changed in the move, but the owner reruns `scan-legacy-paths.mjs` standalone while fixing hits, after the migration commit, and at that point no move map is passed in.
**Decided:** when the caller passes no move map, `scanRepo` reads the renames of the commit titled `sdlc: migrate to layout 2` in the branch's history. Tests and fixtures stay exempt from every form except that `'..'`-join check on a test that moved to a new depth.
**Why:** the check then gives the same answer during `--apply` and on every later scan of the branch.
**Reversal path:** pass moves explicitly and drop `movesFromHistory`.
