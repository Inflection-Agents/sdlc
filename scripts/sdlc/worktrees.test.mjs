// SPEC-011 > Design > Detection: worktrees.mjs lists and prunes strays. Every case runs against
// a real repo with a bare remote, because the behaviour is git's (upstream tracking, worktree
// registration), and a path-only fixture would not exercise it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findStrays, prune } from './worktrees.mjs'
import { write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./worktrees.mjs', import.meta.url))

const spec = (id, status) => `---\nid: ${id}\ntitle: x\nstatus: ${status}\n---\n\n## Problem\n\nx\n`

/** A repo pushed to a bare remote, with one worktree of every kind. */
function fixture() {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sdlc-wt-')))
    const remote = join(tmp, 'remote.git')
    const root = join(tmp, 'repo')
    const sh = (cwd, ...a) => {
        const r = spawnSync('git', a, { cwd, encoding: 'utf8' })
        assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`)
        return r.stdout
    }
    sh(tmp, 'init', '-q', '--bare', remote)
    sh(tmp, 'init', '-q', '-b', 'main', root)
    sh(root, 'config', 'user.email', 't@t')
    sh(root, 'config', 'user.name', 't')
    write(root, '.sdlc/config.yaml', 'layout: 2\n')
    write(root, 'specs/SPEC-900-live.md', spec('SPEC-900', 'active'))
    write(root, 'specs/SPEC-901-done.md', spec('SPEC-901', 'completed'))
    write(root, '.gitignore', '.claude/worktrees/\n')
    sh(root, 'add', '-A')
    sh(root, 'commit', '-qm', 'init')
    sh(root, 'remote', 'add', 'origin', remote)
    sh(root, 'push', '-q', '-u', 'origin', 'main')
    const wt = (name, ...extra) => sh(root, 'worktree', 'add', '-q', ...extra, join(root, '.claude/worktrees', name))
    // non-strays
    wt('spec-900', '-b', 'feat/spec-900')
    wt('feature-new', '-b', 'feature-new') // no commits, no upstream
    wt('feature-pushed', '-b', 'feature-pushed')
    sh(join(root, '.claude/worktrees/feature-pushed'), 'push', '-q', '-u', 'origin', 'feature-pushed')
    // strays
    sh(root, 'worktree', 'add', '-q', '-b', 'sibling', join(tmp, 'sibling')) // outside
    wt('feature-merged', '-b', 'feature-merged')
    sh(join(root, '.claude/worktrees/feature-merged'), 'push', '-q', '-u', 'origin', 'feature-merged')
    sh(root, 'push', '-q', 'origin', '--delete', 'feature-merged')
    sh(root, 'fetch', '-q', '--prune')
    wt('det', '--detach')
    wt('spec-901', '-b', 'feat/spec-901')
    wt('agent-abc', '-b', 'worktree-agent-abc')
    return { tmp, root, remote, sh, path: (n) => join(root, '.claude/worktrees', n), cleanup: () => rmSync(tmp, { recursive: true, force: true }) }
}

const byReason = (strays) => Object.fromEntries(strays.map((s) => [s.reason, s.path.split('/').pop()]))
const run = (cwd, ...a) => spawnSync(process.execPath, [SCRIPT, '--root', cwd, ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } })

test('AC-005: each stray kind is reported once with its reason, and the three non-strays are not', () => {
    const fx = fixture()
    try {
        const strays = findStrays(fx.root)
        assert.deepEqual(byReason(strays), {
            outside: 'sibling',
            'branch-gone': 'feature-merged',
            detached: 'det',
            'spec-closed': 'spec-901',
            agent: 'agent-abc',
        })
        assert.equal(strays.length, 5)
        const res = run(fx.root)
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stdout, /worktrees: 5 stray\(s\)/)
        const json = JSON.parse(run(fx.root, '--json').stdout)
        assert.deepEqual(Object.keys(json[0]).sort(), ['branch', 'path', 'reason'])
        assert.equal(json.length, 5)
    } finally {
        fx.cleanup()
    }
})

test('AC-005: --fetch sees a branch deleted on the remote since the last fetch', () => {
    const fx = fixture()
    try {
        fx.sh(fx.tmp, '--git-dir', fx.remote, 'branch', '-D', 'feature-pushed')
        assert.equal(findStrays(fx.root).some((s) => s.path.endsWith('feature-pushed')), false, 'list mode reads local refs only')
        const res = run(fx.root, '--fetch', '--json')
        assert.equal(res.status, 0, res.stderr)
        assert.ok(JSON.parse(res.stdout).some((s) => s.reason === 'branch-gone' && s.path.endsWith('feature-pushed')))
    } finally {
        fx.cleanup()
    }
})

test('agent wins over every other reason, so a detached agent worktree is never reported as detached', () => {
    const fx = fixture()
    try {
        fx.sh(fx.root, 'worktree', 'add', '-q', '--detach', fx.path('agent-det'))
        const s = findStrays(fx.root).find((x) => x.path.endsWith('agent-det'))
        assert.equal(s.reason, 'agent')
    } finally {
        fx.cleanup()
    }
})

test('AC-006: --prune removes only clean branch-gone and spec-closed strays, never forces, never deletes a branch', () => {
    const fx = fixture()
    try {
        fx.sh(fx.root, 'worktree', 'add', '-q', '--detach', fx.path('agent-det'))
        // a dirty branch-gone stray
        fx.sh(fx.root, 'worktree', 'add', '-q', '-b', 'feature-dirty', fx.path('feature-dirty'))
        fx.sh(fx.path('feature-dirty'), 'push', '-q', '-u', 'origin', 'feature-dirty')
        fx.sh(fx.root, 'push', '-q', 'origin', '--delete', 'feature-dirty')
        fx.sh(fx.root, 'fetch', '-q', '--prune')
        writeFileSync(join(fx.path('feature-dirty'), 'wip.txt'), 'unsaved\n')
        const res = run(fx.root, '--prune')
        assert.equal(res.status, 0, res.stderr)
        for (const gone of ['feature-merged', 'spec-901']) assert.equal(existsSync(fx.path(gone)), false, `${gone} removed`)
        for (const kept of ['det', 'agent-abc', 'agent-det', 'feature-dirty', 'spec-900', 'feature-new', 'feature-pushed']) {
            assert.equal(existsSync(fx.path(kept)), true, `${kept} kept`)
        }
        assert.equal(existsSync(join(fx.tmp, 'sibling')), true, 'outside kept')
        assert.match(res.stdout, /kept +branch-gone .*feature-dirty.*\[kept: dirty\]/)
        const branches = fx.sh(fx.root, 'branch', '--format=%(refname:short)')
        for (const b of ['feature-merged', 'feat/spec-901', 'feature-dirty']) assert.match(branches, new RegExp(`^${b}$`, 'm'), `${b} not deleted`)
        assert.equal(existsSync(fx.root), true)
    } finally {
        fx.cleanup()
    }
})

test('AC-007: --own SPEC-900 removes only that spec worktree, even though it is not a stray', () => {
    const fx = fixture()
    try {
        const { removed, kept } = prune(fx.root, { own: 'spec-900' })
        assert.deepEqual(removed.map((r) => r.path.split('/').pop()), ['spec-900'])
        assert.equal(existsSync(fx.path('spec-900')), false)
        for (const left of ['agent-abc', 'det', 'feature-merged', 'spec-901']) assert.equal(existsSync(fx.path(left)), true, left)
        assert.ok(kept.some((k) => k.reason === 'agent') && kept.some((k) => k.reason === 'detached'))
        const res = run(fx.root, '--prune', '--own', 'SPEC-901')
        assert.equal(res.status, 0, res.stderr)
        assert.equal(existsSync(fx.path('spec-901')), false)
        assert.equal(existsSync(fx.path('feature-merged')), true, '--own never prunes other strays')
    } finally {
        fx.cleanup()
    }
})

test('a dirty own spec worktree is kept and reported, never forced', () => {
    const fx = fixture()
    try {
        writeFileSync(join(fx.path('spec-900'), 'wip.txt'), 'unsaved\n')
        const { removed, kept } = prune(fx.root, { own: 'spec-900' })
        assert.deepEqual(removed, [])
        assert.ok(kept.some((k) => k.path.endsWith('spec-900') && k.why === 'dirty'))
        assert.equal(existsSync(fx.path('spec-900')), true)
    } finally {
        fx.cleanup()
    }
})

test('run from inside a linked worktree, it still reports against the main checkout', () => {
    const fx = fixture()
    try {
        assert.equal(findStrays(fx.path('spec-900')).length, 5)
    } finally {
        fx.cleanup()
    }
})

test('outside a git repo it exits 2 and says so; a bad --own exits 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-nogit-'))
    try {
        const res = run(dir)
        assert.equal(res.status, 2)
        assert.match(res.stderr, /not a git repository/)
        assert.equal(run(dir, '--own', 'nope').status, 2)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

// ── Gate round 1 (PR #99) ────────────────────────────────────────────────────

test('a live spec worktree is never a stray, even when the main checkout lacks the spec', () => {
    const fx = fixture()
    try {
        // The main checkout moves to a branch cut before SPEC-900 existed (D-008's judgment branches).
        fx.sh(fx.root, 'checkout', '-q', '-b', 'spec/SPEC-950-x', 'HEAD')
        fx.sh(fx.root, 'rm', '-q', 'specs/SPEC-900-live.md')
        fx.sh(fx.root, 'commit', '-qm', 'branch without SPEC-900')
        writeFileSync(join(fx.path('spec-900'), '.env.local'), 'SECRET=1\n')
        assert.equal(findStrays(fx.root).some((s) => s.path.endsWith('spec-900')), false, 'its own tree says active')
        run(fx.root, '--prune')
        assert.equal(existsSync(join(fx.path('spec-900'), '.env.local')), true)
    } finally {
        fx.cleanup()
    }
})

test('a live spec worktree on a branch whose upstream is gone is still not a stray', () => {
    const fx = fixture()
    try {
        const wt = fx.path('spec-900')
        fx.sh(wt, 'checkout', '-q', '-b', 'claude/SPEC-900-S1')
        fx.sh(wt, 'push', '-q', '-u', 'origin', 'claude/SPEC-900-S1')
        fx.sh(fx.root, 'push', '-q', 'origin', '--delete', 'claude/SPEC-900-S1')
        fx.sh(fx.root, 'fetch', '-q', '--prune')
        assert.equal(findStrays(fx.root).some((s) => s.path.endsWith('spec-900')), false)
    } finally {
        fx.cleanup()
    }
})

test('a spec-NNN worktree whose spec resolves nowhere is reported but never removed', () => {
    const fx = fixture()
    try {
        fx.sh(fx.root, 'worktree', 'add', '-q', '-b', 'feat/spec-999', fx.path('spec-999'))
        assert.equal(findStrays(fx.root).find((s) => s.path.endsWith('spec-999')).reason, 'spec-closed')
        run(fx.root, '--prune')
        assert.equal(existsSync(fx.path('spec-999')), true)
    } finally {
        fx.cleanup()
    }
})

test('agent wins over outside too', () => {
    const fx = fixture()
    try {
        fx.sh(fx.root, 'worktree', 'add', '-q', '-b', 'worktree-agent-zz', join(fx.tmp, 'agent-zz'))
        assert.equal(findStrays(fx.root).find((s) => s.path.endsWith('agent-zz')).reason, 'agent')
    } finally {
        fx.cleanup()
    }
})

test('a candidate that holds another worktree is kept, and the nested work survives', () => {
    const fx = fixture()
    try {
        const nested = join(fx.path('spec-900'), '.claude/worktrees/agent-in')
        fx.sh(fx.root, 'worktree', 'add', '-q', '-b', 'worktree-agent-in', nested)
        writeFileSync(join(nested, 'wip.txt'), 'unsaved\n')
        const { removed, kept } = prune(fx.root, { own: 'spec-900' })
        assert.deepEqual(removed, [])
        assert.ok(kept.some((k) => k.path.endsWith('spec-900') && k.why === 'holds another worktree'))
        assert.equal(existsSync(join(nested, 'wip.txt')), true)
    } finally {
        fx.cleanup()
    }
})

test('--prune never deregisters a worktree whose directory was moved by hand', () => {
    const fx = fixture()
    try {
        renameSync(join(fx.tmp, 'sibling'), join(fx.tmp, 'moved'))
        run(fx.root, '--prune')
        run(fx.root, '--prune', '--own', 'SPEC-900')
        assert.match(fx.sh(fx.root, 'worktree', 'list', '--porcelain'), /\/sibling\n/, 'still registered, so `git worktree repair` can recover it')
    } finally {
        fx.cleanup()
    }
})

test('a locked stray is kept with git\'s reason, not mislabelled dirty', () => {
    const fx = fixture()
    try {
        fx.sh(fx.root, 'worktree', 'lock', fx.path('feature-merged'))
        const { kept } = prune(fx.root)
        const k = kept.find((x) => x.path.endsWith('feature-merged'))
        assert.ok(k && k.why !== 'dirty', JSON.stringify(k))
        assert.equal(existsSync(fx.path('feature-merged')), true)
    } finally {
        fx.cleanup()
    }
})

test('list mode runs no git status, and --prune never passes --force', () => {
    const fx = fixture()
    const shim = mkdtempSync(join(tmpdir(), 'sdlc-gitshim-'))
    try {
        const log = join(shim, 'calls.log')
        const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
        writeFileSync(join(shim, 'git'), `#!/bin/sh\necho "$*" >> ${log}\nexec ${realGit} "$@"\n`, { mode: 0o755 })
        const env = { ...process.env, CLAUDE_PROJECT_DIR: '', PATH: `${shim}:${process.env.PATH}` }
        spawnSync(process.execPath, [SCRIPT, '--root', fx.root], { encoding: 'utf8', env })
        assert.doesNotMatch(readFileSync(log, 'utf8'), /(^| )status( |$)/m, 'list mode is local refs only')
        // a tracked, modified file: the case where --force would matter
        writeFileSync(join(fx.path('feature-merged'), '.gitignore'), 'changed\n')
        spawnSync(process.execPath, [SCRIPT, '--root', fx.root, '--prune'], { encoding: 'utf8', env })
        assert.doesNotMatch(readFileSync(log, 'utf8'), /--force/)
        assert.equal(existsSync(fx.path('feature-merged')), true, 'the modified tree is kept')
    } finally {
        fx.cleanup()
        rmSync(shim, { recursive: true, force: true })
    }
})
