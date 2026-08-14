// An unmatched shell glob (e.g. `specs/tasks/*/_index.yaml` on a repo with no
// specs/tasks/ yet) is passed through LITERALLY without `nullglob`. Both CI-facing
// validators must treat that as "nothing to check", not "missing file" — the
// state of every freshly bootstrapped repo's very first PR (PR #42 round 3).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const run = (script, args) => spawnSync('node', [join(HERE, script), ...args], { encoding: 'utf8' })

test('plan-gate: an unmatched glob is a clean no-op, not a HALT', () => {
    const res = run('plan-gate.mjs', ['--presence-only', 'specs/tasks/NOPE-*/_index.yaml'])
    assert.equal(res.status, 0)
    assert.match(res.stdout, /nothing to check/)
})

test('plan-gate: an explicit missing literal path still fails (unambiguous intent)', () => {
    const res = run('plan-gate.mjs', ['/no/such/literal/_index.yaml'])
    assert.equal(res.status, 1)
    assert.match(res.stderr, /HALT/)
})

test('validate-phase-memory: an unmatched glob is a clean no-op, not a FAIL', () => {
    const res = run('validate-phase-memory.mjs', ['specs/tasks/NOPE-*/_index.yaml'])
    assert.equal(res.status, 0)
    assert.match(res.stdout, /nothing to check/)
})

test('validate-phase-memory: an explicit missing literal path still fails', () => {
    const res = run('validate-phase-memory.mjs', ['/no/such/literal/_index.yaml'])
    assert.equal(res.status, 1)
    assert.match(res.stderr, /FAIL/)
})

test('a mix of a real match and an unmatched glob still validates the real one', () => {
    const res = run('plan-gate.mjs', ['--presence-only', 'specs/tasks/SPEC-006/_index.yaml', 'specs/tasks/NOPE-*/_index.yaml'])
    assert.equal(res.status, 0)
    assert.match(res.stdout, /SPEC-006/)
})
