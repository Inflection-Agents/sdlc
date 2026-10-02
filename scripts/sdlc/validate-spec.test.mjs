// SPEC-007 Lever 2: validate-spec.mjs decides the mechanical gap categories before a reviewer runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { checkSpec } from './validate-spec.mjs'
import { layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./validate-spec.mjs', import.meta.url))

const FRONT = {
    id: 'SPEC-100',
    title: '"A fixture spec"',
    status: 'draft',
    version: '1',
    initiative: 'INI-001',
    owner: 'franklin',
    created: '2026-10-02',
    updated: '2026-10-02',
}

/** A spec with every mechanical check passing; `edit` changes one thing. */
function spec({ front = {}, body = {}, extra = '' } = {}) {
    const fm = { ...FRONT, ...front }
    const lines = Object.entries(fm)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
    const sections = {
        Problem: 'Something is wrong.',
        'Success criteria': '- [ ] SC-1: It is fixed.',
        Scope: '### In scope\n\n- The fix.\n\n### Out of scope\n\n- A rewrite.\n- A redesign.',
        Design: 'Per ADR-001, fix it.',
        'Acceptance criteria': '- [ ] AC-001: Given the fix, when it runs, then it works in web.',
        'Risks & constraints': '- It could break.',
        ...body,
    }
    const text = Object.entries(sections)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `## ${k}\n\n${v}\n`)
        .join('\n')
    return `---\n${lines.join('\n')}\n---\n\n${text}${extra}`
}

const known = new Set(['ADR-001', 'SPEC-001'])
const run = (text) => checkSpec(text, { root: '/r', resolveId: (id) => known.has(id) })
const criteria = (fs) => fs.map((f) => f.criterion)

test('AC-009: a schema-valid spec has no findings', () => {
    assert.deepEqual(run(spec()), [])
})

test('AC-007: a missing section, a missing field, an unknown ADR and a prose placeholder are each one finding', () => {
    assert.deepEqual(criteria(run(spec({ body: { Design: undefined } }))), ['spec-schema:Design'])
    assert.deepEqual(criteria(run(spec({ front: { owner: undefined } }))), ['spec-schema:owner'])
    const adr = run(spec({ body: { Design: 'Per ADR-999, fix it.' } }))
    assert.equal(adr.length, 1)
    assert.match(adr[0].finding, /ADR-999/)
    assert.equal(run(spec({ body: { Problem: 'TBD later.' } })).length, 1)
})

test('AC-007: markers inside code spans and fenced blocks are not placeholders', () => {
    const body = { Problem: 'The markers (`TBD`, `TODO`) are named here.\n\n```\nTODO in a fence\n```' }
    assert.deepEqual(run(spec({ body })), [])
})

test('AC-008: order, invalid values, thin scope, an unnamed workspace and an unresolved depends_on', () => {
    const swapped = spec().replace('## Problem', '## Tmp').replace('## Design', '## Problem').replace('## Tmp', '## Design')
    assert.ok(criteria(run(swapped)).includes('spec-schema:Body structure'))
    assert.deepEqual(criteria(run(spec({ front: { status: 'shipped' } }))), ['spec-schema:status'])
    assert.deepEqual(criteria(run(spec({ front: { version: '1.2' } }))), ['spec-schema:version'])
    const thin = run(spec({ body: { Scope: '### In scope\n\n### Out of scope\n\n- One thing.' } }))
    assert.deepEqual(thin.map((f) => f.location), ['Scope > In scope', 'Scope > Out of scope'])
    assert.deepEqual(criteria(run(spec({ front: { workspaces: '[web, api]' } }))), ['monorepo:workspaces'])
    assert.deepEqual(criteria(run(spec({ front: { depends_on: '[SPEC-001, SPEC-404]' } }))), ['spec-schema:depends_on'])
})

test('AC-006: Disclosed, not reviewed-clean must sit after spec_followups and before Changelog', () => {
    const good = spec({ extra: '\n## spec_followups\n\nnone\n\n## Disclosed, not reviewed-clean\n\nnone\n\n## Changelog\n\n- v1\n' })
    assert.deepEqual(run(good), [])
    const bad = spec({ extra: '\n## Disclosed, not reviewed-clean\n\nnone\n\n## spec_followups\n\nnone\n' })
    assert.deepEqual(criteria(run(bad)), ['spec-schema:Section ordering'])
})

test('AC-011: --ci fails only an active spec; every other status is a warning', () => {
    const fx = layout2Repo()
    try {
        write(fx.root, 'specs/adrs/ADR-001-x.md', '---\nid: ADR-001\nstatus: accepted\n---\n')
        write(fx.root, 'specs/SPEC-100-draft.md', spec({ body: { Problem: 'TODO' } }))
        write(fx.root, 'specs/SPEC-101-done.md', spec({ front: { id: 'SPEC-101', status: 'completed' }, body: { Problem: 'TODO' } }))
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const ok = spawnSync(process.execPath, [SCRIPT, '--root', fx.root, '--ci'], { encoding: 'utf8', env })
        assert.equal(ok.status, 0, ok.stderr)
        assert.equal((ok.stdout.match(/^warning: /gm) ?? []).length, 2)
        write(fx.root, 'specs/SPEC-102-live.md', spec({ front: { id: 'SPEC-102', status: 'active' }, body: { Problem: 'TODO' } }))
        const bad = spawnSync(process.execPath, [SCRIPT, '--root', fx.root, '--ci'], { encoding: 'utf8', env })
        assert.equal(bad.status, 1)
        assert.match(bad.stdout, /^specs\/SPEC-102-live\.md: major/m)
    } finally {
        fx.cleanup()
    }
})

test('the CLI exits 1 with findings and emits a valid envelope with --json', () => {
    const fx = layout2Repo()
    try {
        write(fx.root, 'specs/SPEC-100-x.md', spec({ body: { Design: 'Per ADR-404, fix it.' } }))
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, [SCRIPT, '--root', fx.root, '--json', `${fx.root}/specs/SPEC-100-x.md`], { encoding: 'utf8', env })
        assert.equal(res.status, 1)
        const out = JSON.parse(res.stdout)
        assert.equal(out.artifact, 'spec')
        assert.equal(out.reviewed_by, 'agent:validate-spec')
        assert.equal(out.findings[0].severity, 'blocker')
        const v = spawnSync(process.execPath, [fileURLToPath(new URL('./validate-review-envelope.mjs', import.meta.url)), '-'], { input: res.stdout, encoding: 'utf8', env })
        assert.equal(v.status, 0, v.stdout + v.stderr)
    } finally {
        fx.cleanup()
    }
})
