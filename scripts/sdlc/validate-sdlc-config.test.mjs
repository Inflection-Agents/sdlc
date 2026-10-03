// Tests for the config validator (SPEC-009 AC-002). A config wrong in shape quietly moves
// the gates that read it, so each rule is pinned with a failing case and a passing one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { gradeConfig } from './validate-sdlc-config.mjs'
import { layout1Repo, layout2Repo } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./validate-sdlc-config.mjs', import.meta.url))

function validate(root) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    return spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env })
}

const VALID = [
    'layout: 2',
    'framework_version: 0.4.0',
    'paths:',
    '  skills: skills',
    'workspaces:',
    '  - name: web',
    '    path: apps/web',
    '    agent_executable: caution',
    '    skills: [web-patterns]',
    'domain_routing:',
    '  web: [web-patterns]',
    'extensions:',
    '  phases:',
    '    - id: roadmap-sync',
    '      owner_skill: roadmap-sync',
    '  exempt: [local-skill]',
    '',
].join('\n')

test('a valid config exits 0', () => {
    const fx = layout2Repo({ config: VALID })
    try {
        mkdirSync(join(fx.root, 'apps/web'), { recursive: true })
        const res = validate(fx.root)
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stdout, /OK \(1 workspace/)
    } finally {
        fx.cleanup()
    }
})

for (const [label, config, pattern] of [
    ['missing layout', VALID.replace('layout: 2\n', ''), /`layout` is missing/],
    ['wrong layout', VALID.replace('layout: 2', 'layout: 1'), /it must be 2/],
    [
        'duplicate workspace name',
        VALID.replace('domain_routing:', '  - name: web\n    path: apps/web\n    agent_executable: yes\ndomain_routing:'),
        /appears more than once/,
    ],
    ['workspace path missing on disk', VALID.replace('apps/web', 'apps/gone'), /does not exist/],
    ['agent_executable outside the enum', VALID.replace('caution', 'maybe'), /is not yes, caution or human/],
    ['extension phase repeats a framework id', VALID.replace('id: roadmap-sync', 'id: spec-authoring'), /repeats a framework phase id/],
]) {
    test(`${label} exits 1 and names the problem`, () => {
        const fx = layout2Repo({ config })
        try {
            mkdirSync(join(fx.root, 'apps/web'), { recursive: true })
            const res = validate(fx.root)
            assert.equal(res.status, 1, res.stdout)
            assert.match(res.stderr, pattern)
        } finally {
            fx.cleanup()
        }
    })
}

test('a config that does not parse exits 1', () => {
    const fx = layout2Repo({ config: 'layout: 2\npaths: [broken\n' })
    try {
        const res = validate(fx.root)
        assert.equal(res.status, 1)
        assert.match(res.stderr, /does not parse/)
    } finally {
        fx.cleanup()
    }
})

test('a layout-1 repo has nothing to grade and exits 0 saying so', () => {
    const fx = layout1Repo()
    try {
        const res = validate(fx.root)
        assert.equal(res.status, 0)
        assert.match(res.stdout, /nothing to grade/)
    } finally {
        fx.cleanup()
    }
})

test('gradeConfig rejects a non-mapping config', () => {
    assert.deepEqual(gradeConfig(['x'], { root: '/' }), ['the config is not a mapping'])
})

test('AC-015: worktrees.setup accepts one command string and rejects anything else', () => {
    assert.deepEqual(gradeConfig({ layout: 2, worktrees: { setup: 'pnpm install --frozen-lockfile' } }, { root: '/' }), [])
    assert.deepEqual(gradeConfig({ layout: 2, worktrees: {} }, { root: '/' }), [])
    assert.deepEqual(gradeConfig({ layout: 2, worktrees: { setup: '' } }, { root: '/' }), [], 'empty means unset, as the schema example shows')
    for (const bad of [{ setup: ['pnpm', 'install'] }, { setup: 42 }]) {
        assert.deepEqual(gradeConfig({ layout: 2, worktrees: bad }, { root: '/' }), ['`worktrees.setup` must be one command string'], JSON.stringify(bad))
    }
    assert.deepEqual(gradeConfig({ layout: 2, worktrees: ['x'] }, { root: '/' }), ['`worktrees` must be a mapping'])
})

test('AC-015: the CLI exits non-zero on a non-string worktrees.setup', () => {
    const fx = layout2Repo({ config: 'layout: 2\nworktrees:\n  setup: [pnpm, install]\n' })
    try {
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, [SCRIPT, '--root', fx.root], { encoding: 'utf8', env })
        assert.notEqual(res.status, 0)
        assert.match(res.stdout + res.stderr, /worktrees\.setup/)
    } finally {
        fx.cleanup()
    }
})
