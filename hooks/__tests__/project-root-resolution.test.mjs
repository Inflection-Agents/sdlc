#!/usr/bin/env node
// Project-root resolution for the three hooks that must find the repo they inspect.
//
// Today those hooks ship INSIDE that repo at `.claude/hooks/`, so walking up two
// levels from the hook file happens to land on the repo root. Shipped inside a
// plugin the same walk lands on the plugin
// (`<cache>/<marketplace>/<plugin>/<version>/hooks/` → `<cache>/<marketplace>/<plugin>`),
// where there is no registry, no state machine and no `.claude/`. Every one of these
// hooks fails open, so the wrong root is a silent no-op rather than an error — the
// failure mode that stays green.
//
// Each test drives the REAL hook binary from a FAKE PLUGIN location with
// CLAUDE_PROJECT_DIR deleted from the env and the payload's `cwd` pointing at a
// separate fake repo, then asserts the hook produced its repo-dependent effect.
// Empty stdout, or a file that never appears, is the failure signal.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/**
 * Walk up to the repo root by MARKER, not by counting levels.
 *
 * These tests live at `hooks/__tests__/` now and lived at `.claude/hooks/__tests__/`
 * before, and `import.meta.url` is realpath'd by Node, so a fixed number of `..`
 * silently resolves to the wrong directory the moment the tree moves. That is the
 * same defect the hooks themselves carried before the project-root fix.
 */
function repoRoot(from) {
    let dir = from
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(dir, 'specs')) && existsSync(join(dir, 'scripts'))) return dir
        const up = dirname(dir)
        if (up === dir) break
        dir = up
    }
    return from
}

const REPO = repoRoot(HERE)
const HOOKS = join(REPO, '.claude', 'hooks')

// A real path in this repo that the shipped registry registers SDLC-GATE-TESTED
// against — the same anchor edit-write-constraint-injection.test.mjs uses.
const MATCHED_PATH = 'scripts/sdlc/resolve.mjs'

/** Env with every root-resolution and mode override stripped, so only the payload steers. */
function bareEnv(extra = {}) {
    const env = { ...process.env, ...extra }
    delete env.CLAUDE_PROJECT_DIR
    if (!('SDLC_GUARD_MODE' in extra)) delete env.SDLC_GUARD_MODE
    if (!('SDLC_EDIT_GATE_BRANCH' in extra)) delete env.SDLC_EDIT_GATE_BRANCH
    return env
}

/**
 * A consuming repo: `.claude/`, the shipped constraint registry, and the routing
 * module the write-time hook imports (plus its own local dependency). Nothing here
 * is shared with the plugin tree — that separation is the whole point.
 */
function makeFakeRepo() {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-consumer-'))
    mkdirSync(join(root, '.claude'), { recursive: true })
    mkdirSync(join(root, '.ai', 'sdlc'), { recursive: true })
    mkdirSync(join(root, 'scripts', 'sdlc'), { recursive: true })
    copyFileSync(join(REPO, '.ai', 'sdlc', 'review-constraints.yaml'), join(root, '.ai', 'sdlc', 'review-constraints.yaml'))
    for (const mod of ['reviewer-routing.mjs', 'check-review-constraint-globs.mjs']) {
        copyFileSync(join(REPO, 'scripts', 'sdlc', mod), join(root, 'scripts', 'sdlc', mod))
    }
    writeFileSync(join(root, 'scripts', 'sdlc', 'resolve.mjs'), '// fixture\n', 'utf8')
    return root
}

/**
 * A hook installed the way a plugin installs it. The nesting mirrors the real cache
 * layout so the two-levels-up walk lands where it really would: on the plugin
 * directory, which has no `.claude/`.
 */
function makeFakePlugin(hookName) {
    const cache = mkdtempSync(join(tmpdir(), 'sdlc-plugincache-'))
    const hooksDir = join(cache, 'marketplace', 'sdlc-framework', '9f1c3a2b', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const hookPath = join(hooksDir, hookName)
    copyFileSync(join(HOOKS, hookName), hookPath)
    return { cache, hookPath }
}

function runHook(hookPath, payload, env) {
    const res = spawnSync('node', [hookPath], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env
    })
    assert.equal(res.status, 0, `hook must always exit 0 (got ${res.status}): ${res.stderr}`)
    return (res.stdout || '').trim()
}

