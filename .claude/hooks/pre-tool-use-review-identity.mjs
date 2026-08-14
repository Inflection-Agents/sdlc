#!/usr/bin/env node
// pre-tool-use-review-identity.mjs — PreToolUse(Bash) author≠reviewer gate.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only). ADVISORY by default (warn mode); a
// one-line constant flips it to enforce. FAILS OPEN: any internal error → exit
// 0 (no-op) so it never wedges an unrelated Bash call.
//
// What it does
// ------------
// Refuses to let a PR author post an `accept`/approve verdict (or merge) on
// their OWN PR. This is the structural half of the review-independence rule in
// `.ai/skills/review-primitives.md`: the reviewer-of-record for code is the
// independent review panel, and humans gate inputs + merge the integration PR —
// an author accepting their own PR is never a legitimate review. There is NO
// override hatch for this gate (it is a correctness rule, not a process gate).
//
// Scope: only the PR-review / verdict-posting Bash invocations
//   (`gh pr review --approve`, `gh pr merge`, and `gh pr comment` whose body
//    carries an accept verdict). Everything else is a no-op:
//   - reviewer ≠ author                                → allow
//   - non-accept actions (request-changes / blocker /  → allow
//     fix_loop comments, `--comment`)
//   - any non-`gh pr` Bash command                     → allow
//
// Contract (Claude Code PreToolUse):
//   - stdin: JSON `{ tool_name, tool_input, ... }`.
//   - To BLOCK: exit code 2 with a human-readable reason on stderr.
//   - To ALLOW: exit 0 (no-op). On any internal error we fail OPEN (exit 0).
//
// Deterministic + fast: no model call. The only I/O is `gh`/`git` lookups to
// resolve the PR author and the authenticated reviewer identity, gated behind a
// check that an accept verdict was actually detected.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ALLOW = 0
const BLOCK = 2

// ─── SDLC_GUARD_MODE — advisory-by-default rollout toggle ──────────────────
//
// REFERENCE-IMPLEMENTATION DEFAULT: `warn` (advisory). The decision logic
// (author == reviewer) is unchanged; only the ACTION on a decided block depends
// on this mode. To change the default, edit the fallback in the IIFE below (or
// set the SDLC_GUARD_MODE env var per-run).
//
//   enforce → block (exit 2 + deny reason on stderr).
//   warn    → DO NOT block; allow (exit 0) but print the would-block reason as
//             a visible `[SDLC guard — WARN, …]` warning on stderr.
//   off     → emergency kill-switch; no-op entirely (exit 0, no output).
const GUARD_MODE = (() => {
    const v = (process.env.SDLC_GUARD_MODE ?? '').trim().toLowerCase()
    if (v === 'enforce' || v === 'warn' || v === 'off') return v
    return 'warn' // ← reference default: advisory. Change to 'enforce' to gate.
})()

/** Apply the configured guard mode to a decided block. Always exits. */
function deny(reason) {
    if (GUARD_MODE === 'off') process.exit(ALLOW)
    if (GUARD_MODE === 'warn') {
        process.stderr.write(`[SDLC guard — WARN, would block in enforce mode]: ${reason}\n`)
        process.exit(ALLOW)
    }
    process.stderr.write(reason + '\n') // enforce
    process.exit(BLOCK)
}

function allow() {
    process.exit(ALLOW)
}

