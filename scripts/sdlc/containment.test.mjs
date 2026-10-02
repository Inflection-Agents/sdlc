// Writes and code execution stay inside the repo (SPEC-009 integration gate, security lens).
// A repo is not trusted input: its config paths, symlinks, registry globs, settings.json
// hooks and script names must not reach a file or a program outside it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { installPayload } from './install-payload.mjs'
import { probeRev } from './probe-gates.mjs'
import { gradeConfig } from './validate-sdlc-config.mjs'
import { applyRefresh, planRefresh } from './sync-refresh.mjs'
import { assertWriteInside, isInside, sdlcPaths } from './lib/sdlc-paths.mjs'
import { commitAll, git, layout2Repo, pluginInit030Repo, write } from './__fixtures__/layouts/build.mjs'

delete process.env.CLAUDE_PROJECT_DIR

const HERE = fileURLToPath(new URL('.', import.meta.url))

/** A repo at `<base>/repo` beside a `<base>/victim` directory it must never touch. */
function besideVictim() {
    const base = mkdtempSync(join(tmpdir(), 'sdlc-contain-'))
    mkdirSync(join(base, 'victim'))
    mkdirSync(join(base, 'repo'))
    return { base, repo: join(base, 'repo'), victim: join(base, 'victim'), cleanup: () => rmSync(base, { recursive: true, force: true }) }
}

test('isInside accepts only relative paths that stay in the repo', () => {
    assert.equal(isInside('/r', 'skills'), true)
    assert.equal(isInside('/r', '.sdlc/scripts'), true)
    assert.equal(isInside('/r', '../victim'), false)
    assert.equal(isInside('/r', 'a/../../victim'), false)
    assert.equal(isInside('/r', '/etc'), false)
})

test('a config path outside the repo is ignored by the resolver and reported by the config gate', () => {
    const fx = layout2Repo({ config: 'layout: 2\npaths:\n  scripts: ../victim/scr\n  templates: /tmp/elsewhere\n' })
    try {
        const p = sdlcPaths(fx.root, { quiet: true })
        assert.equal(p.scripts, join(fx.root, '.sdlc', 'scripts'))
        assert.equal(p.templates, join(fx.root, '.sdlc', 'templates'))
        const problems = gradeConfig({ layout: 2, paths: { scripts: '../victim/scr', templates: '/tmp/x' } }, { root: fx.root })
        assert.equal(problems.filter((x) => /must be a relative path inside the repo/.test(x)).length, 2)
    } finally {
        fx.cleanup()
    }
})

test('the sync refresh writes nothing outside the repo when the config points there', () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\nframework_version: 0.3.0\npaths:\n  scripts: ../victim/scr\n')
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        applyRefresh(v.repo, planRefresh(v.repo), { version: '0.4.0' })
        assert.deepEqual(readdirSync(v.victim), [])
        assert.equal(existsSync(join(v.repo, '.sdlc', 'scripts', 'validate-guide.mjs')), true)
    } finally {
        v.cleanup()
    }
})

test('a write through a symlink that leaves the repo is refused', () => {
    const v = besideVictim()
    try {
        write(v.victim, 'CLAUDE.md', '# shared\n')
        symlinkSync('../victim/CLAUDE.md', join(v.repo, 'CLAUDE.md'))
        symlinkSync('../victim', join(v.repo, 'linked'))
        assert.throws(() => assertWriteInside(v.repo, join(v.repo, 'CLAUDE.md')), /resolves outside/)
        assert.throws(() => assertWriteInside(v.repo, join(v.repo, 'linked', 'new.md')), /resolves outside/)
        assertWriteInside(v.repo, join(v.repo, 'docs', 'new.md'))
        assert.throws(() => installPayload(v.repo), /resolves outside/)
        assert.equal(readFileSync(join(v.victim, 'CLAUDE.md'), 'utf8'), '# shared\n')
    } finally {
        v.cleanup()
    }
})

