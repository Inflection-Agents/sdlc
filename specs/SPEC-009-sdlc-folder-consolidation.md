---
id: SPEC-009
title: "One .sdlc/ folder: consolidate the adopter footprint and migrate existing repos on /sdlc-sync"
status: active
version: 2
supersedes:
initiative: INI-002
owner: franklin
created: 2026-10-01
updated: 2026-10-02
tags: [onboarding, install, layout, migration, sdlc-sync, sdlc-init]
depends_on: []
linear_project:
---

## Problem

An adopting repo receives SDLC files in seven root entries, and none of them says which framework
put it there. `/sdlc-init` copies `scripts/sdlc/`, `templates/`, `.ai/`, `.ignore`,
`.gitattributes` and two workflows under `.github/workflows/`, and creates `specs/`
(`skills/sdlc-init/SKILL.md`, Phase 1 table). That is 5 new top-level directories on an empty repo.
The owner reports that this "pollutes the workspace and makes it difficult to track and manage SDLC
related files" (owner, 2026-10-01).

`.ai/` follows no convention that agents or humans already know. It mixes adopter config
(`.ai/project.md`, `.ai/sdlc/review-constraints.yaml`) with copies of framework files that nobody
edits (`.ai/skills/review-primitives.md`, `.ai/skills/review-envelope.schema.json`). In forked repos
it also holds agent entry points and code. In high-gear-apps, root `CLAUDE.md` and `AGENTS.md` only
point into `.ai/` (`head -10 ~/_code/high-gear-apps/CLAUDE.md ~/_code/high-gear-apps/AGENTS.md`).

Three install defects follow from the current layout:

1. **The state machine is frozen at install.** `/sdlc-sync` writes `specs/sdlc-state-machine.yaml`
   only when it is absent, because the adopter's `domain_routing` lives inside it
   (`skills/sdlc-sync/SKILL.md`, Procedure step 3). The 0.3.0 release therefore told adopters to
   paste new `phases:` and `exempt:` blocks into their copy by hand, and to copy
   `review-primitives.md` over theirs by hand, because sync refreshes neither (`docs/RELEASING.md`,
   0.3.0 row).
2. **Paths are literals in every consumer.** `.ai/` appears 132 times in 42 files and
   `scripts/sdlc` 186 times in 60 files across `skills agents hooks init-payload scripts
   .claude-plugin bootstrap.sh` (`grep -rE '<path>' <those dirs> | wc -l`, run 2026-10-01 on `main`
   at `ed695f5`). Each validator derives the repo root from its own file location
   (`scripts/sdlc/validate-state-machine.mjs:32`, `scripts/sdlc/reviewer-routing.mjs:28`). The three
   hooks find the root by requiring both `specs/` and `scripts/` (`hooks/stop-handoff.mjs:141`,
   `hooks/user-prompt-submit.mjs:89`, `hooks/pre-tool-use-edit-write.mjs:180`).
3. **The shipped state machine is not valid YAML.** Line 99 of both `specs/sdlc-state-machine.yaml`
   and `init-payload/sdlc-state-machine.yaml` puts an unescaped `'` inside a single-quoted scalar, at
   column 341. PyYAML rejects both files (`python3 -c "import yaml; yaml.safe_load(open(p))"`, run
   2026-10-01). The framework's own validator uses a subset parser and does not notice.

Existing adopters come in two shapes, and the migration must handle both.

- **Plugin-init repos** hold what `/sdlc-init` writes, at a released payload version.
- **Forked repos** started from `bootstrap.sh` and carry local copies and local additions.
  high-gear-apps, checked at `899d48c7`, has the following:
  - `.claude/skills` is a symlink to `../.ai/skills` (`ls -la ~/_code/high-gear-apps/.claude/skills`).
    `tools/dev/setup-sdlc.ts:97-110`, which `mise setup` runs, recreates that symlink.
  - `.ai/skills/` holds 20 skill directories plus a `review-primitives.md` that differs from the
    plugin's by 401 diff lines (`ls -d ~/_code/high-gear-apps/.ai/skills/*/`, round-2 adversarial
    review F-003).
  - `.ai/sdlc/` holds code and the envelope schema next to the registry:
    `review-constraints.mjs`, `review-constraints-loader.mjs`, `review-envelope.schema.json` and
    `__tests__/`. The loader reads the registry as a sibling file
    (`.ai/sdlc/review-constraints-loader.mjs:28`).
  - `scripts/sdlc/` holds 22 scripts, some with no upstream counterpart such as
    `check-adr-supersession.mjs` (`ls ~/_code/high-gear-apps/scripts/sdlc`). `check-subagent-types.mjs:41-53`
    walks `join(root, '.ai', 'skills')` behind an `existsSync` guard.
  - `.ai/` holds files the framework never shipped: `DESIGN.md` and `SPEC-029-SUPERVISION.md`.
    `specs/templates/` holds one, `intent-refinement.md`.
  - Its state machine adds the phase `roadmap-sync` and 5 exempt skills: `capture-spec-gap`,
    `dealer-app-playwright`, `migrate-legacy-metric`, `prod-defect-fix` and `prod-validation`
    (phase and exempt ids diffed against `init-payload/sdlc-state-machine.yaml`).
  - Forked readers use `domain_routing` directly: `.claude/hooks/user-prompt-submit.mjs:347`,
    `scripts/sdlc/validate-state-machine.mjs:227`, and `specs/schema/sdlc-state-machine.schema.json:7`,
    which lists `domain_routing` as required.
  - `.ai/project.md` has 527 lines and 35,065 bytes. Its Workspace skills table lists 4 of its 6
    workspaces (`.ai/project.md:98-109`).
  - 147 archived specs sit directly in `specs/archive/` behind a single fence
    (`ls ~/_code/high-gear-apps/specs/archive | grep -c '^SPEC-.*\.md$'`).
  - Its SDLC gates run from `.github/workflows/sdlc-gates.yml`. `ci.yml` has `paths-ignore: '**.md'`
    (lines 10 and 16).

## Success criteria

- [ ] SC-1: `/sdlc-init` on an empty git repo creates 3 new top-level directories (`.github/`,
  `.sdlc/`, `specs/`), down from 5 today (`.github/`, `specs/`, `templates/`, `scripts/`, `.ai/`).
  Measured with `ls -A` before and after on a fresh `git init` repo.
- [ ] SC-2: Migration works on a plugin-init fixture built from the 0.3.0 payload and on a local
  clone of high-gear-apps. On each target, the gates and gate probes P1 to P5 give the same result on
  the commit before the migration and on the migration branch tip, P6 to P8 pass on the tip, and the
  scan reports 0 hits on the tip. Design > Measuring SC-2 defines the gate set and the protocol. The dry-run report and the
  `--apply` report list the same number of unrecognized files.
- [ ] SC-3: After a change to the phase spine in the plugin, `/sdlc-sync` on a layout-2 repo rewrites
  `.sdlc/state-machine.yaml`. `domain_routing` and `extensions` in `.sdlc/config.yaml` stay
  byte-identical (`cmp` on the extracted blocks before and after).
- [ ] SC-4: With the 0.4.0 plugin installed, the 0.3.0 plugin-init fixture (still on layout 1) keeps
  working. Each 0.4.0 payload gate, run against it through `run.mjs` with `--root`, exits as the
  fixture's own 0.3.0 copy does and prints exactly one deprecation line to stderr. Every repo-local
  script command a 0.4.0 plugin skill gives resolves through `run.mjs`, to the repo's copy or the
  plugin's fallback.
