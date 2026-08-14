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
// ONE exemption (ADR-003): a `gh pr merge` whose PR base resolves to a
// `feat/spec-*` integration branch is the delivery executor merging its own
// task PR — mandatory work, not a self-accept, and nothing reaches `main` that
// way. The exemption requires ALL of: exactly one un-chained `gh ... pr <verb>`
// action, no `-R`/`--repo` anywhere, an unambiguously resolvable PR selector (a
// bare number or a github.com pull URL, as the first positional token — flags
// before it are skipped), and a base matching `feat/spec-*`. Any failure of any
// of these falls through to the normal deny check below — see
// `.claude/hooks/__tests__/review-identity-merge-carveout.test.mjs` for the
// exact boundary.
//
// Scope: only the PR-review / verdict-posting Bash invocations
//   (`gh pr review --approve`, `gh pr merge`, and `gh pr comment` whose
//    `--body`/`-b` value carries an accept verdict). Everything else is a no-op:
//   - reviewer ≠ author                                → allow
//   - the merge carve-out above                         → allow
//   - non-accept actions (request-changes / blocker /  → allow
//     fix_loop comments, `--comment`)
//   - any command with no `gh ... pr <verb>` action     → allow
//
// Stated scope, deliberately (six review rounds shaped this line): this
// classifier catches the REALISTIC shape of a `gh pr` invocation — quoting,
// backslash escaping, adjacency, path-qualified/attached flag spellings,
// clustered short flags (including a value-taking flag inside a cluster, e.g.
// `-dR owner/repo`), repeated flags — the ordinary variation an agent
// actually writes. All flag parsing (accept-verdict detection, `--body`
// extraction, `-R`/`--repo` detection, PR-selector extraction) runs through
// ONE shared parser (`parseFlags`) rather than four independent ad hoc scans,
// after round 6 found that duplication let each site learn a different
// partial picture of gh's flag grammar and reopen a bypass round 5 had
// otherwise closed. It does NOT try to see through deliberate shell obfuscation:
// a command built via substitution (`$(echo gh) pr merge 42`), wrapped in an
// interpreter (`bash -c "gh pr merge 42"`), or hidden inside a file executed
// indirectly (`bash some-script.sh`). An earlier version of this file DID try
// to catch inline wrapper commands, gated on an allowlist of interpreter names;
// review found that approach unsound in both directions at once — the
// allowlist can never be complete (any unenumerated interpreter still hides the
// call), and even a complete one still false-denies an unrelated command that
// merely names an interpreter while quoting text that happens to mention "gh
// pr merge". Catching genuine adversarial obfuscation of an arbitrary shell
// command is not a bounded problem for a string classifier, and `SDLC_GUARD_MODE`
// defaults to `warn` in every case — this hook is a heuristic safety net
// against carelessness, not a hardened boundary against a determined
// adversary with full command-construction freedom. No version of this file
// claims otherwise.
//
// Contract (Claude Code PreToolUse):
//   - stdin: JSON `{ tool_name, tool_input, ... }`.
//   - To BLOCK: exit code 2 with a human-readable reason on stderr.
//   - To ALLOW: exit 0 (no-op). On any internal error we fail OPEN (exit 0).
//
// Deterministic + fast: no model call. The only I/O is the `gh pr view` base
// lookup for the merge carve-out, plus `gh`/`git` lookups to resolve the PR
// author and the authenticated reviewer identity — the latter gated behind a
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
 *   - `gh pr comment ...` whose `--body`/`-b` VALUE carries an accept verdict
 *     marker from the review-primitives action vocabulary: `accept`,
 *     `batch_followup_and_accept`, `approve`, or `lgtm`.
 *
 * Explicit NON-accept (returns isAccept:false → no-op):
 *   - `gh pr review --request-changes` / `-r`
 *   - `gh pr review --comment` / `-c` with no approve
 *   - any comment whose body carries no accept marker
 *
 * NOT covered by this classifier — stated plainly rather than implied to be
 * closed: a `gh pr merge` invocation hidden behind a script file
 * (`bash some-script.sh`, where the actual `gh` call lives inside that file) is
 * invisible to any string-based classifier of the Bash tool-call text, because
 * the string "gh pr merge" never appears in what this hook sees. That is a
 * fundamentally different, much larger problem (arbitrary indirection) than
 * anything a command-line parser can close, and no version of this file claims
 * otherwise.
 */

