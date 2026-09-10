# SDLC Plugin Distribution — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship this framework as a public Claude Code plugin so adopters get engine updates automatically, while their own configuration and CI-side gates stay repo-local and untouched.

**Architecture:** The plugin owns what nobody edits (skills, agents, hooks, the two universal contracts). The repo owns what everybody edits (the constraints registry, `domain_routing`, `.ai/project.md`, `specs/`) plus anything a GitHub Actions runner must read (validators, workflows). `${CLAUDE_PROJECT_DIR}` is the seam: the engine ships generic and reads the repo's law at runtime. The restructure inverts a symlink instead of moving files, so 42 references inside immutable completed specs keep resolving.

**Tech Stack:** Node built-ins only — no `package.json`, no dependencies. Tests are `node:test` + `node:assert/strict`. Plugin manifest is JSON. Everything else is markdown and POSIX shell.

**Design doc:** `docs/plans/2026-09-09-plugin-distribution-design.md`
**Branch:** `sdlc/plugin-distribution` (already created)

---

## Before you start

Read the design doc first, especially §1 (the seam) and the "why the symlink inversion" section. Two facts drive nearly every task and are easy to forget:

1. **User modifications to plugin-shipped files are destroyed on update.** Anything an adopter is expected to edit must never ship in the plugin.
2. **A GitHub Actions runner checks out the repo, not the plugin cache.** `sdlc-validate.yml` runs `node scripts/sdlc/validate-state-machine.mjs`, so validators stay repo-local permanently. This is a constraint, not a phase.

**Verified mechanics** (already tested — do not re-litigate):

- The symlink inversion preserves history: `git mv .ai/skills skills` then `ln -s ../skills .ai/skills` leaves the blob SHA unchanged and both old paths resolving.
- After the move, `blastRadius('skills/…')` returns `report`, not `fail`. Task 5 exists because of that.

**Run the full suite at any checkpoint:**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

**Commit trailer for every commit:**

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

# Phase 0 — Hardening

Both tasks are prerequisites. Doing the restructure first would bake these defects into the plugin.

## Task 1: Move the constraints registry out of plugin-owned space

**Why:** `review-constraints.yaml` is the one repo-specific file sitting in `.ai/skills/`. That directory becomes the plugin's `skills/`, so shipping it there destroys every adopter's real invariants on their first `/plugin update`. `review-primitives.md` and `review-envelope.schema.json` are universal contracts and stay put.

**Files:**
- Move: `.ai/skills/review-constraints.yaml` → `.ai/sdlc/review-constraints.yaml`
- Modify: `scripts/sdlc/reviewer-routing.mjs:31` (`DEFAULT_REGISTRY`)
- Modify: `scripts/sdlc/check-review-constraint-globs.mjs:48` (`REGISTRY_REL`)
- Modify: `scripts/sdlc/archive-specs.mjs:120` (the `collectCitedIds` filename list)

**Step 1: Find every reader before touching anything**

```bash
grep -rn "review-constraints.yaml" scripts/ .claude/hooks/ .ai/ *.md 2>/dev/null | grep -v "^\./\.git" | cut -c1-120
```

Expected: two hardcoded path constants (`reviewer-routing.mjs:31`, `check-review-constraint-globs.mjs:48`), one filename mention in `archive-specs.mjs:120`, plus prose. Anything else you find is a reader the plan missed — report it.

**Step 2: Move the file**

```bash
mkdir -p .ai/sdlc
git mv .ai/skills/review-constraints.yaml .ai/sdlc/review-constraints.yaml
```

**Step 3: Update the two path constants**

In `scripts/sdlc/reviewer-routing.mjs`, change `DEFAULT_REGISTRY` from `join(REPO_ROOT, '.ai', 'skills', 'review-constraints.yaml')` to `join(REPO_ROOT, '.ai', 'sdlc', 'review-constraints.yaml')`.

In `scripts/sdlc/check-review-constraint-globs.mjs`, change `REGISTRY_REL` from `'.ai/skills/review-constraints.yaml'` to `'.ai/sdlc/review-constraints.yaml'`.

