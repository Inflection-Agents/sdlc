// Tests for the plan-review gate (ADR-002), re-homed out of the retired
// execute-spec Workflow into scripts/sdlc/plan-gate.mjs (ADR-003).
//
// The gate used to live inside a Workflow-runtime script that could not be
// imported, so this file kept a byte-identical copy of the predicate. It now
// imports the real implementation — the copy, and the drift it invited, are gone.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkPlanGate, parsePlanReviewBlock, planApproved } from './plan-gate.mjs'

test('absent plan_review block is fail-closed (false)', () => {
    assert.equal(planApproved(undefined), false)
    assert.equal(planApproved(null), false)
})

test('approved:false is not approved (false)', () => {
    assert.equal(planApproved({ approved: false }), false)
    assert.equal(planApproved({ approved: false, status: 'reviewed' }), false)
})

test('status:needs-rework is not approved even when approved:true (false)', () => {
    assert.equal(planApproved({ approved: true, status: 'needs-rework' }), false)
})

test('missing approved field is not approved (false)', () => {
    assert.equal(planApproved({ status: 'reviewed' }), false)
})

test('approved:true and status not needs-rework is approved (true)', () => {
    assert.equal(planApproved({ approved: true, status: 'reviewed' }), true)
    assert.equal(planApproved({ approved: true }), true) // status absent is fine; only needs-rework blocks
})

test('a truthy non-boolean approved value does not pass the gate', () => {
    assert.equal(planApproved({ approved: 'yes' }), false)
    assert.equal(planApproved({ approved: 1 }), false)
})

// ── the _index.yaml reader ────────────────────────────────────────────────────

const INDEX_WITH = `spec: SPEC-042
created: 2026-08-14

plan_review:
    approved: true
    status: reviewed
    reviewer: spec-reviewer
    date: 2026-08-14

tasks:
  - id: TASK-001
    status: pending
`

const INDEX_WITHOUT = `spec: SPEC-042
tasks:
  - id: TASK-001
    status: pending
`

test('parsePlanReviewBlock reads the block and coerces booleans', () => {
    const block = parsePlanReviewBlock(INDEX_WITH)
    assert.deepEqual(block, {
        approved: true,
        status: 'reviewed',
        reviewer: 'spec-reviewer',
        date: '2026-08-14'
    })
    assert.equal(parsePlanReviewBlock(INDEX_WITHOUT), null)
})

test('parsePlanReviewBlock stops at the next top-level key', () => {
    const block = parsePlanReviewBlock(INDEX_WITH)
    assert.ok(!('tasks' in block), 'the tasks list must not bleed into the plan_review block')
})

function withIndex(body, fn) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-plan-gate-'))
    const path = join(dir, '_index.yaml')
    writeFileSync(path, body, 'utf8')
    try {
        return fn(path)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

test('checkPlanGate approves a stamped index and HALTs an unstamped one', () => {
    withIndex(INDEX_WITH, (p) => assert.equal(checkPlanGate(p).approved, true))
    withIndex(INDEX_WITHOUT, (p) => {
        const res = checkPlanGate(p)
        assert.equal(res.approved, false)
        assert.match(res.reason, /no plan_review/)
    })
})

test('checkPlanGate HALTs on needs-rework and on an unreadable file', () => {
    withIndex(INDEX_WITH.replace('status: reviewed', 'status: needs-rework'), (p) => {
        const res = checkPlanGate(p)
        assert.equal(res.approved, false)
        assert.match(res.reason, /not approved/)
    })
    const res = checkPlanGate('/nonexistent/_index.yaml')
    assert.equal(res.approved, false)
    assert.match(res.reason, /cannot read/)
})