/** Parse the hook payload from stdin; null (→ fail open) on malformed input. */
function parsePayload() {
    let raw = ''
    try {
        raw = readFileSync(0, 'utf8')
    } catch {
        return null
    }
    if (!raw.trim()) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

/**
 * Does this Bash command post an `accept` / non-blocking PR verdict?
 *
 * Accept signals:
 *   - `gh pr review ... --approve` / `-a`
 *   - `gh pr merge ...`                      (accepting == merging)
 *   - `gh pr comment ...` whose body carries an accept verdict marker from the
 *     review-primitives action vocabulary: `accept`,
 *     `batch_followup_and_accept`, `approve`, or `lgtm`.
 *
 * Explicit NON-accept (returns isAccept:false → no-op):
 *   - `gh pr review --request-changes` / `-r`
 *   - `gh pr review --comment` / `-c` with no approve
 *   - any comment whose verdict is `fix_loop` / `blocker` / `major`
 */
/**
 * Minimal shell-word tokenizer. Splits on whitespace, treating a single- or
 * double-quoted span as ONE token regardless of the whitespace inside it (with
 * `\"` handled inside double quotes; single quotes take everything literally, as
 * in real shells).
 *
 * Three rounds of this gate were bypassed by regex-on-the-raw-string tricks:
 * adjacency assumptions (`gh` ... `pr merge` not adjacent), a PR-shaped token
 * hiding inside a flag VALUE (`-t "...pull/7..."`), and a flag spelling the
 * regex didn't enumerate (`-Rowner/repo` attached). A real tokenizer removes an
 * entire class of these: once "gh", "pr", "merge", "42" are actual array
 * elements, a quoted commit message containing the substring "gh pr merge 999"
 * is ONE token (the whole quoted string), not three tokens that regex scanning
 * would have found and trusted.
 *
 * Not a full shell grammar (no `$()`, no glob expansion, no `;`-in-quotes
 * awareness) — just enough to stop token-boundary tricks. `isSingleUnchainedGhAction`
 * still rejects shell metacharacters outright, which is the correct fail-closed
 * response to anything this tokenizer doesn't understand.
 */
function tokenize(cmd) {
    const tokens = []
    let cur = ''
    let quote = null
    const s = String(cmd)
    for (let i = 0; i < s.length; i += 1) {
        const c = s[i]
        if (quote) {
            if (c === quote) {
                quote = null
                continue
            }
            if (quote === '"' && c === '\\' && i + 1 < s.length) {
                cur += s[i + 1]
                i += 1
                continue
            }
            cur += c
            continue
        }
        if (c === '"' || c === "'") {
            quote = c
            continue
        }
        if (/\s/.test(c)) {
            if (cur) {
                tokens.push(cur)
                cur = ''
            }
            continue
        }
        cur += c
    }
    if (cur) tokens.push(cur)
    return tokens
}

/**
 * Find a `pr <verb>` subcommand among the command's tokens and return the verb
 * plus every token after it. `gh` and `pr` need NOT be adjacent — global flags
 * can sit between them (`gh --repo owner/repo pr merge 42`, `gh -Ro/r pr review
 * 42 --approve`, both valid gh syntax). An adjacency-requiring regex let such a
 * command skip classification ENTIRELY — not just the merge carve-out, the WHOLE
 * author≠reviewer gate, including an unrestricted self-merge to `main`
 * (PR #42 review, round 3).
 */
function findVerb(cmd) {
    const tokens = tokenize(cmd)
    const ghIdx = tokens.indexOf('gh')
    if (ghIdx === -1) return null
    for (let i = ghIdx + 1; i < tokens.length - 1; i += 1) {
        if (tokens[i] === 'pr' && (tokens[i + 1] === 'review' || tokens[i + 1] === 'comment' || tokens[i + 1] === 'merge')) {
            return { verb: tokens[i + 1], restTokens: tokens.slice(i + 2), allTokens: tokens }
        }
    }
    return null
}

function classify(command) {
    if (typeof command !== 'string') return { isVerdict: false }
    const cmd = command
    const found = findVerb(cmd)
    if (!found) return { isVerdict: false }
    const { verb, restTokens } = found

    const isReview = verb === 'review'
    const isComment = verb === 'comment'
    const isMerge = verb === 'merge'

    const requestsChanges = /(^|\s)(--request-changes|-r)(\s|=|$)/.test(cmd)
    const hasApprove = /(^|\s)(--approve|-a)(\s|=|$)/.test(cmd)

    const blockingVerdict = /\b(fix_loop|request[-_ ]?changes|blocker|major)\b/i.test(cmd)
    const acceptVerdict = /\b(accept|batch_followup_and_accept|approve|lgtm)\b/i.test(cmd)

    let isAccept = false
    if (isReview) {
        isAccept = hasApprove && !requestsChanges
    } else if (isMerge) {
        isAccept = true
    } else if (isComment) {
        isAccept = acceptVerdict && !blockingVerdict && !requestsChanges
    }

    return { isVerdict: true, isAccept, isMerge, prNumber: extractPrNumber(restTokens) }
}

/**
 * Best-effort extraction of the PR number from the TOKENS after the `pr <verb>`
 * match. gh accepts a bare number, a URL, or a branch as the selector — always as
 * the FIRST positional token right after the verb (gh's own convention). Nothing
 * later in the command is ever consulted: scanning further let a URL embedded in
 * a flag value (`-t "closes https://github.com/o/r/pull/7"`, a commit message,
 * `--body`) steer base resolution to an unrelated PR (PR #42 review, round 3).
 */
function extractPrNumber(restTokens) {
    const first = (restTokens || [])[0]
    if (!first) return null
    if (/^\d+$/.test(first)) return first
    const url = first.match(/^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)$/)
    if (url) return url[1]
    return null
}