test('the migration refuses a root file that is a symlink to a file outside the repo', () => {
    const fx = pluginInit030Repo()
    const outside = mkdtempSync(join(tmpdir(), 'sdlc-shared-'))
    try {
        write(outside, 'CLAUDE.md', '# shared\n')
        symlinkSync(join(outside, 'CLAUDE.md'), join(fx.root, 'CLAUDE.md'))
        git(fx.root, 'add', '-A')
        git(fx.root, 'commit', '-q', '-m', 'shared CLAUDE.md')
        const env = { ...process.env }
        delete env.CLAUDE_PLUGIN_ROOT
        const res = spawnSync(process.execPath, [join(HERE, 'migrate-layout.mjs'), '--root', fx.root, '--apply'], { encoding: 'utf8', env })
        assert.equal(res.status, 1)
        assert.match(res.stderr, /CLAUDE\.md is a symlink to a file outside the repo/)
        assert.equal(readFileSync(join(outside, 'CLAUDE.md'), 'utf8'), '# shared\n')
    } finally {
        fx.cleanup()
        rmSync(outside, { recursive: true, force: true })
    }
})

test('probes plant nothing outside the worktree, through a glob or a tracked symlink', () => {
    const v = besideVictim()
    try {
        write(v.victim, 'keep.txt', 'precious\n')
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\n')
        write(v.repo, '.sdlc/review-constraints.yaml', `constraints:\n  - id: INV-EVIL\n    scope: task\n    when: { touches: ["${'../'.repeat(12)}${v.victim.slice(1)}/keep.txt"] }\n`)
        mkdirSync(join(v.repo, 'specs'))
        symlinkSync(v.victim, join(v.repo, 'specs', 'archive'))
        write(v.repo, 'README.md', 'hi\n')
        commitAll(v.repo)
        const results = probeRev(v.repo, 'HEAD')
        assert.equal(readFileSync(join(v.victim, 'keep.txt'), 'utf8'), 'precious\n')
        assert.deepEqual(readdirSync(v.victim), ['keep.txt'])
        const p3 = results.find((r) => r.id === 'P3')
        assert.equal(p3.ran, false, p3.detail)
    } finally {
        v.cleanup()
    }
})

test("probes run the repo's own settings.json hooks only with localHooks", () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\ndomain_routing:\n  apps/web: [react-skill]\n')
        write(v.repo, '.sdlc/state-machine.yaml', 'version: 1\nphases: []\n')
        write(v.repo, '.claude/settings.json', JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: `touch ${join(v.victim, 'ran')}` }] }] } }))
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        probeRev(v.repo, 'HEAD')
        assert.equal(existsSync(join(v.victim, 'ran')), false)
        probeRev(v.repo, 'HEAD', { localHooks: true })
        assert.equal(existsSync(join(v.victim, 'ran')), true)
    } finally {
        v.cleanup()
    }
})

test("the plugin's edit hook never imports the repo's reviewer-routing.mjs", () => {
    const v = besideVictim()
    try {
        git(v.repo, 'init', '-q', '-b', 'feat/spec-001')
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\n')
        write(v.repo, '.sdlc/review-constraints.yaml', 'constraints: []\n')
        write(v.repo, '.sdlc/scripts/reviewer-routing.mjs', `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(join(v.victim, 'ran'))}, 'x')\nexport const loadConstraints = () => []\nexport const applicableConstraints = () => []\n`)
        write(v.repo, 'specs/.gitkeep', '')
        write(v.repo, 'src/a.ts', 'x\n')
        git(v.repo, 'add', '-A')
        git(v.repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init')
        const hook = fileURLToPath(new URL('../../hooks/pre-tool-use-edit-write.mjs', import.meta.url))
        const payload = { tool_name: 'Edit', tool_input: { file_path: join(v.repo, 'src', 'a.ts') }, session_id: 's1', cwd: v.repo }
        spawnSync(process.execPath, [hook], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: v.repo } })
        assert.equal(existsSync(join(v.victim, 'ran')), false)
    } finally {
        v.cleanup()
    }
})