/**
 * Minimal shell-word tokenizer. Splits on whitespace, treating a single- or
 * double-quoted span as ONE token regardless of the whitespace inside it
 * (`\"` is honored inside double quotes; single quotes take everything
 * literally, as in real shells). An unquoted backslash escapes the very next
 * character (also real-shell behavior), so `\gh` tokenizes to `gh` and
 * `gh p\r merge` tokenizes to the same three tokens as `gh pr merge`.
 *
 * Four rounds of this gate were bypassed by regex-on-the-raw-string tricks, and
 * then by two gaps in the FIRST tokenizer pass: adjacency assumptions (`gh` ...
 * `pr merge` not adjacent), a PR-shaped token hiding inside a flag VALUE, an
 * unenumerated flag spelling, an unhandled backslash escape (`\gh`, `g\h`), and
 * verdict-flag detection that stayed on raw-string regex after the rest moved
 * to tokens. Each fix closed the instance found, not the class — see
 * `findAllVerbMatches` below for the piece that actually generalizes (searching
 * inside quoted spans, not just splitting on them).
 *
 * Not a full shell grammar (no `$()` evaluation, no glob expansion) —
 * `isSingleUnchainedGhAction` rejects shell metacharacters outright, the
 * correct fail-closed response to anything this tokenizer doesn't understand.
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
        if (c === '\\' && i + 1 < s.length) {
            // Unquoted backslash: escapes the next character literally, exactly
            // as a real shell would. Without this, `\gh` and `gh p\r merge`
            // tokenize as `\gh`/`p\r` — strings that are NOT `gh`/`pr` by exact
            // comparison, so the whole gate silently skipped them.
            cur += s[i + 1]
            i += 1
            continue
        }
        if (c === '"' || c === "'") {
            quote = c
            continue
        }
        if (/[ \t\n\r\f\v]/.test(c)) {
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

/** Is this token the `gh` command word — by basename, so `/usr/bin/gh` and `./gh` count too? */
function isGhToken(t) {
    const base = String(t).split('/').pop()
    return base === 'gh'
}

/**
 * Find every `gh ... pr <verb>` action among the command's TOP-LEVEL tokens —
 * deliberately NOT inside quoted spans.
 *
 * An earlier version of this function recursed into a quoted span when a
 * code-execution wrapper (`bash -c "..."`, `eval "..."`) was present, to catch
 * `bash -c "gh pr merge 42"`. Round 5 review found that approach unsound in
 * BOTH directions at once: the wrapper allowlist can never be complete (`awk
 * 'BEGIN{system("gh pr merge 42")}'`, `csh -c`, `env -S`, and any interpreter
 * not enumerated all still hid the call), and even a complete allowlist would
 * still false-deny an unrelated command that merely NAMES a wrapper and
 * quotes text mentioning "gh pr merge" (`python analyze.py --note "gh pr
 * merge 42 was the fix"`). A classifier that is simultaneously incomplete
 * against a determined adversary and wrong about ordinary commands is not
 * earning its complexity.
 *
 * The decision this function encodes: catch the REALISTIC shape of a `gh pr`
 * invocation — the one an agent actually writes, including its ordinary flag
 * variations (quoting, escaping, adjacency, attached/`=`-form flags) — and
 * explicitly do NOT try to see through deliberate shell obfuscation (an
 * invocation wrapped in an interpreter, built via command substitution
 * (`$(...)`), or hidden inside a file executed indirectly). That class is
 * unbounded for a string classifier; no amount of allowlisting closes it, and
 * `SDLC_GUARD_MODE` defaults to `warn` — this hook is a heuristic safety net
 * against carelessness, not a hardened boundary against a determined
 * adversary with full command-construction freedom. See the file header for
 * the complete, stated scope.
 */
function findAllVerbMatches(cmd) {
    const tokens = tokenize(cmd)
    const matches = []
    for (let i = 0; i < tokens.length - 1; i += 1) {
        if (!isGhToken(tokens[i])) continue
        for (let j = i + 1; j < tokens.length - 1; j += 1) {
            if (tokens[j] === 'pr' && (tokens[j + 1] === 'review' || tokens[j + 1] === 'comment' || tokens[j + 1] === 'merge')) {
                matches.push({ verb: tokens[j + 1], restTokens: tokens.slice(j + 2) })
                break // one match per `gh` token is enough to prove "this command has a match"
            }
        }
    }
    return matches
}