- [ ] SC-5: Shipped code holds no layout-1 path. `scan-legacy-paths.mjs` on a fresh layout-2 init
  reports 0 hits. In this repo, `scan-legacy-paths.mjs --root . --only hooks,scripts/sdlc
  --no-allow` reports 0 hits. Both runs apply only the scan's built-in exemptions (Design > Legacy
  map > Which files the scan reads).

## Scope

### In scope

- The layout-2 tree, the `.sdlc/config.yaml` schema and its validator.
- One path resolver, one state-machine loader and one script runner, used by every validator, hook
  and skill, with a fallback to layout 1.
- Moving adopter data out of the state machine: `domain_routing`, plus local phases and local exempt
  entries as `extensions`.
- Project context moving from `.ai/project.md` to root `AGENTS.md` or `.sdlc/project.md`, with the
  workspace tables moving into `.sdlc/config.yaml`.
- `migrate-layout.mjs`, `scan-legacy-paths.mjs`, `probe-gates.mjs` and the released-payload manifest,
  and `/sdlc-sync` running them for both adopter shapes.
- `/sdlc-init`, `init-payload/` and `bootstrap.sh` writing layout 2.
- Rewriting path references in skills, agents, hooks, scripts and docs.
- Fixing the YAML quoting defect in both state machines.
- This repo moving its own adopter-side files to layout 2.
- Release `0.4.0` with a `docs/RELEASING.md` row.

### Out of scope

- **Stopping the copying.** Serving validators through a reusable GitHub workflow, and templates and
  review contracts from the plugin, is SPEC-010. This spec still copies them, under `.sdlc/`.
  Splitting keeps each guide under the 10-step limit (`skills/guide-schema.md`, Split rule).
- **De-forking local files.** The migration relocates a modified skill, script, template or contract
  and rewrites its paths. It never replaces it with the plugin's copy. Replacing one stays a per-file
  decision for the owner, because drift between upstream and high-gear-apps runs both ways. Forked
  hooks in `.claude/hooks/` stay where they are, and only their path strings are rewritten.
- **Moving `specs/` by default.** It stays at the root, and `paths.specs` lets a repo move it.
- **Removing the layout-1 fallback.** That happens in a later release, after the known adopters have
  migrated.
- **Running the migration on the real high-gear-apps repo.** The owner runs `/sdlc-sync` there after
  `0.4.0` ships. This spec proves the migration on a local clone.
- **Merging `domain_routing` with the workspaces' `skills` lists.** They may describe the same thing.
  This spec moves `domain_routing` byte-for-byte and does not change what it means.
- **Worktree location and lifecycle.** That is a separate intent (`specs/intents.md`, sdlc-multi-agent,
  2026-10-01).

## Design

Per [ADR-008](adrs/ADR-008-sdlc-folder-layout.md), everything the framework puts in an adopter repo
lives under `.sdlc/`, project context lives in root `AGENTS.md` when it fits a size budget, adopter
data leaves the state machine, and every consumer resolves paths through one module. We chose the
two-spec split (Approach C) over one spec that also stops the copying (Approach A), because A needs
more than 10 guide steps. We rejected moving the copies under `.sdlc/` without fixing the frozen
state machine (Approach B), because it leaves defect 1 in place.

### Layout 2

```
AGENTS.md                      # SDLC block between <!-- BEGIN SDLC --> and <!-- END SDLC -->
CLAUDE.md                      # contains the line @AGENTS.md
.ignore                        # !.sdlc/ and specs/archive/
.gitignore                     # gains .claude/.sdlc-*
.sdlc/
  config.yaml                  # layout, framework_version, paths, workspaces, domain_routing, extensions, scan
  project.md                   # only when the project prose is over the AGENTS.md budget
  review-constraints.yaml
  state-machine.yaml           # framework-owned; refreshed by every sync
  scripts/                     # validators (copied until SPEC-010)
  templates/                   # templates (copied until SPEC-010)
  contracts/                   # review-primitives.md, review-envelope.schema.json
  skills/                      # forked repos only
  agents/                      # forked repos only: sdlc.md, CLAUDE.md, AGENTS.md, GEMINI.md, setup.md
specs/                         # unchanged
.github/workflows/             # unchanged location; paths inside rewritten
.gitattributes                 # unchanged
```

**The root `.ignore` stays.** ripgrep skips hidden directories by default, so `.sdlc/` would drop out
of agent search. A probe on 2026-10-01 with ripgrep 15.1.0 found `scripts/sdlc/b.mjs` and not
`.sdlc/scripts/a.mjs` for a plain `rg -l`. Adding `!.sdlc/` to the root `.ignore` found both. The
file keeps its `specs/archive/` line, which hides a flat archive like high-gear-apps' 147 files.

**The `.gitignore` entry** is the line `.claude/.sdlc-*` followed by `!.claude/.sdlc-override-log`.
The first line covers the per-session marker files the hooks write, so they never make a tree look
dirty. The second keeps the edit-gate bypass log visible, because the hook promises that a bypass is
"visible, never silent" (`hooks/pre-tool-use-edit-write.mjs:40`).

### `.sdlc/config.yaml`

```yaml
layout: 2
framework_version: 0.4.0        # plugin version of the last init or sync
paths:                          # optional overrides; defaults shown
  specs: specs
  scripts: .sdlc/scripts
  templates: .sdlc/templates
  primitives: .sdlc/contracts/review-primitives.md
  envelope_schema: .sdlc/contracts/review-envelope.schema.json
  skills: .sdlc/skills
  project: AGENTS.md            # or .sdlc/project.md when the prose is over budget
  process_doc: ""               # empty means the plugin's docs/sdlc.md
workspaces:                     # [] for a single-app repo
  - name: dealer-app
    path: apps/dealer-app
    package: "@org/dealer-app"
    stack: Next.js
    test: pnpm --filter dealer-app test
    build: pnpm --filter dealer-app build
    agent_executable: yes        # yes | caution | human
    skills: [nextjs-app-patterns]
    notes: ""                    # eligibility notes, skill purpose, and any cell that is not one command
domain_routing:                 # moved byte-for-byte from the state machine
  dealer-app: [nextjs-app-patterns]
extensions:                     # adopter additions to the framework state machine
  phases: []                    # full phase entries, same shape as the machine's phases
  exempt: []                    # skill names
scan:
  allow: []                     # globs where a layout-1 path is named on purpose
```

`validate-sdlc-config.mjs` requires:

- `layout: 2`;
- a string for each `paths` value;
- unique workspace names, each with a `path` that exists;
- an `agent_executable` value from the enum;
- `extensions.phases` ids that do not repeat a framework phase id.

Rule 8 of `validate-guide.mjs` reads "defines workspaces" as "`workspaces` is non-empty". Today it
reads `.ai/project.md` (`scripts/sdlc/validate-guide.mjs:172`).

### The resolver, the loader and the runner

`scripts/sdlc/lib/sdlc-paths.mjs` exports three functions.

**`sdlcPaths(root)`** returns absolute paths for these keys: `config`, `constraints`, `machine`,
`scripts`, `templates`, `primitives`, `envelopeSchema`, `skills`, `specs`, `project`, `processDoc`
and `layout`. It resolves each key in this order:

1. the override in `.sdlc/config.yaml`;
2. the layout-2 default, when `.sdlc/config.yaml` exists;
3. the layout-1 path from `scripts/sdlc/lib/legacy-map.mjs`, when it does not.

On layout 1 some keys depend on the repo's shape. The resolver decides them in this order:

