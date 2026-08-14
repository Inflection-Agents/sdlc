// Tests for lens → reviewer routing (ADR-001), re-homed out of the retired
// execute-spec Workflow into scripts/sdlc/reviewer-routing.mjs (ADR-003).
//
// The resolver used to live inside a Workflow-runtime script that could not be
// imported, so this file kept a byte-identical copy. It now imports the real
// implementation, and additionally asserts the shipped registry parses.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agentForLens, loadConstraints, parseConstraints } from './reviewer-routing.mjs'

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

test('adding an agent: to a fixture constraint reroutes the lens (data, not code)', () => {
    // baseline: the `naming` lens folds into task-reviewer.
    assert.equal(agentForLens(constraints, 'naming'), 'task-reviewer')
    // add an agent: line to the registry constraint -> the lens reroutes, purely from data.
    const rerouted = constraints.map((c) => (c.lens === 'naming' ? { ...c, agent: 'naming-reviewer' } : c))
    assert.equal(agentForLens(rerouted, 'naming'), 'naming-reviewer')
})

// ── the registry reader ───────────────────────────────────────────────────────

const REGISTRY = `baseLenses:
  _default: [ac-completeness, conventions, adversarial]

constraints:
  - id: INV-ONE
    scope: task
    when: { touches: ["packages/**"] }
    lens: core-purity
    agent: invariants-reviewer
    severity: blocker
    check: >
      A folded block scalar that mentions agent: nothing and lens: nothing
      across several lines.
    cite: "inv:INV-ONE"

  - id: INV-TWO
    scope: integration
    when: { touches: ["**/schema/**"] }
    lens: contract-parity
    severity: blocker
    cite: "inv:INV-TWO"
`

test('parseConstraints reads the routing fields and ignores nested/blocked ones', () => {
    const parsed = parseConstraints(REGISTRY)
    assert.equal(parsed.length, 2)
    assert.deepEqual(parsed[0], {
        id: 'INV-ONE',
        scope: 'task',
        lens: 'core-purity',
        agent: 'invariants-reviewer',
        severity: 'blocker'
    })
    assert.equal(parsed[1].agent, undefined, 'an integration-scope constraint carries no agent:')
    assert.equal(agentForLens(parsed, 'core-purity'), 'invariants-reviewer')
    assert.equal(agentForLens(parsed, 'contract-parity'), 'task-reviewer')
})

test('the shipped registry parses and every declared agent resolves through it', () => {
    const parsed = loadConstraints()
    assert.ok(parsed.length > 0, 'the shipped review-constraints.yaml must parse to at least one constraint')
    for (const c of parsed) {
        assert.ok(c.lens, `constraint ${c.id} declares no lens`)
        if (c.agent) assert.equal(agentForLens(parsed, c.lens), c.agent)
    }
})
