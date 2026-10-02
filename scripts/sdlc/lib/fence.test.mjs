import { test } from 'node:test'
import assert from 'node:assert/strict'

import { fenceTracker } from './fence.mjs'

const mark = (text) => {
    const fenced = fenceTracker()
    return text.split('\n').map((l) => fenced(l))
}

test('a fence closes only on the same character, at least as long as its opener', () => {
    assert.deepEqual(mark('a\n~~~\n```\nb\n~~~\nc'), [false, true, true, true, true, false])
    assert.deepEqual(mark('````\n```\nb\n````\nc'), [true, true, true, true, false])
    assert.deepEqual(mark('```js\nx\n```\ny'), [true, true, true, false])
})