| Key | Layout-1 value |
| --- | --- |
| `skills` | `.ai/skills/` if it holds any `*/SKILL.md`, else `skills/` if it does, else none (plugin skills only) |
| `primitives`, `envelopeSchema` | the first of `.ai/skills/<file>` and `.ai/sdlc/<file>` that exists |
| `templates` | `templates/` if it holds a shipped template, else `specs/templates/` if it does, else the plugin's `templates/` |
| `project` | `.ai/project.md` |
| `processDoc` | `.ai/sdlc.md` if it exists, else the plugin's `docs/sdlc.md` |

Code that must still recognize a layout-1 path for the fallback takes it from an export of
`legacy-map.mjs`, never from its own literal. That covers `check-stale-citations.mjs`'s always-loaded
`^\.ai\/` entry (`scripts/sdlc/check-stale-citations.mjs:38`) and the edit-write hook's `.ai/`
process-artifact prefix (`hooks/pre-tool-use-edit-write.mjs:218`).

Taking path 3 writes one line to stderr per process: `sdlc: layout 1 detected; run /sdlc-sync to
migrate`.

**`loadMachine(root)`** returns the state machine with `extensions.phases` appended and
`extensions.exempt` merged in. `domain_routing` is read from `config.yaml` on layout 2 and from the
machine on layout 1. A layout-2 machine that still carries `domain_routing:` is an error. These
readers of phases, exempt entries or routing go through it:

- `validate-state-machine.mjs`;
- `validate-phase-memory.mjs`;
- `gen-handoffs.mjs`;
- `hooks/user-prompt-submit.mjs` (routing at `:199`);
- `hooks/stop-handoff.mjs` (machine at `:514`).

The referential skill checks count a skill as present when it is in `sdlcPaths(root).skills` or in
the plugin's own `skills/`.

**`resolveRoot(start)`** uses `CLAUDE_PROJECT_DIR` when it is set. Otherwise it walks up from `start`
to the first directory that holds either:

- `.sdlc/config.yaml`; or
- `specs/` together with `.ai/` or `scripts/sdlc/`, which is the layout-1 marker.

This replaces the `specs/` and `scripts/` check in the three hooks.

Every validator takes `--root <dir>`, and the root defaults to `resolveRoot(process.cwd())`. The hooks
import the resolver from the plugin's own `../scripts/sdlc/lib/`. `pre-tool-use-edit-write.mjs`
imports the plugin's own `reviewer-routing.mjs`, where today it imports from the repo's
`scripts/sdlc/` (`hooks/pre-tool-use-edit-write.mjs:127`), so a plugin hook never runs code from the
repo. A hook copy that `bootstrap.sh` installed into `.claude/hooks/` has no plugin beside it and
imports the repo's copy from `sdlcPaths(root).scripts`. It also counts `.sdlc/` as a
process-artifact path, except `.sdlc/scripts/`, which stays gated as code the way `scripts/sdlc/` is
today (the list is at lines 214 to 222). When `user-prompt-submit.mjs` sees
layout 1, it adds one line telling the user to run `/sdlc-sync`, once per session.

**The runner.** `scripts/sdlc/run.mjs <name> [args...]` finds `<name>` in `sdlcPaths(root).scripts`
and runs it with the given arguments, passing its exit code through. That works on either layout.
When the repo has no copy of `<name>`, for example a script newer than the repo's last sync, the
runner runs the plugin's own copy with `--root <repo>` and prints one line saying so. It exits 2 only
when neither copy exists.
Skills and docs give every repo-local script command as `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs
<name> [args]`. A script that exists only in the plugin, such as `migrate-layout.mjs`, is given as
`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/<name>`. CI workflows keep calling `node .sdlc/scripts/<name>`
directly, because a runner has no plugin.

### Legacy map

`scripts/sdlc/lib/legacy-map.mjs` is the one table. The resolver, the migration and the scan all
import it. Entries apply longest match first.

| Layout 1 | Layout 2 |
| --- | --- |
| `.ai/project.md` | the value of `paths.project` (`AGENTS.md` or `.sdlc/project.md`) |
| `.ai/sdlc/` (directory prefix) | `.sdlc/` |
| `.ai/skills/` (directory prefix), forked repos | `.sdlc/skills/` |
| `skills/` holding `*/SKILL.md`, plugin-init repos | stays at `skills/`; the migration writes `paths.skills: skills` |
| `.ai/skills/review-primitives.md`, plugin-init repos | `.sdlc/contracts/review-primitives.md` |
| `.ai/skills/review-envelope.schema.json`, plugin-init repos | `.sdlc/contracts/review-envelope.schema.json` |
| `.ai/sdlc.md`, `.ai/CLAUDE.md`, `.ai/AGENTS.md`, `.ai/GEMINI.md`, `.ai/setup.md` | `.sdlc/agents/<name>` |
| `specs/sdlc-state-machine.yaml` | `.sdlc/state-machine.yaml` |
| `scripts/sdlc/` (directory prefix) | `.sdlc/scripts/` |
| `templates/<name>.md`, `specs/templates/<name>.md` | `.sdlc/templates/<name>.md` |

`<name>` in the templates row is a template the framework ships or has shipped, such as `spec`,
`adr`, `guide` or the retired `task`. Other files in a `templates/` directory are not framework files
and do not match. In a forked repo, the contracts land wherever the moves put them: inside
`.sdlc/skills/` when they sat in `.ai/skills/`, and directly in `.sdlc/` when they sat in `.ai/sdlc/`.
The migration writes `paths.primitives` and `paths.envelope_schema` to those post-move locations, so
there is one copy of each contract. When `.ai/sdlc.md` exists, it also writes
`paths.process_doc: .sdlc/agents/sdlc.md`, so a forked repo keeps its own process doc and the gates
that check it.

**Matching.** Each candidate path in a file is first normalized:

1. A relative path (`./` or `../`) is resolved against the directory of the file that contains it,
   using the file's location before the moves, to give a root-relative path.
2. A path after a `$NAME/`, `$(...)/` or `${NAME}/` expansion is treated as root-relative, except
   after `${CLAUDE_PLUGIN_ROOT}`, which names the plugin and is never rewritten.
3. Any other path counts only if the character before it is not a letter, a digit, or one of
   `_ @ . - /`. Under this rule `claude.ai/code` and `@/components/templates/DashboardTemplate` never
   match.

The map is applied to the normalized root-relative path. A path that started relative is then
rewritten as a relative path again, computed from the containing file's new location to the
target's new location. Every relative path in a moved file is recomputed this way, whether or not
its target moved. For example, `.ai/sdlc.md` linking `../docs/runbooks/spec-execution.md` becomes
`.sdlc/agents/sdlc.md` linking `../../docs/runbooks/spec-execution.md`. A match after `\` (a regex escape) keeps the backslash, so `\.ai/sdlc/`
becomes `\.sdlc/`.

**Forms the scan flags but does not rewrite**, because a text edit cannot fix them safely:

- quoted path segments, in single quotes, double quotes or template literals, that spell a map
  entry or a mapped directory, such as `join(root, 'specs', 'sdlc-state-machine.yaml')` or
  `join(root, '.ai', 'skills')`;
- a quoted `.ai` or `.ai/` literal, with or without the slash, in code;
- a `'..'` segment in a `join` or `resolve` call inside a file whose directory depth changed;
- code outside `sdlc-paths.mjs` that reads a `domain_routing` key from a parsed state machine;
- a JSON schema that lists `domain_routing` under `required`;
- a regular-expression literal that holds an escaped layout-1 prefix, such as `/^\.ai\//` or
  `scripts\/sdlc`;
- a file in the skills directory that names one of the three moved table headings
  (`Workspaces`, `Agent eligibility by workspace`, `Workspace skills`) as something to read or edit,
  because that data now lives in `config.yaml` `workspaces`.

