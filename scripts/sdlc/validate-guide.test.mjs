// Tests for validate-guide.mjs (SPEC-008, ADR-007): one case per rule, the spec-resolution
// edge cases, and the direct-invocation guard through a symlinked path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KICKOFF_MAX_CHARS, validateGuide } from './validate-guide.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

const SPEC = `---
id: SPEC-900
version: 1
---

## Design

A reference to SPEC-001 AC-010 and to the \`## Acceptance criteria\` heading inline.

## Acceptance criteria

- [ ] AC-001: Given X, when Y, then Z.
- [ ] AC-002: Given A, when B, then C.

## Risks & constraints

- None.
`

const GUIDE = `---
spec: SPEC-900
spec_version: 1
---

## Steps

### S1: First
- Covers: AC-001
- Changes: \`a/**\`
- Verify: \`true\`

### S2: Second
- Covers: AC-002
- Changes: \`b/**\`
- Verify: \`true\`
- After: S1

## Owner decisions

- D1: Pick a name. Decided by the owner.

## End-to-end validation

- Run it.
`

const INDEX = `spec: SPEC-900
plan_review:
  status: approve-ready
  approved: false
  reviewed: 2026-09-30
steps:
  - id: S1
    status: pending
  - id: S2
    status: pending
decisions:
  - id: D1
    status: pending
`

/** Lay out a temp repo; `files` overrides or adds paths relative to its root. */
function repo(files = {}) {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-guide-'))
    const all = {
        'specs/SPEC-900-example.md': SPEC,
        'specs/tasks/SPEC-900/GUIDE.md': GUIDE,
        'specs/tasks/SPEC-900/_index.yaml': INDEX,
        ...files,
    }
    for (const [rel, body] of Object.entries(all)) {
        if (body === null) continue
        mkdirSync(dirname(join(root, rel)), { recursive: true })
        writeFileSync(join(root, rel), body, 'utf8')
    }
    return { root, guide: join(root, 'specs/tasks/SPEC-900/GUIDE.md') }
}

