---
spec: SPEC-009
spec_version: 1
---

## Steps

### S1: Resolver, legacy map, runner and config validator
- Covers: AC-001, AC-002, AC-020
- Changes: `scripts/sdlc/lib/sdlc-paths.mjs`, `scripts/sdlc/lib/sdlc-paths.test.mjs`, `scripts/sdlc/lib/mini-yaml.mjs`, `scripts/sdlc/lib/mini-yaml.test.mjs`, `specs/sdlc-state-machine.yaml` and `init-payload/sdlc-state-machine.yaml` (the `sdlc-config-schema` entry under `exempt:` only), `scripts/sdlc/lib/legacy-map.mjs`, `scripts/sdlc/run.mjs`, `scripts/sdlc/run.test.mjs`, `scripts/sdlc/validate-sdlc-config.mjs`, `scripts/sdlc/validate-sdlc-config.test.mjs`, `scripts/sdlc/__fixtures__/layouts/**`, `skills/sdlc-config-schema.md`
- Verify: `node --test scripts/sdlc/lib/sdlc-paths.test.mjs scripts/sdlc/run.test.mjs scripts/sdlc/validate-sdlc-config.test.mjs`
- Notes: Before starting, confirm that SPEC-003 is closed (D1). `legacy-map.mjs` holds SPEC-009 Design > Legacy map, including the normalization and matching rules and an export of the layout-1 prefixes the fallback needs, so S6 imports them and does not reimplement them. `run.mjs` falls back to the plugin's own copy with `--root` when the repo has none, and exits 2 only when neither exists. Build the layout-1 and layout-2 fixtures under `__fixtures__/layouts/` here; S2 to S7 reuse them. The deprecation line is exactly `sdlc: layout 1 detected; run /sdlc-sync to migrate`, once per process. `skills/sdlc-config-schema.md` and the validator must agree field for field.