**Which files the scan reads.** The scan reads every git-tracked text file except the rewrite
exceptions (see Migration > Rewrites) and the globs in `config.yaml` `scan.allow`. Two exemptions are
built in and apply even with `--no-allow`:
- the files `lib/legacy-map.mjs`, `lib/sdlc-paths.mjs` and `lib/released-payloads.json`, wherever
  they sit;
- test files and fixtures: anything under a `__tests__/` or `__fixtures__/` directory, and any
  `*.test.mjs`, because tests must build layout-1 repos;
- a relative path whose resolved target exists in the current tree, such as a sibling import inside
  `scripts/sdlc/` or a hook's `../scripts/sdlc/lib/` import. A relative path is a hit when its target is
  missing and either the legacy map has an entry for it or the file containing it moved.

The migration's rewrite pass also skips `.sdlc/scripts/lib/`, so it never rewrites the map's own
left column. References to
files that stay in `.ai/` because the map does not cover them, such as `.ai/DESIGN.md`, are not hits.
`--only <dirs>` limits the scan to those directories, and `--no-allow` ignores `scan.allow`.

### Released-payload manifest

`scripts/sdlc/lib/released-payloads.json` maps each released version to the SHA-256 of every file
its `init-payload/` held. `gen-released-payloads.mjs` builds it from every commit that touched
`init-payload/`, keyed by the `version` in `.claude-plugin/plugin.json` at that commit, because the
payload also changed between version bumps (`a73eeb3` changed `archive-specs.mjs` under 0.2.0). The
version bumps themselves are `e1680af` for 0.1.0, `4a4446a` for 0.2.0 and `89cba06` for 0.3.0
(`git log -S'"version": "<v>"' -- .claude-plugin/plugin.json`). The repo has no release tags
(`git tag` prints nothing). A framework file in an adopter repo is **unmodified** when its bytes
match the payload file of the same name in any released version, and **modified** otherwise.
`docs/RELEASING.md` gains a step: regenerate the manifest in every release commit.

### Migration

`migrate-layout.mjs` runs from the plugin, because a layout-1 repo has no copy of it:
`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/migrate-layout.mjs --root . (--dry-run | --apply) [--exclude <glob>]...`.

It refuses to run (exit 1) in three cases:
- the target is not a git repo;
- a tracked file has uncommitted changes (`git status --porcelain --untracked-files=no` prints
  anything);
- the layout matches neither shape.

On a layout-2 repo it prints `nothing to migrate` and exits 0. A repo counts as forked when
`.ai/skills/` holds any `*/SKILL.md`.

**Moves** use `git mv`, so history follows each file. Directories move whole, which keeps every
sibling relationship. For example, `.ai/sdlc/review-constraints-loader.mjs` still finds
`review-constraints.yaml` next to it at `.sdlc/`. The destinations are the legacy map's. Every
tracked symlink whose target moved is repointed, which includes `.claude/skills` and
`.agents/skills`.

**Framework files.** After the moves, each script, template and contract the framework ships is
handled in one of three ways:
- An unmodified file is replaced with its 0.4.0 copy in the migration commit.
- A modified file is kept as it is, and only its paths are rewritten. The report lists it.
- `.sdlc/scripts/lib/` is always added, so a forked repo's own fixes can call `loadMachine` and
  `sdlcPaths`.

**State machine.** The script compares the adopter's machine with the 0.4.0 payload machine:
- Phases and exempt entries that exist only in the adopter's copy go to `config.yaml` `extensions`,
  verbatim. For high-gear-apps that is `roadmap-sync` and the five exempt skills.
- `domain_routing` goes to `config.yaml` byte-for-byte.
- `.sdlc/state-machine.yaml` becomes the 0.4.0 payload machine.
- A framework phase whose adopter copy differs from the payload's is replaced by the payload's
  version, and the dry run prints the diff for each one.

**Project context.** The prose of `.ai/project.md`, minus the three workspace tables, goes to one of
two places:
- When the prose is at most 16 KiB, it goes into root `AGENTS.md` between `<!-- BEGIN SDLC -->` and
  `<!-- END SDLC -->`, after any existing content, which stays byte-for-byte. `.ai/project.md` is then
  deleted.
- When it is over 16 KiB, `.ai/project.md` moves to `.sdlc/project.md` with `git mv`. The `AGENTS.md`
  block holds one line pointing at it, and `paths.project` records the choice.

The budget is half the 32 KiB that Codex reads from `AGENTS.md` by default, and it keeps an
`@AGENTS.md` import small in every Claude session. high-gear-apps' 35,065 bytes go to
`.sdlc/project.md`.

Relative links in the moved prose are recomputed like any other relative path. The script creates
`AGENTS.md` when it is missing, and adds `@AGENTS.md` to `CLAUDE.md` unless the line is already
there.

**Workspace tables.** Three tables move into `config.yaml` `workspaces`, and the prose keeps one
pointer line in their place.

| Table | Rule |
| --- | --- |
| `Workspaces` | Gives the list of workspaces. Each row gives `name`, `path`, `package`, `stack`, `test` and `build`. |
| `Agent eligibility by workspace` | Must have a row for every workspace. A value containing `caution` maps to `caution`, and that test runs first. Then a value starting with `Yes` maps to `yes`. A value starting with `No` or containing `human` maps to `human`. The `Notes` column goes to `notes`. |
| `Workspace skills` | Optional per workspace. A workspace without a row gets `skills: []`. The skills cell is split on commas, with backticks stripped from each item. The `Purpose` column goes to `notes`. |

One wrapping backtick span is stripped from each `name`, `path` and `package` cell.

A row is a **placeholder** when its first cell (the workspace name) is wrapped in `[...]`. Placeholder
rows are dropped and reported. A table with no rows, or only placeholder rows, contributes no
workspaces, so an unfilled stub and a single-app repo both migrate to `workspaces: []`.

A **command cell** is a cell that holds exactly one backtick span and nothing else. That span becomes
`test` or `build`. Any other cell leaves the field empty and its text goes to `notes`, and the report
lists it. `notes` joins its parts in a fixed order: `eligibility: <Notes>`, then `skills: <Purpose>`,
then `test: <cell>` and `build: <cell>` for non-command cells, separated by `; `.

The migration stops with exit 1 before writing anything in two cases:
- an eligibility value maps to nothing;
- among non-placeholder rows, the eligibility table or the skills table names a workspace that the
  `Workspaces` table does not list, or the eligibility table lacks a workspace that `Workspaces`
  lists.

A wrong `workspaces` list would quietly change rule 8 of `validate-guide.mjs` and the `Run by:`
handling of human-only workspaces.

**`.ignore` and `.gitignore`.** The script appends `!.sdlc/` to the root `.ignore` and the two
`.gitignore` lines from Layout 2, creating each file if needed. Each line is added only when it is
not already there, and every existing line stays.

**Rewrites.** The script applies the legacy map to every git-tracked text file (`git ls-files`, minus
binaries), with these exceptions:

- anything under `specs/archive/`, `specs/review-logs/` or `specs/decisions/`;
- a spec whose `status` is anything other than `active` or `draft`, together with that spec's
  `specs/tasks/SPEC-NNN/` directory;
- an ADR whose `status` is anything other than `proposed` or `accepted`;
- every `DECISIONS.md` and every `*.jsonl` file;
- any path matching an `--exclude` glob.

These are history or append-only logs. SPEC-007 makes finding ids a hash over each finding's text,
so rewriting a stored path would break them. Live ADRs, active guides' `Verify:` commands and adopter
workflows are rewritten.

Workflow filters need their own rule, because a rewrite there changes when the workflow runs:
- A `paths:` glob that matched a moved file before the move gets a `.sdlc/**` entry added next to it,
  once.
