// Tests for the engine's pure reviewer-routing resolver (ADR-001).
//
// execute-spec.js is a Workflow-runtime script (no `import`/`export run`, uses runtime globals
// like `agent`/`parallel`), so this test CANNOT import it. Instead it defines a byte-identical
// copy of the engine's `agentForLens` and asserts its behavior. The no-import test pattern.
//
// >>> The copy below MUST stay byte-identical to the `agentForLens` definition in
// >>> .claude/workflows/execute-spec.js. If you change one, change the other. <<<
const agentForLens = (constraints, lens) =>
    ((constraints || []).find((c) => c.lens === lens && c.agent) || {}).agent || 'task-reviewer'

import { test } from 'node:test'
import assert from 'node:assert/strict'

// fixture: a constraints array as parsed from review-constraints.yaml.
const constraints = [
    { id: 'C1', lens: 'design-fidelity', agent: 'design-fidelity-reviewer', severity: 'major' },
    { id: 'C2', lens: 'security', agent: 'invariants-reviewer', severity: 'blocker' },
    { id: 'C3', lens: 'naming' } // declares a lens but NO agent -> unmapped
]

test('a mapped lens resolves to its constraint agent:', () => {
    assert.equal(agentForLens(constraints, 'design-fidelity'), 'design-fidelity-reviewer')
    assert.equal(agentForLens(constraints, 'security'), 'invariants-reviewer')
})

test('an unmapped lens (no agent, or no matching constraint) resolves to task-reviewer', () => {
    assert.equal(agentForLens(constraints, 'naming'), 'task-reviewer') // constraint present but no agent:
    assert.equal(agentForLens(constraints, 'no-such-lens'), 'task-reviewer') // no constraint at all
    assert.equal(agentForLens(undefined, 'security'), 'task-reviewer') // no constraints array
    assert.equal(agentForLens([], 'security'), 'task-reviewer') // empty constraints
})

test('adding an agent: to a fixture constraint reroutes the lens (no engine change required)', () => {
    // baseline: the `naming` lens folds into task-reviewer.
    assert.equal(agentForLens(constraints, 'naming'), 'task-reviewer')
    // add an agent: line to the registry constraint -> the lens reroutes, purely from data.
    const rerouted = constraints.map((c) => (c.lens === 'naming' ? { ...c, agent: 'naming-reviewer' } : c))
    assert.equal(agentForLens(rerouted, 'naming'), 'naming-reviewer')
})
