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

/**
 * A stub `gh` that answers a DIFFERENT base depending on WHICH PR number it was
 * asked about — needed to prove the hook resolves the base of the PR actually
 * being merged, not of some other PR-shaped token found elsewhere in the command.
 */
function runGateWithDistinctBases(command, basesByPr) {
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-gate-'))
    try {
        const stub = join(dir, 'gh')
        const cases = Object.entries(basesByPr)
            .map(([n, base]) => `  ${n}) echo '{"baseRefName":"${base}"}'; exit 0 ;;`)
            .join('\n')
        writeFileSync(
            stub,
            `#!/bin/sh
for a in "$@"; do
  case "$a" in
${cases}
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

test('a PR URL embedded in a flag value cannot steer resolution to a DIFFERENT PR (round-3 bypass)', () => {
    // PR 42 (the one actually being merged) targets `main`; PR 7 (mentioned only
    // inside a flag value) targets a task branch. Before the fix, extractPrNumber
    // scanned the whole command for a PR-shaped URL and found "7" here, so the gate
    // resolved PR 7's base — a task branch — and exempted a merge of PR 42 into
    // `main`. It must now resolve PR 42, the PR gh will actually merge.
    const bases = { 42: 'main', 7: 'feat/spec-1' }
    assert.equal(
        runGateWithDistinctBases('gh pr merge 42 --squash -t "closes https://github.com/o/r/pull/7"', bases),
        DENY,
        'must resolve PR 42 (the one merged), not PR 7 (mentioned only in a flag value)'
    )
    assert.equal(
        runGateWithDistinctBases('gh pr merge 42 --squash -b "see https://github.com/o/r/pull/7 for context"', bases),
        DENY
    )
    // The reverse must still work: a genuine, correctly-targeted merge is exempt.
    assert.equal(runGateWithDistinctBases('gh pr merge 7 --squash', bases), ALLOW)
})

test('a bare PR URL as the selector itself is still resolvable (not a regression)', () => {
    const bases = { 7: 'feat/spec-1' }
    assert.equal(
        runGateWithDistinctBases('gh pr merge https://github.com/o/r/pull/7 --squash', bases),
        ALLOW,
        'a URL that IS the selector (first positional token) must still resolve'
    )
})

test('a cross-repo command (-R/--repo) does not get the carve-out', () => {
    // The base lookup never queries the flagged repo, so honoring -R/--repo here
    // would either resolve the wrong repo's PR or silently trust an unrelated
    // answer. The carve-out simply does not apply; it falls through to deny.
    assert.equal(runGate('gh pr merge 7 --squash -R owner/other-repo', { base: 'feat/spec-1' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash --repo owner/other-repo', { base: 'feat/spec-1' }), DENY)
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

test('a global flag between gh and pr does not skip classification (round-3 second bypass)', () => {
    // `gh` and `pr <verb>` need not be adjacent — `--repo`/`-R` are valid GLOBAL
    // flags that sit before the subcommand. Requiring adjacency let these skip the
    // gate ENTIRELY, not just the carve-out: an unrestricted self-merge to `main`.
    assert.equal(runGate('gh --repo owner/repo pr merge 7 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('gh -Rowner/repo pr review 7 --approve', { base: 'main' }), DENY)
    assert.equal(runGate('gh -R owner/repo pr merge 7 --squash', { base: 'main' }), DENY)
    // ...and a legitimate task merge with a global flag still resolves correctly
    // once it's classified at all — the cross-repo flag itself still denies the
    // carve-out (this is a cross-repo command), so it falls through to DENY too.
    assert.equal(runGate('gh --repo owner/repo pr merge 7 --squash', { base: 'feat/spec-1' }), DENY)
})

test('the attached short-flag form -Rowner/repo is denied the carve-out (round-3 third bypass)', () => {
    // gh accepts `-R` with its value attached, no space — POSIX short-flag
    // shorthand. A regex that only matched the separated/`=` forms missed this.
    assert.equal(runGate('gh pr merge 7 --squash -Rowner/repo', { base: 'feat/spec-1' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash --repo=owner/repo', { base: 'feat/spec-1' }), DENY)
})