- A `paths-ignore:` glob is never widened. A slash-form path inside it is rewritten through the map
  like any other path.

This changes `/sdlc-sync`'s rule from "never touches anything under `specs/`"
(`skills/sdlc-sync/SKILL.md`, "What it will and will not touch") to "touches live `specs/` content
only to rewrite paths".

**Commit, then scan.** `--apply` creates and switches to `chore/sdlc-layout-v2`. It makes one commit,
`sdlc: migrate to layout 2`, and then runs `scan-legacy-paths.mjs`. When the scan finds hits, the
command prints each `file:line`, exits 3, and leaves the branch with that one commit. The owner fixes
the hits in further commits on the same branch. A rerun of `--apply` on the branch sees layout 2 and
prints `nothing to migrate`, so it never re-migrates. The branch is ready to merge once the scan
exits 0, the gate probes match, and the gates give the same result as on the commit before the
migration.

**Dry-run proposals.** The dry run proposes every directory fenced in the adopter's root `.ignore`,
other than `specs/archive/`, as an `--exclude` glob. Those directories are usually retrospective
records. It also prints the content of `AGENTS.md` outside the SDLC block, and the files that text
tells a reader to open, because the `@AGENTS.md` import makes every Claude session load it from now
on. In high-gear-apps that text is the Jules entry point, which sends the reader to a step-executor
brief.

**Open branches.** The dry run lists every local branch and worktree whose diff from the base
branch touches a mapped path. high-gear-apps has 8 such branches out of 26 unmerged ones, which
the round-4 adversarial review found with `git diff --name-only main...<branch>`. Such a branch
conflicts on the renames or adds a file at a layout-1 path after the migration merges. The payload's
`sdlc-validate.yml` therefore runs `scan-legacy-paths.mjs`, so a layout-1 path that arrives late fails
CI.

**Formatter ignores.** When the repo has a `.prettierignore`, the migration and init append the
framework-owned files under `.sdlc/`:
- `.sdlc/state-machine.yaml`;
- `.sdlc/scripts/`;
- `.sdlc/templates/`;
- the contract files.

Every sync overwrites those files, so a formatter gate on them would fail after each sync.
high-gear-apps' `sdlc-gates.yml:107-108` runs `prettier --check` on the state machine, which is one
such gate. The report also lists any workflow step that formats or lints a framework-owned file.

**Report.** Both modes list:

- each move, merge, extension, replaced file and rewritten file;
- each modified framework file kept as it is, whether skill, script, template or contract;
- each workspace cell moved to `notes`, and each placeholder row dropped;
- each hook wired in `.claude/settings.json` and also by the plugin;
- each unrecognized file left in `.ai/`, `templates/` or `specs/templates/`.

`.ai/` is deleted only when it is empty.

### Gate probes

A gate that cannot find its input usually exits 0, so equal exit codes do not prove a gate still
works. `probe-gates.mjs --root <dir> --rev <commit>` checks out the commit in a temporary
`git worktree`, plants each violation, and records whether the gate caught it. Each validator probe
runs the copy that the repo's own workflow `run:` line invokes. Each hook probe runs every wired hook:
the plugin's (from its `hooks/hooks.json`) and every hook command in `.claude/settings.json`.

The repo's own code (its `.claude/settings.json` hook commands and the validators its workflows
name) runs only with `--repo-code`, because it runs with the developer's environment. For each
probed revision, `probe-gates.mjs` prints the repo code it would run, read from that revision, and
it lists every probe it held back under `not probed without --repo-code`. `/sdlc-sync` shows that
list to the owner and runs the probes with `--repo-code` only after a yes. The report names any
probe that stayed unprobed.

| Probe | Planted violation | Caught when | Runs when |
| --- | --- | --- | --- |
| P1 | a guide step with no `Workspace:` | `validate-guide.mjs` exits 1 | workspaces are defined |
| P2 | a prompt naming a `domain_routing` workspace path | each wired `UserPromptSubmit` hook prints that workspace's chain | `domain_routing` is non-empty |
| P3 | an edit to a path a registry row matches | each wired edit-write hook prints the row id | the registry has rows |
| P4 | a search for a word in an archived spec | `rg -l -g '*.md'` from the root does not list it | `specs/archive/` exists |
| P5 | a skill directory no phase or exempt entry names, planted in the resolved skills directory | `validate-state-machine.mjs` exits 1 | always |
| P6 | a search for a word in `.sdlc/scripts/` | plain `rg -l` from the root lists it | layout 2 |
| P7 | none: compare workflow triggers | no moved file is selected by fewer workflows at its new path than at its old path, using `path.matchesGlob` on every `paths` and `paths-ignore` filter; added workflows are reported, not failed | always, on the branch tip |
| P8 | a citation of a superseded ADR in a file the stale-citation gate treats as always loaded, under `.sdlc/` or at `paths.process_doc` | `check-stale-citations.mjs` exits 1 | the repo has a superseded ADR, on the branch tip |

A probe whose precondition does not hold reports `ran: false`. `/sdlc-sync` runs the probes on the
commit before the migration and on the branch tip, and requires P1 to P5 to give the same result on
both, and P6 to P8 to pass on the tip.

### Measuring SC-2

- **Gates, plugin-init fixture:** every `run:` step of `sdlc-validate.yml`.
- **Gates, high-gear-apps clone:** every `run:` step, in any workflow, that invokes a script under the
  repo's SDLC scripts directory, which covers `sdlc-gates.yml` and `pr-policy.yml`
  (`pr-policy.yml:63` and `:68`). Add `node --test` on the relocated SDLC tests. Those tests are at `.ai/sdlc/__tests__/` and `scripts/sdlc/__tests__/` before
  the migration, and at `.sdlc/__tests__/` and `.sdlc/scripts/__tests__/` after it.
- **Local runs of workflow steps:** a step that computes scope runs for real. Its changed-file input
  is the output of `git ls-files`, and `$GITHUB_OUTPUT` points at a temp file, so each list output
  holds exactly the files its own pattern selects. Every boolean output is then forced to `true`, so
  every scoped gate runs. `github.event_name` is `pull_request`, and every base or before SHA is the
  pre-migration commit. The same substitution applies before and after.
- **Unrecognized files:** the count in the `--dry-run` report against the count in the `--apply`
  report.

### `/sdlc-sync` and `/sdlc-init`

On layout 1, `/sdlc-sync` runs these steps in order:

1. the dry run;
2. show the plan and the diff to the owner;
3. `--apply`;
4. fix scan hits with the owner, as commits on the branch, until the scan exits 0;
5. the gate probes, before and after;
6. the gates;
7. the report.

That run makes no other changes, so reverting the branch undoes exactly the migration.

On layout 2, sync refreshes these files and writes `framework_version`:

- the files in `.sdlc/scripts/`;
- the files in `.sdlc/templates/`;
- the contract files at their resolved paths;
- `.sdlc/state-machine.yaml`;
- the workflows.

An unmodified script, template or contract is replaced. A modified one is shown as a diff and
replaced only if the owner agrees, which is today's rule for validators extended to templates and
contracts. Sync never touches:

- `review-constraints.yaml`;
- `config.yaml`, apart from `framework_version`;
- the `AGENTS.md` content outside the SDLC block;
- `.sdlc/project.md`;
- `specs/` content.

