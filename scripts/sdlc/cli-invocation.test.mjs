// The direct-invocation guard must survive a symlinked entry path (PR #42 review).
//
// `import.meta.url` is realpath'd by Node; `process.argv[1]` is not. Comparing them
// raw makes every CLI here a silent no-op when invoked through a symlinked directory
// — and for validate-review-envelope.mjs, "silent no-op, exit 0" is what the SOP
// reads as "fold the findings", i.e. a garbage envelope passing as a clean review.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

function viaSymlink(script, args, input) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-symlink-'))
    const link = join(dir, 'linked-scripts')
    try {
        symlinkSync(HERE, link, 'dir')
        return spawnSync('node', [join(link, script), ...args], { input, encoding: 'utf8' })
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

test('validate-review-envelope still rejects garbage through a symlinked path', () => {
    const res = viaSymlink('validate-review-envelope.mjs', ['-'], '{not json')
    assert.equal(res.status, 3, 'a silent exit 0 here would read as a clean accept')
    assert.match(res.stderr, /CONTRACT VIOLATION/)
})

test('plan-gate still fails closed through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-plan-'))
    const idx = join(dir, '_index.yaml')
    writeFileSync(idx, 'spec: SPEC-001\ntasks: []\n', 'utf8')
    try {
        const res = viaSymlink('plan-gate.mjs', [idx], '')
        assert.equal(res.status, 1, 'an unstamped plan must HALT, not silently pass')
        assert.match(res.stderr, /HALT/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('reviewer-routing still answers through a symlinked path', () => {
    const res = viaSymlink('reviewer-routing.mjs', ['security'], '')
    assert.equal(res.status, 0)
    assert.match(res.stdout.trim(), /reviewer$/, 'a silent no-op would print nothing')
})

test('check-review-constraint-globs still enforces through a symlinked path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-globs-link-'))
    const reg = join(dir, 'review-constraints.yaml')
    writeFileSync(reg, 'constraints:\n  - id: DEAD\n    when: { touches: ["nowhere/**"] }\n', 'utf8')
    try {
        const res = viaSymlink('check-review-constraint-globs.mjs', ['--enforce', '--registry', reg], '')
        assert.equal(res.status, 1, 'a silent exit 0 here would pass a dead registry as healthy')
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('validate-phase-memory still fails a bad file through a symlinked path', () => {
    // The fifth CLI in this suite — brought under the same isMain() realpath fix
    // as its siblings one round late; a silent exit-0 here would mean CI validated
    // nothing (PR #42 review, round 3).
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-phase-link-'))
    const bad = join(dir, '_index.yaml')
    writeFileSync(bad, 'spec: SPEC-1\nphase:\n  current: not-a-real-phase\n  next_action: none\n  next_trigger: x\n  updated: 2026-01-01\n', 'utf8')
    try {
        const res = viaSymlink('validate-phase-memory.mjs', [bad], '')
        assert.equal(res.status, 1, 'a silent exit 0 here would mean CI validated nothing')
        assert.match(res.stderr, /FAIL/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})
