// SPEC-007 Lever 7: gen-spec-index.mjs writes specs/spec-index.json in the documented shape.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildIndex } from './gen-spec-index.mjs'
import { layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./gen-spec-index.mjs', import.meta.url))
const SCHEMA = fileURLToPath(new URL('../../skills/spec-schema.md', import.meta.url))

function corpus(root) {
    write(
        root,
        'specs/SPEC-001-auth.md',
        [
            '---',
            'id: SPEC-001',
            'title: "User auth"',
            'status: active',
            'version: 2',
            'initiative: INI-003',
            'owner: franklin',
            'workspaces: [web, api]',
            'tags: [auth]',
            'depends_on: [SPEC-002]',
            'created: 2026-10-01',
            'updated: 2026-10-02',
            '---',
            '',
            '## Acceptance criteria',
            '',
            '- [x] AC-001: Given a, then b.',
            '- [ ] AC-002: Given c, then d.',
            '- [ ] Given an id-less criterion, then it still counts.',
            '',
            '## Risks & constraints',
            '',
            '- [ ] not a criterion',
            '',
        ].join('\n')
    )
    write(root, 'specs/archive/specs/SPEC-002-old.md', '---\nid: SPEC-002\ntitle: Old\nstatus: completed\nversion: 1\n---\n')
    write(root, 'specs/adrs/ADR-001-x.md', '---\nid: ADR-001\ntitle: "Use X"\nstatus: accepted\nspec: SPEC-001\n---\n')
    write(root, 'specs/gaps/GAP-001-y.md', '---\nid: GAP-001\nspec: SPEC-001\ntitle: "Edge"\nstatus: open\nresolution: workaround\ncreated: 2026-10-01\n---\n')
}

test('AC-024: the index carries the documented fields plus owner, workspaces and depends_on', () => {
    const fx = layout2Repo()
    try {
        corpus(fx.root)
        const idx = buildIndex(fx.root)
        assert.deepEqual(Object.keys(idx), ['specs', 'adrs', 'bugs', 'gaps'])
        const [s1, s2] = idx.specs
        assert.deepEqual(s1, {
            id: 'SPEC-001',
            title: 'User auth',
            status: 'active',
            version: 2,
            path: 'specs/SPEC-001-auth.md',
            initiative: 'INI-003',
            owner: 'franklin',
            workspaces: ['web', 'api'],
            tags: ['auth'],
            depends_on: ['SPEC-002'],
            acceptance_criteria_count: 3,
            acceptance_criteria_done: 1,
            gaps: [{ id: 'GAP-001', status: 'open', resolution: 'workaround', created: '2026-10-01' }],
        })
        assert.equal(s2.path, 'specs/archive/specs/SPEC-002-old.md', 'archived specs are indexed at their archive path')
        assert.deepEqual(idx.adrs, [{ id: 'ADR-001', title: 'Use X', status: 'accepted', spec: 'SPEC-001', path: 'specs/adrs/ADR-001-x.md' }])
        assert.deepEqual(idx.bugs, [])
        assert.equal(idx.gaps[0].path, 'specs/gaps/GAP-001-y.md')
    } finally {
        fx.cleanup()
    }
})

test('AC-024: spec-schema.md documents every per-spec field the generator writes', () => {
    const doc = readFileSync(SCHEMA, 'utf8')
    const section = doc.slice(doc.indexOf('## spec-index.json'))
    const fx = layout2Repo()
    try {
        corpus(fx.root)
        for (const key of Object.keys(buildIndex(fx.root).specs[0])) assert.match(section, new RegExp(`"${key}"`), key)
    } finally {
        fx.cleanup()
    }
})

test('AC-025: --check exits 1 on a missing or stale index and 0 once regenerated', () => {
    const fx = layout2Repo()
    try {
        corpus(fx.root)
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const run = (...a) => spawnSync(process.execPath, [SCRIPT, '--root', fx.root, ...a], { encoding: 'utf8', env })
        assert.equal(run('--check').status, 1, 'missing')
        assert.equal(run().status, 0)
        assert.equal(run('--check').status, 0)
        const idx = join(fx.root, 'specs/spec-index.json')
        write(fx.root, 'specs/spec-index.json', readFileSync(idx, 'utf8').replace('"active"', '"draft"'))
        const stale = run('--check')
        assert.equal(stale.status, 1)
        assert.match(stale.stderr, /stale/)
    } finally {
        fx.cleanup()
    }
})

test('--check accepts a missing index only while the corpus is empty', () => {
    const fx = layout2Repo()
    try {
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const run = () => spawnSync(process.execPath, [SCRIPT, '--root', fx.root, '--check'], { encoding: 'utf8', env })
        assert.equal(run().status, 0, 'a fresh repo with no specs passes')
        write(fx.root, 'specs/adrs/ADR-001-x.md', '---\nid: ADR-001\nstatus: proposed\n---\n')
        assert.equal(run().status, 1, 'one record and no index fails')
    } finally {
        fx.cleanup()
    }
})