`init-payload/` is restructured to mirror the layout-2 tree. `/sdlc-init` copies it into the root
without overwriting a file that exists, then renames the `*.stub.*` files. Five root files get an
append, using the migration's rules, when they already exist:
- `AGENTS.md` gets the SDLC block.
- `CLAUDE.md` gets the `@AGENTS.md` line.
- `.ignore` gets `!.sdlc/` and `specs/archive/`.
- `.gitignore` gets the two marker lines.
- `.gitattributes` gets every rule in the payload's `.gitattributes`, today `* text=auto eol=lf`,
  `*.sh text eol=lf` and `*.mjs text eol=lf`.
- `.prettierignore`, when it exists, gets the framework-owned files (see Migration > Formatter
  ignores).
 The interview fills `config.yaml` `workspaces` and the `AGENTS.md` block, and applies the
16 KiB budget. `bootstrap.sh` copies the same payload and keeps its skills, hooks and agents wiring,
pointed at `.sdlc/skills/`.

The template parity between `templates/` and `init-payload/templates/` moves to `.sdlc/templates/`
and `init-payload/.sdlc/templates/`, and AC-017 checks it. Draft SPEC-007's AC-022 names the old
pair and is revised to the new one when SPEC-007 is revived.

### This repo

This repo moves its own adopter-side files by hand, because its plugin source directories are
special:

- `.ai/sdlc/review-constraints.yaml` moves to `.sdlc/review-constraints.yaml`.
- `specs/sdlc-state-machine.yaml` moves to `.sdlc/state-machine.yaml`, with `domain_routing` cut into
  `.sdlc/config.yaml`.
- `templates/` moves to `.sdlc/templates/`.
- `.ai/CLAUDE.md` becomes root `CLAUDE.md`.
- `.ai/sdlc.md`, `.ai/AGENTS.md` and `.ai/setup.md` move to `docs/sdlc.md`,
  `docs/executor-brief.md` and `docs/setup.md`. They ship with the plugin, because the plugin root is
  this repo.
- The `.ai/skills` symlink is deleted, and `.agents/skills` is repointed to `../skills`.
- `.sdlc/scripts` is a new symlink to `../scripts/sdlc`.
- The root `.ignore` gains `!.sdlc/`.
- `check-stale-citations.mjs` adds `.sdlc/` (except `.sdlc/scripts/`) and `paths.process_doc` to its
  always-loaded list, which today matches `^\.ai\/` (`scripts/sdlc/check-stale-citations.mjs:38`).
- The skills that read or edit the workspace tables are retargeted to `config.yaml` `workspaces`:
  `create-domain-skill` (Steps 6 and 9, and its checklists), `sdlc-code-review` and
  `sdlc-code-standards` (Domain skills), `spec-authoring` (Domain skills, line 24),
  `spec-execution/SOP.md` (the workspace table, line 12), `pr-reviewer` (domain reviewers), `skills/guide-schema.md`
  (the `Workspace:` field and rule 8), `skills/spec-schema.md` (the `workspaces` field) and
  `sdlc-init` (the interview).

`skills/`, `agents/`, `hooks/`, `scripts/sdlc/` and `init-payload/` stay where they are.

Its `config.yaml` sets these values:
- `paths.skills: skills`
- `paths.process_doc: docs/sdlc.md`
- `paths.primitives: skills/review-primitives.md`
- `paths.envelope_schema: skills/review-envelope.schema.json`
- `scan.allow`:
  - `scripts/sdlc/**`, `hooks/**`, `init-payload/**` and `bootstrap.sh`, which are plugin source;
  - `docs/RELEASING.md` and `docs/plans/**`, which are release history;
  - `specs/SPEC-009-*.md`, `specs/tasks/SPEC-009/**` and `specs/adrs/**`, which name layout 1 on
    purpose.

SC-5's `--no-allow` run keeps this list from hiding a layout-1 path in shipped code.

## Acceptance criteria

- [ ] AC-001: Given a repo with `.sdlc/config.yaml`, when any key is resolved through `sdlcPaths`,
  then it returns the override if one is set and otherwise the layout-2 default. Given a layout-1
  repo, it returns the legacy-map path and writes the deprecation line to stderr exactly once per
  process. Verified by `node --test scripts/sdlc/lib/sdlc-paths.test.mjs`.
- [ ] AC-002: Given any of the following, when `validate-sdlc-config.mjs` runs, then it exits 1 and
  names the problem:
  - a config missing `layout`;
  - a duplicate workspace name;
  - a workspace `path` that does not exist;
  - an `agent_executable` outside the enum;
  - an `extensions.phases` id equal to a framework phase id.

  Given a valid config, it exits 0.
- [ ] AC-003: Given each validator in `init-payload/.sdlc/scripts/`, when it runs with
  `--root <fixture>` from a different working directory, then it grades the fixture. Verified on a
  layout-1 fixture and a layout-2 fixture.
- [ ] AC-004: Given a layout-2 repo with no top-level `scripts/` directory, when each of the three
  hooks runs without `CLAUDE_PROJECT_DIR`, then it binds to the repo root. Given a layout-1 repo, it
  binds as it does today. Verified by `node --test hooks/__tests__/project-root-resolution.test.mjs`.
- [ ] AC-005: Given a layout-2 repo, when the edit-write hook sees an edit under `.sdlc/`, then it
  classifies the edit as a process artifact, except under `.sdlc/scripts/`, which it gates as code. When it loads constraints from the plugin,
  it imports the plugin's own `reviewer-routing.mjs` and never the repo's.
- [ ] AC-006: Given a layout-1 repo, when the first prompt of a session is submitted, then
  `user-prompt-submit.mjs` adds one line telling the user to run `/sdlc-sync`, and it does not add
  the line again that session.
- [ ] AC-007: Given a layout-2 repo whose `config.yaml` holds `domain_routing` and an `extensions`
  phase and exempt entry, when `loadMachine` runs, then the result has:
  - the framework phases plus the extension phase;
  - the merged exempt list;
  - the config's routing.

  `validate-state-machine.mjs` accepts a skill directory named only in `extensions.exempt`, and exits
  1 on a layout-2 machine that has a `domain_routing:` block. Given layout 1, `loadMachine` returns
  the machine file unchanged.
- [ ] AC-008: Given `validate-guide.mjs` on layout 2, when `workspaces` is non-empty and a step has no
  `Workspace:`, then rule 8 fails. When `workspaces` is `[]`, rule 8 does not apply.
- [ ] AC-009: Given an empty git repo, when `/sdlc-init` runs, then it writes the layout-2 tree and
  creates exactly 3 new top-level directories (`.github/`, `.sdlc/`, `specs/`). It writes no `.ai/`,
  `templates/` or `scripts/`. The root `.ignore` contains `!.sdlc/`, and
  `cmp -r .sdlc/templates "${CLAUDE_PLUGIN_ROOT}/init-payload/.sdlc/templates"` is clean. A second
  run writes nothing, so `git status --porcelain` prints the same output after it as after the first
  run. Given a repo with an existing `AGENTS.md`, `CLAUDE.md`, `.ignore`, `.gitignore` and
  `.gitattributes`, init appends the lines from Design > `/sdlc-sync` and `/sdlc-init` and leaves
  every other byte of those five files unchanged.
