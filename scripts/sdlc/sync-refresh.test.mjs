// Tests for the layout-2 refresh /sdlc-sync runs after a plugin update (SPEC-009 AC-016, SC-3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyRefresh, gitignoreToAdd, planRefresh } from './sync-refresh.mjs'
import { installPayload } from './install-payload.mjs'
import { loadManifest, roleOf, sha256 } from './gen-released-payloads.mjs'
import { commitAll, frameworkFileAt, git, layout2Repo } from './__fixtures__/layouts/build.mjs'

delete process.env.CLAUDE_PROJECT_DIR

const PAYLOAD = fileURLToPath(new URL('../../init-payload/', import.meta.url))

/** The released manifest plus today's payload, as the manifest reads once this payload ships. */
function manifestWithCurrentPayload() {
    const m = structuredClone(loadManifest())
    const walk = (dir) =>
        readdirSync(join(PAYLOAD, dir), { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]
        )
    for (const rel of [...walk('.sdlc'), ...walk('.github/workflows')]) {
        const role = roleOf(`init-payload/${rel}`)
        if (!role) continue
        m.roles[role] ??= {}
        m.roles[role][sha256(readFileSync(join(PAYLOAD, rel)))] ??= 'current'
    }
    return m
}

const ROUTING = 'domain_routing:\n  web: [web-patterns]\n'
const EXTENSIONS = 'extensions:\n  phases:\n    - id: roadmap-sync\n      owner_skill: roadmap-sync\n  exempt: [local-only]\n'

test('AC-016 and SC-3: the refresh replaces framework files by rule and leaves the adopter config byte-identical', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sdlc-refresh-'))
    const update = mkdtempSync(join(tmpdir(), 'sdlc-update-'))
    try {
        git(repo, 'init', '-q', '-b', 'main')
        installPayload(repo)
        const cfgFile = join(repo, '.sdlc/config.yaml')
        const cfg = readFileSync(cfgFile, 'utf8')
            .replace('domain_routing: {}\n', ROUTING)
            .replace(/extensions:\n {2}phases: \[\]\n {2}exempt: \[\]\n/, EXTENSIONS)
        writeFileSync(cfgFile, cfg)
        writeFileSync(join(repo, '.sdlc/scripts/plan-gate.mjs'), `${readFileSync(join(repo, '.sdlc/scripts/plan-gate.mjs'), 'utf8')}// local fix\n`)
        writeFileSync(join(repo, '.sdlc/templates/completion-report.md'), frameworkFileAt('89cba06', 'init-payload/templates/completion-report.md'))
        commitAll(repo, 'adopter state')

        // The plugin update: a changed phase in the machine and a changed validator.
        cpSync(PAYLOAD, update, { recursive: true })
        const machine = join(update, '.sdlc/state-machine.yaml')
        writeFileSync(machine, readFileSync(machine, 'utf8').replace("next_trigger: 'spec out intent #N'", "next_trigger: 'spec out intent number N'"))
        writeFileSync(join(update, '.sdlc/scripts/resolve.mjs'), `${readFileSync(join(update, '.sdlc/scripts/resolve.mjs'), 'utf8')}// next release\n`)

        const plan = planRefresh(repo, { payload: update, manifest: manifestWithCurrentPayload() })
        const status = (f) => plan.find((p) => p.file === f)?.status
        assert.equal(status('.sdlc/state-machine.yaml'), 'replace')
        assert.equal(status('.sdlc/scripts/resolve.mjs'), 'replace', 'an unedited copy of a shipped version is replaced')
        assert.equal(status('.sdlc/templates/completion-report.md'), 'replace', 'the 0.3.0 template is a released version')
        assert.equal(status('.sdlc/scripts/plan-gate.mjs'), 'modified')
        assert.equal(status('.sdlc/scripts/validate-guide.mjs'), 'current')

        const kept = applyRefresh(repo, plan, { payload: update, version: '9.9.9' })
        assert.deepEqual(kept, ['.sdlc/scripts/plan-gate.mjs'], 'a modified file is kept until the owner accepts it')
        assert.match(readFileSync(join(repo, '.sdlc/scripts/plan-gate.mjs'), 'utf8'), /\/\/ local fix/)
        assert.match(readFileSync(join(repo, '.sdlc/state-machine.yaml'), 'utf8'), /spec out intent number N/)
        assert.match(readFileSync(join(repo, '.sdlc/scripts/resolve.mjs'), 'utf8'), /\/\/ next release/)

        const after = readFileSync(cfgFile, 'utf8')
        assert.equal(after, cfg.replace(/^framework_version:.*$/m, 'framework_version: 9.9.9'), 'only framework_version changed')
        assert.ok(after.includes(ROUTING) && after.includes(EXTENSIONS))

        applyRefresh(repo, planRefresh(repo, { payload: update, manifest: manifestWithCurrentPayload() }), {
            payload: update,
            accept: ['.sdlc/scripts/plan-gate.mjs'],
            version: '9.9.9',
        })
        assert.doesNotMatch(readFileSync(join(repo, '.sdlc/scripts/plan-gate.mjs'), 'utf8'), /\/\/ local fix/, '--accept replaces it')
    } finally {
        rmSync(repo, { recursive: true, force: true })
        rmSync(update, { recursive: true, force: true })
    }
})

