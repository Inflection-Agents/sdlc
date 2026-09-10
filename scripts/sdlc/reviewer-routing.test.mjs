// Tests for lens → reviewer routing (ADR-001), re-homed out of the retired
// execute-spec Workflow into scripts/sdlc/reviewer-routing.mjs (ADR-003).
//
// The resolver used to live inside a Workflow-runtime script that could not be
// imported, so this file kept a byte-identical copy. It now imports the real
// implementation, and additionally asserts the shipped registry parses.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    agentForLens,
    applicableConstraints,
    globToRe,
    loadConstraints,
    parseConstraints
} from './reviewer-routing.mjs'

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
      A folded block scalar whose own lines START with routing-looking keys:
      agent: not-a-real-reviewer
      lens: hijacked
      severity: nit
      Free text inside a check must never overwrite the row's routing.
    cite: "inv:INV-ONE"

  - id: INV-TWO
    scope: integration
    when: { touches: ["**/schema/**"] }
    lens: contract-parity
    severity: blocker
    cite: "inv:INV-TWO"
`

test('a check: block scalar cannot hijack the row it documents', () => {
    // The fixture's `check:` paragraph contains lines that begin `agent:` / `lens:` /
    // `severity:`. Prose must never reroute a reviewer.
    const parsed = parseConstraints(REGISTRY)
    const one = parsed.find((c) => c.id === 'INV-ONE')
    assert.equal(one.agent, 'invariants-reviewer', 'block-scalar text overwrote the real agent')
    assert.equal(one.lens, 'core-purity', 'block-scalar text overwrote the real lens')
    assert.equal(one.severity, 'blocker')
    assert.equal(agentForLens(parsed, 'hijacked'), 'task-reviewer', 'a hijacked lens must not exist')
})

test('a column-0 list style still parses (a real top-level key ends the list)', () => {
    const flat = `constraints:
- id: INV-FLAT
  lens: flat-lens
  agent: flat-reviewer
exempt:
  - something
`
    const parsed = parseConstraints(flat)
    assert.equal(parsed.length, 1)
    assert.equal(agentForLens(parsed, 'flat-lens'), 'flat-reviewer')
})

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

// ── Path matching for write-time constraint injection (the enforcement-tiers plan (M2)) ────────────

test('globToRe: ** crosses path separators, * does not', () => {
    assert.ok(globToRe('packages/**/core.ts').test('packages/a/b/core.ts'))
    assert.ok(globToRe('src/*.ts').test('src/a.ts'))
    assert.equal(globToRe('src/*.ts').test('src/a/b.ts'), false)
})

test('globToRe: `**/` matches ZERO segments, in any position', () => {
    // Parity with git, minimatch and fs.globSync. Compiling `**/` as `.*\/` requires at
    // least one directory, so the write-time hook would decline a row that
    // check-review-constraint-globs (which uses globSync) calls healthy - two engines
    // disagreeing about the same registry row.
    assert.ok(globToRe('**/domain/**').test('domain/user.ts'), 'leading, zero segments')
    assert.ok(globToRe('**/domain/**').test('src/domain/b.ts'), 'leading, one segment')
    assert.ok(globToRe('src/**/*.test.ts').test('src/x.test.ts'), 'mid-pattern, zero segments')
    assert.ok(globToRe('src/**/*.test.ts').test('src/a/b.test.ts'), 'mid-pattern, one segment')
    assert.ok(globToRe('a/**/b.ts').test('a/b.ts'), 'mid-pattern collapses cleanly')
})

test('globToRe: a literal dot is not a wildcard', () => {
    assert.equal(globToRe('src/a.ts').test('src/axts'), false)
})

test('globToRe: bare ** matches nested paths', () => {
    assert.ok(globToRe('**').test('a/b/c.ts'))
    assert.ok(globToRe('scripts/**').test('scripts/sdlc/x.mjs'))
})

test('globToRe: emits no control characters', () => {
    // A placeholder-based multi-pass implementation needs a byte no glob can
    // contain, and every such byte is a control character.
    assert.equal(/[\x00-\x1f]/.test(globToRe('a/**/b*.ts').source), false)
})

test('applicableConstraints: returns task-scope rows whose touches match', () => {
    const rows = [
        { id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', severity: 'major' },
        { id: 'B', scope: 'task', when: { touches: ['apps/**'] }, check: 'b', severity: 'major' }
    ]
    assert.deepEqual(
        applicableConstraints(rows, 'scripts/sdlc/x.mjs').map((c) => c.id),
        ['A']
    )
})

test('applicableConstraints: integration-scope rows never match a single edit', () => {
    const rows = [{ id: 'I', scope: 'integration', when: { touches: ['**'] }, check: 'i' }]
    assert.deepEqual(applicableConstraints(rows, 'anything.ts'), [])
})

test('applicableConstraints: a row with no when.touches is skipped, not thrown on', () => {
    const rows = [{ id: 'W', scope: 'task', when: { workspace: ['app'] }, check: 'w' }]
    assert.deepEqual(applicableConstraints(rows, 'anything.ts'), [])
})

test('applicableConstraints: a row with no scope defaults to task', () => {
    const rows = [{ id: 'D', when: { touches: ['scripts/**'] }, check: 'd' }]
    assert.deepEqual(applicableConstraints(rows, 'scripts/x.mjs').map((c) => c.id), ['D'])
})

test('applicableConstraints: a non-array input yields no matches rather than throwing', () => {
    assert.deepEqual(applicableConstraints(null, 'x.ts'), [])
    assert.deepEqual(applicableConstraints(undefined, 'x.ts'), [])
})

test('globToRe: a control character in a glob cannot hijack the substitution', () => {
    // An earlier revision hopped through NUL/SOH sentinels, so a glob carrying one
    // compiled as a zero-or-more-segments token. The single-pass alternation has no
    // sentinel to collide with.
    assert.equal(globToRe(`a${String.fromCharCode(0)}b`).test('a/x/b'), false)
    assert.equal(globToRe(`a${String.fromCharCode(1)}b`).test('a/x/b'), false)
})
