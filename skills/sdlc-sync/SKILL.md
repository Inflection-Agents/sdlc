---
name: sdlc-sync
description: Use after updating the sdlc plugin to refresh the repo-local half, or to move a repo off the old layout: "sync the SDLC", "update the SDLC scripts", "pull the new validators", "migrate to .sdlc/", or when a plugin update mentions new gates. On layout 1 (.ai/ and a top-level scripts directory) it migrates the repo to .sdlc/ on a branch; on layout 2 it refreshes the framework-owned files without touching configuration.
---

# SDLC sync

A plugin update refreshes the skills, agents and hooks on its own. It cannot touch the
repo-local half (the validators CI runs, the templates, the workflows, the state machine)
because a plugin cannot write outside its own directory. This skill is that half. On a repo
still on layout 1 it first migrates the repo to layout 2 (ADR-008), and that run does
nothing else.

## Which layout

- **Layout 2**: `.sdlc/config.yaml` exists. Go to "Refresh".
- **Otherwise**, run the migration's dry run (step 1 of "Migrate"). On a layout-1 repo, with
  `.ai/` or the validators in a top-level `scripts` directory, it prints the plan. On a repo
  that is on neither layout it refuses and says so. That repo is not on the SDLC yet, so
  use `/sdlc-init`.

## What it will and will not touch

| | |
| --- | --- |
| **Refreshes** (layout 2) | `.sdlc/scripts/`, `.sdlc/templates/`, the contract files at their resolved paths, `.sdlc/state-machine.yaml`, `.github/workflows/` (the files the payload ships) |
| **Writes once** (layout 2) | `framework_version` in `.sdlc/config.yaml`, and that line only |
| **Never touches** | `.sdlc/review-constraints.yaml`, everything else in `.sdlc/config.yaml` (`workspaces`, `domain_routing`, `extensions`, `scan.allow`), the `AGENTS.md` content outside the SDLC block, `.sdlc/project.md` |
| **`specs/` content** | Left alone, with one exception: the migration rewrites layout-1 paths in live specs, live ADRs and active guides. Closed or archived records, review logs and decision ledgers stay as written. |

The adopter's own decisions live in the never-touched files. An update that overwrote them
would destroy the adoption it is meant to serve.

---

## Migrate (layout 1 → layout 2)

Seven steps, in order. Record the commit you start from first, because steps 5 and 6
compare against it:

```bash
BEFORE=$(git rev-parse HEAD)
```

1. **Dry run.** Nothing is written:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/migrate-layout.mjs" --root . --dry-run
    ```

    It refuses (exit 1) on a dirty tree, an unknown layout, or a workspace table it cannot
    read, and it names the table and row. Fix the cause with the owner and run it again.

2. **Show the plan to the owner and get a yes.** Walk through the moves, the
   `extensions`, the replaced framework phases, the rewritten files, and the framework
   files that will be replaced or kept. Three items need an explicit answer:
    - The **`AGENTS.md` text Claude will start loading**, and the files it points at. After
      the migration `CLAUDE.md` imports `AGENTS.md`, so whatever it says reaches every
      session. In a forked repo it is often another agent's entry point.
    - The **proposed `--exclude` globs**: directories the repo's own `.ignore` already fences
      as retrospective records. Keep the ones the owner agrees are history.
    - The **open branches** that touch moved paths. Each one conflicts on the renames or
      adds a file at a layout-1 path when it merges later. The scan step in CI catches the
      second case.

3. **Apply**, with the agreed excludes:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/migrate-layout.mjs" --root . --apply [--exclude '<glob>']...
    ```

    It creates `chore/sdlc-layout-v2`, commits `sdlc: migrate to layout 2`, and then scans.
    Exit 3 means the scan found references a text rewrite cannot fix. That is the normal
    result for a forked repo, not a failure of the run.

