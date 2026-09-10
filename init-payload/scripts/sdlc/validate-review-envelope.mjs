#!/usr/bin/env node
/**
 * validate-review-envelope.mjs — the owner of reviewer-envelope validation (ADR-003).
 *
 * Generic reference implementation shipped by the AI-native SDLC framework.
 * Dependency-free (Node built-ins only; the schema is JSON, so no YAML reader and
 * no `ajv` are needed).
 *
 * WHY THIS EXISTS. `review-primitives.md` pins three correctness rules to a
 * dispatch-layer validation step, and that step used to live inside the
 * deterministic `execute-spec` Workflow (`validEnvelope` / the `ALLOWED_PREFIX`
 * grounding check):
 *
 *   1. A **malformed or absent** envelope is a contract violation — re-dispatch or
 *      escalate. It must NEVER fold to "no findings" and read as a clean accept.
 *   2. A **valid but abstaining** envelope (`reviewer_status: "abstained"`)
 *      escalates even with `findings: []` — abstain is not a clean accept.
 *   3. A **blocking finding with an ungrounded citation** is a contract violation:
 *      severity that routes to a fix loop must cite an allowed prefix.
 *
 * Retiring the engine left all three unowned — a dispatched reviewer returning
 * garbage would silently produce zero findings, the exact silent-accept path the
 * independence rules exist to close. This script is that owner, and the
 * `spec-execution` skill runs it on every returned envelope at the integration gate.
 *
 * The validator is hand-rolled against `skills/review-envelope.schema.json`
 * (draft-07). It implements exactly the constraints that schema declares —
 * top-level `required`, enum membership, and the per-finding `severity` +
 * (`criterion` | `citation`) `anyOf` — plus the grounding rule above. It is
 * deliberately NOT a general JSON-Schema engine; if the schema grows a construct
 * beyond these, this file must grow with it.
 *
 * Usage:
 *   node scripts/sdlc/validate-review-envelope.mjs <envelope.json>
 *   … | node scripts/sdlc/validate-review-envelope.mjs -      # read stdin
 *
 * Exit codes (distinct so a caller can branch without parsing prose):
 *   0  valid AND assessed          → fold findings through the severity→action policy
 *   2  valid BUT abstained         → escalate (never accept)
 *   3  malformed / ungrounded      → contract violation: re-dispatch or escalate
 *   1  usage / internal error
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const EXIT_VALID = 0
export const EXIT_ABSTAINED = 2
export const EXIT_MALFORMED = 3

/**
 * Where the envelope schema lives, in priority order.
 *
 * It ships in the PLUGIN, so an adopting repo has no local copy — and this validator
 * decides at the integration gate whether findings fold or the review is a contract
 * violation. Pointing it at a single repo-relative path made every adopter's every
 * envelope exit 3. Both `skills/` and `.ai/skills/` resolve in the framework repo
 * because one is a symlink to the other, which is exactly why the single-path version
 * looked correct here and was broken everywhere else.
 */
const SCHEMA_CANDIDATES = [
    process.env.REVIEW_ENVELOPE_SCHEMA,
    process.env.CLAUDE_PLUGIN_ROOT && join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', 'review-envelope.schema.json'),
    join(__dirname, '..', '..', 'skills', 'review-envelope.schema.json'),
    join(__dirname, '..', '..', '.ai', 'skills', 'review-envelope.schema.json')
].filter(Boolean)

export const SCHEMA_FILE = SCHEMA_CANDIDATES.find((p) => existsSync(p)) ?? SCHEMA_CANDIDATES.at(-1)

/**
 * The canonical PR-side allowed-citation prefixes, owned by
 * `review-primitives.md` > PR-side canonical prefix table. Kept in lockstep with
 * that table and the schema by `scripts/sdlc/prefix-parity.test.mjs`.
 */
export const PR_SIDE_PREFIXES = ['ac:', 'adr:', 'std:', 'inv:', 'design:', 'lens:', 'monorepo:', 'task:', 'spec:']

/** Severities that route to a fix loop, and therefore must be grounded. */
const BLOCKING = new Set(['blocker', 'major'])

export function loadSchema(file = SCHEMA_FILE) {
    return JSON.parse(readFileSync(file, 'utf8'))
}

/** Does `value` satisfy this property subschema? Returns an error string or null. */
function checkProperty(name, value, sub) {
    if (value === undefined) return null
    if (Array.isArray(sub?.enum) && !sub.enum.includes(value)) {
        return `\`${name}\` must be one of ${JSON.stringify(sub.enum)} (got ${JSON.stringify(value)})`
    }
    const types = sub?.type == null ? null : Array.isArray(sub.type) ? sub.type : [sub.type]
    if (types) {
        const actual =
            value === null
                ? 'null'
                : Array.isArray(value)
                  ? 'array'
                  : Number.isInteger(value)
                    ? 'integer'
                    : typeof value
        const ok = types.some((t) => t === actual || (t === 'number' && actual === 'integer'))
        if (!ok) return `\`${name}\` must be ${types.join('|')} (got ${actual})`
    }
    return null
}

/**
 * The grounded citation a finding carries, if any. Coerced to a string: `criterion`
 * is type-flagged but not skipped, so an object or number here would otherwise throw
 * a TypeError out of `startsWith` — turning a contract violation (exit 3) into a
 * crash (exit 1), and making the exported validator throw at an in-process caller.
 */
const critOf = (f) => {
    const c = f && (f.criterion ?? f.citation)
    return typeof c === 'string' ? c : ''
}

