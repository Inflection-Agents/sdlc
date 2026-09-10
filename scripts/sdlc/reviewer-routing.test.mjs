// Tests for lens → reviewer routing (ADR-001), re-homed out of the retired
// execute-spec Workflow into scripts/sdlc/reviewer-routing.mjs (ADR-003).
//
// The resolver used to live inside a Workflow-runtime script that could not be
// imported, so this file kept a byte-identical copy. It now imports the real
// implementation, and additionally asserts the shipped registry parses.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    GENERIC_REVIEWER,
    agentForLens,
    applicableConstraints,
    applicableConstraintsFor,
    globToRe,
    loadConstraints,
    parseConstraints
} from './reviewer-routing.mjs'
import { PR_SIDE_PREFIXES } from './validate-review-envelope.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

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

test('globToRe: ?, [abc] and {a,b} are wildcards, matching fs.globSync', () => {
    // Escaping these to literals is the dangerous direction: the glob-resolvability
    // gate uses globSync and would call the row healthy while the write-time hook
    // silently declined to inject it.
    assert.ok(globToRe('scripts/?heck-a.mjs').test('scripts/check-a.mjs'))
    assert.equal(globToRe('scripts/?heck-a.mjs').test('scripts/xx-a.mjs'), false)
    assert.ok(globToRe('scripts/[rc]esolve.mjs').test('scripts/resolve.mjs'))
    assert.equal(globToRe('scripts/[rc]esolve.mjs').test('scripts/zesolve.mjs'), false)
    assert.ok(globToRe('scripts/{resolve,gen}.mjs').test('scripts/resolve.mjs'))
    assert.ok(globToRe('scripts/{resolve,gen}.mjs').test('scripts/gen.mjs'))
    assert.equal(globToRe('scripts/{resolve,gen}.mjs').test('scripts/other.mjs'), false)
    assert.equal(globToRe('a?b').test('a/b'), false, '? must not cross a separator')
})

test('every shipped registry row carries a GROUNDED cite', () => {
    // This branch is the first to read `cite:` programmatically and hand it to an
    // author at write time, so a row shipping a citation the envelope validator
    // refuses would put an ungrounded blocker in front of a reviewer.
    const rows = loadConstraints()
    assert.ok(rows.length > 0)
    for (const c of rows) {
        assert.ok(c.cite, `constraint ${c.id} has no cite`)
        assert.ok(
            PR_SIDE_PREFIXES.some((p) => c.cite.startsWith(p)),
            `constraint ${c.id} cite "${c.cite}" is not a grounded prefix`
        )
    }
})

// ── Every routing target must be a shipped agent ──────────────────────────────
// ADR-001 makes lens -> reviewer routing registry DATA. That only means anything if
// the data points at something: the registry routed `security` and `core-purity` to
// an `invariants-reviewer` that existed in no repo, so the SOP's "dispatch one
// reviewer per distinct resolved agent" resolved to nothing.

test('every agent: named in the registry is a shipped agent definition', () => {
    const dir = join(REPO_ROOT_DIR, 'agents')
    const named = new Set(loadConstraints().map((c) => c.agent).filter(Boolean))
    named.add(GENERIC_REVIEWER) // the default for a lens with no agent:
    for (const a of named) {
        assert.ok(existsSync(join(dir, `${a}.md`)), `registry routes to "${a}" but agents/${a}.md does not exist`)
    }
})

test('no reviewer agent carries Edit or Write', () => {
    // The tools line IS the independence mechanism. "You grade, you never fix" is an
    // instruction a model can talk itself out of; an absent tool is not.
    const dir = join(REPO_ROOT_DIR, 'agents')
    for (const f of readdirSync(dir).filter((f) => f.endsWith('-reviewer.md'))) {
        const tools = readFileSync(join(dir, f), 'utf8').match(/^tools:\s*(.+)$/m)
        assert.ok(tools, `${f} declares no tools: line`)
        assert.equal(/\bEdit\b|\bWrite\b/.test(tools[1]), false, `${f} grants Edit/Write to a reviewer`)
    }
})