Add a one-line comment at each site explaining WHY the registry lives outside the skills tree — a future reader will otherwise "tidy" it back:

```javascript
// Outside .ai/skills on purpose: that tree ships in the plugin and is overwritten
// on update, and this file holds the adopting repo's own invariants.
```

**Step 4: Update `archive-specs.mjs`**

`collectCitedIds` reads `review-primitives.md` and `review-constraints.yaml` from the skills dir by name. The registry is no longer there. Point that one entry at the new location, keeping `review-primitives.md` where it is.

**Step 5: Verify**

```bash
node scripts/sdlc/reviewer-routing.mjs --list
node scripts/sdlc/check-review-constraint-globs.mjs
node scripts/sdlc/archive-specs.mjs --dry-run
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: routing lists 7 lenses; the glob checker reports the same warn-mode output as before; the archiver still says `nothing to archive or restore.`; all tests pass. A silent `--list` printing nothing means the path constant is wrong and the reader failed open.

**Step 6: Prove the registry is still reachable from the write-time hook**

```bash
node --input-type=module -e "
const {loadConstraints,applicableConstraints}=await import('./scripts/sdlc/reviewer-routing.mjs');
const h=applicableConstraints(loadConstraints(),'scripts/sdlc/resolve.mjs');
console.log('matched:',h.map(c=>c.id));"
```

Expected: `[ 'SDLC-GATE-TESTED' ]`. Empty means injection is broken.

**Step 7: Commit**

```bash
git add -A
git commit -m "sdlc: move the constraints registry out of plugin-owned space

.ai/skills becomes the plugin's skills/ and is overwritten on every update.
The registry holds the adopting repo's own invariants, so shipping it there
would destroy them. review-primitives.md and the envelope schema are universal
contracts and stay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 2: Fix the hook project-root fallback

**Why:** The hooks prefer `CLAUDE_PROJECT_DIR`, then fall back to walking up two levels from their own file. From `.claude/hooks/x.mjs` that lands on the repo root. From a plugin cache at `<cache>/<plugin>/<version>/hooks/x.mjs` it lands on the version directory — no `specs/`, no registry — and because the hooks fail open, the result is a silent no-op. This codebase has now been bitten three times by a fail-open path hiding a real defect.

**Files:**
- Modify: `.claude/hooks/pre-tool-use-edit-write.mjs` (`projectRoot`)
- Modify: `.claude/hooks/stop-handoff.mjs` (same helper)
- Modify: `.claude/hooks/user-prompt-submit.mjs` (same helper)
- Test: `.claude/hooks/__tests__/project-root-resolution.test.mjs` (create)

**Step 1: Write the failing test**

Create `.claude/hooks/__tests__/project-root-resolution.test.mjs`. It builds a fake plugin layout in a tmpdir (`<tmp>/plugin/hooks/`), copies a hook there, and runs it with `CLAUDE_PROJECT_DIR` UNSET and `cwd` set to a separate fake repo that has `.claude/` and `specs/`. Assert the hook resolves the repo, not the plugin dir — observable via its behaviour (it must not silently no-op on a payload that should produce output).

The cheapest observable: run `pre-tool-use-edit-write.mjs` from the fake plugin dir with a payload targeting a path in the fake repo that has a matching constraint, and assert stdout is non-empty.

**Corrected after execution.** That plugin-layout case alone does NOT discriminate for
`pre-tool-use-edit-write.mjs`: a real cache path walks up to a directory with no `.claude/`, so even
the old ordering fell through to `cwd` and passed. Verified by reverting the fix and re-running. The
discriminating case is the ordering one — run the IN-REPO hook (whose own location is a valid repo)
with `cwd` pointing at a different valid repo, and assert it prefers `cwd`. The plugin-layout cases
DO discriminate for `stop-handoff.mjs` and `user-prompt-submit.mjs`, which have no `cwd` fallback at
all. Write all four. Do not fake the fixture to force the first one red.

**Step 2: Run it and watch it fail**

```bash
node --test .claude/hooks/__tests__/project-root-resolution.test.mjs
```

Expected: FAIL — the hook resolved the plugin dir, found no registry, and emitted nothing.

**Step 3: Reorder the resolution in all three hooks**