test('a layout-1 repo is refused, with the migration named', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sdlc-refresh-l1-'))
    try {
        writeFileSync(join(repo, 'x'), '')
        cpSync(join(PAYLOAD, '.sdlc/state-machine.yaml'), join(repo, 'specs/sdlc-state-machine.yaml'), { recursive: true })
        cpSync(join(PAYLOAD, '.sdlc/scripts/resolve.mjs'), join(repo, 'scripts/sdlc/resolve.mjs'), { recursive: true })
        assert.throws(() => planRefresh(repo), /not on layout 2; run migrate-layout\.mjs/)
    } finally {
        rmSync(repo, { recursive: true, force: true })
    }
})

test('a workflow the repo deleted is not added back', () => {
    const fx = layout2Repo({ config: 'layout: 2\nframework_version: 0.4.0\n' })
    try {
        commitAll(fx.root)
        const plan = planRefresh(fx.root)
        assert.equal(plan.some((p) => p.file.startsWith('.github/workflows/')), false)
        assert.ok(plan.some((p) => p.file === '.sdlc/state-machine.yaml'))
    } finally {
        fx.cleanup()
    }
})

test('AC-013: --apply on a layout-2 repo adds the .claude/worktrees/ ignore line, once', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sdlc-refresh-gi-'))
    try {
        git(repo, 'init', '-q', '-b', 'main')
        installPayload(repo)
        // A repo set up before SPEC-011: its .gitignore has the hooks' lines and not the worktree one.
        writeFileSync(join(repo, '.gitignore'), 'dist/\n.claude/.sdlc-*\n!.claude/.sdlc-override-log\n')
        commitAll(repo, 'pre-SPEC-011 adopter')
        const plan = planRefresh(repo, { manifest: manifestWithCurrentPayload() })
        applyRefresh(repo, plan, { version: null })
        const once = readFileSync(join(repo, '.gitignore'), 'utf8')
        assert.equal(once, 'dist/\n.claude/.sdlc-*\n!.claude/.sdlc-override-log\n.claude/worktrees/\n')
        applyRefresh(repo, planRefresh(repo, { manifest: manifestWithCurrentPayload() }), { version: null })
        assert.equal(readFileSync(join(repo, '.gitignore'), 'utf8'), once, 'a second sync writes nothing')
        writeFileSync(join(repo, '.gitignore'), 'dist/\n')
        assert.deepEqual(gitignoreToAdd(repo), ['.claude/.sdlc-*', '!.claude/.sdlc-override-log', '.claude/worktrees/'], '--plan names every line --apply will add')
    } finally {
        rmSync(repo, { recursive: true, force: true })
    }
})

test('--plan prints the .gitignore lines --apply will add', () => {
    const repo = mkdtempSync(join(tmpdir(), 'sdlc-refresh-plan-'))
    try {
        git(repo, 'init', '-q', '-b', 'main')
        installPayload(repo)
        writeFileSync(join(repo, '.gitignore'), 'dist/\n')
        commitAll(repo, 'pre-SPEC-011 adopter')
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        const res = spawnSync(process.execPath, [fileURLToPath(new URL('./sync-refresh.mjs', import.meta.url)), '--root', repo, '--plan'], { encoding: 'utf8', env })
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stdout, /\.gitignore lines to add \(3\):\n {2}\.claude\/\.sdlc-\*\n {2}!\.claude\/\.sdlc-override-log\n {2}\.claude\/worktrees\//)
    } finally {
        rmSync(repo, { recursive: true, force: true })
    }
})
