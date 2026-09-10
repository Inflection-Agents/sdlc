// Tests for id resolution across the archive boundary (the enforcement-tiers plan (M3)).
//
// The fence hides archived material from search, which only pays if the archive
// stays addressable. Ids are how the corpus refers to itself, so this is the
// address lookup: without it, archiving ships a trap.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { rootsFor, matchesId } from './resolve.mjs'

test('each id kind searches both its live and archived roots', () => {
    assert.ok(
        rootsFor('SPEC-004').some((r) => r.includes('archive')),
        'SPEC must search the archive'
    )
    assert.ok(
        rootsFor('TASK-100').some((r) => r.includes('archive')),
        'TASK must search the archive'
    )
    assert.ok(rootsFor('ADR-001').length > 0, 'ADR must have at least one root')
})

test('rootsFor puts the live root first, so a live hit wins a tie', () => {
    const roots = rootsFor('SPEC-004')
    assert.equal(
        roots.findIndex((r) => r.includes('archive')) > 0,
        true,
        'the archive root must not be searched before the live one'
    )
})

test('an unknown id kind still resolves to a searchable root rather than throwing', () => {
    assert.ok(Array.isArray(rootsFor('BUG-001')))
})

test('id matching anchors at the start and requires a separator', () => {
    assert.ok(matchesId('SPEC-004', 'SPEC-004-artifact-completeness-ports.md'))
    assert.equal(matchesId('SPEC-004', 'SPEC-0041-other.md'), false)
    assert.equal(matchesId('SPEC-4', 'SPEC-004-x.md'), false)
})

test('id matching accepts a dot separator, for TASK-012.md style names', () => {
    assert.ok(matchesId('TASK-012', 'TASK-012.md'))
})

test('id matching is case-insensitive on the prefix', () => {
    assert.ok(matchesId('spec-004', 'SPEC-004-x.md'))
    assert.ok(matchesId('SPEC-004', 'spec-004-x.md'))
})

test('id matching does not match a mention inside a longer name', () => {
    assert.equal(matchesId('SPEC-004', 'notes-about-SPEC-004.md'), false)
})
