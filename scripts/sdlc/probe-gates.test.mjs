// Tests for the gate probes (SPEC-009 AC-015). A probe plants a violation and checks the gate
// catches it, so a gate that went silent in the migration shows up as a regression.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { compare, probeRev, workflowFilters } from './probe-gates.mjs'
import { FIXED_HOOK, forkedHighGearRepo, git, write } from './__fixtures__/layouts/build.mjs'

delete process.env.CLAUDE_PROJECT_DIR
delete process.env.CLAUDE_PLUGIN_ROOT

const MIGRATE = fileURLToPath(new URL('./migrate-layout.mjs', import.meta.url))
const PAYLOAD = fileURLToPath(new URL('../../init-payload/', import.meta.url))
const result = (list, id) => list.find((r) => r.id === id)
// P4 and P6 search with ripgrep, which a CI image may not have. They report `ran: false` there.
const hasRg = spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0

test('AC-015: P1 to P5 hold across a fixed migration, the unfixed tip regresses, and P6 and P7 pass', () => {
    const fx = forkedHighGearRepo()
    const r = fx.root
    try {
        const before = probeRev(r, 'HEAD')
        assert.equal(result(before, 'P1').caught, true, 'rule 8 fires on layout 1')
        assert.equal(result(before, 'P2').caught, true, 'the local hook routes on layout 1')
        if (hasRg) assert.equal(result(before, 'P4').caught, true, 'the flat archive is hidden')

        const m = spawnSync(process.execPath, [MIGRATE, '--root', r, '--apply'], { encoding: 'utf8' })
        assert.equal(m.status, 3, m.stderr)
        const unfixed = probeRev(r, 'HEAD')
        const regressed = compare(before, unfixed)
        assert.ok(regressed.some((p) => /^P(2|3|5) /.test(p)), regressed.join('\n'))

        write(r, '.claude/hooks/user-prompt-submit.mjs', FIXED_HOOK)
        write(r, '.sdlc/scripts/validate-guide.mjs', readFileSync(`${PAYLOAD}.sdlc/scripts/validate-guide.mjs`, 'utf8'))
        git(r, 'add', '-A')
        git(r, 'commit', '-q', '-m', 'fix the readers the scan flagged')
        const fixed = probeRev(r, 'HEAD')
        assert.deepEqual(compare(before, fixed), [])
        for (const id of hasRg ? ['P6', 'P7'] : ['P7']) {
            assert.equal(result(fixed, id).ran, true, id)
            assert.equal(result(fixed, id).caught, true, `${id}: ${result(fixed, id).detail}`)
        }
        assert.deepEqual(git(r, 'worktree', 'list').trim().split('\n').length, 1, 'every probe worktree is removed')
        assert.doesNotMatch(git(r, 'branch'), /probe/, 'every probe branch is deleted')
    } finally {
        fx.cleanup()
    }
})

test('workflowFilters reads block and flow paths filters per event', () => {
    const f = workflowFilters("on:\n  push:\n    branches: [main]\n    paths-ignore:\n      - '**.md'\n  pull_request:\n    paths: ['.sdlc/**', 'specs/**']\njobs: {}\n")
    assert.deepEqual(f.push.ignore, ['**.md'])
    assert.deepEqual(f.pull_request.paths, ['.sdlc/**', 'specs/**'])
})
