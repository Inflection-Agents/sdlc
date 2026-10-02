// Tests for the retired-phase path in validate-phase-memory.mjs (SPEC-008 AC-019, ADR-007).
//
// Fixtures are built from the shipped machine's `retired_phases:` list, so this file holds no
// literal retired id: retiring another phase later needs no edit here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFile, loadPhaseIds, loadRetiredIds, validatePhaseBlock } from './validate-phase-memory.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MACHINE = join(HERE, '..', '..', '.sdlc', 'state-machine.yaml')
const phaseIds = loadPhaseIds(MACHINE)
const retiredIds = loadRetiredIds(MACHINE)
const [retired] = [...retiredIds]

const index = (current, nextAction) =>
    `spec: SPEC-900\nphase:\n  current: ${current}\n  next_action: ${nextAction}\n  next_trigger: 'x'\n  updated: 2026-09-30\n`

function withIndex(text, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-phase-'))
    const path = join(dir, '_index.yaml')
    writeFileSync(path, text, 'utf8')
    try {
        return fn(path)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

test('the shipped machine retires at least one id, and no retired id is still a live phase', () => {
    assert.ok(retiredIds.size > 0)
    for (const id of retiredIds) assert.ok(!phaseIds.has(id), `${id} is both retired and live`)
})

test('a retired id in phase.current is accepted with a warning', () => {
    const { problems, warnings } = withIndex(index(retired, 'spec-execution'), (p) => checkFile(p, phaseIds, retiredIds))
    assert.deepEqual(problems, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], new RegExp(`phase\\.current: '${retired}'`))
})

test('a retired id in phase.next_action is accepted with a warning', () => {
    const { problems, warnings } = withIndex(index('spec-authoring', retired), (p) => checkFile(p, phaseIds, retiredIds))
    assert.deepEqual(problems, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], new RegExp(`phase\\.next_action: '${retired}'`))
})

test('an id that is neither live nor retired is still rejected', () => {
    const problems = validatePhaseBlock({ current: 'no-such-phase', next_action: 'none', next_trigger: 'x', updated: 'd' }, phaseIds, retiredIds)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /no-such-phase/)
})

test('the CLI exits 0 and prints the warning through a symlinked path', () => {
    withIndex(index(retired, retired), (path) => {
        const dir = mkdtempSync(join(tmpdir(), 'sdlc-phase-link-'))
        try {
            symlinkSync(HERE, join(dir, 'linked'), 'dir')
            const res = spawnSync('node', [join(dir, 'linked', 'validate-phase-memory.mjs'), path], { encoding: 'utf8' })
            assert.equal(res.status, 0, res.stderr)
            assert.match(res.stdout, /WARN .*retired phase id/)
            assert.match(res.stdout, /^OK /m)
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })
})
