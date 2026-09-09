// The write-time hook hands the AUTHOR the constraints registered against the path
// being edited, so a law is read before the code is written rather than cited in a
// fix round afterwards. Advisory: it never blocks and never alters the edit.
//
// These tests drive the real hook binary over stdin, because the failure mode that
// matters is the whole path — payload in, JSON on stdout — and a unit test of the
// matcher alone cannot see a broken import or a swallowed exception.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadConstraints, applicableConstraints } from '../../../scripts/sdlc/reviewer-routing.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const HOOK = join(ROOT, '.claude', 'hooks', 'pre-tool-use-edit-write.mjs')

/** Run the hook with a payload; returns trimmed stdout. Never throws on exit 0. */
function run(payload, env = {}) {
    return execFileSync('node', [HOOK], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env }
    }).trim()
}

const edit = (path, sessionId = 'injection-test') => ({
    tool_name: 'Edit',
    tool_input: { file_path: join(ROOT, path) },
    session_id: sessionId,
    cwd: ROOT
})

// A path the SHIPPED registry actually registers a constraint against. If the
// registry's illustrative rows are ever replaced, this is the line to update.
const MATCHED_PATH = 'packages/shared/src/core/example.ts'

test('CANARY: the shipped registry and the matcher agree on a real path', () => {
    // The whole feature is advisory and swallows its own errors, so a moved module,
    // a renamed key, or a reader that stops populating `when.touches` would disable
    // it permanently with no signal. This asserts the join actually produces a hit.
    const hits = applicableConstraints(loadConstraints(), MATCHED_PATH)
    assert.ok(hits.length > 0, 'the shipped registry must match a known path - injection is wired wrong if not')
    assert.ok(hits[0].id, 'a matched constraint must carry its id')
    assert.ok(hits[0].check, 'a matched constraint must carry its check prose, or the guidance is empty')
    assert.ok(hits[0].cite, 'a matched constraint must carry its cite, or a reviewer cannot ground the finding')
})

test('an override-bypassed edit gets the registered laws as additionalContext', () => {
    // The override hatch is the reachable allow path for implementation code on a
    // branch with no active task, which is what CI runs on.
    const sessionId = `injection-${process.pid}`
    const overrideFile = join(ROOT, '.claude', `.sdlc-override-${sessionId}`)
    writeFileSync(overrideFile, 'testing constraint injection')
    try {
        const out = run(edit(MATCHED_PATH, sessionId))
        assert.notEqual(out, '', 'expected injected guidance on the override allow path')
        const parsed = JSON.parse(out)
        assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse')
        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow')
        assert.match(parsed.hookSpecificOutput.additionalContext, /cite:/)
        assert.match(parsed.hookSpecificOutput.additionalContext, /INV-CORE-PURITY/)
    } finally {
        rmSync(overrideFile, { force: true })
        rmSync(join(ROOT, '.claude', '.sdlc-override-log'), { force: true })
    }
})

test('a path with no registered constraint injects nothing', () => {
    assert.equal(run(edit('README.md')), '')
})

test('SDLC_GUARD_MODE=off emits nothing at all', () => {
    // The kill-switch contract is no I/O, so it disables injection too.
    assert.equal(run(edit(MATCHED_PATH), { SDLC_GUARD_MODE: 'off' }), '')
})

test('a malformed payload exits 0 and emits nothing', () => {
    const out = execFileSync('node', [HOOK], {
        input: 'not json',
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT }
    })
    assert.equal(out.trim(), '')
})

test('an unreadable registry degrades to silence rather than breaking the edit', () => {
    // A hook that breaks edits when its optional input is malformed is worse than no
    // hook, so the guidance path must swallow its own failures.
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-badreg-'))
    try {
        mkdirSync(join(dir, 'scripts', 'sdlc'), { recursive: true })
        writeFileSync(join(dir, 'scripts', 'sdlc', 'reviewer-routing.mjs'), 'this is not valid javascript {{{')
        const out = execFileSync('node', [HOOK], {
            input: JSON.stringify({
                tool_name: 'Edit',
                tool_input: { file_path: join(dir, 'README.md') },
                session_id: 'bad-registry',
                cwd: dir
            }),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            env: { ...process.env, CLAUDE_PROJECT_DIR: dir }
        })
        assert.equal(out.trim(), '')
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})
