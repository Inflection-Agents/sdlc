// An unmatched shell glob (e.g. `specs/tasks/*/_index.yaml` on a repo with no
// specs/tasks/ yet) is passed through LITERALLY without `nullglob`. Both CI-facing
// validators must treat that as "nothing to check", not "missing file" — the
// state of every freshly bootstrapped repo's very first PR (PR #42 round 3).
//
// Every fixture here is built in a temp directory with absolute paths. An earlier
// version of this file used a repo-relative fixture (`specs/tasks/SPEC-006/...`),
// which only passed because it happened to be run from THIS repo's root — copied
// into a consuming repo by bootstrap.sh (which ships every scripts/sdlc/*.test.mjs
// file), that fixture doesn't exist and the test itself would fail, reintroducing
// the exact "red CI on a bootstrapped repo" failure this file exists to prevent
// (PR #42 review, round 3, second occurrence).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const run = (script, args) => spawnSync('node', [join(HERE, script), ...args], { encoding: 'utf8' })

function withTempIndex(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-empty-glob-'))
    const specDir = join(dir, 'SPEC-999')
    mkdirSync(specDir, { recursive: true })
    const indexPath = join(specDir, '_index.yaml')
    writeFileSync(
        indexPath,
        'spec: SPEC-999\nplan_review:\n  approved: true\n  status: reviewed\ntasks: []\n',
        'utf8'
    )
    try {
        return fn(indexPath)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

test('plan-gate: an unmatched glob is a clean no-op, not a HALT', () => {
    const res = run('plan-gate.mjs', ['--presence-only', '/tmp/sdlc-empty-glob-nope-XXXX/NOPE-*/_index.yaml'])
    assert.equal(res.status, 0)
    assert.match(res.stdout, /nothing to check/)
})

test('plan-gate: an explicit missing literal path still fails (unambiguous intent)', () => {
    const res = run('plan-gate.mjs', ['/no/such/literal/_index.yaml'])
    assert.equal(res.status, 1)
    assert.match(res.stderr, /HALT/)
})

test('validate-phase-memory: an unmatched glob is a clean no-op, not a FAIL', () => {
    const res = run('validate-phase-memory.mjs', ['/tmp/sdlc-empty-glob-nope-XXXX/NOPE-*/_index.yaml'])
    assert.equal(res.status, 0)
    assert.match(res.stdout, /nothing to check/)
})

test('validate-phase-memory: an explicit missing literal path still fails', () => {
    const res = run('validate-phase-memory.mjs', ['/no/such/literal/_index.yaml'])
    assert.equal(res.status, 1)
    assert.match(res.stderr, /FAIL/)
})

test('a mix of a real match and an unmatched glob still validates the real one', () => {
    withTempIndex((indexPath) => {
        const res = run('plan-gate.mjs', [
            '--presence-only',
            indexPath,
            '/tmp/sdlc-empty-glob-nope-XXXX/NOPE-*/_index.yaml'
        ])
        assert.equal(res.status, 0)
        assert.match(res.stdout, /SPEC-999/)
    })
})

test('a real file that happens to contain a glob metacharacter in its name still validates', () => {
    // A literal path can legitimately contain `[` or `?` on some filesystems; the
    // "unmatched glob" tolerance must check existence FIRST, never treat a
    // glob-looking character as disqualifying on its own.
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-empty-glob-weird-'))
    try {
        const weird = join(dir, '_index[1].yaml')
        writeFileSync(weird, 'spec: SPEC-999\nplan_review:\n  approved: true\ntasks: []\n', 'utf8')
        const res = run('plan-gate.mjs', ['--presence-only', weird])
        assert.equal(res.status, 0)
        assert.match(res.stdout, /block present/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})