4. **Fix the scan hits with the owner, as commits on the branch**, until the scan exits 0:

    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs scan-legacy-paths
    ```

    Each hit is a reader that will go silent:
    - a `join(root, '.ai', ...)` or `'specs', 'sdlc-state-machine.yaml'` path built from segments;
    - a `domain_routing` reader that does not go through `loadMachine`;
    - a schema that requires `domain_routing`;
    - a regular expression that matches the old `.ai/` prefix;
    - a skill that edits a workspace table now in `config.yaml`;
    - code that reads the `Workspaces` table out of `project.md`;
    - a relative path whose target moved.

    Tests are not scanned, except for a moved test's `'..'` joins, so run the repo's own SDLC
    tests too and point their fixtures at layout 2. A repo with its own skill footers
    regenerates them with its own generator, because the machine changed. A line the report
    marks `-` under a replaced framework phase is dropped; if the repo still needs it, move it
    into an `extensions.phases` entry with the owner.

    A locally edited framework validator is usually fixed by replacing it with the plugin's
    copy, with the owner's yes. Put a path in `config.yaml` `scan.allow` only when it names
    layout 1 on purpose (release notes, a migration record). **Never pass `--exclude` or add
    `scan.allow` to make a real hit go quiet.**

5. **Gate probes**, before against after:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/probe-gates.mjs" --root . --before "$BEFORE" --after HEAD
    ```

    Each probe plants a violation and checks the gate still catches it. Exit 1 names the
    probe that regressed, so fix the reader behind it and go back to step 4. The run probes
    the plugin's hooks and prints each of the repo's own hook commands from
    `.claude/settings.json` without running it. Those commands run in a shell with the
    developer's environment, so show them to the owner, and add `--local-hooks` only after a
    yes.

6. **The gates.** For each workflow step that calls an SDLC script, run only its
   `node <SDLC script>` lines, never the step's other commands, on `$BEFORE` and on the
   branch tip, and compare the exit codes. List the exact commands for the owner before
   running any; a step that mixes a validator with a deploy or publish command runs the
   validator line alone. A step that only computes scope runs for real, with its
   changed-file input set to `git ls-files` and `$GITHUB_OUTPUT` pointed at a temp file. Its
   boolean outputs are then forced to `true`, so every scoped gate runs. Use the same
   substitution on both commits.

7. **Report.** List what moved, what was appended to the root files, the framework files
   replaced and the modified ones kept, the shadowed skills, the double-wired hooks, and the
   unrecognized files left in place. The branch is ready to merge when the scan exits 0,
   the probes report no regression, and the gates give the same result as on `$BEFORE`.
   Hand the branch to the owner. You do not merge it.

**Rollback.** Before the merge, delete `chore/sdlc-layout-v2`. After the merge, revert the
merge, which undoes the migration and every fix commit together. A repo reverted to layout 1
keeps working on this plugin version through the resolver's fallback.

---

## Refresh (layout 2)

1. **Plan:**

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/sync-refresh.mjs" --root . --plan
    ```

    It classifies each framework file:
    - `add`: missing;
    - `replace`: an unedited copy of a released version;
    - `modified`: a local edit;
    - `current`: already up to date.

    `.sdlc/state-machine.yaml` is always refreshed. The adopter's routing and phases are in
    `config.yaml`, so nothing of theirs lives in it.

2. **For each `modified` file, show the diff to the owner** before anything is written:

    ```bash
    diff -u "${CLAUDE_PLUGIN_ROOT}/init-payload/<source>" <file>
    ```

    A local edit may be a fix the plugin's copy lacks. The owner decides per file.

3. **Apply**, accepting the files the owner agreed to replace:

    ```bash
    node "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/sync-refresh.mjs" --root . --apply [--accept <file>]...
    ```

    Exit 2 lists the modified files it kept. That is the owner's choice recorded, not an
    error. Only the `framework_version` line of `config.yaml` changes.

4. **Run the gates afterwards.** A new validator may grade something the repo has never
   been graded on:

    ```bash
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-sdlc-config
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-constraints-registry --allow-empty
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-state-machine
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs check-review-constraint-globs
    node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs scan-legacy-paths
    ```

    Read the output. A new gate going red on its first run is usually the gate working, not
    the sync failing. Report what it found rather than reverting it.

5. **Report** what was added, replaced, kept as modified and why, and anything a new gate
   now flags.

## If a new gate fails

Say what it found and leave it failing. Weakening a gate to make a sync look clean is how a
repo ends up with checks that pass and catch nothing.
