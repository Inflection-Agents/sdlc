// Gates that went quiet or wrong in an environment the step tests never built, found at the
// SPEC-009 integration gate: a config that does not parse, a session that sets
// CLAUDE_PROJECT_DIR, an existing .prettierignore, and a depth-1 CI clone after a squash merge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { installPayload } from './install-payload.mjs'
import { probeRev } from './probe-gates.mjs'
import { movesFromHistory } from './scan-legacy-paths.mjs'
import { commitAll, forkedHighGearRepo, git, write } from './__fixtures__/layouts/build.mjs'

const HOOK = fileURLToPath(new URL('../../hooks/pre-tool-use-edit-write.mjs', import.meta.url))
const MIGRATE = fileURLToPath(new URL('./migrate-layout.mjs', import.meta.url))

test('an edit gate over a config that does not parse still blocks, and says why', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-badcfg-'))
    try {
        write(root, '.sdlc/config.yaml', 'layout: 2\npaths:\n  skills: [unterminated\n')
        write(root, 'specs/.gitkeep', '')
        write(root, 'src/a.ts', 'x\n')
        commitAll(root)
        const payload = { tool_name: 'Edit', tool_input: { file_path: join(root, 'src', 'a.ts') }, session_id: 'badcfg', cwd: root }
        const res = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root, SDLC_GUARD_MODE: 'enforce' } })
        assert.match(res.stderr, /cannot read the SDLC config/)
        assert.match(res.stdout + res.stderr, /no-active-task implementation-code gate/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('a CLAUDE_PROJECT_DIR naming the main checkout does not change what the probes grade', () => {
    // The 0.4.0 validators on a migrated tip honor CLAUDE_PROJECT_DIR, so a probe that does not
    // point it at the worktree grades the main checkout, where no violation was planted.
    const fx = forkedHighGearRepo()
    const prior = process.env.CLAUDE_PROJECT_DIR
    try {
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        delete env.CLAUDE_PLUGIN_ROOT
        spawnSync(process.execPath, [MIGRATE, '--root', fx.root, '--apply'], { env, encoding: 'utf8' })
        delete process.env.CLAUDE_PROJECT_DIR
        const brief = (rs) => rs.map((r) => `${r.id}:${r.ran}:${r.caught}`)
        const clean = brief(probeRev(fx.root, 'HEAD', { repoCode: true }))
        process.env.CLAUDE_PROJECT_DIR = fx.root
        assert.deepEqual(brief(probeRev(fx.root, 'HEAD', { repoCode: true })), clean)
        assert.ok(clean.includes('P5:true:true'), clean.join(' '))
    } finally {
        if (prior === undefined) delete process.env.CLAUDE_PROJECT_DIR
        else process.env.CLAUDE_PROJECT_DIR = prior
        fx.cleanup()
    }
})

test('init appends the framework-owned files to an existing .prettierignore, and creates none', () => {
    const withFile = mkdtempSync(join(tmpdir(), 'sdlc-prettier-'))
    const without = mkdtempSync(join(tmpdir(), 'sdlc-noprettier-'))
    try {
        write(withFile, '.prettierignore', 'dist/\n')
        const report = installPayload(withFile)
        const text = readFileSync(join(withFile, '.prettierignore'), 'utf8')
        assert.match(text, /^dist\/\n\.sdlc\/state-machine\.yaml\n\.sdlc\/scripts\/\n\.sdlc\/templates\/\n\.sdlc\/contracts\/\n$/)
        assert.ok(report.appended['.prettierignore'])
        installPayload(without)
        assert.throws(() => readFileSync(join(without, '.prettierignore')))
    } finally {
        rmSync(withFile, { recursive: true, force: true })
        rmSync(without, { recursive: true, force: true })
    }
})

test('a depth-1 clone of a squash-merged migration knows no moves, and a full clone does', () => {
    const base = mkdtempSync(join(tmpdir(), 'sdlc-shallow-'))
    try {
        const full = join(base, 'full')
        write(full, 'a.md', 'x\n')
        commitAll(full, 'init')
        git(full, 'mv', 'a.md', 'b.md')
        git(full, 'commit', '-q', '-m', 'SPEC-009 migration (#12)', '-m', '* sdlc: migrate to layout 2')
        execFileSync('git', ['clone', '-q', '--depth', '1', `file://${full}`, join(base, 'shallow')])
        assert.deepEqual([...movesFromHistory(join(base, 'shallow'))], [])
        assert.deepEqual([...movesFromHistory(full)], [['a.md', 'b.md']])
    } finally {
        rmSync(base, { recursive: true, force: true })
    }
})
