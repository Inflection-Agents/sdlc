// The migration's failure modes found at the SPEC-009 integration gate, each reproduced on
// the 0.3.0 plugin-init fixture: a half-applied run, a destination that already exists, a
// bare directory reference, a quoted status, an unreplaced workflow, an escaped table pipe,
// an existing AGENTS.md block, and a config that would not read back.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseWorkspaceTables } from './migrate-layout.mjs'
import { parseYaml } from './lib/mini-yaml.mjs'
import { git, pluginInit030Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./migrate-layout.mjs', import.meta.url))

function migrate(root, ...args) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CLAUDE_PLUGIN_ROOT
    return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 26 })
}

/** The 0.3.0 fixture with `files` added in a second commit. */
function fixture(files = {}) {
    const fx = pluginInit030Repo()
    for (const [rel, body] of Object.entries(files)) write(fx.root, rel, body)
    if (Object.keys(files).length) {
        git(fx.root, 'add', '-A')
        git(fx.root, 'commit', '-q', '-m', 'adopter files')
    }
    return fx
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')

test('a commit that fails (a pre-commit hook) rolls the whole migration back', () => {
    const fx = fixture()
    try {
        const head = git(fx.root, 'rev-parse', 'HEAD').trim()
        write(fx.root, '.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n')
        chmodSync(join(fx.root, '.git/hooks/pre-commit'), 0o755)
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1, res.stdout + res.stderr)
        assert.match(res.stderr, /rolled back/)
        assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
        assert.equal(git(fx.root, 'rev-parse', 'HEAD').trim(), head)
        assert.equal(git(fx.root, 'status', '--porcelain').trim(), '')
        assert.equal(git(fx.root, 'branch', '--list', 'chore/sdlc-layout-v2').trim(), '')
        assert.equal(existsSync(join(fx.root, '.sdlc')), false)
    } finally {
        fx.cleanup()
    }
})

test('an untracked .sdlc/ is refused, so git mv cannot nest the registry inside it', () => {
    const fx = fixture()
    try {
        write(fx.root, '.sdlc/scratch.txt', 'x\n')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /\.sdlc\/ already exists/)
        assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
    } finally {
        fx.cleanup()
    }
})

test('an untracked .sdlc/config.yaml is a leftover, not a finished migration', () => {
    const fx = fixture()
    try {
        write(fx.root, '.sdlc/config.yaml', 'layout: 2\n')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /not committed/)
    } finally {
        fx.cleanup()
    }
})

test('a bare multi-segment directory is rewritten, and the prose word templates is not', () => {
    const fx = fixture({
        'package.json': '{ "scripts": { "test:sdlc": "node --test scripts/sdlc" } }\n',
        'docs/notes.md': 'Edit the templates by hand.\n',
    })
    try {
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 0, res.stderr)
        assert.match(read(fx.root, 'package.json'), /node --test \.sdlc\/scripts"/)
        assert.equal(read(fx.root, 'docs/notes.md'), 'Edit the templates by hand.\n')
    } finally {
        fx.cleanup()
    }
})

test("a quoted or capitalized status decides history the way the spec's own reader does", () => {
    const guide = '# guide\n\nRun scripts/sdlc/validate-guide.mjs.\n'
    const fx = fixture({
        'specs/SPEC-001-old.md': '---\nid: SPEC-001\nstatus: "completed"\n---\n',
        'specs/tasks/SPEC-001/GUIDE.md': guide,
        'specs/SPEC-003-live.md': '---\nid: SPEC-003\nstatus: Active\n---\n',
        'specs/tasks/SPEC-003/GUIDE.md': guide,
    })
    try {
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 0, res.stderr)
        assert.equal(read(fx.root, 'specs/tasks/SPEC-001/GUIDE.md'), guide, 'a closed spec is history')
        assert.match(read(fx.root, 'specs/tasks/SPEC-003/GUIDE.md'), /\.sdlc\/scripts\/validate-guide\.mjs/)
    } finally {
        fx.cleanup()
    }
})