/**
 * Short/long flags whose value can determine the outcome of THIS gate, so
 * `parseFlags` below must know they take a value rather than treating what
 * follows as a boolean flag or a positional selector. Round 6 review found
 * round 5's independent, flag-by-flag patches (`expandFlagToken`'s cluster
 * expansion, `flagValueAfter`, `extractPrNumber`'s leading-flag skip,
 * `hasRepoFlag`) had each learned a DIFFERENT partial picture of gh's flag
 * grammar, so an attached value (`-bready`), a clustered value-taking flag
 * (`-dR owner/repo`), or a separate-token long-flag value (`--body 42`)
 * broke exactly one of the four independently — not because any one fix was
 * wrong, but because there was no single shared source of truth for "which
 * flags take a value." `parseFlags` is that shared source now; every
 * consumer below reads its output instead of re-deriving it.
 */
const VALUE_TAKING_SHORT_FLAGS = new Set(['b', 't', 'F', 'R'])
const VALUE_TAKING_LONG_FLAGS = new Set(['--body', '--body-file', '--repo'])

/**
 * Parse `tokens` into `{ flags, positionals }`: `flags` is every flag
 * occurrence found (`{ flag: '-x' | '--long', value: string | null }`, one
 * entry per short flag even inside a cluster), `positionals` is every
 * remaining bare token IN ORDER, with a value-taking flag's value never
 * appearing in either list twice and never leaking into `positionals`.
 *
 * Handles, uniformly, so no call site has to: `--flag value`, `--flag=value`,
 * `-f value`, `-fvalue` (attached), `-f=value`, and a clustered short-flag
 * group where only the LAST flag in the cluster may take a value
 * (`-dR owner/repo` == `-d -R owner/repo`, matching real getopt/pflag
 * semantics — confirmed against gh 2.92.0) — either attached to the same
 * token (`-dRowner/repo`) or as the next token.
 */
function parseFlags(tokens) {
    const flags = []
    const positionals = []
    let i = 0
    while (i < tokens.length) {
        const t = tokens[i]
        if (t.startsWith('--') && t.length > 2) {
            const eq = t.indexOf('=')
            if (eq !== -1) {
                flags.push({ flag: t.slice(0, eq), value: t.slice(eq + 1) })
                i += 1
                continue
            }
            if (VALUE_TAKING_LONG_FLAGS.has(t) && i + 1 < tokens.length) {
                flags.push({ flag: t, value: tokens[i + 1] })
                i += 2
                continue
            }
            flags.push({ flag: t, value: null })
            i += 1
            continue
        }
        if (t.startsWith('-') && t.length > 1 && t !== '--') {
            const eq = t.indexOf('=')
            const body = eq !== -1 ? t.slice(1, eq) : t.slice(1)
            const attachedValue = eq !== -1 ? t.slice(eq + 1) : null
            let consumedNextToken = false
            for (let c = 0; c < body.length; c += 1) {
                const ch = body[c]
                if (VALUE_TAKING_SHORT_FLAGS.has(ch)) {
                    const rest = body.slice(c + 1)
                    if (attachedValue !== null) {
                        flags.push({ flag: `-${ch}`, value: attachedValue })
                    } else if (rest) {
                        flags.push({ flag: `-${ch}`, value: rest })
                    } else if (i + 1 < tokens.length) {
                        flags.push({ flag: `-${ch}`, value: tokens[i + 1] })
                        consumedNextToken = true
                    } else {
                        flags.push({ flag: `-${ch}`, value: null })
                    }
                    break // a value-taking flag ends the cluster
                }
                flags.push({ flag: `-${ch}`, value: null })
            }
            i += consumedNextToken ? 2 : 1
            continue
        }
        positionals.push(t)
        i += 1
    }
    return { flags, positionals }
}

/**
 * The value passed to the LAST of `names` found among `tokens` — gh's own
 * string flags are last-wins when repeated, so scanning only the first
 * occurrence let a later, real value (e.g. a second `--body`) go unseen (PR
 * #42 review, round 5). Used to scope verdict-keyword scanning to the ACTUAL
 * flag value (e.g. a comment body) rather than the whole command line —
 * scanning the whole line let unrelated text (a `-t`/`-m` value, a trailing
 * comment) inject or neutralize a verdict keyword (PR #42 review, rounds 3-4).
 */
function flagValueAfter(tokens, names) {
    let found = null
    for (const f of parseFlags(tokens).flags) {
        if (names.includes(f.flag)) found = f.value
    }
    return found
}

/** Does any token in `tokens` represent one of these canonical flag forms (any spelling)? */
function hasFlag(tokens, canonicalForms) {
    return parseFlags(tokens).flags.some((f) => canonicalForms.includes(f.flag))
}

