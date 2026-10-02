// Every validator an adopter's CI runs grades the repo named by --root, not the repo the
// script file sits in (SPEC-009 AC-003). The old scripts derived their root from their
// own location, which is why they had to be copied into the repo they grade. Each case
// plants something only the fixture has and checks the validator saw it, on both layouts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sdlcPaths } from './lib/sdlc-paths.mjs'
import { layout1Repo, layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PAYLOAD = [join(REPO, 'init-payload', '.sdlc', 'scripts'), join(REPO, 'init-payload', 'scripts', 'sdlc')].find(
    existsSync
)

const runs = []

function run(script, args) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CLAUDE_PLUGIN_ROOT
    const res = spawnSync(process.execPath, [join(PAYLOAD, script), ...args], { cwd: tmpdir(), encoding: 'utf8', env })
    runs.push({ script, stderr: res.stderr ?? '' })
    return res
}

/** Plant one spec, one superseded ADR cited from AGENTS.md, and a guide, wherever the layout keeps them. */
function plant(root) {
    const p = sdlcPaths(root, { quiet: true })
    const specs = p.specs
    write(root, join(relativeTo(root, specs), 'SPEC-777-fixture.md'), '---\nid: SPEC-777\nstatus: completed\n---\n\n## Success criteria\n\n- [x] SC-1: done\n')
    write(root, join(relativeTo(root, specs), 'adrs', 'ADR-901-old.md'), '---\nid: ADR-901\nstatus: superseded\nsuperseded_by: ADR-902\n---\n')
    write(root, join(relativeTo(root, specs), 'adrs', 'ADR-902-new.md'), '---\nid: ADR-902\nstatus: accepted\n---\n')
    write(root, 'AGENTS.md', 'Per ADR-901, do the thing.\n')
    mkdirSync(join(specs, 'tasks', 'SPEC-777'), { recursive: true })
    write(root, join(relativeTo(root, specs), 'tasks', 'SPEC-777', '_index.yaml'), 'spec: SPEC-777\nphase:\n  current: not-a-phase\n  next_action: none\n  next_trigger: none\n  updated: 2026-10-02\n')
    return p
}

const relativeTo = (root, abs) => abs.slice(root.length + 1)

for (const [label, build] of [
    ['layout 1', layout1Repo],
    ['layout 2', layout2Repo],
]) {
    test(`${label}: each validator grades the --root repo from another working directory`, () => {
        runs.length = 0
        const fx = build()
        try {
            const p = plant(fx.root)
            const root = ['--root', fx.root]

            const machine = run('validate-state-machine.mjs', root)
            assert.match(machine.stdout + machine.stderr, /phases: 1/, 'the fixture machine has one phase')

            const registry = run('validate-constraints-registry.mjs', [...root, '--allow-empty'])
            assert.equal(registry.status, 0, registry.stderr)
            assert.match(registry.stdout, /no rows/)

            const routing = run('reviewer-routing.mjs', [...root, '--list'])
            assert.match(routing.stdout, /no lenses registered/)

            const resolve = run('resolve.mjs', [...root, 'SPEC-777'])
            assert.equal(resolve.status, 0, resolve.stderr)
            assert.match(resolve.stdout, /SPEC-777-fixture\.md/)

            const complete = run('complete-spec.mjs', [...root, 'SPEC-777'])
            assert.match(complete.stdout, /SPEC-777/)

            const archive = run('archive-specs.mjs', [...root, '--check'])
            assert.equal(archive.status, 1, 'a completed spec in the live corpus is misplaced')
            assert.match(archive.stderr, /SPEC-777/)

            const stale = run('check-stale-citations.mjs', root)
            assert.equal(stale.status, 1, stale.stdout)
            assert.match(stale.stderr, /AGENTS\.md:1 +cites ADR-901/)

            const phase = run('validate-phase-memory.mjs', [...root, join(p.specs, 'tasks', 'SPEC-777', '_index.yaml')])
            assert.equal(phase.status, 1)
            assert.match(phase.stdout + phase.stderr, /not-a-phase/)

            const globs = run('check-review-constraint-globs.mjs', root)
            assert.equal(globs.status, 0, globs.stderr)

            const gate = run('plan-gate.mjs', [...root, '--presence-only', join(p.specs, 'tasks', 'SPEC-777', '_index.yaml')])
            assert.equal(gate.status, 1, 'the fixture index has no plan_review block')
            assert.match(gate.stderr, /MISSING plan_review/)

            // SPEC-009 SC-4: a layout-1 repo sees the notice once per script, a layout-2 repo never.
            for (const r of runs) {
                const notices = (r.stderr.match(/layout 1 detected/g) ?? []).length
                assert.equal(notices, label === 'layout 1' ? 1 : 0, `${r.script}: ${notices} deprecation line(s)`)
            }
        } finally {
            fx.cleanup()
        }
    })
}