test('an unmodified released workflow is replaced with the 0.4.0 copy, so CI gains the scan', () => {
    const fx = fixture()
    try {
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 0, res.stderr)
        const payload = fileURLToPath(new URL('../../init-payload/.github/workflows/sdlc-validate.yml', import.meta.url))
        assert.equal(read(fx.root, '.github/workflows/sdlc-validate.yml'), readFileSync(payload, 'utf8'))
        assert.match(read(fx.root, '.github/workflows/sdlc-validate.yml'), /scan-legacy-paths\.mjs/)
    } finally {
        fx.cleanup()
    }
})

test('an escaped pipe stays inside its cell, and a row with the wrong cell count stops the migration', () => {
    const table = (row) => `## Workspaces\n\n| Workspace | Path | Test command | Build command |\n|---|---|---|---|\n${row}\n`
    const ok = parseWorkspaceTables(table('| web | apps/web | `pnpm test 2>&1 \\| tee t.log` | `pnpm build` |'))
    assert.deepEqual(
        ok.workspaces.map((w) => [w.test, w.build]),
        [['pnpm test 2>&1 | tee t.log', 'pnpm build']]
    )
    const bad = parseWorkspaceTables(table('| web | apps/web | `pnpm test` | `pnpm build` | extra |'))
    assert.match(bad.problems.join('\n'), /has 5 cells for 4 columns/)
    const short = parseWorkspaceTables(table('| web | apps/web | `pnpm test` |'))
    assert.deepEqual(short.workspaces.map((w) => [w.test, w.build]), [['pnpm test', '']])
    assert.equal(short.problems.filter((p) => /cells for/.test(p)).length, 0)
})

test('an AGENTS.md that already has an SDLC block is refused instead of losing the project prose', () => {
    const fx = fixture({ 'AGENTS.md': '<!-- BEGIN SDLC -->\nSee .ai/project.md\n<!-- END SDLC -->\n' })
    try {
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /already has an SDLC block/)
        assert.equal(existsSync(join(fx.root, '.ai', 'project.md')), true)
    } finally {
        fx.cleanup()
    }
})

test('a phase field holding a newline is written so the config reads back as written', () => {
    const fx = pluginInit030Repo()
    try {
        const machine = read(fx.root, 'specs/sdlc-state-machine.yaml').replace(
            /^phases:\n/m,
            'phases:\n    - id: roadmap-sync\n      entry_triggers: [sync the roadmap]\n      preconditions: [a roadmap]\n      owner_skill: roadmap-sync\n      exit_condition: "roadmap synced\\nand posted"\n      next_phase: none\n      next_trigger: none\n'
        )
        write(fx.root, 'specs/sdlc-state-machine.yaml', machine)
        git(fx.root, 'commit', '-qam', 'extension phase')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 0, res.stderr)
        const config = parseYaml(read(fx.root, '.sdlc/config.yaml'))
        assert.equal(config.extensions.phases[0].exit_condition, 'roadmap synced\nand posted')
    } finally {
        fx.cleanup()
    }
})

test('files git does not track are refused before anything moves, so a failed apply cannot lose them', () => {
    for (const [rel, body, ignore, reason] of [
        ['scripts/sdlc/my-wip-gate.mjs', '// wip\n', null, /untracked or ignored files sit in a directory the migration moves/],
        ['.ai/sdlc/cache/x.json', '{}\n', 'cache/', /untracked or ignored files sit in a directory the migration moves/],
        ['CLAUDE.md', '# mine\n', null, /CLAUDE\.md exists but is not committed/],
        ['.prettierignore', 'dist/\n', null, /\.prettierignore exists but is not committed/],
    ]) {
        const fx = fixture()
        try {
            if (ignore) write(fx.root, '.git/info/exclude', `${ignore}\n`)
            write(fx.root, rel, body)
            const res = migrate(fx.root, '--apply')
            assert.equal(res.status, 1, rel)
            assert.match(res.stderr, reason)
            assert.equal(read(fx.root, rel), body, `${rel} is untouched`)
            assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
        } finally {
            fx.cleanup()
        }
    }
})