### S2: Validators resolve through the module
- Covers: AC-003, AC-008
- Changes: `scripts/sdlc/*.mjs`, `scripts/sdlc/*.test.mjs`, `init-payload/scripts/sdlc/**`, `scripts/sdlc/__fixtures__/layouts/**`, `hooks/__tests__/project-root-resolution.test.mjs` (its fixture copies `lib/`), `.github/workflows/sdlc-validate.yml` (the test step's glob gains `scripts/sdlc/lib/*.test.mjs`)
- Verify: `node --test scripts/sdlc/*.test.mjs`, `for f in scripts/sdlc/*.mjs; do b=$(basename $f); [ -f init-payload/scripts/sdlc/$b ] && cmp $f init-payload/scripts/sdlc/$b; done`
- Notes: Each script takes `--root` and defaults to `resolveRoot(process.cwd())`. Keep every existing CLI argument and exit code. Usage strings say `.sdlc/scripts/<name>`. `check-stale-citations.mjs` adds `.sdlc/` (except `.sdlc/scripts/`) and `paths.process_doc` to its always-loaded list, and takes its layout-1 entry from the `legacy-map.mjs` export. The resolver's layout-1 values follow the per-shape table in SPEC-009 Design > The resolver. Copy `lib/` into the payload as well. S5 moves the payload to `.sdlc/scripts/`.

### S3: Hooks resolve through the module
- Covers: AC-004, AC-005, AC-006
- Changes: `hooks/*.mjs`, `hooks/__tests__/**`
- Verify: `node --test hooks/__tests__/*.test.mjs`
- Notes: Import `../scripts/sdlc/lib/sdlc-paths.mjs`, which is plugin-internal and exempt from the scan. The edit-write hook takes its `.ai/` prefix from the `legacy-map.mjs` export. The root walk replaces the `specs` plus `scripts` check at `stop-handoff.mjs:141`, `user-prompt-submit.mjs:89` and `pre-tool-use-edit-write.mjs:180`. Track the once-per-session nudge with the per-session marker style the hooks already use (`.claude/.sdlc-handoff-<session>`).

### S4: State-machine loader, extensions, domain_routing and the YAML fix
- Covers: AC-007, AC-021
- Changes: `scripts/sdlc/lib/sdlc-paths.mjs`, `scripts/sdlc/lib/sdlc-paths.test.mjs`, `scripts/sdlc/validate-state-machine.mjs`, `scripts/sdlc/validate-state-machine.test.mjs`, `scripts/sdlc/validate-phase-memory.mjs`, `scripts/sdlc/gen-handoffs.mjs`, `init-payload/scripts/sdlc/**`, `hooks/user-prompt-submit.mjs`, `hooks/stop-handoff.mjs`, `hooks/__tests__/**`, `init-payload/sdlc-state-machine.yaml`, `specs/sdlc-state-machine.yaml` (line 99 quoting only)
- Verify: `node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs`, `node scripts/sdlc/validate-state-machine.mjs`, `node scripts/sdlc/gen-handoffs.mjs --check`, `for p in init-payload/sdlc-state-machine.yaml specs/sdlc-state-machine.yaml; do python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" $p; done`
- Notes: Fix the line-99 quoting in both machines first. Apart from that, leave this repo's `specs/sdlc-state-machine.yaml` alone until S10. It is still layout 1, and the fallback reads routing from it. The payload's state machine drops `domain_routing:`. The referential check counts a skill as present in `sdlcPaths(root).skills` or the plugin's `skills/`.

### S5: Layout-2 payload, sdlc-init and bootstrap.sh
- Covers: AC-009
- Changes: `init-payload/**`, `skills/sdlc-init/SKILL.md`, `bootstrap.sh`, `scripts/sdlc/validate-plugin-manifest.mjs`, `scripts/sdlc/validate-plugin-manifest.test.mjs`
- Verify: `node --test scripts/sdlc/validate-plugin-manifest.test.mjs`, `node scripts/sdlc/validate-plugin-manifest.mjs`, then copy `init-payload/` into a fresh `git init` repo in the scratchpad, rename the stubs, compare `ls -A` before and after, and run the payload gates from that repo
- Notes: Mirror the layout-2 tree in `init-payload/`:
  - `.sdlc/config.stub.yaml` (with `domain_routing: {}`, `extensions: {phases: [], exempt: []}` and `workspaces: []`)
  - `.sdlc/review-constraints.stub.yaml`
  - `.sdlc/state-machine.yaml`
  - `.sdlc/scripts/`
  - `.sdlc/templates/`
  - `.sdlc/contracts/`
  - `AGENTS.sdlc-block.md`
  - `.ignore` (`!.sdlc/` and `specs/archive/`)
  - `.github/workflows/`
  - `.gitattributes`

  Delete `init-payload/.ai/`. Init appends to an existing `AGENTS.md`, `CLAUDE.md`, `.ignore`, `.gitignore` and `.gitattributes` per SPEC-009 Design > `/sdlc-sync` and `/sdlc-init`. The payload workflows call `node .sdlc/scripts/...`, their `paths:` filters include `.sdlc/**`, and `sdlc-validate.yml` gains a `scan-legacy-paths.mjs` step. Init also appends to an existing `.prettierignore`. `bootstrap.sh` copies the same payload and points `.claude/skills` at `.sdlc/skills`.

### S6: Migration, scan and released-payload manifest
- Covers: AC-010, AC-011, AC-012, AC-013, AC-014, AC-022
- Changes: `scripts/sdlc/gen-released-payloads.mjs`, `scripts/sdlc/gen-released-payloads.test.mjs`, `scripts/sdlc/lib/released-payloads.json`, `scripts/sdlc/migrate-layout.mjs`, `scripts/sdlc/migrate-layout.test.mjs`, `scripts/sdlc/scan-legacy-paths.mjs`, `scripts/sdlc/scan-legacy-paths.test.mjs`, `scripts/sdlc/lib/legacy-map.mjs`, `scripts/sdlc/__fixtures__/layouts/**`, `init-payload/.sdlc/scripts/scan-legacy-paths.mjs`, `init-payload/.sdlc/scripts/lib/legacy-map.mjs`
- Verify: `node --test scripts/sdlc/gen-released-payloads.test.mjs scripts/sdlc/migrate-layout.test.mjs scripts/sdlc/scan-legacy-paths.test.mjs`, `node scripts/sdlc/gen-released-payloads.mjs --check`
- Notes: Build the manifest first, from every commit that touched `init-payload/`. The plugin-init fixture is the 0.3.0 payload (`git show 89cba06:init-payload/...`), not the working tree. Build the forked fixture from the AC-010 list. The tests run each fixture as a temp git repo with `git init` and a commit, never on this working tree. The scan reads `config.yaml` `paths`, so a configured path is current, not legacy. Recompute every relative path in a moved file, list branches and worktrees that touch mapped paths, and append framework-owned files to an existing `.prettierignore`. `migrate-layout.mjs` ships in the plugin only.

### S7: Gate probes
- Covers: AC-015
- Changes: `scripts/sdlc/probe-gates.mjs`, `scripts/sdlc/probe-gates.test.mjs`, `scripts/sdlc/__fixtures__/layouts/**`
- Verify: `node --test scripts/sdlc/probe-gates.test.mjs`
- Notes: Each probe runs in a temporary `git worktree` at the given commit. Remove the worktree in a `finally`. Run each wired hook as a command, using the hook commands in `.claude/settings.json` and in the plugin's `hooks/hooks.json`, with a fixture payload on stdin. Validator probes run the copy the repo's workflow `run:` line invokes. P7 uses `path.matchesGlob` and fails only when a moved file loses a workflow. P8 plants a superseded-ADR citation, so the fixture needs one superseded ADR. Output is JSON, one entry per probe: `{id, ran, caught}`. A probe whose precondition does not hold reports `ran: false`, and a probe with `ran: false` on both commits counts as the same result.

### S8: sdlc-sync runs the migration
- Covers: AC-016
- Changes: `skills/sdlc-sync/SKILL.md`
- Verify: `rg -n "migrate-layout|scan-legacy-paths|probe-gates|framework_version|layout 1|layout 2|extensions" skills/sdlc-sync/SKILL.md`
- Notes: Replace the "Never touches" row with the narrower rule from SPEC-009 Design > Migration > Rewrites. Spell out the seven layout-1 steps in order, and say that no refresh runs in the migrating run. Scan hits get fixed with the owner as commits on the branch. Never pass `--exclude` to make the scan go quiet.

### S9: Path references in skills, agents and docs
- Covers: AC-018, AC-023
- Changes: `skills/**`, `agents/**`, `README.md`, `playbook.md`, `skills.md`, `skill-architecture.md`, `roles.md`, `agent-orchestration.md`, `sync.md`, `triage.md`, `tooling.md`, `work-graph.md`, `specs/_index.md`, `templates/*.md`, `init-payload/.sdlc/templates/*.md`
- Verify: the two AC-018 scan commands, `rg -n "Workspace skills|Agent eligibility|workspace table" skills`, `node scripts/sdlc/gen-handoffs.mjs --check`
- Notes: Give every repo-local script command in the `run.mjs` form from SPEC-009 Design > The runner. Retarget the table-reading skills listed in SPEC-009 Design > This repo to `.sdlc/config.yaml` `workspaces`, and do not mechanically map those references to `AGENTS.md`. `.ai/project.md` becomes `AGENTS.md`, and workspace data becomes `.sdlc/config.yaml`. Leave the generated `## Handoff` footers alone; S10 regenerates them.

### S10: This repo moves to layout 2, and release 0.4.0
- Covers: AC-017, AC-019
- Changes: `.ai/**`, `.sdlc/**`, `.ignore`, `CLAUDE.md`, `docs/sdlc.md`, `docs/executor-brief.md`, `docs/setup.md`, `docs/RELEASING.md`, `templates/**`, `specs/sdlc-state-machine.yaml`, `.agents/skills`, `.claude/settings.json`, `.github/workflows/*.yml`, `scripts/sdlc/gen-handoffs.mjs`, `skills/*/SKILL.md` (generated regions only), `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`
- Verify: every `run:` step of `.github/workflows/sdlc-validate.yml`, `node --test scripts/sdlc/*.test.mjs scripts/sdlc/lib/*.test.mjs hooks/__tests__/*.test.mjs`, `cmp -r .sdlc/templates init-payload/.sdlc/templates`, `node scripts/sdlc/scan-legacy-paths.mjs --root .`, `node scripts/sdlc/scan-legacy-paths.mjs --root . --only hooks,scripts/sdlc --no-allow`, `git ls-files .ai`, `rg -l sdlc-paths .sdlc`, `node scripts/sdlc/validate-plugin-manifest.mjs`
- Notes: Use `git mv` for each move in SPEC-009 Design > This repo. `gen-handoffs.mjs` writes `docs/sdlc.md` in place of `.ai/sdlc.md`. Regenerate the footers. Write `config.yaml` with the values in SPEC-009 Design > This repo, including `scan.allow`. Version `0.4.0`, with the RELEASING row and release step from AC-019.

## Owner decisions

- D1: SPEC-003 is closed through `spec-completion` before S1 starts. Decided by the owner, 2026-10-01.

## End-to-end validation

- Every `run:` step of `.github/workflows/sdlc-validate.yml`, run locally on the integration tip.
- SC-1: `/sdlc-init` on a fresh `git init` repo in the scratchpad, with `ls -A` before and after.
- SC-2, clone: `git clone --local ~/_code/high-gear-apps` into the scratchpad, then follow SPEC-009 Design > Measuring SC-2:
  1. At the clone's HEAD, record the exit code of every workflow `run:` step that invokes an SDLC script (`sdlc-gates.yml` and `pr-policy.yml`, with the scope step run for real per Design > Measuring SC-2), the old-path SDLC tests, and `probe-gates.mjs`.
  2. Run `migrate-layout.mjs --dry-run`, then `--apply`, and fix the scan hits as commits on the branch.
  3. Repeat step 1 on the tip with the new test paths, and compare.
  4. Run `--apply` again and expect `nothing to migrate`.
  5. Compare the unrecognized-file counts in the dry-run and apply reports.

  Never push the clone.
- SC-2, fixture: the same sequence on the 0.3.0 plugin-init fixture with `sdlc-validate.yml`.
- SC-3: on the SC-1 repo, add a `domain_routing` entry and an extension phase to `config.yaml`, change a phase in the plugin payload's state machine, run the sync refresh, and `cmp` both config blocks before and after.
- SC-4: run the payload gates against the layout-1 fixture and count the deprecation lines per script.
- SC-5: `node scripts/sdlc/scan-legacy-paths.mjs --root .` on the integration tip and on the SC-1 repo.