// ── Multi-path constraint selection ───────────────────────────────────────────
// applicableConstraints grades ONE path; a PR touches many. Without a shared
// helper the caller invents a loop, and two places compute the same lens set
// differently — the two-engines-disagree failure this codebase has hit twice
// (globToRe vs globSync, and three registry parsers with different CRLF handling).

test('applicableConstraintsFor: unions across paths and dedupes by id', () => {
    const rows = [
        { id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' },
        { id: 'B', scope: 'task', when: { touches: ['docs/**'] }, check: 'b', cite: 'inv:B' }
    ]
    const hits = applicableConstraintsFor(rows, ['scripts/x.mjs', 'docs/y.md', 'scripts/z.mjs'])
    assert.deepEqual(
        hits.map((c) => c.id).sort(),
        ['A', 'B']
    )
})

test('applicableConstraintsFor: a row matching several paths appears once', () => {
    const rows = [{ id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' }]
    assert.equal(applicableConstraintsFor(rows, ['scripts/a.mjs', 'scripts/b.mjs']).length, 1)
})

test('applicableConstraintsFor: no paths yields no constraints, and does not throw', () => {
    const rows = [{ id: 'A', scope: 'task', when: { touches: ['**'] }, check: 'a', cite: 'inv:A' }]
    assert.deepEqual(applicableConstraintsFor(rows, []), [])
    assert.deepEqual(applicableConstraintsFor(rows, null), [])
    assert.deepEqual(applicableConstraintsFor(null, ['a.ts']), [])
})

test('applicableConstraintsFor: integration-scope rows are excluded, as in the single-path form', () => {
    const rows = [{ id: 'I', scope: 'integration', when: { touches: ['**'] }, check: 'i', cite: 'inv:I' }]
    assert.deepEqual(applicableConstraintsFor(rows, ['a.ts']), [])
})

test('applicableConstraintsFor agrees with applicableConstraints on a single path', () => {
    // One matcher, two entry points. If these ever disagree, a lens fires at write
    // time and not at review time, or the reverse.
    const rows = [
        { id: 'A', scope: 'task', when: { touches: ['scripts/**'] }, check: 'a', cite: 'inv:A' },
        { id: 'B', scope: 'task', when: { touches: ['docs/**'] }, check: 'b', cite: 'inv:B' }
    ]
    for (const p of ['scripts/x.mjs', 'docs/y.md', 'nothing/z.txt']) {
        assert.deepEqual(
            applicableConstraintsFor(rows, [p]).map((c) => c.id),
            applicableConstraints(rows, p).map((c) => c.id),
            `disagreement on ${p}`
        )
    }
})

test('every reviewer agent is told to set reviewed_by', () => {
    // The branch that added the provenance check shipped it to only the two NEW
    // agents. task-reviewer and integration-reviewer gate delivery, so their
    // envelopes exited 3 as contract violations and re-dispatch produced the
    // identical envelope — a correct independent blocking review looping to
    // escalation. A directory-iterating test cannot be forgotten the way a
    // checklist item can.
    const dir = join(REPO_ROOT_DIR, 'agents')
    const files = readdirSync(dir).filter((f) => f.endsWith('-reviewer.md'))
    assert.ok(files.length >= 4, 'expected the shipped reviewer agents')
    for (const f of files) {
        const text = readFileSync(join(dir, f), 'utf8')
        assert.match(text, /reviewed_by/, `${f} never tells the reviewer to set reviewed_by`)
        const name = f.replace(/\.md$/, '')
        assert.match(text, new RegExp(`agent:${name}`), `${f} does not name its own agent:${name} value`)
    }
})

test('the canonical envelope example carries reviewed_by', () => {
    // A reviewer copies this block. If it omits the field, every reviewer obeying
    // its own contract emits an envelope the validator rejects.
    const md = readFileSync(join(REPO_ROOT_DIR, 'skills', 'review-primitives.md'), 'utf8')
    const start = md.indexOf('## Output schema')
    assert.notEqual(start, -1)
    assert.match(md.slice(start, start + 1500), /reviewed_by/)
})