The current order is env → own-location → cwd. Change it to env → cwd → own-location, and require the chosen root to actually look like an SDLC repo:

```javascript
/**
 * Resolve the project root.
 *
 * Order matters. `CLAUDE_PROJECT_DIR` is authoritative. `cwd` comes next because
 * it is the repo under work. Walking up from this file is LAST and is only correct
 * when the hook ships inside the repo: from a plugin cache it resolves to the
 * plugin's own directory, and because this hook fails open the result is a silent
 * no-op rather than an error.
 */
function projectRoot(cwd) {
    const looksLikeRepo = (d) => d && existsSync(join(d, '.claude'))
    if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR
    if (looksLikeRepo(cwd)) return cwd
    const fromHook = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    if (looksLikeRepo(fromHook)) return fromHook
    return cwd || fromHook
}
```

`stop-handoff.mjs` and `user-prompt-submit.mjs` take no `cwd` argument today — thread the payload's `cwd` through to the helper in each.

**Step 4: Run the test again**

```bash
node --test .claude/hooks/__tests__/project-root-resolution.test.mjs
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

Expected: PASS, and no existing hook test regressed.

**Step 5: Commit**

```bash
git add -A
git commit -m "sdlc: hooks resolve the repo before their own location

From a plugin cache, walking up from the hook file resolves the plugin
directory. The hooks fail open, so the result is a silent no-op - the failure
mode that is hardest to diagnose and that this codebase has now hit three times.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

# Phase 1 — Restructure

## Task 3: Invert the skills symlink

**Files:**
- Move: `.ai/skills/` → `skills/`
- Create symlinks: `.ai/skills` → `../skills`, `.claude/skills` → `../skills`

**Step 1: Record the before state**

```bash
git ls-files -s .claude/skills
ls .ai/skills/
grep -rc "\.ai/skills" . 2>/dev/null | grep -v "^\./\.git" | grep -v ":0$" | wc -l
```

Note the file count and the number of referencing files (70 at time of writing). Both must survive.

**Step 2: Do the inversion**

```bash
git mv .ai/skills skills
rm -f .claude/skills
ln -s ../skills .ai/skills
ln -s ../skills .claude/skills
git add -A
```

**Step 3: Verify git recorded renames, not delete-plus-add**

```bash
git status --porcelain | head -5
git ls-files -s .ai/skills .claude/skills
git diff --cached --stat | tail -3
```

Expected: `.ai/skills` and `.claude/skills` both mode `120000`; skill files show as renames with 0 additions/deletions. A large insertion count means git recorded a copy and history is lost — reset and retry.

**Step 4: Verify every old path still resolves**

```bash
cat .ai/skills/spec-execution/SKILL.md | head -2
cat .claude/skills/spec-execution/SKILL.md | head -2
cat skills/spec-execution/SKILL.md | head -2
```

All three must print the same content.

**Step 5: Full suite and gates**

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/gen-handoffs.mjs --check
node scripts/sdlc/validate-state-machine.mjs
node scripts/sdlc/archive-specs.mjs --check
```

All must pass unchanged. `gen-handoffs --check` is the sharp one — it walks skill files.

**Step 6: Commit**

```bash
git commit -m "sdlc: skills/ becomes real, .ai/skills becomes a symlink

The plugin reads skills/ at the repo root. Inverting the existing symlink rather
than moving files keeps all 326 references resolving, including 42 inside
completed specs and shipped plans this framework's own rule forbids editing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

## Task 4: Move the agents to the plugin location

**Files:**
- Move: `.claude/agents/` → `agents/`
- Create symlink: `.claude/agents` → `../agents`

Same pattern and the same verification as Task 3. The symlink keeps `.claude/agents` working for this repo's own sessions while `agents/` is what the plugin ships.

**Verify the agents are still discovered** after the move by confirming the four files resolve through both paths, and that `reviewer-routing.test.mjs`'s agent-resolvability test still passes — it reads `.claude/agents` today and must be updated to read `agents/` (the real location) in the same commit.

```bash
node --test scripts/sdlc/reviewer-routing.test.mjs
```