/** Is this single verb-match an accept-shaped action? */
function isAcceptMatch({ verb, restTokens }) {
    if (verb === 'merge') return true
    if (verb === 'review') {
        const hasApprove = hasFlag(restTokens, ['--approve', '-a'])
        const requestsChanges = hasFlag(restTokens, ['--request-changes', '-r'])
        return hasApprove && !requestsChanges
    }
    if (verb === 'comment') {
        // Only the --body/-b VALUE is inspected — never the whole command — so
        // an unrelated flag or trailing text cannot inject a verdict marker.
        const body = flagValueAfter(restTokens, ['--body', '-b'])
        if (!body) return false
        // Ambiguous phrasing (both an accept AND a blocking word in the same
        // body) resolves TOWARD accept. Over-flagging a legitimate blocking
        // comment as a possible accept is just an annoying false deny (safe);
        // under-flagging a crafted self-accept ("accept — no major issues")
        // whose incidental "major" neutralized the real signal is the actual
        // security hole this closes (PR #42 review, round 4).
        return /\b(accept|batch_followup_and_accept|approve|lgtm)\b/i.test(body)
    }
    return false
}

function classify(command) {
    if (typeof command !== 'string') return { isVerdict: false }
    const matches = findAllVerbMatches(command)
    if (matches.length === 0) return { isVerdict: false }
    const isAccept = matches.some(isAcceptMatch)
    const mergeMatch = matches.find((m) => m.verb === 'merge')
    const isMerge = !!mergeMatch
    const prNumber = extractPrNumber((mergeMatch || matches[0]).restTokens)
    return { isVerdict: true, isAccept, isMerge, prNumber }
}

/**
 * Best-effort extraction of the PR number from the TOKENS after the `pr <verb>`
 * match. gh accepts a bare number, a URL, or a branch as the selector — always as
 * the FIRST positional token right after the verb (gh's own convention). Nothing
 * later in the command is ever consulted: scanning further let a URL embedded in
 * a flag value (`-t "closes https://github.com/o/r/pull/7"`, a commit message,
 * `--body`) steer base resolution to an unrelated PR (PR #42 review, round 3).
 *
 * Uses `parseFlags`'s `positionals` rather than a raw leading-dash skip: a
 * value-taking flag's SEPARATE-token value (`gh pr merge --body 42 --squash`,
 * `gh pr merge -t 42 --squash`) is not a positional at all, and a naive skip
 * that only recognized `--flag`/`-f` tokens (not `--flag value` pairs) was
 * fooled into taking that value as the selector — the exact opposite of the
 * "fails closed" behavior it was believed to have (PR #42 review, round 6).
 */
function extractPrNumber(restTokens) {
    const { positionals } = parseFlags(restTokens || [])
    const first = positionals[0]
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
 * Does this command carry a `-R`/`--repo` cross-repo flag, in any of gh's accepted
 * spellings: separate (`-R owner/repo`), attached short-flag (`-Rowner/repo` —
 * valid POSIX shorthand, confirmed against gh 2.92.0), clustered with another
 * short flag (`-dR owner/repo` == `-d -R owner/repo`), or long (`--repo owner/repo`,
 * `--repo=owner/repo`)? The base lookup below never queries the flagged repo, so
 * honoring ANY spelling here would resolve — or silently trust — the wrong repo's
 * PR. Delegates to the shared `parseFlags` rather than its own token matching: a
 * hand-rolled check here is exactly what missed the attached form (round 3) and
 * then the clustered form (round 6) — two different partial pictures of the same
 * flag grammar `parseFlags` now owns once, for every caller.
 */
function hasRepoFlag(tokens) {
    return parseFlags(tokens).flags.some((f) => f.flag === '-R' || f.flag === '--repo')
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
 * author≠reviewer check still applies (this is also the only defense against
 * command substitution like `$(echo gh) pr merge 42` — the carve-out is refused,
 * though the outer classify() below has no way to recognize such a command as a
 * verdict at all; see the file header's stated scope). `-R`/`--repo` (any
 * spelling) targets a different repository than the one the base lookup below
 * queries, so it never gets the carve-out either — it falls through to deny.
 */
function isSingleUnchainedGhAction(cmd) {
    if (/[;&|]{1,2}|\$\(|`|\n/.test(String(cmd))) return false
    if (findAllVerbMatches(cmd).length !== 1) return false
    if (hasRepoFlag(tokenize(cmd))) return false
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