- [ ] AC-010: Given each of the two layout-1 fixtures below, when `migrate-layout.mjs --dry-run`
  runs, then it prints every move, merge, extension, replaced file, kept modified file, rewritten
  file and unrecognized file, and `git status` stays clean.

  The plugin-init fixture is built from the 0.3.0 payload at `89cba06`, plus a root `skills/` holding
  one domain skill, as the 0.3.0 stub tells adopters to do.

  The forked fixture models high-gear-apps with each of these:
  - local skills behind a `.claude/skills` symlink;
  - a modified `review-primitives.md` in `.ai/skills/`;
  - an envelope schema in `.ai/sdlc/`;
  - a `SKILL.md` with a relative path to `../../sdlc/review-constraints.mjs`;
  - a loader in `.ai/sdlc/` that reads its sibling `review-constraints.yaml`;
  - a modified copy of a framework validator and a local-only script;
  - a script that walks `join(root, '.ai', 'skills')`;
  - a test in `.ai/sdlc/__tests__/` that joins `'..', '..', 'skills'`;
  - an unknown file in `.ai/` and one in `specs/templates/`;
  - an existing `AGENTS.md` with a beads block;
  - a `project.md` over 16 KiB holding the three tables, with a workspace missing from the skills
    table, a `Yes (with caution)` value and a multi-command test cell;
  - a local phase and a local exempt skill;
  - a hook that builds `join(root, 'specs', 'sdlc-state-machine.yaml')`, lists `'.ai/'` in its
    process-artifact prefixes, and reads `sm.domain_routing`;
  - a schema that requires `domain_routing`;
  - a script whose always-loaded list holds the regex `/^\.ai\//`;
  - a forked `create-domain-skill` that edits the `Workspace skills` table;
  - a workflow with `paths: ['.ai/**']`, and another with `paths-ignore: ['**.md']`;
  - an import of `@/components/templates/X`;
  - a skill line naming `${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/x.mjs`.
- [ ] AC-011: Given the same fixtures, when `--apply` runs, then every file and directory move happens
  with `git mv`, apart from a `.ai/project.md` merged into `AGENTS.md` under the 16 KiB budget. The
  tree is left in this state:
  - The `AGENTS.md` content outside the SDLC block is byte-identical.
  - The unknown files are still where they were.
  - The symlinks point into `.sdlc/`.
  - The loader still loads its sibling registry.
  - The `SKILL.md` relative path resolves to the moved file.
  - `paths.primitives` and `paths.envelope_schema` name files that exist, and each contract exists once.
  - In the plugin-init fixture, every framework script equals its 0.4.0 copy, and `config.yaml` has
    `paths.skills: skills`.
  - `.gitignore` holds `.claude/.sdlc-*` and `!.claude/.sdlc-override-log`.
  - In the forked fixture, the modified validator is unchanged apart from rewritten paths.
  - `.sdlc/scripts/lib/` exists.
  - `domain_routing` in `config.yaml` is byte-identical to the block cut from the machine.
  - The local phase and exempt skill are in `extensions`.
  - The forked `project.md` is at `.sdlc/project.md`, and `paths.process_doc` is
    `.sdlc/agents/sdlc.md`.
  - A relative link in the moved `sdlc.md` to a file that did not move still resolves.
  - `.prettierignore` lists the framework-owned files, and the dry run listed a fixture branch that
    touches `scripts/sdlc/`.
  - The missing skills row became `skills: []`, `Yes (with caution)` became `caution`, and the
    multi-command cell is in `notes`.
  - The `paths:` filter also lists `.sdlc/**`, and the `paths-ignore:` filter is unchanged.
  - The `@/components/templates/X` import and the `${CLAUDE_PLUGIN_ROOT}` line are unchanged.
- [ ] AC-012: Given a fixture that names `scripts/sdlc/validate-guide.mjs` in each of these files:
  - an active guide;
  - a closed spec with the non-standard status `snapshot`;
  - an archived spec;
  - a review log under `specs/review-logs/`;
  - an ADR with status `retired`;
  - a `DECISIONS.md`;
  - an accepted ADR;

  when `--apply` runs, then only the active guide and the accepted ADR change, and every other file
  is byte-identical. A file that matches an `--exclude` glob is also unchanged.
- [ ] AC-013: Given the forked fixture, when `--apply` runs, then it commits `sdlc: migrate to layout
  2` on `chore/sdlc-layout-v2`. The scan then reports each of these as `file:line` and the command
  exits 3:
  - the `join`-built state-machine path;
  - the `join(root, '.ai', 'skills')` walk;
  - the `'..'` join in the moved test;
  - the bare `'.ai/'` literal;
  - the `domain_routing` reader;
  - the schema's `required` entry;
  - the `/^\.ai\//` regex;
  - the forked skill's table edit.

  After the fixes are committed on the branch, the scan exits 0, and `--apply` prints `nothing to
  migrate` and exits 0.
