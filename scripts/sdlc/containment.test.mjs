// Writes and code execution stay inside the repo (SPEC-009 integration gate, security lens).
// A repo is not trusted input: its config paths, symlinks, registry globs, settings.json
// hooks and script names must not reach a file or a program outside it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
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
        const p4 = results.find((r) => r.id === 'P4')
        assert.equal(p4.ran, false, p4.detail)
        assert.match(p4.detail, /refusing to write/)
    } finally {
        v.cleanup()
    }
})

test("probes run the repo's own settings.json hooks only with repoCode", () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\ndomain_routing:\n  apps/web: [react-skill]\n')
        write(v.repo, '.sdlc/state-machine.yaml', 'version: 1\nphases: []\n')
        write(v.repo, '.claude/settings.json', JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: `touch ${join(v.victim, 'ran')}` }] }] } }))
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        probeRev(v.repo, 'HEAD')
        assert.equal(existsSync(join(v.victim, 'ran')), false)
        probeRev(v.repo, 'HEAD', { repoCode: true })
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

test("without repoCode a probe never runs the repo's own validator", () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\nworkspaces:\n  - name: web\n    path: apps/web\n')
        write(v.repo, '.sdlc/scripts/validate-guide.mjs', `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(join(v.victim, 'ran'))}, 'x')\n`)
        write(v.repo, 'apps/web/.gitkeep', '')
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        const p1 = probeRev(v.repo, 'HEAD').find((r) => r.id === 'P1')
        assert.equal(existsSync(join(v.victim, 'ran')), false)
        assert.equal(p1.ran, false)
        assert.match(p1.detail, /--repo-code/)
    } finally {
        v.cleanup()
    }
})

test('each probed revision prints the repo commands it would run, and the probes held back', () => {
    const v = besideVictim()
    try {
        const settings = (cmd) => JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: cmd }] }] } })
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\ndomain_routing:\n  apps/web: [react-skill]\n')
        write(v.repo, '.sdlc/state-machine.yaml', 'version: 1\nphases: []\n')
        write(v.repo, '.claude/settings.json', settings('echo from-the-old-commit'))
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        write(v.repo, '.claude/settings.json', settings('echo from-the-new-commit'))
        git(v.repo, 'commit', '-qam', 'new hook')
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        delete env.CLAUDE_PLUGIN_ROOT
        const res = spawnSync(process.execPath, [join(HERE, 'probe-gates.mjs'), '--root', v.repo, '--before', 'HEAD~1', '--after', 'HEAD'], { encoding: 'utf8', env })
        assert.match(res.stderr, /HEAD~1 \(\w+\): skipping \(pass --repo-code to run\) the repo's hook: "echo from-the-old-commit"/)
        assert.match(res.stderr, /HEAD \(\w+\): skipping \(pass --repo-code to run\) the repo's hook: "echo from-the-new-commit"/)
        assert.match(res.stderr, /not probed without --repo-code: P2/)
        assert.deepEqual(JSON.parse(res.stdout).unprobed, ['P2'])
    } finally {
        v.cleanup()
    }
})

test('the sync refresh refuses, and exits 1, when a tracked .sdlc/scripts links out of the repo', () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\nframework_version: 0.3.0\n')
        write(v.repo, 'specs/.gitkeep', '')
        symlinkSync(v.victim, join(v.repo, '.sdlc', 'scripts'))
        commitAll(v.repo)
        assert.throws(() => applyRefresh(v.repo, planRefresh(v.repo), { version: '0.4.0' }), /resolves outside/)
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, [join(HERE, 'sync-refresh.mjs'), '--root', v.repo, '--apply'], { encoding: 'utf8', env })
        assert.equal(res.status, 1)
        assert.deepEqual(readdirSync(v.victim), [])
    } finally {
        v.cleanup()
    }
})

test("probes never fire the probed revision's git hooks (a husky post-checkout)", () => {
    const v = besideVictim()
    try {
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\n')
        write(v.repo, 'specs/.gitkeep', '')
        write(v.repo, '.husky/post-checkout', `#!/bin/sh\necho ran >> ${join(v.victim, 'post-checkout-ran')}\n`)
        commitAll(v.repo)
        chmodSync(join(v.repo, '.husky', 'post-checkout'), 0o755)
        git(v.repo, 'config', 'core.hooksPath', '.husky')
        probeRev(v.repo, 'HEAD')
        assert.equal(existsSync(join(v.victim, 'post-checkout-ran')), false)
    } finally {
        v.cleanup()
    }
})

test('a validator a workflow names outside the repo is never run', () => {
    const v = besideVictim()
    try {
        write(v.victim, 'validate-guide.mjs', `require('fs').writeFileSync(${JSON.stringify(join(v.victim, 'ran'))}, 'x')\n`)
        write(v.repo, '.sdlc/config.yaml', 'layout: 2\nworkspaces:\n  - name: web\n    path: apps/web\n')
        write(v.repo, '.github/workflows/ci.yml', 'jobs:\n  a:\n    steps:\n      - run: node ../victim/validate-guide.mjs\n')
        write(v.repo, 'apps/web/.gitkeep', '')
        write(v.repo, 'specs/.gitkeep', '')
        commitAll(v.repo)
        probeRev(v.repo, 'HEAD', { repoCode: true })
        assert.equal(existsSync(join(v.victim, 'ran')), false)
    } finally {
        v.cleanup()
    }
})

test('isInside treats a name that starts with two dots as a name', () => {
    assert.equal(isInside('/r', '..foo/x'), true)
    assert.equal(isInside('/r', '..'), false)
})