Expected: PASS, including `every agent: named in the registry is a shipped agent definition`.

## Task 5: Teach the stale-citation gate about the new locations

**Why:** Verified before writing this plan — `blastRadius('skills/spec-execution/SKILL.md')` returns `report`, while `.ai/skills/…` returned `fail`. After Task 3 the walker sees the real `skills/` tree (it skips the symlink), so the framework's own instruction files would silently drop out of always-loaded classification and a stale citation in a skill would stop failing the build.

**Files:**
- Modify: `scripts/sdlc/check-stale-citations.mjs` (`ALWAYS_LOADED`)
- Test: `scripts/sdlc/check-stale-citations.test.mjs`

**Step 1: Write the failing test**

```javascript
test('top-level skills/ and agents/ are always-loaded', () => {
    // After the plugin restructure these are the REAL locations; .ai/skills and
    // .claude/agents are symlinks the walker skips. Without this, the framework's
    // own instruction files silently stop being graded at fail severity.
    assert.equal(blastRadius('skills/spec-execution/SKILL.md'), 'fail')
    assert.equal(blastRadius('agents/task-reviewer.md'), 'fail')
    assert.equal(blastRadius('skills/review-primitives.md'), 'fail')
})
```

**Step 2: Run it and watch it fail**

```bash
node --test scripts/sdlc/check-stale-citations.test.mjs
```

Expected: FAIL, `'report' !== 'fail'`.

**Step 3: Extend `ALWAYS_LOADED`**

Add `/^skills\//` and `/^agents\//` to the array. Keep the existing `.ai/` and `.claude/` patterns — a consuming repo that has not restructured still uses those.

**Step 4: Re-run, then run the gate over the corpus**

```bash
node --test scripts/sdlc/check-stale-citations.test.mjs
node scripts/sdlc/check-stale-citations.mjs
```

Expected: tests pass; the corpus run still reports `nothing to check` (no wholly superseded ADR).

**Step 5: Commit**

## Task 6: Migrate the 28 live references

**Why:** Optional for correctness — the symlink keeps them working — but a reader greps `.ai/skills` and lands on a symlink, which obscures where the file actually lives.

**Do NOT touch** anything under `specs/` or `docs/plans/`. Those 42 references are inside completed specs and shipped plans; this framework's own rule makes them immutable, and they correctly describe the world as it was.

**Step 1: List exactly what may change**

```bash
grep -rl "\.ai/skills" . 2>/dev/null | sed 's|^\./||' | grep -v "^\.git/" | grep -vE "^(specs/|docs/plans/)"
```

Expected: 28 files.

**Step 2: Rewrite them**

```bash
grep -rl "\.ai/skills" . 2>/dev/null | sed 's|^\./||' | grep -v "^\.git/" | grep -vE "^(specs/|docs/plans/)" | while read -r f; do
  sed -i '' 's|\.ai/skills|skills|g' "$f"
done
```

**Step 3: Verify the historical set is untouched**

```bash
git diff --name-only | grep -E "^(specs/|docs/plans/)" && echo "ERROR: touched immutable docs" || echo "immutable docs untouched"
grep -rc "\.ai/skills" specs/ docs/plans/ 2>/dev/null | grep -v ":0$" | wc -l
```

Expected: the error branch does not fire, and the historical references are still present.

**Step 4: Full suite and every gate, then commit**

---

# Phase 2 — Plugin manifest

## Task 7: Write the plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `hooks/hooks.json`

**Step 1: Write `plugin.json`**

```json
{
    "name": "sdlc",
    "version": "0.1.0",
    "description": "An AI-native SDLC: intent to spec to tasks to delivery, with graded review, a capped integration gate, and enforcement tiers that run at write time, commit time and CI time.",
    "author": "Inflection Agents",
    "homepage": "https://github.com/Inflection-Agents/sdlc",
    "license": "MIT"
}
```

Version starts at `0.1.0` and is the ONLY thing that delivers updates to users — a push without a version bump ships nothing.

**Step 2: Write `hooks/hooks.json`**