function check(files) {
    const { root, guide } = repo(files)
    try {
        return validateGuide(guide)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

const approved = INDEX.replace('approved: false', 'approved: true')

test('a valid guide passes, and prose AC references and inline headings are ignored', () => {
    assert.deepEqual(check(), [])
})

test('the legacy `AC-NNN —` form is read as an AC id', () => {
    assert.deepEqual(check({ 'specs/SPEC-900-example.md': SPEC.replaceAll('AC-001:', 'AC-001 —').replaceAll('AC-002:', 'AC-002 —') }), [])
})

test('rule 1: an AC covered by no step fails and names the AC', () => {
    const problems = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Covers: AC-002', '- Covers: AC-001') })
    assert.ok(problems.some((p) => p.startsWith('rule 1:') && p.includes('AC-002')), problems.join('\n'))
})

test('rule 1: an AC covered only by a cancelled step fails', () => {
    const problems = check({
        'specs/tasks/SPEC-900/_index.yaml': INDEX.replace('  - id: S2\n    status: pending', '  - id: S2\n    status: cancelled'),
    })
    assert.ok(problems.some((p) => p.startsWith('rule 1:') && p.includes('AC-002')), problems.join('\n'))
})

test('rule 2: a Covers id the spec does not define fails and names it', () => {
    const problems = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Covers: AC-002', '- Covers: AC-002, AC-099') })
    assert.ok(problems.some((p) => p.startsWith('rule 2:') && p.includes('AC-099')), problems.join('\n'))
})

test('rule 3: a step without Changes or Verify fails and names the step', () => {
    const noChanges = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Changes: `b/**`\n', '') })
    assert.ok(noChanges.some((p) => p.startsWith('rule 3:') && p.includes('S2') && p.includes('Changes')), noChanges.join('\n'))
    const noVerify = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Verify: `true`\n\n### S2', '\n### S2') })
    assert.ok(noVerify.some((p) => p.startsWith('rule 3:') && p.includes('S1') && p.includes('Verify')), noVerify.join('\n'))
})

test('rule 4: step or decision ids that differ between guide and index fail', () => {
    const steps = check({ 'specs/tasks/SPEC-900/_index.yaml': INDEX.replace('  - id: S2\n    status: pending\n', '') })
    assert.ok(steps.some((p) => p.startsWith('rule 4:') && p.includes('S2')), steps.join('\n'))
    const decisions = check({ 'specs/tasks/SPEC-900/_index.yaml': INDEX.replace('decisions:\n  - id: D1\n    status: pending\n', 'decisions: []\n') })
    assert.ok(decisions.some((p) => p.startsWith('rule 4:') && p.includes('D1')), decisions.join('\n'))
})

test('rule 5: a stale spec_version fails and names both versions', () => {
    const problems = check({ 'specs/SPEC-900-example.md': SPEC.replace('version: 1', 'version: 2') })
    assert.ok(problems.some((p) => p.startsWith('rule 5:') && p.includes('1') && p.includes('2')), problems.join('\n'))
})

test('rule 6: an acceptance criterion with no id fails and quotes the line', () => {
    const problems = check({ 'specs/SPEC-900-example.md': SPEC.replace('- [ ] AC-002: Given A', '- [ ] Given A') })
    assert.ok(problems.some((p) => p.startsWith('rule 6:') && p.includes('Given A')), problems.join('\n'))
})

test('rule 6: a missing or differently cased Acceptance criteria heading fails closed', () => {
    const problems = check({ 'specs/SPEC-900-example.md': SPEC.replace('\n## Acceptance criteria\n', '\n## Acceptance Criteria\n') })
    assert.ok(problems.some((p) => p.startsWith('rule 6:') && p.includes('no line-anchored')), problems.join('\n'))
})

test('rule 6: an Acceptance criteria section with no checkbox AC ids fails closed', () => {
    const plain = SPEC.replace('- [ ] AC-001: Given X', '- AC-001: Given X').replace('- [ ] AC-002: Given A', '- AC-002: Given A')
    const problems = check({ 'specs/SPEC-900-example.md': plain, 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace(/- Covers: AC-00\d\n/g, '') })
    assert.ok(problems.some((p) => p.startsWith('rule 6:') && p.includes('no `- [ ] AC-NNN:` line')), problems.join('\n'))
})

test('rule 6: a heading quoted in a fence is ignored, and a second Acceptance criteria section fails', () => {
    const fenced = SPEC.replace('## Design\n', '## Design\n\n```markdown\n## Acceptance criteria\n\n- [ ] AC-001: quoted example\n```\n')
    assert.deepEqual(check({ 'specs/SPEC-900-example.md': fenced }), [], 'a fenced example must not open the section')
    const twice = SPEC + '\n## Acceptance criteria\n\n- [ ] AC-003: Given G, when H, then I.\n'
    const problems = check({ 'specs/SPEC-900-example.md': twice })
    assert.ok(problems.some((p) => p.startsWith('rule 6:') && p.includes('2 `## Acceptance criteria` sections')), problems.join('\n'))
})

test('rule 1 and 6: star and plus checkboxes are AC lines, and Covers ids match whole ids only', () => {
    const star = SPEC.replace('- [ ] AC-002: Given A', '* [ ] AC-002: Given A')
    const uncovered = check({ 'specs/SPEC-900-example.md': star, 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Covers: AC-002', '- Covers: AC-001') })
    assert.ok(uncovered.some((p) => p.startsWith('rule 1:') && p.includes('AC-002')), uncovered.join('\n'))
    const idless = check({ 'specs/SPEC-900-example.md': SPEC.replace('- [ ] AC-002: Given A', '+ [ ] Given A') })
    assert.ok(idless.some((p) => p.startsWith('rule 6:') && p.includes('Given A')), idless.join('\n'))
    const prefix = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Covers: AC-001', '- Covers: AC-0012') })
    assert.ok(prefix.some((p) => p.startsWith('rule 1:') && p.includes('AC-001')), prefix.join('\n'))
})

test('rule 4: a step or decision id repeated in GUIDE.md or _index.yaml fails and names it', () => {
    const dupGuide = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('### S2: Second', '### S1: Second') })
    assert.ok(dupGuide.some((p) => p.startsWith('rule 4:') && p.includes('S1 appears more than once in GUIDE.md')), dupGuide.join('\n'))
    const dupIndex = check({ 'specs/tasks/SPEC-900/_index.yaml': INDEX.replace('decisions:\n  - id: D1\n    status: pending\n', 'decisions:\n  - id: D1\n    status: pending\n  - id: D1\n    status: pending\n') })
    assert.ok(dupIndex.some((p) => p.startsWith('rule 4:') && p.includes('D1 appears more than once in _index.yaml')), dupIndex.join('\n'))
})

test('rule 7: an After id that is unknown or not earlier fails and names it', () => {
    const unknown = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- After: S1', '- After: S9') })
    assert.ok(unknown.some((p) => p.startsWith('rule 7:') && p.includes('S9')), unknown.join('\n'))
    const forward = check({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- After: S1', '- After: S2') })
    assert.ok(forward.some((p) => p.startsWith('rule 7:') && p.includes('S2')), forward.join('\n'))
})

test('rule 8: a step without Workspace fails when .ai/project.md defines workspaces', () => {
    const project = '# P\n\n## Workspaces\n\n| Workspace | Path |\n|---|---|\n| web | apps/web |\n\n## Commands\n'
    const problems = check({ '.ai/project.md': project })
    assert.ok(problems.some((p) => p.startsWith('rule 8:') && p.includes('S1')), problems.join('\n'))
    assert.deepEqual(check({ '.ai/project.md': project.replace('| web | apps/web |\n', '') }), [], 'a header-only table defines no workspace')
})

test('rule 9: an approved guide with no KICKOFF.md fails', () => {
    const problems = check({ 'specs/tasks/SPEC-900/_index.yaml': approved })
    assert.ok(problems.some((p) => p.startsWith('rule 9:') && p.includes('missing')), problems.join('\n'))
})

test('rule 9: a KICKOFF.md of 3,801 characters fails and prints the count', () => {
    const problems = check({ 'specs/tasks/SPEC-900/_index.yaml': approved, 'specs/tasks/SPEC-900/KICKOFF.md': 'x'.repeat(KICKOFF_MAX_CHARS + 1) })
    assert.ok(problems.some((p) => p.startsWith('rule 9:') && p.includes('3801')), problems.join('\n'))
})

test('rule 9: exactly 3,800 characters passes, counting a multi-byte character once', () => {
    const body = '—'.repeat(100) + 'x'.repeat(KICKOFF_MAX_CHARS - 100)
    assert.ok(Buffer.byteLength(body) > KICKOFF_MAX_CHARS, 'the fixture must exceed the limit in bytes')
    assert.deepEqual(check({ 'specs/tasks/SPEC-900/_index.yaml': approved, 'specs/tasks/SPEC-900/KICKOFF.md': body }), [])
})

test('zero or two matching spec files fail', () => {
    const none = check({ 'specs/SPEC-900-example.md': null })
    assert.ok(none.some((p) => p.includes('found 0')), none.join('\n'))
    const two = check({ 'specs/SPEC-900-other.md': SPEC })
    assert.ok(two.some((p) => p.includes('found 2')), two.join('\n'))
})

test('the CLI fails loudly through a symlinked path, and an unmatched glob is nothing to check', () => {
    const { root, guide } = repo({ 'specs/tasks/SPEC-900/GUIDE.md': GUIDE.replace('- Covers: AC-002', '- Covers: AC-001') })
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-guide-link-'))
    try {
        symlinkSync(HERE, join(dir, 'linked'), 'dir')
        const bad = spawnSync('node', [join(dir, 'linked', 'validate-guide.mjs'), guide], { encoding: 'utf8' })
        assert.equal(bad.status, 1, 'a silent exit 0 here would pass an uncovered AC')
        assert.match(bad.stderr, /rule 1: AC-002/)
        const none = spawnSync('node', [join(HERE, 'validate-guide.mjs'), join(root, 'nowhere/*/GUIDE.md')], { encoding: 'utf8' })
        assert.equal(none.status, 0)
        assert.match(none.stdout, /nothing to check/)
    } finally {
        rmSync(dir, { recursive: true, force: true })
        rmSync(root, { recursive: true, force: true })
    }
})
