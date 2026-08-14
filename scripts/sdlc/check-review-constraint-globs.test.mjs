// Tests for the review-registry resolvability gate.
//
// The registry is the review floor the integration panel is graded against, so a row
// this reader mis-parses is a row that silently stops being checked — the same defect
// class the checker exists to catch, one level up. Round 2 of the PR #42 panel found
// exactly that: prose inside a `check:` block forked a phantom row that stole a real
// row's globs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findDeadGlobs, globResolves, parseRegistryTouches } from './check-review-constraint-globs.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'check-review-constraint-globs.mjs')
const REPO = join(HERE, '..', '..')

test('reads the inline flow form', () => {
    const rows = parseRegistryTouches(`constraints:
  - id: A
    when: { touches: ["src/**", "lib/*.ts"] }
    lens: x
`)
    assert.deepEqual(rows, [{ id: 'A', touches: ['src/**', 'lib/*.ts'] }])
})

test('reads the block-list form', () => {
    const rows = parseRegistryTouches(`constraints:
  - id: B
    when:
        touches:
            - 'a/**'
            - "b/**"
`)
    assert.deepEqual(rows[0].touches, ['a/**', 'b/**'])
})

test('reads a flow list that spans lines, including one opening on the next line', () => {
    const rows = parseRegistryTouches(`constraints:
  - id: C
    when:
        touches: [
            'c/**',
            'd/**'
        ]
  - id: D
    when:
        touches:
            [
                'e/**'
            ]
`)
    assert.deepEqual(rows.find((r) => r.id === 'C').touches, ['c/**', 'd/**'])
    assert.deepEqual(rows.find((r) => r.id === 'D').touches, ['e/**'])
})

test('a check: block scalar cannot fork a phantom row or steal globs', () => {
    const rows = parseRegistryTouches(`constraints:
  - id: INV-REAL
    when: { touches: ["scripts/**"] }
    lens: real-lens
    check: >
      A prose paragraph that happens to contain a line starting with
      - id: PHANTOM
      and a stray touches: ["nope/**"] mention.
    cite: "inv:INV-REAL"
`)
    assert.equal(rows.length, 1, 'prose must not fork a row')
    assert.equal(rows[0].id, 'INV-REAL')
    assert.deepEqual(rows[0].touches, ['scripts/**'], "the real row must keep its own globs")
})

test('a row with no path selector is RETURNED, not silently dropped', () => {
    // Integration-scope rows legitimately select on workspace/task_has instead. They
    // must still surface, or "no globs read" is indistinguishable from "not parsed".
    const rows = parseRegistryTouches(`constraints:
  - id: INTEG-ONLY
    scope: integration
    lens: y
`)
    assert.deepEqual(rows, [{ id: 'INTEG-ONLY', touches: [] }])
})

test('globResolves answers against the given root and ignores vendored dirs', () => {
    assert.equal(globResolves('scripts/sdlc/*.mjs', REPO), true)
    assert.equal(globResolves('no/such/path/**', REPO), false)
})

test('findDeadGlobs reports exactly the unresolvable globs', () => {
    const dead = findDeadGlobs(
        [{ id: 'A', touches: ['scripts/sdlc/*.mjs', 'definitely/not/here/**'] }],
        REPO
    )
    assert.deepEqual(dead, [{ id: 'A', glob: 'definitely/not/here/**' }])
})

// ── CLI modes ────────────────────────────────────────────────────────────────

function runCli(registryBody, args = []) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-globs-'))
    const reg = join(dir, 'review-constraints.yaml')
    writeFileSync(reg, registryBody, 'utf8')
    try {
        return spawnSync('node', [CLI, '--registry', reg, '--root', REPO, ...args], { encoding: 'utf8' })
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

const DEAD = `constraints:
  - id: DEAD-ROW
    when: { touches: ["nowhere/at/all/**"] }
    lens: z
`
const LIVE = `constraints:
  - id: LIVE-ROW
    when: { touches: ["scripts/sdlc/**"] }
    lens: z
`

test('warn mode reports a dead glob but exits 0; --enforce exits 1', () => {
    const warn = runCli(DEAD)
    assert.equal(warn.status, 0)
    assert.match(warn.stderr, /dead glob/)

    const enforce = runCli(DEAD, ['--enforce'])
    assert.equal(enforce.status, 1)
    assert.match(enforce.stderr, /DEAD GLOB/)
})

test('a fully resolving registry exits 0 in both modes', () => {
    assert.equal(runCli(LIVE).status, 0)
    assert.equal(runCli(LIVE, ['--enforce']).status, 0)
})

test('an unreadable registry does not fail the build in warn mode', () => {
    const res = spawnSync('node', [CLI, '--registry', '/no/such/registry.yaml'], { encoding: 'utf8' })
    assert.equal(res.status, 0)
    assert.match(res.stderr, /cannot read/)
})
