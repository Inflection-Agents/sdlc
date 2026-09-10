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

// ── The four CLIs added by the enforcement-tiers plan (M3/M4) ─────────────────────────────────────
// Each shipped with the raw `argv[1] === fileURLToPath(import.meta.url)` comparison
// this file exists to prevent, and two of them are wired into sdlc-validate.yml —
// where "silent no-op, exit 0" reads as a passing gate.

test('resolve.mjs still reports a missing id through a symlinked path', () => {
    const res = viaSymlink('resolve.mjs', ['SPEC-99999'], '')
    assert.notEqual(res.status, 0, 'a missing id must not exit 0 through a symlink')
    assert.match(res.stderr, /no file found/)
})

test('resolve.mjs still resolves a real id through a symlinked path', () => {
    const res = viaSymlink('resolve.mjs', ['ADR-004'], '')
    assert.equal(res.status, 0)
    assert.match(res.stdout, /ADR-004/)
})

test('complete-spec.mjs still grades through a symlinked path', () => {
    // SPEC-003 is active with unchecked criteria, so a working CLI exits 1 and says so.
    const res = viaSymlink('complete-spec.mjs', ['SPEC-003'], '')
    assert.notEqual(res.status, 0, 'an incomplete spec must not exit 0 through a symlink')
    assert.match(res.stdout, /NOT COMPLETABLE/)
})

test('complete-spec.mjs still reports a missing spec through a symlinked path', () => {
    const res = viaSymlink('complete-spec.mjs', ['SPEC-99999'], '')
    assert.equal(res.status, 2)
    assert.match(res.stderr, /no spec file found/)
})

test('archive-specs.mjs --check still produces output through a symlinked path', () => {
    const res = viaSymlink('archive-specs.mjs', ['--check'], '')
    // Exit code depends on corpus state; a silent no-op is the failure mode.
    assert.notEqual(res.stdout.trim() + res.stderr.trim(), '', 'the gate must not run silently')
})

test('check-stale-citations.mjs still produces output through a symlinked path', () => {
    const res = viaSymlink('check-stale-citations.mjs', [], '')
    assert.notEqual(res.stdout.trim() + res.stderr.trim(), '', 'the gate must not run silently')
})
