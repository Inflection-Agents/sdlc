#!/usr/bin/env node
/**
 * Grade whether a spec's success criteria are all met.
 *
 * GRADES ONLY. It does not flip status, move files, or regenerate indexes. Whether
 * the evidence actually substantiates each criterion is judgment, and that stays
 * with the human at the integration PR, where it is already being read.
 *
 * The narrower scope is also a fact about this repo: there is no index generator to
 * re-run, and `.ai/CLAUDE.md` states the framework does not ship the auto-merge lane
 * a writing workflow would need. A writer here would open bookkeeping PRs nobody
 * merges, which is the manual chore it exists to remove, relocated.
 *
 * REFUSES RATHER THAN GUESSES. A missing section, an empty section, a non-active
 * status, or any unchecked box all return `completable: false` with a reason.
 *
 * Usage:
 *   node scripts/sdlc/complete-spec.mjs SPEC-003    # exit 0 completable, 1 not
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(p, 'utf8')

/** Statuses this gate may act on. Everything else is terminal or not yet started. */
const GRADABLE = new Set(['active'])

/**
 * The body of the `## Success criteria` section, with fenced code blocks removed.
 *
 * A template inside a fence is an example, not a criterion; counting it would let a
 * documentation block decide whether a spec is done.
 */
function criteriaSection(body) {
    // Strip fences from the WHOLE document before locating the heading. Doing it after
    // the slice defeats the purpose twice over: a fenced template heading above the
    // real section is found first, and a fence opened inside the section but closed
    // after the next `##` is orphaned by the slice, so the strip becomes a no-op and
    // its example criteria are graded.
    const lines = String(body)
        .replace(/\r\n?/g, '\n')
        .replace(/```[\s\S]*?```/g, '')
        .split('\n')
    const start = lines.findIndex((l) => /^##\s+Success criteria\s*$/i.test(l.trim()))
    if (start === -1) return null
    const rest = lines.slice(start + 1)
    const end = rest.findIndex((l) => /^##\s+/.test(l))
    return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/** Every unchecked `- [ ]` item in the success-criteria section, text only. */
export function uncheckedCriteria(body) {
    const section = criteriaSection(body)
    if (section === null) return []
    return [...section.matchAll(/^\s*[-*]\s*\[ \]\s*(.+?)\s*$/gm)].map((m) => m[1])
}

/** Every checked `- [x]` item in the success-criteria section. */
function checkedCriteria(body) {
    const section = criteriaSection(body)
    if (section === null) return []
    return [...section.matchAll(/^\s*[-*]\s*\[[xX]\]\s*(.+?)\s*$/gm)].map((m) => m[1])
}

/**
 * Whether a spec may be marked complete, and why not when it may not.
 */
export function completability({ status, body }) {
    const s = String(status ?? '').toLowerCase()
    if (!GRADABLE.has(s)) {
        return {
            completable: false,
            blocking: [],
            reason: `status is \`${s || 'unset'}\`, not \`active\` — a terminal or unstarted spec is not graded here (superseded and cancelled are left alone: replaced is not finished)`
        }
    }

    const section = criteriaSection(body)
    if (section === null) {
        return { completable: false, blocking: [], reason: 'no `## Success criteria` section — refusing rather than guessing' }
    }

    const unchecked = uncheckedCriteria(body)
    const checked = checkedCriteria(body)

    // Zero criteria is NOT zero unchecked criteria. An empty section auto-completing
    // is the one failure this gate exists to prevent.
    if (!unchecked.length && !checked.length) {
        return {
            completable: false,
            blocking: [],
            reason: 'the `## Success criteria` section is empty or holds no criteria — zero criteria is not zero unchecked criteria'
        }
    }

    if (unchecked.length) {
        return { completable: false, blocking: unchecked, reason: `${unchecked.length} success criterion/criteria still unchecked` }
    }

    return { completable: true, blocking: [], reason: `all ${checked.length} success criteria are checked` }
}

function frontmatterStatus(text) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return null
    const f = m[1].match(/^status:\s*['"]?([A-Za-z-]+)/m)
    return f ? f[1].toLowerCase() : null
}

/** Find a spec file by id, live or archived. */
function findSpec(id) {
    for (const dir of [join(ROOT, 'specs'), join(ROOT, 'specs', 'archive', 'specs')]) {
        if (!existsSync(dir)) continue
        const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const hit = readdirSync(dir).find((f) => new RegExp(`^${esc}[-.]`, 'i').test(f) && f.endsWith('.md'))
        if (hit) return join(dir, hit)
    }
    return null
}

function main(argv) {
    const id = argv.find((a) => !a.startsWith('--'))
    if (!id) {
        process.stderr.write('usage: node scripts/sdlc/complete-spec.mjs <SPEC-NNN>\n')
        process.exit(2)
    }

    const path = findSpec(id)
    if (!path) {
        process.stderr.write(`complete-spec: no spec file found for ${id}\n`)
        process.exit(2)
    }

    const body = read(path)
    const r = completability({ status: frontmatterStatus(body), body })

    process.stdout.write(`${id}: ${r.completable ? 'COMPLETABLE' : 'NOT COMPLETABLE'}\n`)
    process.stdout.write(`  ${r.reason}\n`)
    for (const c of r.blocking) process.stdout.write(`  unchecked: ${c}\n`)
    if (!r.completable) process.exit(1)
}

/**
 * Whether this file was invoked directly.
 *
 * `import.meta.url` is already realpath'd by Node; `process.argv[1]` is not, so a raw
 * comparison silently turns the CLI into a no-op that still exits 0 when invoked
 * through a symlinked path or symlinked ancestor directory. This repo fixed that once
 * already; `cli-invocation.test.mjs` is the regression suite.
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

if (isMain(import.meta.url)) main(process.argv.slice(2))