- [ ] AC-014: Given any of the following among the non-placeholder rows of `project.md`, when
  `--apply` runs, then it exits 1 before writing anything and names the table and row:
  - an eligibility value that maps to nothing;
  - a workspace named in the eligibility or skills table but absent from `Workspaces`;
  - a `Workspaces` row with no eligibility row.

  Given the 0.3.0 `project.stub.md` left unfilled (every row's first cell is a `[...]` placeholder),
  and given a filled single-app `project.md` whose tables keep their headings with no rows, each
  migrates to `workspaces: []`, and the report lists any dropped placeholder rows.
- [ ] AC-015: Given `probe-gates.mjs` on the forked fixture, when it runs on the pre-migration commit
  and on the branch tip with the scan hits fixed, then P1 to P5 give the same result on both. P6, P7
  and P8 pass on the tip. Given the tip before the fixes, at least one of P2, P3 or P5 differs.
- [ ] AC-016: Given `/sdlc-sync` on a layout-1 repo, when it runs, then it follows the seven migration
  steps in Design in order and makes no other change in that run. Given a layout-2 repo, it refreshes
  `.sdlc/state-machine.yaml`, replaces unmodified scripts, templates and contracts, asks before
  replacing a modified one, and leaves `config.yaml` unchanged apart from `framework_version`.
  Verified by reading `skills/sdlc-sync/SKILL.md` and by the SC-3 run.
- [ ] AC-017: Given this repo after its own move, when these run, then each passes:
  - the gates in `.github/workflows/sdlc-validate.yml`, and `node --test scripts/sdlc/*.test.mjs
    scripts/sdlc/lib/*.test.mjs hooks/__tests__/*.test.mjs`, exit 0;
  - `scan-legacy-paths.mjs --root .` reports 0 hits under the `scan.allow` list in Design > This
    repo;
  - `git ls-files .ai` prints nothing;
  - `cmp -r .sdlc/templates init-payload/.sdlc/templates` is clean;
  - plain `rg -l` from the root finds a file under `.sdlc/`.
- [ ] AC-018: Given skills, agents and the root docs, when `scan-legacy-paths.mjs --root . --only
  skills,agents --no-allow` and `scan-legacy-paths.mjs --root . --only README.md,playbook.md,skills.md,skill-architecture.md,roles.md,agent-orchestration.md,sync.md,triage.md,tooling.md,work-graph.md,docs/sdlc.md,docs/setup.md,docs/executor-brief.md
  --no-allow` run, then each reports 0 hits. Every repo-local script command in
  `skills/**` and `agents/**` uses the `run.mjs` form.
- [ ] AC-019: Given `.claude-plugin/plugin.json`, when the release is cut, then `version` is `0.4.0`
  and `validate-plugin-manifest.mjs` exits 0. `docs/RELEASING.md` has a `0.4.0` row that names the
  layout change, the migration command, the branch review, both rollback paths and the layout-1
  fallback, and its release steps include regenerating `released-payloads.json`. If SPEC-007 has not
  shipped its own version, the row also lists SPEC-007's contract changes.
- [ ] AC-020: Given `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide <guide>` on a
  layout-1 fixture and on a layout-2 fixture, when it runs, then it runs that repo's own copy and
  returns its exit code. Given a script the repo has no copy of but the plugin has, it runs the
  plugin's copy with `--root <repo>` and prints one line saying so. Given a name neither has, it
  exits 2 and names both directories it searched.
- [ ] AC-021: Given `init-payload/.sdlc/state-machine.yaml` and this repo's `.sdlc/state-machine.yaml`,
  when each is loaded with `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))"`, then
  both load without error.
- [ ] AC-022: Given `released-payloads.json`, when `gen-released-payloads.mjs --check` runs, then it
  exits 0. It holds an entry for every commit that touched `init-payload/`, each keyed by its plugin
  version, covering 0.1.0, 0.2.0 and 0.3.0. A fixture file with the bytes of the 0.2.0
  `validate-state-machine.mjs` (at `4a4446a`) is classed as unmodified, and a one-byte change to it is
  classed as modified.
- [ ] AC-023: Given this repo's skills after S9, when `rg -n "Workspace skills|Agent eligibility|workspace table"
  skills` runs, then no hit tells a reader to read or edit a table in `project.md` or `AGENTS.md`.
  `create-domain-skill` writes a new skill into `.sdlc/config.yaml` `workspaces[].skills` and checks
  `agent_executable` there.

## Risks & constraints

- **A forked repo reads paths or data in a way the scan does not know.** A hook that misses its input
  goes silent and does not fail. The scan flags the forms it knows (AC-013). The gate probes catch the
  silent result for the gates that matter (AC-015), and the clone run (SC-2) is the end-to-end check.
  A local gate that no probe covers can still go silent. high-gear-apps' `check-subagent-types.mjs`
  is one, and the scan flags its `join(root, '.ai', 'skills')` walk.
- **A local tool recreates the old layout.** high-gear-apps' `tools/dev/setup-sdlc.ts` relinks
  `.claude/skills` to `.ai/skills`. Its slash-form paths are rewritten through the map, and any
  segment form is flagged. A tool outside the repo, such as a global dotfile script, is not seen.
- **The `project.md` parser misreads a hand-edited table.** AC-014 stops on the failure modes it can
  detect. A row read with wrong values still shows in the dry-run diff, and probe P1 checks rule 8.
- **The plugin's phase versions replace the adopter's modified ones.** That is the intended refresh,
  and the dry run shows each replaced phase. A forked repo that depended on a modified framework phase
  has to move that behavior into an `extensions` phase.
- **The manifest only knows plugin releases.** A bootstrap-era copy never matches a released
  payload, so it counts as modified and is kept. That is the safe direction, at the cost of a longer
  report for forked repos.
- **SPEC-007 edits the same files and lands after this spec.** It touches `review-primitives.md`,
  `skills/spec-authoring/SKILL.md` and several validators (`grep -o` of
  `specs/SPEC-007-spec-review-convergence.md`), and adds `specs/review-logs/` and `specs/decisions/`.
  The owner first chose to land SPEC-007 first (2026-10-01). At sign-off SPEC-007 was still a draft,
  last updated 2026-09-11, with no delivery guide and no PR, so it could not land first without its
  own sign-off. On the owner's instruction to proceed autonomously, SPEC-009 lands first. SPEC-007 is
  revised to the layout-2 paths when it is revived, including its AC-022 template pair. The rewrite
  exceptions already cover the two directories SPEC-007 adds, so a later SPEC-007 needs no change to
  this spec.
- **SPEC-003 is still `active`.** Its success criteria require `.ai/skills` paths in `bootstrap.sh`
  and the docs (`specs/SPEC-003-onboarding-phase-1.md:26-28`). The owner chose to close SPEC-003
  through `spec-completion` before SPEC-009 executes (2026-10-01). Its delivered criteria then stand
  as history, and this spec supersedes the paths.
- **Double-wired hooks.** high-gear-apps wires hooks in `.claude/settings.json`, and the plugin is
  also installed (`~/.claude/plugins/installed_plugins.json` lists `sdlc@inflection-agents`). The
  report names each double-wired hook, and the probes run both copies. This spec does not unwire them.
- **Claude starts loading an adopter's existing `AGENTS.md`.** The `@AGENTS.md` import pulls in
  whatever that file already says. In high-gear-apps it is the Jules entry point, which sends the
  reader to a step-executor brief. The dry run prints that text and the files it points to, and
  `/sdlc-sync` step 2 asks the owner to confirm it before `--apply`.
- **Branches cut before the migration.** An unmerged branch that touches a mapped path conflicts on
  the renames, or adds a file at a layout-1 path that nothing reads. The dry run lists those branches,
  and the scan gate in the payload's CI fails a layout-1 path that arrives later.
- **A formatter gate on a framework-owned file.** Every sync overwrites those files. The migration
  adds them to an existing `.prettierignore` and reports any workflow step that formats or lints one.
- **The runner's fallback runs a newer script against an older repo.** On an unsynced repo, a
  script added after the repo's last sync runs from the plugin with `--root`, so it may grade the
  repo by newer rules than the repo's CI. The runner prints a line whenever it falls back.
- **The fallback hides an unmigrated repo.** Layout 1 keeps CI green and skill commands working
  (SC-4), which means a repo can stay on it without noticing. The stderr line and the session nudge
  are the only signals until a later release removes the fallback.
- **Constraint on an adopter migration.** The only files it deletes are `.ai/project.md` when its
  prose merges into `AGENTS.md`, and an empty `.ai/`. Every other change is a `git mv`, a file
  replacement under the manifest rule, a block insert, a config write or a path rewrite.

## Migration

### Current state

Layout 1, as described in Problem: `/sdlc-init` writes seven root entries, forked repos add local
skills, hooks, scripts and state-machine entries, and every consumer hard-codes layout-1 paths.

### Target state

Layout 2, as described in Design. Every consumer resolves paths through `sdlc-paths.mjs`, reads the
machine through `loadMachine`, and runs repo-local scripts through `run.mjs`. Layout 1 keeps working
through the fallback until a later release removes it.

### Migration strategy

1. Ship the resolver, the loader, the runner and the fallback before anything moves (S1 to S4), so
   both layouts work at every step.
2. Ship the new init payload, the migration tooling, the manifest and the probes (S5 to S7).
3. Move this repo and release (S10), after proving the migration on fixtures and on a clone of
   high-gear-apps.
4. Adopters run `/sdlc-sync`, which migrates on a branch they review and merge.

### Rollback plan

- **For an adopter, before merging:** delete `chore/sdlc-layout-v2`.
- **For an adopter, after merging:** revert the merge, which undoes the migration commit and the fix
  commits together. The layout-1 fallback means a reverted repo works on `0.4.0` without other
  changes.
- **For the framework:** ship a `0.4.x` patch that keeps the resolver and fixes the faulty part. A
  migrated repo needs the resolver, because `0.3.x` hooks read layout-1 paths
  (`hooks/stop-handoff.mjs:514`, `hooks/pre-tool-use-edit-write.mjs:127`) and would go silent on
  layout 2. Pinning back to `0.3.x` therefore also requires each migrated adopter to revert its
  migration merge first.

## Changelog

### v2 (2026-10-02)
- **Breaking:** AC-005 and Design > The resolver. The plugin's edit hook imports the plugin's own `reviewer-routing.mjs`, not `sdlcPaths(root).scripts/reviewer-routing.mjs`. The integration panel's security review showed that the old import let any repo with a `.sdlc/config.yaml` run its own JavaScript inside a plugin hook (PR #71, round 1). A hook that `bootstrap.sh` installed into `.claude/hooks/` keeps using the repo's copy.
- **Breaking:** Design > Gate probes. The repo's own hooks and validators run only with `--repo-code` after the owner agrees. Each revision prints what it would run, and the probes that were held back are listed (PR #71, rounds 1 and 2).

### v1 (2026-10-01)
- Initial spec.