function gh(args) {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/**
 * Branches that are a spec's INTEGRATION branch — the merge target ADR-003 requires
 * the executor to merge its own task PRs into.
 */
const INTEGRATION_BRANCH = /^feat\/spec-/i

/**
 * Does this command carry exactly ONE `gh pr` action, with no shell chaining?
 *
 * The carve-out authorizes a whole Bash command from a single resolved PR base, so a
 * compound command is a bypass: `gh pr merge 100 && gh pr merge 7` resolves only
 * PR 100's base (a task branch) and would exempt the merge of PR 7 into `main`. Same
 * for `gh pr merge 7 && gh pr review 8 --approve`. If the command does more than one
 * thing, it does not get the exemption.
 */
/**
 * Does this command carry a `-R`/`--repo` cross-repo flag, in any of gh's accepted
 * spellings: separate (`-R owner/repo`), attached short-flag (`-Rowner/repo` —
 * valid POSIX shorthand, confirmed against gh 2.92.0), or long (`--repo owner/repo`,
 * `--repo=owner/repo`)? The base lookup below never queries the flagged repo, so
 * honoring ANY spelling here would resolve — or silently trust — the wrong repo's
 * PR. Token-based, not one regex: a single pattern covering both the separated and
 * attached `-R` forms without also matching an unrelated `-R*` flag is fragile: the
 * separated-only regex is exactly what missed the attached form the first time
 * (PR #42 review, round 3).
 */
function hasRepoFlag(tokens) {
    return tokens.some(
        (t) => t === '-R' || t === '--repo' || t.startsWith('--repo=') || (t.startsWith('-R') && t.length > 2 && !t.startsWith('--'))
    )
}

/**
 * Does this command carry exactly ONE `gh ... pr <verb>` action, with no shell
 * chaining and no cross-repo flag anywhere in it?
 *
 * The carve-out authorizes a whole Bash command from a single resolved PR base, so
 * a compound command is a bypass: `gh pr merge 100 && gh pr merge 7` resolves only
 * PR 100's base (a task branch) and would exempt the merge of PR 7 into `main`.
 * Chaining metacharacters are checked on the RAW string, not the tokenized one —
 * this is deliberately the more paranoid direction: a metacharacter appearing
 * anywhere, even inside a quoted value, denies the carve-out, and the normal
 * author≠reviewer check still applies. `-R`/`--repo` (any spelling) targets a
 * different repository than the one the base lookup below queries, so it never
 * gets the carve-out either — it falls through to deny, the fail-closed direction.
 */
function isSingleUnchainedGhAction(cmd) {
    if (/[;&|]{1,2}|\$\(|`|\n/.test(String(cmd))) return false
    const tokens = tokenize(cmd)
    let verbCount = 0
    for (let i = 0; i < tokens.length - 1; i += 1) {
        if (tokens[i] === 'pr' && (tokens[i + 1] === 'review' || tokens[i + 1] === 'comment' || tokens[i + 1] === 'merge')) {
            verbCount += 1
        }
    }
    if (verbCount !== 1) return false
    if (hasRepoFlag(tokens)) return false
    return true
}

/**
 * The PR selector must be one we can resolve UNAMBIGUOUSLY. `gh pr merge` also accepts
 * a branch name or a shell variable; with those, `extractPrNumber` returns null and the
 * base lookup silently falls back to the CURRENT BRANCH's PR — a different PR whose
 * base may well be a task branch. Only a bare number or a github.com pull URL counts.
 */
function hasResolvablePrSelector(cmd, prNumber) {
    // extractPrNumber above now ONLY resolves from the first positional token, so
    // a non-null prNumber already means "unambiguously resolvable". No secondary
    // whole-command scan — that was the other half of the same bypass class.
    return prNumber != null
}

/**
 * Is this merge a task PR landing on a spec integration branch?
 *
 * ADR-003 splits one rule into two. Merging a task PR into `feat/spec-NNN` is
 * MANDATORY work for the delivery executor — it merges its own PR, immediately, and
 * nothing reaches `main` that way. Merging the integration PR into `main` is the
 * human's, always. This gate only ever meant the second one; without the base check
 * it denies the first, and in `enforce` mode a delivery run cannot get past task 1.
 *
 * Fails CLOSED for this carve-out specifically: if the base cannot be resolved we
 * return false and the normal author≠reviewer check applies, so an unresolvable base
 * never widens the exemption.
 */
function mergesIntoIntegrationBranch(prNumber) {
    // Test seam, deliberately narrow: only honored when the identity seams are ALSO
    // injected, which never happens in production. Read unconditionally, an exported
    // SDLC_REVIEW_GATE_BASE=feat/spec-x would exempt every merge including the
    // integration PR into `main`.
    const injected = process.env.SDLC_REVIEW_GATE_BASE
    if (injected != null && process.env.SDLC_REVIEW_GATE_AUTHOR_LOGIN != null) {
        return INTEGRATION_BRANCH.test(injected)
    }
    const args = ['pr', 'view']
    if (prNumber) args.push(prNumber)
    args.push('--json', 'baseRefName')
    try {
        return INTEGRATION_BRANCH.test(JSON.parse(gh(args))?.baseRefName ?? '')
    } catch {
        return false
    }
}

// Test seam: fixtures inject identities via env so tests are deterministic and
// never hit the network. Production never sets these.
function envIdentity(prefix) {
    const login = process.env[`${prefix}_LOGIN`]
    const email = process.env[`${prefix}_EMAIL`]
    if (login == null && email == null) return undefined
    return { login: login || null, email: email || null }
}

/** Resolve the PR author login + email (best effort). */
function resolveAuthor(prNumber) {
    const injected = envIdentity('SDLC_REVIEW_GATE_AUTHOR')
    if (injected) return injected
    const args = ['pr', 'view']
    if (prNumber) args.push(prNumber)
    args.push('--json', 'author,headRefOid')
    let json
    try {
        json = JSON.parse(gh(args))
    } catch {
        return null
    }
    const login = json?.author?.login || null
    let email = null
    // The head-commit author email is the most reliable identity signal when
    // GitHub logins differ from commit identities.
    const headOid = json?.headRefOid
    if (headOid) {
        try {
            email = execFileSync('git', ['log', '-1', '--format=%ae', headOid], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore']
            }).trim()
        } catch {
            email = null
        }
    }
    return { login, email }
}

/** Resolve the reviewer (current actor) login + email. */
function resolveReviewer() {
    const injected = envIdentity('SDLC_REVIEW_GATE_REVIEWER')
    if (injected) return injected
    let login = null
    let email = null
    try {
        login = gh(['api', 'user', '--jq', '.login'])
    } catch {
        login = null
    }
    try {
        email = execFileSync('git', ['config', 'user.email'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
    } catch {
        email = null
    }
    return { login, email }
}

function identitiesMatch(author, reviewer) {
    if (!author || !reviewer) return false
    const eq = (a, b) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase()
    return eq(author.login, reviewer.login) || eq(author.email, reviewer.email)
}

const DENY_REASON =
    'BLOCKED by the author≠reviewer review-independence gate (review-primitives.md).\n' +
    'The resolved reviewer identity equals the PR author — an author may not post ' +
    'an accept/approve verdict (or merge) on their own PR.\n' +
    'Dispatch an INDEPENDENT reviewer (different identity) to grade and accept this ' +
    'PR. There is no override for this gate.\n' +
    'NOTE (ADR-003): merging a TASK PR into a spec integration branch (`feat/spec-NNN`) ' +
    'is exempt — that is the delivery executor landing its own task, and nothing reaches ' +
    '`main` by it. This deny means the PR targets `main` (or its base could not be ' +
    'resolved), which is the human\'s merge, always.'

function main() {
    if (GUARD_MODE === 'off') allow() // emergency kill-switch: no-op, no I/O

    const payload = parsePayload()
    if (!payload) allow() // fail open on no/bad input

    const toolName = payload.tool_name || payload.toolName
    if (toolName !== 'Bash') allow()

    const command =
        payload.tool_input?.command ?? payload.toolInput?.command ?? payload.tool_input?.cmd
    const { isVerdict, isAccept, isMerge, prNumber } = classify(command)

    // No-op for anything that isn't an accept/non-blocking PR verdict.
    if (!isVerdict || !isAccept) allow()

    // ADR-003 carve-out: a task PR merging into `feat/spec-NNN` is the delivery
    // executor doing its job, not an author self-accepting. Nothing reaches `main`
    // that way. An integration PR into `main` stays denied.
    //
    // Every precondition must hold, and each failure falls THROUGH to the normal
    // author≠reviewer check (deny), never around it: exactly one un-chained `gh pr`
    // action, an unambiguously resolvable PR selector, and a base matching
    // `feat/spec-*`.
    if (
        isMerge &&
        isSingleUnchainedGhAction(command) &&
        hasResolvablePrSelector(command, prNumber) &&
        mergesIntoIntegrationBranch(prNumber)
    ) {
        allow()
    }

    // Resolve identities only now (gated behind a detected accept).
    let author, reviewer
    try {
        author = resolveAuthor(prNumber)
        reviewer = resolveReviewer()
    } catch {
        allow() // fail open if identity resolution throws
    }

    // If we can't resolve either identity, fail open — never block on missing
    // data (the reviewer/orchestrator and CI remain the backstop).
    if (!author || !reviewer) allow()

    if (identitiesMatch(author, reviewer)) deny(DENY_REASON)

    allow()
}

try {
    main()
} catch {
    allow() // fail open
}
