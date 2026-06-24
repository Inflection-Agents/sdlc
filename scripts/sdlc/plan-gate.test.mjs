// Tests for the engine's pure plan-review gate predicate (ADR-002).
//
// execute-spec.js is a Workflow-runtime script (no `import`/`export run`, uses runtime globals
// like `agent`/`parallel`), so this test CANNOT import it. Instead it defines a byte-identical
// copy of the engine's `planApproved` and asserts its truth table. The no-import test pattern.
//
// >>> The copy below MUST stay byte-identical to the `planApproved` definition in
// >>> .claude/workflows/execute-spec.js. If you change one, change the other. <<<
const planApproved = (pr) => !!pr && pr.approved === true && pr.status !== 'needs-rework'

import { test } from 'node:test'
import assert from 'node:assert/strict'

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
