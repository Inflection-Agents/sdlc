// Tests for the archive boundary (the enforcement-tiers plan (M3)).
//
// `archivable` is pure so the denylist rules can be tested without touching the
// filesystem. The two guards below were shipped as blockers downstream before this
// port; both are cheap to hold and expensive to discover after a `git mv`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { archivable, LIVE_STATUSES, statusOf, isCompanion } from './archive-specs.mjs'

const spec = (id, status) => ({ id, status, path: `specs/${id}-x.md` })
const noProtection = { citedIds: new Set(), adrBoundIds: new Set() }

test('draft and active specs are never archivable', () => {
    assert.ok(LIVE_STATUSES.has('draft'))
    assert.ok(LIVE_STATUSES.has('active'))
    assert.deepEqual(archivable([spec('SPEC-010', 'active'), spec('SPEC-011', 'draft')], noProtection), [])
})

test('a completed spec with no protection is archivable', () => {
    assert.deepEqual(
        archivable([spec('SPEC-012', 'completed')], noProtection).map((s) => s.id),
        ['SPEC-012']
    )
})

test('denylist clause 1: a spec cited as spec of record is exempt', () => {
    const p = { citedIds: new Set(['SPEC-001']), adrBoundIds: new Set() }
    assert.deepEqual(archivable([spec('SPEC-001', 'completed')], p), [])
})

test('denylist clause 2: a spec bound by a live ADR is exempt', () => {
    const p = { citedIds: new Set(), adrBoundIds: new Set(['SPEC-006']) }
    assert.deepEqual(archivable([spec('SPEC-006', 'completed')], p), [])
})

test('superseded and cancelled are archivable - replaced is not protected', () => {
    const out = archivable([spec('SPEC-013', 'superseded'), spec('SPEC-014', 'cancelled')], noProtection)
    assert.deepEqual(
        out.map((s) => s.id).sort(),
        ['SPEC-013', 'SPEC-014']
    )
})

test('an unreadable status is treated as live, not archived', () => {
    assert.deepEqual(archivable([{ id: 'SPEC-015', status: null, path: 'x' }], noProtection), [])
})

// ── Status is read from frontmatter only ──────────────────────────────────────
// specs/SPEC-004 carries a template line `status: open | resolved | wontfix` in its
// BODY, so a bare `^status:` scan returns two values for that file.

test('statusOf reads the leading frontmatter block, not a body line', () => {
    const doc = ['---', 'id: SPEC-020', 'status: active', '---', '', '## Template', '', 'status: completed', ''].join(
        '\n'
    )
    assert.equal(statusOf(doc), 'active')
})

test('statusOf returns null when there is no frontmatter, so the spec stays live', () => {
    assert.equal(statusOf('# just a heading\n\nstatus: completed\n'), null)
})

test('a body status line cannot make a live spec archivable', () => {
    const doc = ['---', 'id: SPEC-021', 'status: active', '---', 'status: completed'].join('\n')
    assert.deepEqual(archivable([{ id: 'SPEC-021', status: statusOf(doc), path: 'x' }], noProtection), [])
})

// ── Companion sub-documents ───────────────────────────────────────────────────
// A companion declares `parent_spec` instead of its own `id`. The task tree is
// resolved from the FILENAME's id, so archiving a companion on its own would drag a
// LIVE parent's task tree behind the fence with no warning. Shipped as a blocker
// downstream; this repo has no companions today, so the guard is preventive.

test('isCompanion detects parent_spec without an id of its own', () => {
    assert.ok(isCompanion('---\nparent_spec: SPEC-016\nstatus: completed\n---\n'))
    assert.equal(isCompanion('---\nid: SPEC-016\nstatus: completed\n---\n'), false)
})

test('a companion is never archived on its own', () => {
    const rows = [{ id: 'SPEC-016', status: 'completed', path: 'x', companion: true }]
    assert.deepEqual(archivable(rows, noProtection), [])
})
