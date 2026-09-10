#!/usr/bin/env node
/**
 * Resolve a SPEC / TASK / ADR id to its file, live or archived.
 *
 * Archiving works because `specs/archive/**` is hidden from ripgrep (see `.ignore`),
 * so a default search cannot surface a document whose authority has expired. That
 * only stays a net win if the archive remains ADDRESSABLE: ids are how the corpus
 * refers to itself, so this is the address lookup. Ship the fence without this and
 * archiving is a trap rather than a filter.
 *
 * Reads the filesystem directly, so ripgrep's ignore rules do not apply here.
 *
 * Usage:
 *   node scripts/sdlc/resolve.mjs SPEC-004         # -> path, status, archived?
 *   node scripts/sdlc/resolve.mjs ADR-004 --print  # -> path plus file contents
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(p, 'utf8')

/**
 * The directories to search for an id, LIVE ROOT FIRST.
 *
 * Order matters: a spec that was archived and then reopened exists in both places
 * for the length of one commit, and the live copy is the one that governs.
 */
export function rootsFor(id) {
    const kind = String(id).split('-')[0].toUpperCase()
    return (
        {
            SPEC: ['specs', 'specs/archive/specs'],
            TASK: ['specs/tasks', 'specs/archive/tasks'],
            ADR: ['specs/adrs', 'specs/archive/adrs']
        }[kind] || ['specs']
    )
}

/**
 * Whether a filename carries this id.
 *
 * Anchored at the start and requires a `-` or `.` separator, so `SPEC-004` does not
 * match `SPEC-0041-other.md` and a mention inside a longer name is not a hit. The id
 * is compared verbatim, so `SPEC-4` does not resolve `SPEC-004`: the corpus writes
 * ids zero-padded and accepting the short form would silently resolve the wrong file
 * once a repo passes a hundred specs.
 */
export function matchesId(id, filename) {
    const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${esc}[-.]`, 'i').test(filename)
}

/** Frontmatter field lookup, leading block only. */
function frontmatterField(text, field) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return null
    const f = m[1].match(new RegExp(`^${field}:\\s*['"]?([^'"\\n]+)`, 'm'))
    return f ? f[1].trim() : null
}

function walk(dir, onFile, depth = 6) {
    if (!existsSync(dir) || depth < 0) return
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        // lstat, not stat: .claude/skills is a symlink to skills elsewhere in the
        // repo, and a following walk would read the same file under two paths.
        let st
        try {
            st = lstatSync(p)
        } catch {
            continue
        }
        if (st.isSymbolicLink()) continue
        if (st.isDirectory()) walk(p, onFile, depth - 1)
        else onFile(p, entry)
    }
}

export function findById(id, root = ROOT) {
    const hits = []
    const seen = new Set()
    for (const r of rootsFor(id)) {
        walk(join(root, r), (p, name) => {
            if (name.endsWith('.md') && matchesId(id, name) && !seen.has(p)) {
                seen.add(p)
                hits.push(p)
            }
        })
    }
    return hits
}

function main(argv) {
    const wantPrint = argv.includes('--print')
    const id = argv.find((a) => !a.startsWith('--'))
    if (!id) {
        process.stderr.write('usage: node scripts/sdlc/resolve.mjs <SPEC-NNN|TASK-NNN|ADR-NNN> [--print]\n')
        process.exit(2)
    }

    const hits = findById(id)
    if (!hits.length) {
        process.stderr.write(`resolve: no file found for ${id}\n`)
        process.exit(1)
    }

    for (const p of hits) {
        const rel = relative(ROOT, p)
        const text = read(p)
        const status = frontmatterField(text, 'status')
        const archived = rel.includes(`archive${'/'}`)
        process.stdout.write(`${rel}${status ? `  [${status}]` : ''}${archived ? '  (archived)' : ''}\n`)
        if (wantPrint) process.stdout.write(`\n${text}\n`)
    }
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
        return resolvePath(entry) === fileURLToPath(metaUrl)
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2))