/** mkdtemp roots are cleaned even when the assertion throws. */
function cleanup(...dirs) {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

test('plugin layout: the write gate resolves the consuming repo, not the plugin', () => {
    const repo = makeFakeRepo()
    const { cache, hookPath } = makeFakePlugin('pre-tool-use-edit-write.mjs')
    try {
        const out = runHook(
            hookPath,
            {
                tool_name: 'Edit',
                tool_input: { file_path: join(repo, MATCHED_PATH) },
                session_id: 'root-resolution',
                cwd: repo
            },
            // The branch seam supplies the active-task context the gate needs to
            // reach its allow-with-guidance path without a git checkout.
            bareEnv({ SDLC_EDIT_GATE_BRANCH: 'claude/SPEC-099-TASK-001' })
        )
        assert.notEqual(out, '', 'a hook that resolved the plugin dir finds no registry and emits nothing')
        const parsed = JSON.parse(out)
        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow')
        assert.match(parsed.hookSpecificOutput.additionalContext, /SDLC-GATE-TESTED/)
    } finally {
        cleanup(repo, cache)
    }
})

test('cwd beats the hook’s own location when both look like a repo', () => {
    // The ordering assertion, stated directly and without a plugin fixture: run the
    // in-repo hook (whose own location IS a valid repo) against a DIFFERENT repo.
    // Resolving its own location makes the target fall outside the root, and the
    // hook then allows silently — indistinguishable from "no constraints matched".
    const repo = makeFakeRepo()
    try {
        const out = runHook(
            join(HOOKS, 'pre-tool-use-edit-write.mjs'),
            {
                tool_name: 'Edit',
                tool_input: { file_path: join(repo, MATCHED_PATH) },
                session_id: 'root-ordering',
                cwd: repo
            },
            bareEnv({ SDLC_EDIT_GATE_BRANCH: 'claude/SPEC-099-TASK-001' })
        )
        assert.notEqual(out, '', 'the hook resolved its own repo instead of the cwd repo')
        assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /SDLC-GATE-TESTED/)
    } finally {
        cleanup(repo)
    }
})

test('plugin layout: the stop hook reads the consuming repo’s goal state', () => {
    const repo = makeFakeRepo()
    const { cache, hookPath } = makeFakePlugin('stop-handoff.mjs')
    try {
        writeFileSync(
            join(repo, '.claude', '.sdlc-goal-s1'),
            JSON.stringify({
                version: 1,
                spec: 'SPEC-099',
                statement: 'deliver SPEC-099 end to end',
                exit_criteria: ['every task merged'],
                status: 'active',
                armed_at: new Date().toISOString()
            }),
            'utf8'
        )
        const out = runHook(hookPath, { session_id: 's1', hook_event_name: 'Stop', cwd: repo }, bareEnv())
        assert.notEqual(out, '', 'a hook that resolved the plugin dir finds no goal file and lets the stop through')
        const parsed = JSON.parse(out)
        assert.equal(parsed.decision, 'block')
        assert.match(parsed.reason, /every task merged/)
    } finally {
        cleanup(repo, cache)
    }
})

test('plugin layout: the prompt hook writes the override into the consuming repo', () => {
    const repo = makeFakeRepo()
    const { cache, hookPath } = makeFakePlugin('user-prompt-submit.mjs')
    try {
        runHook(
            hookPath,
            { session_id: 's2', prompt: 'out-of-process: verifying root resolution', cwd: repo },
            bareEnv()
        )
        assert.ok(
            existsSync(join(repo, '.claude', '.sdlc-override-s2')),
            'the override landed outside the consuming repo, so the write gate will never see it'
        )
    } finally {
        cleanup(repo, cache)
    }
})
