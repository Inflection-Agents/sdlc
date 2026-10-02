#!/usr/bin/env node
/**
 * Find layout-1 references left in a repo (SPEC-009 Design > Legacy map).
 *
 * The migration rewrites every slash-form path it can. What it cannot fix with a text
 * edit is flagged here instead, because a reader that misses its file usually goes
 * silent rather than failing:
 * - a layout-1 path built from quoted segments in a `join` call;
 * - a quoted literal naming the layout-1 agent-config folder, in code;
 * - a `'..'` join in a file whose directory depth changed;
 * - code that reads `domain_routing` without going through `loadMachine`;
 * - a schema that requires `domain_routing`;
 * - an escaped layout-1 prefix in a regular expression;
 * - a skill that edits a workspace table that now lives in `config.yaml`;
 * - a relative path whose target is gone.
 *
 * It reads every git-tracked text file except history (archived or closed records, review
 * logs, decision ledgers, *.jsonl), the globs in `config.yaml` `scan.allow`, and its own
 * built-in exemptions (the map, the resolver, the manifest, tests and fixtures).
 *
 * Usage:
 *   node .sdlc/scripts/scan-legacy-paths.mjs [--root <dir>] [--only a,b] [--no-allow] [--json]
 *
 * Exit codes: 0 no hits, 3 hits (each printed as file:line), 1 the repo cannot be read.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { join, matchesGlob, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { frontmatterStatus, isBuiltInExempt, isHistory, mapEntries, scanText } from './lib/legacy-map.mjs'
import { readConfig, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

export const BINARY = /\.(?:png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|eot|mp4|mov|parquet|db|sqlite)$/i

function trackedFiles(root) {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    return out.split('\0').filter(Boolean)
}

/** A file's text, or null for a symlink, a binary file (one holding a NUL byte) or an unreadable path. */
export function readText(abs) {
    try {
        if (lstatSync(abs).isSymbolicLink()) return null
        const buf = readFileSync(abs)
        return buf.includes(0) ? null : buf.toString('utf8')
    } catch {
        return null
    }
}

/**
 * The old-to-new renames of the migration commit (`sdlc: migrate to layout 2`) in this
 * branch's history, or an empty map when there is none. A scan run after the migration
 * commit, as the owner runs it while fixing hits, still knows which files moved.
 */
export function movesFromHistory(root) {
    const moves = new Map()
    let commit
    try {
        // The migration commit's subject, or the same line in a squash merge's body.
        commit = execFileSync('git', ['log', '-1', '--format=%H', '-E', '--grep=^(\\* )?sdlc: migrate to layout 2$'], {
            cwd: root,
            encoding: 'utf8',
        }).trim()
    } catch {
        return moves
    }
    if (!commit) return moves
    let diff
    try {
        // A shallow clone (CI checks out depth 1) may not hold the parent: no moves are known then.
        execFileSync('git', ['rev-parse', '--verify', '--quiet', `${commit}^`], { cwd: root, stdio: 'ignore' })
        diff = execFileSync('git', ['diff', '--name-status', '-M', `${commit}^`, commit], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
    } catch {
        return moves
    }
    for (const line of diff.split('\n')) {
        const [kind, from, to] = line.split('\t')
        if (kind?.startsWith('R') && from && to) moves.set(from, to)
    }
    return moves
}

/**
 * Every hit in `root`, as `{ file, line, form, snippet }`.
 * `moves` is the migration's old-to-new map, when the caller has one, so moved files are
 * checked for depth changes and relative paths.
 */
export function scanRepo(root, { only = null, useAllow = true, moves = null } = {}) {
    const config = readConfig(root) ?? {}
    const paths = sdlcPaths(root, { quiet: true })
    // Detection does not depend on the repo's shape: every layout-1 path either shape had is legacy.
    const byFrom = new Map()
    for (const e of [...mapEntries({ forked: true }), ...mapEntries({ forked: false })]) byFrom.set(e.from, e)
    let entries = [...byFrom.values()].sort((a, b) => b.from.length - a.from.length)
    // A path the config names as current is not legacy, whatever the map says.
    const configured = new Set(Object.values(config.paths ?? {}).map((p) => String(p).replace(/\/$/, '')))
    entries = entries.filter((e) => !configured.has(e.from.replace(/\/$/, '')))
    const allow = useAllow ? (config.scan?.allow ?? []) : []
    const specsRel = relative(root, paths.specs) || 'specs'
    const skillsRel = paths.skills ? relative(root, paths.skills) : null
    const read = (rel) => readText(join(root, rel)) ?? ''
    const tracked = trackedFiles(root)
    const specStatus = (id) => {
        const hit = tracked.find((f) => f.startsWith(`${specsRel}/${id}-`) && f.endsWith('.md'))
        return hit ? frontmatterStatus(read(hit)) : null
    }
    const newToOld = new Map([...(moves ?? movesFromHistory(root))].map(([o, n]) => [n, o]))
    const existsNow = (rel) => existsSync(join(root, rel))

    const hits = []
    for (const rel of tracked) {
        if (only && !only.some((d) => rel === d || rel.startsWith(`${d.replace(/\/$/, '')}/`))) continue
        if (BINARY.test(rel)) continue
        if (allow.some((g) => matchesGlob(rel, g))) continue
        if (isHistory(rel, { specsRel, specStatus, read })) continue
        const old = newToOld.get(rel)
        const depthChanged = old !== undefined && old.split('/').length !== rel.split('/').length
        // Tests and fixtures spell layout-1 paths on purpose, so they are exempt, except that a
        // test the migration moved to a new depth still has its '..' joins checked.
        const exempt = isBuiltInExempt(rel)
        if (exempt && !depthChanged) continue
        const text = readText(join(root, rel))
        if (text === null) continue
        const inSkills = skillsRel !== null && rel.startsWith(`${skillsRel}/`)
        for (const h of scanText(text, { rel, entries, moved: old !== undefined, old: old ?? null, depthChanged, existsNow, inSkills })) {
            if (!exempt || h.form === "'..'-join") hits.push({ file: rel, ...h })
        }
    }
    return hits
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    sdlcPaths(root) // prints the one-line notice on a layout-1 repo, as every gate does
    const onlyArg = rest.find((a) => a.startsWith('--only'))
    let onlyValue = null
    if (onlyArg?.includes('=')) onlyValue = onlyArg.split('=')[1]
    else if (onlyArg) onlyValue = rest[rest.indexOf(onlyArg) + 1]
    let hits
    try {
        hits = scanRepo(root, { only: onlyValue ? onlyValue.split(',') : null, useAllow: !rest.includes('--no-allow') })
    } catch (err) {
        process.stderr.write(`scan-legacy-paths: cannot scan ${root}: ${err.message}\n`)
        process.exit(1)
    }
    if (rest.includes('--json')) process.stdout.write(`${JSON.stringify(hits, null, 2)}\n`)
    else for (const h of hits) process.stdout.write(`${h.file}:${h.line}  [${h.form}]  ${h.snippet}\n`)
    if (hits.length) {
        process.stderr.write(`\n${hits.length} layout-1 reference(s) left. Fix each one; a reader that misses its file goes silent.\n`)
        process.exit(3)
    }
    process.stdout.write('scan-legacy-paths: no layout-1 references\n')
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
