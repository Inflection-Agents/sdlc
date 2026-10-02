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

---

## S6 — Migration, scan and released-payload manifest

**Merged:** PR #65
**What changed:** added `migrate-layout.mjs` (plugin-only), `scan-legacy-paths.mjs` (payload with a CI step), `gen-released-payloads.mjs` and `lib/released-payloads.json` (through `89cba06`, covering 0.1.0 to 0.3.0), and the map, rewrite and scan rules in `lib/legacy-map.mjs`. Added the `pluginInit030Repo` and `forkedHighGearRepo` fixtures.
**Anything a later step must match:**
- S9 and S10 must make every file the payload ships scan clean: script and hook comments, the contracts, the state machine's exit-condition text, and the templates. After that, SC-5's fresh-init scan reports 0 hits, and the AC-013 test drops its `shippedByPayload` filter.
- S10's release commit regenerates `released-payloads.json`, which must then cover 0.4.0.
- `migrate-layout.mjs` exports `planMigration`, `applyMigration`, `parseWorkspaceTables` and `cutDomainRouting`. `scan-legacy-paths.mjs` exports `scanRepo` and `movesFromHistory`. S7's probes use them.

---

## S7 — Gate probes

**Merged:** PR #66
**What changed:** added `probe-gates.mjs` (P1 to P8, `probeRev`, `compare`, `--before/--after`) and its test. The forked fixture gained a working, wired local hook and a flat archive. P4 and P6 report `ran: false` where ripgrep is absent, which includes the CI image, so the test asserts on them only when `rg` is installed.
**Anything a later step must match:** S8's sync skill runs `probe-gates.mjs --root . --before <pre-migration commit> --after HEAD` as step 5, and exit 1 there means a gate regressed. `compare()` reads "the same result" for P1 to P5 as no regression: a probe that caught before must still catch after.

---

## EXECUTIVE DECISION — guide change: S8 adds a refresh tool and a workflow role in the manifest

**Date:** 2026-10-02
**Question:** AC-016 and SC-3 need the layout-2 refresh to replace unmodified framework files, ask before replacing modified ones, always refresh the machine, and change only `framework_version` in `config.yaml`. Written as skill prose alone, an agent would carry that out by hand on each run, and SC-3 could not be measured.
**Decided:** add `scripts/sdlc/sync-refresh.mjs` (plugin-only, `--plan` and `--apply [--accept <file>]`) and its test, and have the skill call it. The manifest gains a `workflows/<name>` role, so an unedited older workflow counts as unmodified, and it is regenerated.
**Why:** the classification is mechanical and must match the migration's manifest rule exactly. Owner judgment stays where it belongs, on the diff of each modified file.
**Reversal path:** inline the steps in the skill and drop the role.

---

## S8 — sdlc-sync migrates layout 1 and refreshes layout 2

**Merged:** PR #67
**What changed:** `skills/sdlc-sync/SKILL.md` now has a layout check, the seven migration steps and the refresh procedure. Added `sync-refresh.mjs` and its test. The manifest gained a workflow role.
**Anything a later step must match:** S10's release commit regenerates the manifest. For the SC-3 end-to-end run, use `sync-refresh.mjs` with a payload copy that changes a phase.

---

## S9 — Path references in skills, agents and docs

**Merged:** PR #68
**What changed:** skills, agents, root docs and templates name layout-2 paths. Repo-local commands use the `run.mjs` form, and plugin-only scripts and docs are named under `${CLAUDE_PLUGIN_ROOT}`. Workspace data points at `config.yaml`, and project prose at the `AGENTS.md` block.
**Anything a later step must match:** the generated `## Handoff` footers still name the layout-1 machine path and `scripts/sdlc/gen-handoffs.mjs`. S10 moves the machine, sets `GENERATOR_LABEL` to the `${CLAUDE_PLUGIN_ROOT}` form, and regenerates them. The docs now point at `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md`, `docs/executor-brief.md` and `docs/setup.md`, which S10 creates by moving the `.ai/*.md` files.

---

## EXECUTIVE DECISION — guide change: S10 cleans the shipped text and adds a release-time manifest mode

**Date:** 2026-10-02
**Question:** SC-5 needs shipped code and a fresh init to scan clean, but the comments and usage strings in hooks and scripts, the nudge text, the state machine's exit-condition text and two payload workflow comments still named layout-1 paths. The migration tools needed layout-1 patterns as literals. The manifest could not include the release being made, because its bump commit does not exist until the release is committed.
**Decided:**
- Rewrite that text to layout-2 terms.
- Have `migrate-layout.mjs` and `gen-released-payloads.mjs` take their layout-1 patterns from new `legacy-map.mjs` exports (`LAYOUT1_DIRS`, `isUnder`, `payloadRoleOf`).
- Give the generator a release-time mode: when the working `plugin.json` is ahead of the last bump, it covers every commit to HEAD plus the working tree, under the new version, and gives the same file after the commit.
- Add `.sdlc/review-constraints.yaml` and `proposal.html` to this repo's `scan.allow`, with reasons.
- Rewrite the paths in `specs/intents.md`, a live backlog.
- Point this repo's own `CLAUDE.md` at local `docs/` and `.sdlc/scripts/`, because the `${CLAUDE_PLUGIN_ROOT}` form is for adopters.
**Why:** without these, SC-5 and AC-017 cannot pass, and the 0.4.0 release would be missing from its own manifest.
**Reversal path:** revert the hunks. The manifest regenerates either way.

