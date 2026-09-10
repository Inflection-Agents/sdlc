#!/usr/bin/env node
/**
 * Grade a repo's own constraints registry.
 *
 * This is what `/sdlc:init` Phase 3 runs to prove an interview-generated registry
 * before keeping it. It exists because the obvious alternative does not work: the
 * framework's `*.test.mjs` files grade the FRAMEWORK's corpus, they do not travel to
 * an adopting repo, and `node --test` on an unmatched glob exits 0 — so a "prove it"
 * step built on them reports success having verified nothing.
 *
 * FAILS LOUDLY on nothing-to-check. A registry that is missing, unparseable, or
 * silently empty when rows were expected is reported, not passed over. Every other
 * gate in this framework that failed open has eventually hidden a real defect.
 *
 * What it grades:
 *   1. The registry exists and parses.
 *   2. Every row has an id, a lens, and a check.
 *   3. Every `cite` carries a grounded prefix — a reviewer cannot ground a finding
 *      on a citation the envelope validator rejects.
 *   4. Every `severity` is in the ladder.
 *   5. Every `scope` is task or integration.
 *
 * Glob RESOLVABILITY is deliberately not checked here — `check-review-constraint-globs.mjs`
 * owns it and already has warn/enforce modes. A second glob engine in a second file is
 * how two checkers end up disagreeing about the same row, which this codebase has
 * already been bitten by once.
 *
 * What it cannot grade: whether a rule that resolves cleanly is the RIGHT rule. No
 * gate can. That is why the interview asks rather than infers.
 *
 * Usage:
 *   node scripts/sdlc/validate-constraints-registry.mjs
 *   node scripts/sdlc/validate-constraints-registry.mjs --allow-empty   # pre-interview
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const REGISTRY = join(ROOT, '.ai', 'sdlc', 'review-constraints.yaml')

/** Mirrors PR_SIDE_PREFIXES in validate-review-envelope.mjs. */
const GROUNDED_PREFIXES = ['ac:', 'adr:', 'std:', 'inv:', 'design:', 'lens:', 'monorepo:', 'task:', 'spec:']
const SEVERITIES = new Set(['blocker', 'major', 'nit', 'suggestion'])
const SCOPES = new Set(['task', 'integration'])

export function gradeRows(rows) {
    const problems = []
    for (const c of rows) {
        const id = c?.id ?? '(row with no id)'
        if (!c?.id) problems.push('a row declares no `id`; a reviewer cites the id verbatim')
        if (!c?.lens) problems.push(`${id}: no \`lens\`, so it routes to no reviewer`)
        if (!c?.check) problems.push(`${id}: no \`check\`, so a reviewer is told nothing to verify`)

        if (c?.severity && !SEVERITIES.has(c.severity)) {
            problems.push(`${id}: severity "${c.severity}" is not blocker|major|nit|suggestion`)
        }
        if (c?.scope && !SCOPES.has(c.scope)) {
            problems.push(`${id}: scope "${c.scope}" is not task|integration`)
        }
        if (!c?.cite) {
            problems.push(`${id}: no \`cite\`, so a finding enforcing it cannot be grounded`)
        } else if (!GROUNDED_PREFIXES.some((p) => String(c.cite).startsWith(p))) {
            problems.push(
                `${id}: cite "${c.cite}" has no grounded prefix (${GROUNDED_PREFIXES.join(' ')}) — ` +
                    `the envelope validator rejects a blocking finding citing it`
            )
        }

        for (const g of c?.when?.touches ?? []) {
            if (typeof g !== 'string') problems.push(`${id}: a when.touches entry is not a string`)
        }
    }
    return problems
}

async function main(argv) {
    const allowEmpty = argv.includes('--allow-empty')

    if (!existsSync(REGISTRY)) {
        process.stderr.write(
            `constraints registry not found at .ai/sdlc/review-constraints.yaml\n` +
                `Run /sdlc:init, or create it from the stub.\n`
        )
        process.exit(1)
    }

    let rows
    try {
        // loadConstraints, NOT parseConstraints: the latter reads only the routing
        // keys by design, so `check` and `cite` come back undefined and every row
        // looks broken. The enrichment is what joins in touches, check and cite.
        const { loadConstraints } = await import(new URL('./reviewer-routing.mjs', import.meta.url).href)
        rows = loadConstraints(REGISTRY)
    } catch (err) {
        process.stderr.write(`constraints registry could not be read: ${err.message}\n`)
        process.exit(1)
    }

    if (rows.length === 0) {
        const msg = 'constraints registry has no rows'
        if (allowEmpty) {
            process.stdout.write(`${msg} (--allow-empty) — review runs on the base lenses only\n`)
            return
        }
        process.stderr.write(
            `${msg}.\n` +
                `That is the pre-interview state. Run /sdlc:init to fill it, or pass\n` +
                `--allow-empty if you deliberately run with base lenses only.\n`
        )
        process.exit(1)
    }

    const problems = gradeRows(rows)
    if (problems.length) {
        process.stderr.write(`constraints registry is invalid:\n${problems.map((p) => `  ${p}\n`).join('')}`)
        process.exit(1)
    }
    process.stdout.write(`constraints registry OK (${rows.length} row(s) graded)\n`)
}

/**
 * Direct-invocation guard. `import.meta.url` is realpath'd and `argv[1]` is not, so a
 * raw comparison makes this a silent no-op through a symlinked path.
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

if (isMain(import.meta.url)) await main(process.argv.slice(2))
