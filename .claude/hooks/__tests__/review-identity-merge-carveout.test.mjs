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

test('a PR-shaped substring hidden inside ANY quoted value never counts as the real command (tokenizer)', () => {
    // Regex-on-the-raw-string scanning treated a quoted commit message or flag
    // value as fair game for finding "gh"/"pr"/a number. A real tokenizer makes a
    // quoted span ONE token, so text inside it can never masquerade as the verb,
    // the selector, or a second gh-pr action.
    assert.equal(
        runGate('gh pr merge 42 -m "unrelated note: gh pr merge 999 --squash"', { base: 'main' }),
        DENY,
        'quoted text mentioning a second merge must not be treated as a real second action'
    )
    assert.equal(
        runGate("gh pr merge 42 -m 'pull/7 mentioned here, not a real selector'", { base: 'main' }),
        DENY
    )
})

test('a command with no REAL gh pr action, only a quoted mention of one, is untouched (not a verdict at all)', () => {
    // `git commit -m "gh pr merge 999 --squash"` is a git commit whose message
    // happens to contain that text — there is no gh invocation here whatsoever,
    // so this is correctly a no-op (ALLOW), not a denied verdict. The tokenizer's
    // job is to stop a QUOTED mention from being treated as a real second action
    // inside an ACTUAL gh command (covered above), not to flag unrelated commands
    // that merely reference gh syntax in a string.
    assert.equal(runGate('git commit -m "gh pr merge 999 --squash" && true', { base: 'main' }), ALLOW)
})

test('a genuine PR number is still found through quoted flag values elsewhere in the command', () => {
    assert.equal(runGate('gh pr merge 7 -m "release notes" --squash', { base: 'feat/spec-1' }), ALLOW)
    assert.equal(runGate("gh pr merge 7 -m 'multi word body here' --squash", { base: 'feat/spec-1' }), ALLOW)
})