---

## SPEC DEVIATION — template parity is checked with diff -rq

**Date:** 2026-10-02
**Spec says:** AC-009 and AC-017: "`cmp -r .sdlc/templates init-payload/.sdlc/templates` is clean".
**Built instead:** BSD `cmp`, as shipped on macOS, has no `-r`, so the check runs `diff -rq`, which compares the same two trees file by file. `install-payload.test.mjs` also compares the trees in Node.

---

## EXECUTIVE DECISION — the payload machine takes the repo's newer spec-completion exit condition

**Date:** 2026-10-02
**Question:** before this run, `specs/sdlc-state-machine.yaml` and the payload's machine differed in one place. The repo had the archive clause in the `spec-completion` exit condition, from the archive-on-completion change, and the payload never received it.
**Decided:** the payload takes the repo's text. This repo's `.sdlc/state-machine.yaml` is now byte-identical to the payload's.
**Why:** the repo's text is the newer contract. A fixed copy that every sync refreshes has to start from the current one.
**Reversal path:** restore the shorter exit condition in both.

---

## S10 — This repo moves to layout 2, and release 0.4.0

**Merged:** PR #69
**What changed:** this repo runs on layout 2, with `.sdlc/scripts` as a symlink to the plugin source, at version 0.4.0. The manifest now runs through 0.4.0, and RELEASING has the 0.4.0 row and a regenerate step. Every shipped file scans clean. CI found one more hit after the first push: the scan read this repo's own `.sdlc/config.yaml`, whose `paths` and `scan.allow` name paths on purpose. The scan now exempts that file by built-in rule.

---

## EXECUTIVE DECISION — guide change: end-to-end validation fixes land as one fix-up PR

**Date:** 2026-10-02
**Question:** End-to-end validation on a clone of high-gear-apps and on the 0.3.0 fixture found defects that no step's `Verify:` could have seen. The guide has no step for them and is at its 10-step limit.
**Decided:** fix them in one PR into `feat/spec-009`, with a test for each one. No AC, scope item or design decision changes. Each fix makes an existing AC or Design rule hold. What found each one, and the fix:

- **Probe P3 never ran on high-gear.**
  - Cause: `parseConstraints` read only a registry under a `constraints:` key, and high-gear's registry is a bare top-level list.
  - Effect: the probe passed on both commits without running. The plugin's write hook gave that repo no constraint guidance.
  - Fix: the parser accepts a top-level list.
- **The plugin's write hook failed open on high-gear.**
  - Cause: it imported `reviewer-routing.mjs` from the repo's scripts directory, and high-gear has none.
  - Fix: it falls back to the plugin's copy, as `run.mjs` does.
- **Probes recorded false misses.** The probe worktree had no `node_modules`, so a repo's own hooks failed on their imports. The probe now links the repo's `node_modules`. P3 also reads only task-scope rows.
- **The migration added a file that crashed.**
  - Cause: the added `reviewer-routing.mjs` imported `parseRegistryTouches` from the repo's kept, forked `check-review-constraint-globs.mjs`, which lacks it.
  - Effect: P3 regressed on the tip, which is how this was found.
  - Fix: the parser moved to `lib/registry-touches.mjs`, and the old module re-exports it.
- **The released-payload manifest stopped at the last version bump.** Every payload fix merged after S10's bump ships as 0.4.0 but was missing from the manifest. It now covers every payload commit to HEAD plus the working tree. RELEASING says any payload PR regenerates it, and CI's `--check` enforces that.
- **The dry run printed only the ids of replaced framework phases.** The spec (Design > Migration) says it prints the diff. It now prints a `-`/`+` line for each changed field value. On high-gear that shows 4 dropped `spec-execution` preconditions and the `open initiative` trigger that `roadmap-sync` hands off with.
- **Scan false positives.**
  - A relative link in a moved file is now a hit only when it resolved from the file's old location. All 9 such hits on high-gear never resolved.
  - A moved file's `'..'` join is now a hit only when its target is missing.
- **A reader the scan could not see.**
  - The forked `validate-guide.mjs` read the `Workspaces` table from `project.md`, which the migration empties.
  - Effect: P1 regressed. The new `workspace-table-read` form now flags that code.
- **P1 regressed on the 0.3.0 fixture.** The layout-1 `definesWorkspaces` counted the template's `[placeholder]` rows, and the headers of later tables, as workspaces. It now reads only the first table and skips placeholder rows, as the migration does.
- **SC-4 on the fixture.** `plan-gate.mjs` rejected the `--root` that `run.mjs` passes on fallback. It and `reviewer-routing.mjs`, `scan-legacy-paths.mjs` and `validate-sdlc-config.mjs` printed no deprecation line on layout 1. Each now takes `--root` and prints the line once. `root-arg.test.mjs` asserts the count.
- **AC-018.** `sdlc-init` and `sdlc-sync` gave 10 direct `node .sdlc/scripts/…` commands. They now use `run.mjs`, and `run.test.mjs` fails on any skill or agent command that does not.
- **`sdlc-sync` step 4** now also says to:
  - update the repo's own SDLC tests;
  - regenerate its own footers;
  - move any dropped phase line it still needs into `extensions.phases`.

**Why:** each defect would have reached an adopter. The high-gear defects reached the real repo's shape: a gate that went quiet, or a hook that stopped helping, with nothing to say so.
**Reversal path:** revert the fix-up PR. The steps' own changes do not depend on it.
