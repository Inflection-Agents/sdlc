#!/usr/bin/env node
/**
 * Fail when a superseded decision is cited as current authority.
 *
 * Runs CORPUS-WIDE, with no changed-file scope. Every other gate in
 * `sdlc-validate.yml` grades what a PR touched, which is exactly how a stale
 * citation survives: the defect sits in a file nobody is editing.
 *
 * SCOPED BY BLAST RADIUS, not by document. A superseded ADR cited as live in
 * always-loaded context is what misleads an agent on its next run, so that fails the
 * build. The same citation in a spec body or a test name is legitimate history —
 * a completed spec records the decision that was current when it was written — so
 * that is reported and passes. A gate that cries wolf on the second case gets
 * deleted, and then the first case survives too.
 *
 * A line that names the successor is acknowledged, not stale.
 *
 * Usage:
 *   node scripts/sdlc/check-stale-citations.mjs            # fail on always-loaded hits
 *   node scripts/sdlc/check-stale-citations.mjs --strict   # fail on reported hits too
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(p, 'utf8')

/** Paths loaded into an agent's context on every run, where a stale citation acts. */
const ALWAYS_LOADED = [/^\.ai\//, /^\.claude\/(agents|hooks|skills)\//, /^(AGENTS|CLAUDE|GEMINI)\.md$/]

/** Where an id's own supersession record lives; grading it against itself is noise. */
const SELF_RECORD = /^specs\/adrs\//

/**
 * How much a stale citation in this file costs.
 *
 * `fail` — always-loaded context; an agent reads it as current on the next run.
 * `report` — history: spec bodies, tests, plans, docs.
 * `skip` — the ADR corpus itself, which is where supersession is recorded.
 */
export function blastRadius(rel) {
    const p = String(rel).replace(/\\/g, '/')
    if (SELF_RECORD.test(p)) return 'skip'
    if (ALWAYS_LOADED.some((re) => re.test(p))) return 'fail'
    return 'report'
}

/** A citation that names its successor is acknowledged, not stale. */
export function isAcknowledged(line, staleId, successorId) {
    return String(line).includes(successorId)
}

/**
 * Map of WHOLLY superseded id -> successor id, read from frontmatter only.
 *
 * Document-level supersession is the only kind this gate can act on, and the
 * distinction is not pedantic. ADR-003 has ONE ROW reversed by ADR-004; its status is
 * still `accepted` and its `superseded_by` is deliberately empty, because stamping
 * the whole ADR dead over one row would be false. Every other row — single-executor
 * delivery, the goal leash, the branch discipline — remains live authority that the
 * corpus correctly cites 97 times.
 *
 * An earlier revision of this file also matched the inline `**SUPERSEDED by ADR-NNN`
 * row annotation, and flagged all 97 of those citations, 32 of them as build
 * failures. Every one was correct as written. A gate that cries wolf on valid
 * citations gets deleted, and then the citations it existed to catch survive too.
 *
 * A row-level reversal is therefore out of scope here by construction: no automated
 * check can tell which of an ADR's rows a given citation relies on. That is a
 * reviewer's judgment, and the inline annotation on the row is what informs it.
 */
export function supersededIds(docs) {
    const out = new Map()
    for (const { id, text } of docs) {
        const front = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (!front) continue
        const fm = front[1].match(/^superseded_by:\s*['"]?(ADR-\d+)/m)
        if (fm) out.set(id, fm[1])
    }
    return out
}

/**
 * Sort citations into build failures and reports.
 *
 * Pure, and exported so the FAIL path is exercised by a fixture rather than by
 * whatever the corpus happens to contain. A gate whose failure branch has never run
 * is a gate nobody has tested.
 */
export function classify(files, superseded) {
    const failures = []
    const reports = []
    for (const { path, text } of files) {
        const radius = blastRadius(path)
        if (radius === 'skip') continue
        const lines = String(text).split('\n')
        for (const [staleId, successorId] of superseded) {
            lines.forEach((line, i) => {
                if (!line.includes(staleId)) return
                if (isAcknowledged(line, staleId, successorId)) return
                const hit = `${path}:${i + 1}  cites ${staleId} (superseded by ${successorId})`
                if (radius === 'fail') failures.push(hit)
                else reports.push(hit)
            })
        }
    }
    return { failures, reports }
}

function walk(dir, onFile, depth = 8) {
    if (!existsSync(dir) || depth < 0) return
    for (const entry of readdirSync(dir)) {
        if (entry === '.git' || entry === 'node_modules') continue
        const p = join(dir, entry)
        let st
        try {
            // lstat, never stat: .claude/skills is a symlink to .ai/skills, and a
            // following walk reports every skill finding twice under two paths.
            st = lstatSync(p)
        } catch {
            continue
        }
        if (st.isSymbolicLink()) continue
        if (st.isDirectory()) walk(p, onFile, depth - 1)
        else if (/\.(md|mjs|js|ya?ml|json)$/.test(entry)) onFile(p)
    }
}

function main(argv) {
    const strict = argv.includes('--strict')

    const adrDir = join(ROOT, 'specs', 'adrs')
    const docs = existsSync(adrDir)
        ? readdirSync(adrDir)
              .filter((f) => f.endsWith('.md'))
              .map((f) => ({ id: (f.match(/^(ADR-\d+)/) || [])[1], text: read(join(adrDir, f)) }))
              .filter((d) => d.id)
        : []

    const superseded = supersededIds(docs)
    if (!superseded.size) {
        process.stdout.write('no superseded decisions declared; nothing to check.\n')
        return
    }

    const files = []
    walk(ROOT, (p) => files.push({ path: relative(ROOT, p).replace(/\\/g, '/'), text: read(p) }))
    const { failures, reports } = classify(files, superseded)

    for (const r of reports) process.stdout.write(`  report  ${r}\n`)
    if (reports.length) {
        process.stdout.write(
            `\n${reports.length} citation(s) outside always-loaded context — history, not a defect.\n`
        )
    }

    const hard = strict ? [...failures, ...reports] : failures
    if (hard.length) {
        process.stderr.write(`\nstale citations in always-loaded context:\n`)
        for (const f of hard) process.stderr.write(`  FAIL  ${f}\n`)
        process.stderr.write(
            `\nA superseded decision cited here is read as current on the next agent run.\n` +
                `Name the successor on the same line, or cite the successor instead.\n`
        )
        process.exit(1)
    }
    process.stdout.write(`stale-citation check OK (${superseded.size} superseded decision(s) tracked)\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2))
}