test('a root file the repo ignores is refused, since the migration could not commit it', () => {
    const fx = fixture({ '.gitignore': 'CLAUDE.md\n' })
    try {
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /CLAUDE\.md is gitignored/)
    } finally {
        fx.cleanup()
    }
})

test('a failed apply from a detached HEAD rolls back to that commit', () => {
    const fx = fixture()
    try {
        const head = git(fx.root, 'rev-parse', 'HEAD').trim()
        git(fx.root, 'switch', '-q', '--detach', 'HEAD')
        write(fx.root, '.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n')
        chmodSync(join(fx.root, '.git/hooks/pre-commit'), 0o755)
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /rolled back, so the repo is as it was/)
        assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'HEAD')
        assert.equal(git(fx.root, 'rev-parse', 'HEAD').trim(), head)
        assert.equal(git(fx.root, 'branch', '--list', 'chore/sdlc-layout-v2').trim(), '')
    } finally {
        fx.cleanup()
    }
})

test('a config that is staged but not in HEAD is not a finished migration', () => {
    const fx = fixture()
    try {
        write(fx.root, '.sdlc/config.yaml', 'layout: 2\n')
        git(fx.root, 'add', '.sdlc/config.yaml')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /not committed/)
    } finally {
        fx.cleanup()
    }
})

test('a move destination that already exists is refused', () => {
    const fx = fixture({ '.ai/sdlc.md': '# process\n', 'docs/keep.md': 'x\n' })
    try {
        const res = migrate(fx.root, '--dry-run')
        assert.equal(res.status, 0, res.stderr)
        const dest = res.stdout.match(/\.ai\/sdlc\.md -> (\S+)/)?.[1]
        assert.ok(dest, res.stdout)
        write(fx.root, dest, 'already here\n')
        git(fx.root, 'add', '-A')
        git(fx.root, 'commit', '-q', '-m', 'dest exists')
        const apply = migrate(fx.root, '--apply')
        assert.equal(apply.status, 1)
        assert.match(apply.stderr, new RegExp(`\\.ai/sdlc\\.md cannot move: ${dest.replace(/[.]/g, '\\.')} already exists|\\.sdlc/ already exists`))
    } finally {
        fx.cleanup()
    }
})

test('a symlink out of the repo inside a moved path is refused', () => {
    const fx = fixture()
    const outside = mkdtempSync(join(tmpdir(), 'sdlc-out-'))
    try {
        symlinkSync(outside, join(fx.root, '.ai', 'sdlc', 'agents'))
        git(fx.root, 'add', '-A')
        git(fx.root, 'commit', '-q', '-m', 'link out')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /\.ai\/sdlc\/agents is a symlink out of the repo/)
        assert.deepEqual(readdirSync(outside), [])
    } finally {
        fx.cleanup()
        rmSync(outside, { recursive: true, force: true })
    }
})

test('a phase field holding a control character stops the migration before anything is written', () => {
    const fx = pluginInit030Repo()
    try {
        const machine = read(fx.root, 'specs/sdlc-state-machine.yaml').replace(
            /^phases:\n/m,
            'phases:\n    - id: roadmap-sync\n      entry_triggers: [sync]\n      preconditions: [a roadmap]\n      owner_skill: roadmap-sync\n      exit_condition: "bell\u0007here"\n      next_phase: none\n      next_trigger: none\n'
        )
        write(fx.root, 'specs/sdlc-state-machine.yaml', machine)
        git(fx.root, 'commit', '-qam', 'control character')
        const res = migrate(fx.root, '--apply')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /the config cannot be written: cannot write a control character/)
        assert.equal(existsSync(join(fx.root, '.sdlc')), false)
    } finally {
        fx.cleanup()
    }
})

test("a sentence-final bare directory is rewritten, and a longer name is not", () => {
    const fx = fixture({ 'docs/notes.md': 'The validators live in scripts/sdlc. See scripts/sdlcx too.\n' })
    try {
        assert.equal(migrate(fx.root, '--apply').status, 0)
        assert.equal(read(fx.root, 'docs/notes.md'), 'The validators live in .sdlc/scripts. See scripts/sdlcx too.\n')
    } finally {
        fx.cleanup()
    }
})