Mirror the four wirings in `.claude/settings.json`, replacing `$CLAUDE_PROJECT_DIR` with `${CLAUDE_PLUGIN_ROOT}` — the hook files ship in the plugin, while the repo they inspect comes from the payload's `cwd` and `CLAUDE_PROJECT_DIR` at runtime.

```json
{
    "PreToolUse": [
        { "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use-review-identity.mjs\"" }] },
        { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use-edit-write.mjs\"" }] }
    ],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.mjs\"" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-handoff.mjs\"" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/stop-handoff.mjs\"" }] }]
}
```

**Step 3: Move the hooks to the plugin location**

`.claude/hooks/` → `hooks/`, with `.claude/hooks` as a symlink, exactly as Tasks 3 and 4. Keep `.claude/hooks/__tests__/` resolving — CI runs `node --test … .claude/hooks/__tests__/*.test.mjs`, so either update that glob in `sdlc-validate.yml` or confirm it resolves through the symlink. **Test it; do not assume.**

**Step 4: Validate the JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('both parse')"
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
```

**Step 5: Commit**

## Task 8: Add a manifest-integrity gate

**Why:** Every dangling-reference defect this repo has hit came from a name that resolved to nothing. The manifest is a new surface with the same hazard: a hook path that does not exist, or a skill directory listed but missing.

**Files:**
- Create: `scripts/sdlc/validate-plugin-manifest.mjs`
- Test: `scripts/sdlc/validate-plugin-manifest.test.mjs`
- Modify: `.github/workflows/sdlc-validate.yml`

Assert: `plugin.json` parses and carries `name`, `version`, `description`; the version is semver; every command path in `hooks/hooks.json` exists on disk after `${CLAUDE_PLUGIN_ROOT}` substitution; every directory under `skills/` contains a `SKILL.md`; every file in `agents/` has `name` and `tools` frontmatter.

**Prove it bites** by breaking one hook path and confirming the gate goes red, then restoring it. A gate whose failure branch has never run is untested.

Wire it into `sdlc-validate.yml` with no `if:` scope.

---

# Phase 3 — Init and sync

## Task 9: Assemble `init-payload/`

**Files:**
- Create: `init-payload/` containing the repo-half files

Copy (do not move — this repo still needs its own): `scripts/sdlc/*.mjs` excluding `*.test.mjs`, `.github/workflows/*.yml`, `templates/*.md`, `.ignore`, plus a `review-constraints.stub.yaml` carrying only the schema comment and no rows, and a `project.stub.md`.

**Do NOT include** `specs/` content, `sdlc-state-machine.yaml` (the adopter needs their own `domain_routing`, but the phase spine is universal — copy it and let the interview edit only `domain_routing`), or anything under `docs/`.

Add `init-payload/README.md` explaining that these files are copied into an adopting repo and are NOT loaded by Claude in this repo.

**Trap, surfaced during Task 2.** `reviewer-routing.mjs` and `check-review-constraint-globs.mjs` both
derive `REPO_ROOT` from their own `import.meta.url`, with no env or cwd escape. That is correct while
they live in the repo, and it is why COPYING them into an adopting repo works. But if any part of
`scripts/sdlc/` is ever shipped plugin-side instead of copied, `DEFAULT_REGISTRY` acquires the exact
bug Task 2 fixed in the hooks — and `loadConstraints` is consumed through a `try/catch` returning
`null`, so it fails open the same silent way. Validators are copied, never shipped.

**Verify** the payload has no absolute paths and no reference to this repo's own specs:

```bash
grep -rn "/Users/\|Inflection-Agents/sdlc" init-payload/ | head
```

Expected: no output.

## Task 10: `/sdlc:init` — phase 1, scaffold

**Files:**
- Create: `skills/sdlc-init/SKILL.md`

The skill's scaffold phase copies `${CLAUDE_PLUGIN_ROOT}/init-payload/` into `${CLAUDE_PROJECT_DIR}`, creating `specs/`, `specs/adrs/`, `specs/tasks/`, `scripts/sdlc/`, `.github/workflows/`, `templates/`, `.ai/sdlc/`.

**Never clobber.** Every file is copied only if absent, and the skill reports what it skipped. This is the rule `bootstrap.sh` already follows at nine sites; the skill inherits it.

Idempotency is the acceptance criterion: running init twice must leave the repo identical after the first run and report every file as already present.

## Task 11: `/sdlc:init` — phases 2 and 3, interview and prove

**Files:**
- Modify: `skills/sdlc-init/SKILL.md`

**Phase 2, interview.** Ask about workspaces, layer boundaries, security surfaces, design surfaces. Generate `review-constraints.yaml` rows from the ANSWERS ONLY. The skill must not infer a constraint the user did not state — a generated law nobody asked for is worse than no law.

**Phase 3, prove.** After writing the rows, run against the user's real tree:

```bash
node scripts/sdlc/check-review-constraint-globs.mjs --enforce
node --test scripts/sdlc/reviewer-routing.test.mjs
```

Every generated glob must resolve, every `cite` must carry a grounded prefix, every `agent:` must name a shipped agent. A row that fails is corrected with the user or dropped — never written and left red.

Document the residual honestly in the skill: a row can resolve cleanly and still encode the wrong law, and no gate catches that.

## Task 12: `/sdlc:sync`

**Files:**
- Create: `skills/sdlc-sync/SKILL.md`

Re-runs the scaffold phase only, under the never-clobber rule, so an adopter takes new validators and workflows without losing their configuration. It reports a diff summary of what it added and what it skipped.

**Explicitly out of scope:** sync never edits `review-constraints.yaml`, `domain_routing`, `.ai/project.md`, or anything under `specs/`.

## Task 13: Retire `bootstrap.sh` into the plugin

**Files:**
- Modify: `bootstrap.sh`

Keep it — a repo without the plugin installed still needs a way in — but reduce it to: install the plugin, then tell the user to run `/sdlc:init`. Leave the existing copy logic behind a `--legacy` flag for one release, and say in the header that the plugin path is now primary.

---

# Phase 4 — Public surface

## Task 14: README, LICENSE, marketplace entry

**Files:**
- Modify: `README.md`
- Create: `LICENSE`
- Create: `.claude-plugin/marketplace.json`

README leads with what the framework does and the install path (`/plugin install`, then `/sdlc:init`), not with the architecture. State plainly what stays repo-local and why, so an adopter is not surprised when an update leaves their validators alone.

`marketplace.json` follows the documented schema with this repo as the source.

## Task 15: Version discipline

**Files:**
- Create: `docs/RELEASING.md`

Document: users receive an update ONLY when the version string changes; a push without a bump ships nothing. Record the compatibility rule — a change to `review-primitives.md`, the envelope schema, or the state-machine phase spine is breaking for adopters and needs a minor bump plus a note.

---

# Final verification

```bash
node --test scripts/sdlc/*.test.mjs .claude/hooks/__tests__/*.test.mjs
node scripts/sdlc/validate-state-machine.mjs
node scripts/sdlc/gen-handoffs.mjs --check
node scripts/sdlc/validate-plugin-manifest.mjs
node scripts/sdlc/archive-specs.mjs --check
node scripts/sdlc/check-stale-citations.mjs
node scripts/sdlc/check-review-constraint-globs.mjs
bash -n bootstrap.sh
```

Then confirm by hand:

- `.ai/skills`, `.claude/skills`, `.claude/agents`, `.claude/hooks` are all mode `120000` in `git ls-files -s`.
- `cat .ai/skills/spec-execution/SKILL.md` still resolves.
- No file under `specs/` or `docs/plans/` was modified by Task 6.
- `blastRadius('skills/x/SKILL.md')` returns `fail`.
- A fresh consuming repo test: scaffold `init-payload/` into an empty git repo, run the gates there, confirm they pass.

# Rejected, with reasons

**Shipping validators only in the plugin.** A GitHub Actions runner checks out the repo, not the plugin cache. They must exist repo-side.

**Shipping `.github/workflows/` from the plugin.** Unsupported, and unreadable by the runner even if it were.

**`userConfig` prompts for the registry.** `userConfig` is per-user; every setting here is per-project. It would put one developer's answers on a whole team.

**Big-bang move instead of symlink inversion.** 42 references live in completed specs and shipped plans that this framework's own immutability rule forbids editing.
