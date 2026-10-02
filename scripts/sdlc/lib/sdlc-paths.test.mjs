// Tests for the layout resolver (SPEC-009 AC-001).
//
// Every validator and hook asks this module for paths, so a wrong answer here moves a
// gate onto a file that does not exist, and most gates read "no file" as "nothing to
// check". The cases below pin each key on both layouts and the once-per-process warning.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DEPRECATION, detectLayout, resolveRoot, sdlcPaths, takeRootArg } from './sdlc-paths.mjs'
import { layout1Repo, layout2Repo, forkedRepo, write } from '../__fixtures__/layouts/build.mjs'

delete process.env.CLAUDE_PROJECT_DIR
delete process.env.CLAUDE_PLUGIN_ROOT

const MODULE = fileURLToPath(new URL('./sdlc-paths.mjs', import.meta.url))

test('layout 2: every key takes the layout-2 default when no override is set', () => {
    const fx = layout2Repo()
    try {
        const p = sdlcPaths(fx.root)
        assert.equal(p.layout, 2)
        assert.equal(p.constraints, join(fx.root, '.sdlc/review-constraints.yaml'))
        assert.equal(p.machine, join(fx.root, '.sdlc/state-machine.yaml'))
        assert.equal(p.scripts, join(fx.root, '.sdlc/scripts'))
        assert.equal(p.templates, join(fx.root, '.sdlc/templates'))
        assert.equal(p.primitives, join(fx.root, '.sdlc/contracts/review-primitives.md'))
        assert.equal(p.envelopeSchema, join(fx.root, '.sdlc/contracts/review-envelope.schema.json'))
        assert.equal(p.skills, join(fx.root, '.sdlc/skills'))
        assert.equal(p.specs, join(fx.root, 'specs'))
        assert.equal(p.project, join(fx.root, 'AGENTS.md'))
    } finally {
        fx.cleanup()
    }
})

test('layout 2: a config.yaml override wins over the default', () => {
    const fx = layout2Repo({
        config: [
            'layout: 2',
            'paths:',
            '  skills: skills',
            '  project: .sdlc/project.md',
            '  envelope_schema: .sdlc/review-envelope.schema.json',
            '  process_doc: docs/sdlc.md',
            '',
        ].join('\n'),
    })
    try {
        const p = sdlcPaths(fx.root)
        assert.equal(p.skills, join(fx.root, 'skills'))
        assert.equal(p.project, join(fx.root, '.sdlc/project.md'))
        assert.equal(p.envelopeSchema, join(fx.root, '.sdlc/review-envelope.schema.json'))
        assert.equal(p.processDoc, join(fx.root, 'docs/sdlc.md'))
        assert.equal(p.scripts, join(fx.root, '.sdlc/scripts'), 'an unset key keeps its default')
    } finally {
        fx.cleanup()
    }
})

test('layout 1, plugin-init shape: each key takes its legacy-map path', () => {
    const fx = layout1Repo({ withSkillsDir: true })
    try {
        const p = sdlcPaths(fx.root, { quiet: true })
        assert.equal(p.layout, 1)
        assert.equal(p.constraints, join(fx.root, '.ai/sdlc/review-constraints.yaml'))
        assert.equal(p.machine, join(fx.root, 'specs/sdlc-state-machine.yaml'))
        assert.equal(p.scripts, join(fx.root, 'scripts/sdlc'))
        assert.equal(p.templates, join(fx.root, 'templates'))
        assert.equal(p.primitives, join(fx.root, '.ai/skills/review-primitives.md'))
        assert.equal(p.skills, join(fx.root, 'skills'), 'a root skills/ holding SKILL.md is the skills dir')
        assert.equal(p.project, join(fx.root, '.ai/project.md'))
    } finally {
        fx.cleanup()
    }
})

test('layout 1, forked shape: skills come from .ai/skills and the contract from .ai/sdlc when only there', () => {
    const fx = forkedRepo()
    try {
        write(fx.root, '.ai/sdlc/review-envelope.schema.json', '{}\n')
        const p = sdlcPaths(fx.root, { quiet: true })
        assert.equal(p.skills, join(fx.root, '.ai/skills'))
        assert.equal(p.processDoc, join(fx.root, '.ai/sdlc.md'))
        assert.equal(
            p.envelopeSchema,
            join(fx.root, '.ai/skills/review-envelope.schema.json'),
            '.ai/skills is searched before .ai/sdlc'
        )
    } finally {
        fx.cleanup()
    }
})

test('layout 1: a templates/ holding no framework template falls back to specs/templates', () => {
    const fx = layout1Repo()
    try {
        rmSync(join(fx.root, 'templates', 'spec.md'))
        write(fx.root, 'templates/email.html', '<p>the adopter\'s own</p>\n')
        write(fx.root, 'specs/templates/guide.md', '# guide\n')
        assert.equal(sdlcPaths(fx.root, { quiet: true }).templates, join(fx.root, 'specs/templates'))
    } finally {
        fx.cleanup()
    }
})

test('layout 1 writes the deprecation line exactly once per process', () => {
    const fx = layout1Repo()
    try {
        const script = `import { sdlcPaths } from ${JSON.stringify(MODULE)}; sdlcPaths(${JSON.stringify(fx.root)}); sdlcPaths(${JSON.stringify(fx.root)});`
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env })
        assert.equal(res.status, 0, res.stderr)
        assert.equal(res.stderr.split('\n').filter((l) => l === DEPRECATION).length, 1)
    } finally {
        fx.cleanup()
    }
})

test('layout 2 and quiet layout 1 write no deprecation line', () => {
    const fx = layout2Repo()
    try {
        const script = `import { sdlcPaths } from ${JSON.stringify(MODULE)}; sdlcPaths(${JSON.stringify(fx.root)});`
        const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' })
        assert.equal(res.stderr, '')
    } finally {
        fx.cleanup()
    }
})

test('resolveRoot walks up to the layout-2 or layout-1 marker, and detectLayout reports it', () => {
    const l2 = layout2Repo()
    const l1 = layout1Repo()
    try {
        const deep = join(l2.root, 'specs', 'tasks', 'SPEC-001')
        mkdirSync(deep, { recursive: true })
        assert.equal(resolveRoot(deep), l2.root)
        assert.equal(detectLayout(l2.root), 2)
        const deep1 = join(l1.root, 'scripts', 'sdlc')
        assert.equal(resolveRoot(deep1), l1.root)
        assert.equal(detectLayout(l1.root), 1)
    } finally {
        l2.cleanup()
        l1.cleanup()
    }
})

test('a config.yaml that does not parse throws and names the file', () => {
    const fx = layout2Repo({ config: 'layout: 2\npaths:\n  skills: [unterminated\n' })
    try {
        assert.throws(() => sdlcPaths(fx.root), /\.sdlc\/config\.yaml does not parse/)
    } finally {
        fx.cleanup()
    }
})

test('takeRootArg reads --root and leaves the other arguments', () => {
    const { root, rest } = takeRootArg(['--root', '/tmp/x', 'a.md', '--flag'])
    assert.equal(root, '/tmp/x')
    assert.deepEqual(rest, ['a.md', '--flag'])
    assert.throws(() => takeRootArg(['--root']), /--root needs a directory/)
})
