// Tests for the layout-2 installer that /sdlc-init and bootstrap.sh share (SPEC-009 AC-009).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BLOCK_BEGIN, DEFAULT_PAYLOAD, installPayload } from './install-payload.mjs'
import { commitAll, git } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./install-payload.mjs', import.meta.url))

function emptyRepo() {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-init-'))
    git(root, 'init', '-q', '-b', 'main')
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

const dirsIn = (root) => readdirSync(root).filter((n) => n !== '.git' && statSync(join(root, n)).isDirectory()).sort()

function sameTree(a, b) {
    const files = (d, base = d) =>
        readdirSync(d, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? files(join(d, e.name), base) : [join(d, e.name).slice(base.length + 1)]
        )
    const fa = files(a).sort()
    assert.deepEqual(fa, files(b).sort())
    for (const f of fa) assert.equal(readFileSync(join(a, f), 'utf8'), readFileSync(join(b, f), 'utf8'), f)
}

test('an empty repo gets the layout-2 tree and exactly three new top-level directories', () => {
    const fx = emptyRepo()
    try {
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, [SCRIPT, '--root', fx.root], { encoding: 'utf8', env })
        assert.equal(res.status, 0, res.stderr)
        assert.deepEqual(dirsIn(fx.root), ['.github', '.sdlc', 'specs'])
        for (const absent of ['.ai', 'templates', 'scripts']) assert.equal(existsSync(join(fx.root, absent)), false, absent)
        for (const f of ['config.yaml', 'review-constraints.yaml', 'state-machine.yaml', 'scripts/lib/sdlc-paths.mjs', 'contracts/review-primitives.md']) {
            assert.ok(existsSync(join(fx.root, '.sdlc', f)), f)
        }
        assert.ok(readFileSync(join(fx.root, '.ignore'), 'utf8').split('\n').includes('!.sdlc/'))
        sameTree(join(fx.root, '.sdlc', 'templates'), join(DEFAULT_PAYLOAD, '.sdlc', 'templates'))
        assert.match(readFileSync(join(fx.root, 'AGENTS.md'), 'utf8'), /<!-- BEGIN SDLC -->[\s\S]*<!-- END SDLC -->/)
        assert.ok(readFileSync(join(fx.root, 'CLAUDE.md'), 'utf8').split('\n').includes('@AGENTS.md'))
    } finally {
        fx.cleanup()
    }
})

test('a second run writes nothing', () => {
    const fx = emptyRepo()
    try {
        installPayload(fx.root)
        const before = git(fx.root, 'status', '--porcelain', '--untracked-files=all')
        const report = installPayload(fx.root)
        assert.deepEqual(report.created, [])
        assert.deepEqual(report.appended, {})
        assert.equal(report.block, false)
        assert.equal(report.claudeImport, false)
        assert.equal(git(fx.root, 'status', '--porcelain', '--untracked-files=all'), before)
    } finally {
        fx.cleanup()
    }
})

test('existing root files get only what they lack, and every other byte is kept', () => {
    const fx = emptyRepo()
    try {
        const agents = '# Jules entry point\n<!-- BEGIN BEADS INTEGRATION -->\nbeads\n<!-- END BEADS INTEGRATION -->\n'
        const claude = '# Claude\nRead the docs.\n'
        writeFileSync(join(fx.root, 'AGENTS.md'), agents)
        writeFileSync(join(fx.root, 'CLAUDE.md'), claude)
        writeFileSync(join(fx.root, '.ignore'), 'node_modules/\nspecs/archive/\n')
        writeFileSync(join(fx.root, '.gitignore'), 'dist/\n')
        writeFileSync(join(fx.root, '.gitattributes'), '* text=auto eol=lf\n')
        commitAll(fx.root)
        installPayload(fx.root)
        const a = readFileSync(join(fx.root, 'AGENTS.md'), 'utf8')
        assert.ok(a.startsWith(agents), 'the existing AGENTS.md content is byte-identical')
        assert.ok(a.indexOf(BLOCK_BEGIN) > agents.length - 1)
        assert.equal(readFileSync(join(fx.root, 'CLAUDE.md'), 'utf8'), `${claude}\n@AGENTS.md\n`)
        assert.equal(readFileSync(join(fx.root, '.ignore'), 'utf8'), 'node_modules/\nspecs/archive/\n!.sdlc/\n')
        assert.equal(readFileSync(join(fx.root, '.gitignore'), 'utf8'), 'dist/\n.claude/.sdlc-*\n!.claude/.sdlc-override-log\n')
        assert.equal(readFileSync(join(fx.root, '.gitattributes'), 'utf8'), '* text=auto eol=lf\n*.sh text eol=lf\n*.mjs text eol=lf\n')
    } finally {
        fx.cleanup()
    }
})

test('--contracts-in-skills skips .sdlc/contracts and points config.yaml at the skills copy', () => {
    const fx = emptyRepo()
    try {
        installPayload(fx.root, { contractsInSkills: true })
        assert.equal(existsSync(join(fx.root, '.sdlc', 'contracts')), false)
        assert.match(readFileSync(join(fx.root, '.sdlc', 'config.yaml'), 'utf8'), /primitives: \.sdlc\/skills\/review-primitives\.md/)
    } finally {
        fx.cleanup()
    }
})
