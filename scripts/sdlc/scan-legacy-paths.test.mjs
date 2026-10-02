// Tests for the legacy-path scan CLI (SPEC-009). It is the gate a migration branch must pass
// before merging, and a CI step on layout 2, so its exit codes and its file set are pinned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { commitAll, layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./scan-legacy-paths.mjs', import.meta.url))

function scan(root, ...args) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8', env })
}

function repo(files, config = 'layout: 2\n') {
    const fx = layout2Repo({ config })
    for (const [rel, body] of Object.entries(files)) write(fx.root, rel, body)
    commitAll(fx.root)
    return fx
}

test('a layout-1 path exits 3 and prints file:line; a clean repo exits 0', () => {
    const dirty = repo({ 'docs/how.md': 'line one\nrun node scripts/sdlc/validate-guide.mjs\n' })
    const clean = repo({ 'docs/how.md': 'run node .sdlc/scripts/validate-guide.mjs\n' })
    try {
        const d = scan(dirty.root)
        assert.equal(d.status, 3)
        assert.match(d.stdout, /^docs\/how\.md:2 +\[path\] +scripts\/sdlc\//m)
        const c = scan(clean.root)
        assert.equal(c.status, 0, c.stdout)
        assert.match(c.stdout, /no layout-1 references/)
    } finally {
        dirty.cleanup()
        clean.cleanup()
    }
})

test('scan.allow exempts a glob, and --no-allow ignores it', () => {
    const fx = repo({ 'docs/RELEASING.md': 'the 0.3.0 row names scripts/sdlc/\n' }, 'layout: 2\nscan:\n  allow: ["docs/RELEASING.md"]\n')
    try {
        assert.equal(scan(fx.root).status, 0)
        assert.equal(scan(fx.root, '--no-allow').status, 3)
    } finally {
        fx.cleanup()
    }
})

test('--only limits the scan, and a path config.yaml names as current is not legacy', () => {
    const fx = repo({ 'a/x.md': 'scripts/sdlc/\n', 'b/y.md': 'clean\n' }, 'layout: 2\npaths:\n  scripts: scripts/sdlc\n')
    try {
        assert.equal(scan(fx.root).status, 0, 'scripts/sdlc is this repo\'s configured scripts dir')
    } finally {
        fx.cleanup()
    }
    const fx2 = repo({ 'a/x.md': 'scripts/sdlc/\n', 'b/y.md': 'clean\n' })
    try {
        assert.equal(scan(fx2.root, '--only', 'b').status, 0)
        assert.equal(scan(fx2.root, '--only', 'a').status, 3)
    } finally {
        fx2.cleanup()
    }
})

test('history and the built-in exemptions are not read', () => {
    const fx = repo({
        'specs/archive/specs/SPEC-001-old.md': 'scripts/sdlc/\n',
        'specs/SPEC-002-done.md': '---\nstatus: completed\n---\nscripts/sdlc/\n',
        'tools/__tests__/fixture.test.mjs': "join(root, '.ai', 'skills')\n",
        'tools/lib/legacy-map.mjs': "'.ai/'\n",
    })
    try {
        const res = scan(fx.root)
        assert.equal(res.status, 0, res.stdout)
    } finally {
        fx.cleanup()
    }
})
