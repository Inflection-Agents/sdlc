// Tests for spec completability grading (SPEC-007 M4).
//
// This grades and reports. It never writes: whether the evidence substantiates a
// criterion is judgment, and that stays with the human at the integration PR.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { uncheckedCriteria, completability } from './complete-spec.mjs'

const withCriteria = (body) => ['---', 'id: SPEC-099', 'status: active', '---', '', '## Success criteria', '', body].join('\n')

test('unchecked success criteria are extracted verbatim', () => {
    const body = withCriteria(['- [x] First thing works', '- [ ] Second thing is unverified', '- [x] Third works'].join('\n'))
    assert.deepEqual(uncheckedCriteria(body), ['Second thing is unverified'])
})

test('a spec with every criterion checked is completable', () => {
    const r = completability({ status: 'active', body: withCriteria('- [x] a\n- [x] b') })
    assert.equal(r.completable, true)
    assert.deepEqual(r.blocking, [])
})

test('an unchecked criterion blocks completion and names the criterion', () => {
    const r = completability({ status: 'active', body: withCriteria('- [x] a\n- [ ] b is open') })
    assert.equal(r.completable, false)
    assert.deepEqual(r.blocking, ['b is open'])
})

test('superseded and cancelled are left alone - replaced is not finished', () => {
    for (const status of ['superseded', 'cancelled']) {
        const r = completability({ status, body: withCriteria('- [x] a') })
        assert.equal(r.completable, false, `${status} must not auto-complete`)
        assert.match(r.reason, /superseded|cancelled|terminal/i)
    }
})

test('an already-completed spec is not re-completed', () => {
    const r = completability({ status: 'completed', body: withCriteria('- [x] a') })
    assert.equal(r.completable, false)
})

test('a spec with no Success criteria section refuses rather than guessing', () => {
    const r = completability({ status: 'active', body: '---\nstatus: active\n---\n# nothing here' })
    assert.equal(r.completable, false)
    assert.match(r.reason, /no .*success criteria/i)
})

// An EMPTY section auto-completed downstream and shipped as a blocker there. Zero
// criteria is not zero unchecked criteria, and it is the one input this gate exists
// to hold on.

test('an EMPTY Success criteria section refuses', () => {
    const r = completability({ status: 'active', body: withCriteria('') })
    assert.equal(r.completable, false)
    assert.match(r.reason, /empty|no criteria/i)
})

test('a section holding only prose, no checkboxes, refuses', () => {
    const r = completability({ status: 'active', body: withCriteria('All of the criteria were met.') })
    assert.equal(r.completable, false)
})

test('criteria inside a fenced code block are not counted', () => {
    const body = withCriteria(['```markdown', '- [ ] an example criterion in a template', '```', '', '- [x] the real one'].join('\n'))
    assert.deepEqual(uncheckedCriteria(body), [])
    assert.equal(completability({ status: 'active', body }).completable, true)
})

test('the criteria scan stops at the next section heading', () => {
    const body = withCriteria(['- [x] a', '', '## Scope', '', '- [ ] not a success criterion'].join('\n'))
    assert.deepEqual(uncheckedCriteria(body), [])
})
