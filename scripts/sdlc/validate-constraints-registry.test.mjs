// Tests for the registry shape gate.
//
// This gate exists because /sdlc-init Phase 3 previously ran `node --test` on a glob
// that matches nothing in an adopting repo — and node --test exits 0 on an unmatched
// glob, so the step that justifies the whole generated-config interview verified
// nothing at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { gradeRows } from './validate-constraints-registry.mjs'

const row = (over = {}) => ({
    id: 'X',
    lens: 'conventions',
    check: 'do the thing',
    cite: 'inv:X',
    severity: 'major',
    scope: 'task',
    ...over
})

test('a well-formed row grades clean', () => {
    assert.deepEqual(gradeRows([row()]), [])
})

test('an ungrounded cite is caught', () => {
    // The envelope validator rejects a blocking finding citing an unknown prefix, so
    // a row shipping one produces findings a reviewer cannot ground.
    const p = gradeRows([row({ cite: 'standing review-lens checklist' })])
    assert.equal(p.length, 1)
    assert.match(p[0], /no grounded prefix/)
})

test('a missing cite is caught', () => {
    assert.match(gradeRows([row({ cite: undefined })]).join('\n'), /no `cite`/)
})

test('a missing lens is caught — it would route to no reviewer', () => {
    assert.match(gradeRows([row({ lens: undefined })]).join('\n'), /no `lens`/)
})

test('a missing check is caught — a reviewer is told nothing to verify', () => {
    assert.match(gradeRows([row({ check: undefined })]).join('\n'), /no `check`/)
})

test('an off-ladder severity is caught', () => {
    assert.match(gradeRows([row({ severity: 'critical' })]).join('\n'), /not blocker\|major\|nit\|suggestion/)
})

test('an unknown scope is caught', () => {
    assert.match(gradeRows([row({ scope: 'global' })]).join('\n'), /not task\|integration/)
})

test('a non-string glob is caught rather than thrown on', () => {
    assert.match(gradeRows([row({ when: { touches: [42] } })]).join('\n'), /not a string/)
})

test('glob RESOLVABILITY is not graded here', () => {
    // check-review-constraint-globs.mjs owns that, with warn/enforce modes. A second
    // glob engine here is how two checkers disagree about the same row.
    assert.deepEqual(gradeRows([row({ when: { touches: ['nonexistent/zzz/**'] } })]), [])
})

test('every row is graded, not just the first', () => {
    assert.equal(gradeRows([row({ cite: undefined }), row({ lens: undefined })]).length, 2)
})
