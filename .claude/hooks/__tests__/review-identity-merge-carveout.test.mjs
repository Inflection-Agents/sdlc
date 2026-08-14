#!/usr/bin/env node
// Tests for the ADR-003 task-merge carve-out in the author≠reviewer gate.
//
// This is the only logic in the framework that can PERMIT a self-merge, so it is the
// last place that should ship untested. ADR-003 §4 makes merging one's own task PR
// into `feat/spec-NNN` mandatory delivery work; merging the integration PR into
// `main` stays the human's, always. The gate has to tell those apart, and every way
// of failing to tell them apart must fall through to DENY.
//
// The hook shells out to `gh`, so each test puts a stub `gh` on PATH that answers
// `gh pr view --json baseRefName` from a fixture. Identities are injected through the
// hook's documented env seams so nothing touches the network or the real repo.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, '..', 'pre-tool-use-review-identity.mjs')

const ALLOW = 0
const DENY = 2

/**
 * Run the hook in enforce mode against `command`, with a stub `gh` that reports
 * `base` for every `pr view`. Author and reviewer are the SAME identity, so the gate
 * denies unless the carve-out exempts the command.
 */
function runGate(command, { base = 'main' } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-gate-'))
    try {
        const stub = join(dir, 'gh')
        writeFileSync(
            stub,
            `#!/bin/sh
for a in "$@"; do
  case "$a" in
    baseRefName) echo '{"baseRefName":"${base}"}'; exit 0 ;;
    author,headRefOid) echo '{"author":{"login":"same-actor"},"headRefOid":""}'; exit 0 ;;
  esac
done
echo 'same-actor'
`,
            'utf8'
        )
        chmodSync(stub, 0o755)
        const res = spawnSync('node', [HOOK], {
            input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${dir}:${process.env.PATH}`,
                SDLC_GUARD_MODE: 'enforce',
                SDLC_REVIEW_GATE_AUTHOR_LOGIN: 'same-actor',
                SDLC_REVIEW_GATE_REVIEWER_LOGIN: 'same-actor'
            }
        })
        return res.status
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
}

test('a task PR merging into the integration branch is exempt', () => {
    assert.equal(runGate('gh pr merge 7 --squash --delete-branch', { base: 'feat/spec-006' }), ALLOW)
    assert.equal(runGate('gh pr merge 7 --squash', { base: 'feat/spec-1' }), ALLOW)
})

test('merging into main is still denied — that merge is the human\'s', () => {
    assert.equal(runGate('gh pr merge 7 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash', { base: 'master' }), DENY)
})

test('a base that merely resembles an integration branch is denied', () => {
    for (const base of ['notfeat/spec-1', 'feature/spec-1', 'feat/specimen', 'release/feat/spec-1', '']) {
        assert.equal(runGate('gh pr merge 7 --squash', { base }), DENY, `base "${base}" must not be exempt`)
    }
})

test('an unresolvable PR selector is denied, not resolved off the current branch', () => {
    // `gh pr merge <branch>` and `gh pr merge "$PR"` are valid gh, but the base lookup
    // would silently answer for whatever PR the CURRENT branch has.
    assert.equal(runGate('gh pr merge my-integration-branch --squash', { base: 'feat/spec-006' }), DENY)
    assert.equal(runGate('gh pr merge "$PR" --squash', { base: 'feat/spec-006' }), DENY)
})

test('a chained command cannot borrow one PR\'s base to exempt another action', () => {
    // Both halves resolve through the same stub, so if chaining were allowed these
    // would pass on PR 100's task base while actually merging/approving something else.
    assert.equal(runGate('gh pr merge 100 --squash && gh pr merge 7 --squash', { base: 'feat/spec-006' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash; gh pr merge 8 --squash', { base: 'feat/spec-006' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash && gh pr review 8 --approve', { base: 'feat/spec-006' }), DENY)
    assert.equal(runGate('gh pr merge $(echo 7) --squash', { base: 'feat/spec-006' }), DENY)
})

test('the carve-out is merge-only — approving your own PR is never exempt', () => {
    assert.equal(runGate('gh pr review 7 --approve', { base: 'feat/spec-006' }), DENY)
    assert.equal(runGate('gh pr comment 7 --body "accept"', { base: 'feat/spec-006' }), DENY)
})

test('the base test seam is inert unless the identity seams are injected too', () => {
    // Without SDLC_REVIEW_GATE_AUTHOR_LOGIN the injected base must be ignored, so an
    // exported SDLC_REVIEW_GATE_BASE cannot become a blanket production bypass.
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-gate-'))
    try {
        const stub = join(dir, 'gh')
        writeFileSync(stub, '#!/bin/sh\necho \'{"baseRefName":"main","author":{"login":"a"}}\'\n', 'utf8')
        chmodSync(stub, 0o755)
        const res = spawnSync('node', [HOOK], {
            input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'gh pr merge 7 --squash' } }),
            encoding: 'utf8',
            env: {
                ...process.env,
                PATH: `${dir}:${process.env.PATH}`,
                SDLC_GUARD_MODE: 'enforce',
                SDLC_REVIEW_GATE_BASE: 'feat/spec-hijack'
            }
        })
        // Identities are unresolvable here, so the gate fails open (exit 0) — the point
        // is that it did NOT take the injected base as an exemption path.
        assert.equal(res.status, ALLOW)
        assert.doesNotMatch(res.stderr || '', /exempt/i)
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})

test('non-verdict commands are untouched', () => {
    assert.equal(runGate('gh pr list', { base: 'main' }), ALLOW)
    assert.equal(runGate('git status', { base: 'main' }), ALLOW)
    assert.equal(runGate('gh pr review 7 --request-changes', { base: 'main' }), ALLOW)
})
