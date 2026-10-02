#!/usr/bin/env node
/**
 * Generate `specs/spec-index.json`, the agent-readable index of specs, ADRs, bugs and gaps, in
 * the shape `skills/spec-schema.md` > `spec-index.json` documents (SPEC-007 > Design > Lever 7).
 * `spec-authoring` reads it for the next id, active-spec collisions, and the `downstream_specs`
 * reviewer input, which needs every spec's `depends_on`.
 *
 * Archived records are indexed too, at their `specs/archive/` path, so an id never disappears
 * from the index when its spec closes. The output carries no timestamp, so the same corpus
 * always produces the same bytes and `--check` is exact.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs gen-spec-index            # write specs/spec-index.json
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs gen-spec-index --check    # exit 1 if it is stale
 *
 * Exit codes: 0 written or current; 1 stale or missing under --check. A missing index is
 * accepted only while the corpus has no records at all.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'
import { parseFrontmatter, sectionLines } from './validate-guide.mjs'
import { parseList } from './validate-spec.mjs'

// Every checkbox under Acceptance criteria counts, with or without an AC-NNN id: SPEC-006 has none.
const AC_BOX = /^\s*[-*+] \[([ xX])\] \S/

/** `name.md` files whose name starts with `prefix-NNN`, in each existing directory. */
function records(dirs, prefix) {
    const re = new RegExp(`^${prefix}-\\d+.*\\.md$`, 'i')
    return dirs
        .filter((d) => existsSync(d))
        .flatMap((d) => readdirSync(d).filter((f) => re.test(f)).map((f) => join(d, f)))
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const orNull = (v) => (v === undefined || v === '' ? null : v)
const list = (v) => parseList(v) ?? []

/** The index object for the repo at `root`. */
export function buildIndex(root) {
    const specsDir = sdlcPaths(root, { quiet: true }).specs
    const archive = join(specsDir, 'archive')
    const rel = (p) => relative(root, p).split('\\').join('/')
    const load = (dirs, prefix) =>
        records(dirs, prefix)
            .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
            .map((r) => ({ ...r, fm: parseFrontmatter(r.text) }))
            .filter((r) => r.fm.id)

    const gaps = load([join(specsDir, 'gaps'), join(archive, 'gaps')], 'GAP')
        .map(({ path, fm }) => ({
            id: fm.id,
            title: orNull(fm.title),
            status: orNull(fm.status),
            resolution: orNull(fm.resolution),
            created: orNull(fm.created),
            spec: orNull(fm.spec),
            path: rel(path),
        }))
        .sort(byId)

    const specs = load([specsDir, join(archive, 'specs')], 'SPEC')
        .map(({ path, text, fm }) => {
            const boxes = (sectionLines(text, 'Acceptance criteria') ?? []).map((l) => l.match(AC_BOX)).filter(Boolean)
            return {
                id: fm.id,
                title: orNull(fm.title),
                status: orNull(fm.status),
                version: /^\d+$/.test(String(fm.version)) ? Number(fm.version) : orNull(fm.version),
                path: rel(path),
                initiative: orNull(fm.initiative),
                owner: orNull(fm.owner),
                workspaces: list(fm.workspaces),
                tags: list(fm.tags),
                depends_on: list(fm.depends_on),
                acceptance_criteria_count: boxes.length,
                acceptance_criteria_done: boxes.filter((m) => m[1] !== ' ').length,
                gaps: gaps.filter((g) => g.spec === fm.id).map(({ id, status, resolution, created }) => ({ id, status, resolution, created })),
            }
        })
        .sort(byId)

    const adrs = load([join(specsDir, 'adrs'), join(archive, 'adrs')], 'ADR')
        .map(({ path, fm }) => ({ id: fm.id, title: orNull(fm.title), status: orNull(fm.status), spec: orNull(fm.spec), path: rel(path) }))
        .sort(byId)

    const bugs = load([join(specsDir, 'bugs'), join(archive, 'bugs')], 'BUG')
        .map(({ path, fm }) => ({
            id: fm.id,
            title: orNull(fm.title),
            status: orNull(fm.status),
            severity: orNull(fm.severity),
            violates: orNull(fm.violates),
            path: rel(path),
        }))
        .sort(byId)

    return { specs, adrs, bugs, gaps }
}

export const render = (index) => `${JSON.stringify(index, null, 2)}\n`

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const target = join(sdlcPaths(root, { quiet: true }).specs, 'spec-index.json')
    const index = buildIndex(root)
    const want = render(index)
    if (rest.includes('--check')) {
        const have = existsSync(target) ? readFileSync(target, 'utf8') : null
        // A repo with no specs, ADRs, bugs or gaps yet has nothing an index could be stale about,
        // which is every repo /sdlc-init has just set up. Once one record exists the index must too.
        const empty = Object.values(index).every((a) => a.length === 0)
        if (have === null && empty) {
            process.stdout.write('no specs to index yet\n')
            return
        }
        if (have !== want) {
            process.stderr.write(
                `${relative(root, target)} is ${have === null ? 'missing' : 'stale'}.\n` +
                    'Run: node .sdlc/scripts/gen-spec-index.mjs and commit the result.\n'
            )
            process.exit(1)
        }
        process.stdout.write(`${relative(root, target)} OK\n`)
        return
    }
    writeFileSync(target, want, 'utf8')
    process.stdout.write(`wrote ${relative(root, target)}\n`)
}

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