test('a path-qualified or backslash-escaped gh spelling is still recognized (round-4 bypass)', () => {
    // All four are ordinary, working invocations of the SAME gh binary. Exact
    // string equality with "gh" missed every one of them — the whole gate no-op'd,
    // not just the carve-out.
    assert.equal(runGate('/usr/bin/gh pr merge 42 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('\\gh pr merge 42 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('g\\h pr merge 42 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('gh p\\r merge 42 --squash', { base: 'main' }), DENY)
    // ...and still resolves a legitimate task merge correctly through these forms.
    assert.equal(runGate('/usr/bin/gh pr merge 7 --squash', { base: 'feat/spec-1' }), ALLOW)
})

test('a command wrapped in an interpreter is OUT OF SCOPE by design (round-5 scope decision)', () => {
    // An earlier version of this hook tried to recurse into a quoted span when a
    // code-execution wrapper (bash -c / eval) was present. Round 5 review found
    // that unsound in BOTH directions: the wrapper allowlist could never be
    // complete (awk/csh/tclsh/bun/fish/env -S all still hid the call), AND it
    // false-denied unrelated commands that merely named a wrapper while quoting
    // text that happened to mention "gh pr merge". The hook now deliberately does
    // NOT try to see through this class of obfuscation — see the file header.
    // These correctly ALLOW: not a bypass, a stated scope boundary.
    assert.equal(runGate('eval "gh pr merge 42 --squash"', { base: 'main' }), ALLOW)
    assert.equal(runGate('bash -c "gh pr merge 42 --squash"', { base: 'main' }), ALLOW)
    assert.equal(runGate('sh -c "gh pr merge 42 --squash"', { base: 'main' }), ALLOW)
})

test('an unrelated command naming a wrapper and quoting a gh mention is not falsely denied (round-5 regression)', () => {
    // The wrapper-recursion approach this replaced would have flagged these as
    // real actions purely because they name an interpreter AND quote text that
    // mentions "gh pr merge" — a false positive on ordinary, unrelated commands.
    assert.equal(runGate('python analyze.py --note "gh pr merge 42 was the fix"', { base: 'main' }), ALLOW)
    assert.equal(runGate('git commit -m "fix: gh pr merge flow" && node build.js', { base: 'main' }), ALLOW)
})

test('quoting the verdict flag itself does not defeat detection (round-4 bypass)', () => {
    // `gh pr review 42 "--approve"` is argv-identical to the unquoted form for
    // gh, but a raw-string regex requiring a whitespace/end boundary right after
    // `--approve` fails to match with a `"` immediately following it.
    assert.equal(runGate('gh pr review 42 "--approve"', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr review 42 --approve""', { base: 'main' }), DENY)
})

test('unrelated text in a flag value cannot neutralize a real --approve (round-4 bypass)', () => {
    // --approve is a REAL, present flag token. A raw-string regex scanning the
    // WHOLE command for "-r" as a substring found it inside the quoted --body
    // text and incorrectly treated that as --request-changes, suppressing a
    // genuine self-approval.
    assert.equal(runGate('gh pr review 42 --approve --body "no -r blockers here"', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr review 42 -a --body "shipping; -r not needed"', { base: 'main' }), DENY)
})

test('a comment body with both an accept word and an incidental blocking word resolves toward accept (round-4 bypass)', () => {
    // "accept - no major issues" contains the substring "major"; the old
    // formula (acceptVerdict && !blockingVerdict) let that incidental word
    // cancel a genuine accept marker. Ambiguous phrasing must resolve toward
    // catching a possible self-accept, not away from it.
    assert.equal(runGate('gh pr comment 42 --body "accept - no major issues"', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr comment 42 --body "lgtm, no major concerns"', { base: 'main' }), DENY)
})

test('verdict keywords outside the --body value do not count (scoped detection)', () => {
    // "accept" appearing in an unrelated flag value (not the body) must not be
    // read as a verdict marker — only the actual body text is inspected.
    assert.equal(runGate('gh pr comment 42 --body "just fixing a typo" -R accept/repo', { base: 'feat/spec-1' }), ALLOW)
})

test('sweep: no combination of documented gh forms bypasses the carve-out onto a main-targeted merge', () => {
    // PR 42 targets `main`; the attacker's goal is to get ALLOW anyway. None of
    // these should succeed.
    const attacks = [
        'gh pr merge 42 --squash -t "closes https://github.com/o/r/pull/7"',
        'gh pr merge 42 --squash -b "see https://github.com/o/r/pull/7"',
        'gh --repo owner/repo pr merge 42 --squash',
        'gh -Ro/r pr merge 42 --squash',
        'gh pr merge 42 --squash -Rowner/repo',
        'gh pr merge 42 --squash --repo=owner/repo',
        'gh pr merge 42 --squash; gh pr merge 7 --squash',
        'gh pr merge 42 --squash && gh pr merge 7 --squash',
        'gh pr merge 42 --squash | cat',
        'gh pr merge $(echo 42) --squash',
        'gh pr merge `echo 42` --squash',
        'gh pr merge 42 --squash -m "gh pr merge 7"',
        'GH_TOKEN=x gh pr merge 42 --squash'
    ]
    for (const cmd of attacks) {
        assert.equal(runGate(cmd, { base: 'main' }), DENY, `must deny: ${cmd}`)
    }
})

test('an =-attached or clustered verdict flag is still detected (round-5 bypass)', () => {
    // gh accepts --approve=<bool> and clusters short flags (-ab == -a -b). Exact
    // token equality with "--approve"/"-a" missed all of these.
    assert.equal(runGate('gh pr review 42 --approve=true', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr review 42 -a=true', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr review 42 --approve=1', { base: 'main' }), DENY)
    // Even an explicit =false is treated as the flag being present — gh keys off
    // whether the flag was set, not the literal boolean value, so erring toward
    // "this might be an approve" is the safe direction here.
    assert.equal(runGate('gh pr review 42 --approve=false', { base: 'main' }), DENY)
    // The genuinely CLUSTERED case (round-5's test only covered =-attached; a
    // real `-ab` cluster was untested — round-6 nit).
    assert.equal(runGate('gh pr review 42 -ab "no blockers"', { base: 'main' }), DENY)
})

test('a repeated --body takes the LAST value, matching gh (round-5 bypass)', () => {
    // gh's string flags are last-wins when repeated. Scanning only the first
    // occurrence let a real accept marker in a later --body go unseen.
    assert.equal(
        runGate('gh pr comment 42 --body "no blockers found" --body "accept - lgtm"', { base: 'main' }),
        DENY
    )
    // The reverse order also has to be right — otherwise "not first-wins" and
    // "last-wins" are indistinguishable (round-6 nit): a real accept FIRST,
    // superseded by a later non-accept body, must NOT be flagged.
    assert.equal(
        runGate('gh pr comment 42 --body "accept - lgtm" --body "just a typo fix"', { base: 'main' }),
        ALLOW
    )
})

test('a flag before the PR number does not deny a legitimate task merge (round-5 bypass)', () => {
    // `gh pr merge --squash 42` is valid gh syntax (flags-before-selector).
    // Treating "--squash" as an unresolvable selector denied the carve-out for a
    // perfectly legitimate task merge — the ADR-003 failure mode of "a delivery
    // run cannot get past task 1".
    assert.equal(runGate('gh pr merge --squash 42', { base: 'feat/spec-1' }), ALLOW)
    // ...and still correctly denies when that same shape targets main.
    assert.equal(runGate('gh pr merge --squash 42', { base: 'main' }), DENY)
})

test('an attached short-flag value cannot cancel a genuine --approve (round-6 bypass)', () => {
    // Round 5's cluster-expansion treated ANY multi-char `-xy...` token as a
    // cluster of boolean flags, so `-bready` (an attached VALUE for -b, not a
    // cluster) was shredded into phantom -r/-e/-a/-d/-y flags — and the phantom
    // -r was read as --request-changes, cancelling a real --approve right next
    // to it. This is the flip side of "an unrelated flag cannot neutralize a
    // real --approve" (round-4): here the neutralizer was synthesized FROM the
    // approve's own sibling token.
    assert.equal(runGate('gh pr review 42 --approve -bready', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr review 42 --approve -bapproved', { base: 'main' }), DENY)
    // The genuine separated form must keep working too.
    assert.equal(runGate('gh pr review 42 -a -b ready', { base: 'main' }), DENY)
})

test('a clustered cross-repo flag does not get the carve-out (round-6 bypass)', () => {
    // `-dR owner/repo` is `-d -R owner/repo` under real getopt/pflag cluster
    // rules (only the LAST flag in a cluster may take a value) — hasRepoFlag's
    // own hand-rolled matching never expanded clusters, so this cross-repo flag
    // was invisible to the exact-token/attached-only check it used.
    assert.equal(runGate('gh pr merge 7 --squash -dR owner/other-repo', { base: 'feat/spec-1' }), DENY)
    assert.equal(runGate('gh pr merge 7 --squash -sdR owner/other-repo', { base: 'feat/spec-1' }), DENY)
})

test('a value-taking flag never donates its separate-token value as the PR selector (round-6 bypass)', () => {
    // `extractPrNumber`'s leading-flag skip only recognized `--flag`/`-f` TOKENS,
    // not `--flag value` PAIRS with the value in a separate token — so a
    // value-taking flag's value (here, always "42") was read as the positional
    // PR selector. The claim in the old comment that this "fails closed" was
    // false: it actively resolved the WRONG PR. None of these name PR 42 as
    // their real selector, so none should get the carve-out via base "main".
    assert.equal(runGate('gh pr merge -b 42 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr merge --body 42 --squash', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr merge -t 42 --squash', { base: 'main' }), DENY)
    // ...and a genuine bare selector alongside an unrelated value-taking flag
    // still resolves and is exempted correctly.
    assert.equal(runGate('gh pr merge 42 -t "release notes" --squash', { base: 'feat/spec-1' }), ALLOW)
})

test('the attached short-flag BODY form is still scanned for a verdict marker (round-6 bypass)', () => {
    // `flagValueAfter` matched only exact `-b`/`--body` tokens, never gh's own
    // attached short-flag form (`-b<value>`, no space) — even though hasRepoFlag
    // already recognized the equivalent attached form for -R. A self-accept
    // comment posted this way went undetected.
    assert.equal(runGate('gh pr comment 42 -b"accept - lgtm"', { base: 'main' }), DENY)
    assert.equal(runGate('gh pr comment 42 -baccept', { base: 'main' }), DENY)
    // A non-accept attached body must still be a no-op.
    assert.equal(runGate('gh pr comment 42 -bjust-fixing-a-typo', { base: 'main' }), ALLOW)
})