/**
 * Validate a parsed envelope object against the canonical schema.
 * Returns { ok, abstained, errors }.
 *
 * Grounding is enforced on PR-side envelopes only (`artifact` absent or `"pr"`):
 * spec-side reviewers use a distinct prefix set, documented in
 * `review-primitives.md` > Spec-side prefix table.
 */
export function validateEnvelope(env, schema = loadSchema()) {
    const errors = []
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
        return { ok: false, abstained: false, errors: ['envelope is not a JSON object'] }
    }

    for (const req of schema.required ?? []) {
        if (env[req] === undefined) errors.push(`missing required top-level \`${req}\``)
    }
    for (const [name, sub] of Object.entries(schema.properties ?? {})) {
        if (name === 'findings') continue
        const err = checkProperty(name, env[name], sub)
        if (err) errors.push(err)
    }

    const prSide = env.artifact === undefined || env.artifact === 'pr'
    const findingsSchema = schema.properties?.findings
    if (env.findings !== undefined) {
        if (!Array.isArray(env.findings)) {
            errors.push('`findings` must be an array')
        } else {
            const item = findingsSchema?.items ?? {}
            env.findings.forEach((f, i) => {
                const at = `findings[${i}]`
                if (f === null || typeof f !== 'object' || Array.isArray(f)) {
                    errors.push(`${at} is not an object`)
                    return
                }
                for (const req of item.required ?? []) {
                    if (f[req] === undefined) errors.push(`${at} missing required \`${req}\``)
                }
                // The grounded-citation anyOf: `criterion` OR `citation`. Requiring
                // `criterion` alone would fail-validate every real envelope that emits
                // the `citation` alias and spuriously route a clean review to fix_loop.
                const anyOf = item.anyOf ?? []
                if (anyOf.length > 0) {
                    const satisfied = anyOf.some((branch) => (branch.required ?? []).every((k) => f[k] !== undefined))
                    if (!satisfied) {
                        const names = anyOf.map((b) => (b.required ?? []).join('+')).join(' | ')
                        errors.push(`${at} must carry a grounded citation (${names})`)
                    }
                }
                for (const [name, sub] of Object.entries(item.properties ?? {})) {
                    const err = checkProperty(`${at}.${name}`, f[name], sub)
                    if (err) errors.push(err)
                }
                // Rule 3: a finding that routes to a fix loop must be grounded in an
                // allowed prefix, or the fix loop is opened on an unciteable claim.
                if (prSide && BLOCKING.has(f.severity)) {
                    const cite = critOf(f)
                    if (!PR_SIDE_PREFIXES.some((p) => cite.startsWith(p))) {
                        errors.push(
                            `${at} is ${f.severity} but its citation ${JSON.stringify(cite)} is ungrounded ` +
                                `(allowed: ${PR_SIDE_PREFIXES.join(', ')})`
                        )
                    }
                }
            })
        }
    }

    const abstained = String(env.reviewer_status ?? 'assessed') === 'abstained'
    return { ok: errors.length === 0, abstained, errors }
}

function readInput(arg) {
    if (!arg || arg === '-') return readFileSync(0, 'utf8')
    return readFileSync(arg, 'utf8')
}

function main() {
    const arg = process.argv[2]
    let env
    try {
        env = JSON.parse(readInput(arg))
    } catch (err) {
        console.error(
            `✖ CONTRACT VIOLATION — envelope is absent or not parseable JSON (${err?.message ?? err}).\n` +
                `  Per review-primitives.md this is a validation failure: re-dispatch the reviewer ` +
                `or escalate. It must NOT be folded as "no findings".`
        )
        process.exit(EXIT_MALFORMED)
    }

    let ok, abstained, errors
    try {
        ;({ ok, abstained, errors } = validateEnvelope(env))
    } catch (err) {
        // An envelope that breaks the validator is a malformed envelope, not a clean
        // review. Never let an internal error read as anything but a contract violation.
        console.error(
            `✖ CONTRACT VIOLATION — the envelope could not be validated (${err?.message ?? err}).\n` +
                '  Re-dispatch the reviewer or escalate; do NOT treat this as a clean review.'
        )
        process.exit(EXIT_MALFORMED)
    }
    if (!ok) {
        console.error('✖ CONTRACT VIOLATION — envelope does not satisfy the canonical schema:')
        for (const e of errors) console.error(`  - ${e}`)
        console.error('  Re-dispatch the reviewer or escalate; do NOT treat this as a clean review.')
        process.exit(EXIT_MALFORMED)
    }
    if (abstained) {
        console.error(
            '✖ ABSTAINED — the reviewer could not assess (reviewer_status: "abstained").\n' +
                '  Escalate. An abstaining envelope is never an accept, even with findings: [].'
        )
        process.exit(EXIT_ABSTAINED)
    }
    const n = env.findings.length
    console.log(`✓ envelope valid (assessed, ${n} finding${n === 1 ? '' : 's'}) — fold via the severity→action policy.`)
    process.exit(EXIT_VALID)
}


/**
 * Is this module the process entry point? Compares realpath to realpath —
 * `import.meta.url` is already resolved by Node, so an unresolved `process.argv[1]`
 * (any symlinked path or symlinked ancestor directory) would never match, silently
 * turning this CLI into a no-op that still exits 0.
 */
function isMain(metaUrl) {
    const entry = process.argv[1]
    if (!entry) return false
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl))
    } catch {
        return resolve(entry) === fileURLToPath(metaUrl)
    }
}

// A failed guard here is the worst kind: the CLI exits 0 having validated nothing,
// and per the SOP exit 0 means "fold the findings" — so a garbage envelope would
// read as a clean accept, the exact silent-accept path this file exists to close.
if (isMain(import.meta.url)) {
    main()
}
