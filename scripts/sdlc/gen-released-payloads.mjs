#!/usr/bin/env node
/**
 * Build the released-payload manifest (SPEC-009 Design > Released-payload manifest).
 *
 * The migration and `/sdlc-sync` replace a framework file in an adopter repo only when
 * its bytes match a file the framework actually shipped, and keep it as a local edit
 * otherwise. This manifest is that record: for each file role (`scripts/<name>`,
 * `templates/<name>`, `contracts/<name>`, `workflows/<name>`, `state-machine`), the SHA-256 of every version
 * of it the payload has held, each with the plugin version it shipped in.
 *
 * It covers every commit that touched `init-payload/` up to HEAD, plus the working tree,
 * each labeled with the `.claude-plugin/plugin.json` version at that point (the repo has
 * no release tags). Stopping at the last version bump would leave out every payload fix
 * merged after it, and those ship in the same release. So any commit that changes the
 * payload regenerates this file, and `--check` in CI fails until it does. A copy taken
 * from a commit between releases counts as released, which is harmless: nobody edited it.
 *
 * Usage (plugin source only):
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-released-payloads.mjs           # write lib/released-payloads.json
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-released-payloads.mjs --check   # exit 1 when the file is stale
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { payloadRoleOf } from './lib/legacy-map.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
export const MANIFEST = join(HERE, 'lib', 'released-payloads.json')

const git = (args, opts = {}) => execFileSync('git', args, { cwd: REPO, maxBuffer: 1 << 28, ...opts })

/** The adopter-side role of a payload path (see legacy-map.mjs payloadRoleOf). */
export const roleOf = payloadRoleOf

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

function versionAt(commit) {
    try {
        return JSON.parse(git(['show', `${commit}:.claude-plugin/plugin.json`], { encoding: 'utf8' })).version ?? null
    } catch {
        return null
    }
}

/** Build the manifest object from git history. Throws on a shallow clone, which has no history to read. */
export function buildManifest() {
    if (git(['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true') {
        throw new Error('shallow clone: the manifest is built from history; fetch with fetch-depth: 0')
    }
    const working = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8')).version
    const commits = git(['rev-list', '--reverse', 'HEAD', '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    const roles = {}
    const add = (role, bytes, version) => {
        roles[role] ??= {}
        roles[role][sha256(bytes)] ??= version
    }
    for (const commit of commits) {
        const version = versionAt(commit)
        if (!version) continue
        const listing = git(['ls-tree', '-r', commit, '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
        for (const line of listing) {
            const [meta, path] = line.split('\t')
            const role = roleOf(path)
            if (role) add(role, git(['cat-file', 'blob', meta.split(' ')[2]]), version)
        }
    }
    const tracked = git(['ls-files', '--others', '--cached', '--exclude-standard', '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    for (const path of tracked) {
        const role = roleOf(path)
        if (role && existsSync(join(REPO, path))) add(role, readFileSync(join(REPO, path)), working)
    }
    const sorted = Object.fromEntries(Object.keys(roles).sort().map((r) => [r, roles[r]]))
    return { through_version: working, roles: sorted }
}

export const serialize = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`

/** The released versions a file's bytes match for `role`, or [] when it matches none (a local edit). */
export function releasedVersions(manifest, role, bytes) {
    const v = manifest.roles?.[role]?.[sha256(bytes)]
    return v ? [v] : []
}

export function loadManifest(file = MANIFEST) {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { roles: {} }
}

/**
 * The role/hash pairs `generated` has that `committed` lacks.
 *
 * A squash merge drops a branch's intermediate commits from main's history, so main
 * regenerates fewer hashes than the branch recorded. Those extra committed hashes are
 * copies from commits between releases, which count as released harmlessly, so the check
 * only asks that the committed file holds everything history shows.
 */
export function missingFrom(committed, generated) {
    const missing = []
    for (const [role, hashes] of Object.entries(generated.roles)) {
        for (const hash of Object.keys(hashes)) if (!committed.roles?.[role]?.[hash]) missing.push(`${role} ${hash.slice(0, 12)}`)
    }
    if (committed.through_version !== generated.through_version) missing.push(`through_version ${generated.through_version}`)
    return missing
}

/** `generated` plus every hash `committed` already records, so a rewrite never drops one. */
export function mergeManifests(committed, generated) {
    const roles = {}
    for (const role of new Set([...Object.keys(committed.roles ?? {}), ...Object.keys(generated.roles)])) {
        roles[role] = { ...(committed.roles?.[role] ?? {}), ...generated.roles[role] }
    }
    const sorted = Object.fromEntries(Object.keys(roles).sort().map((r) => [r, roles[r]]))
    return { through_version: generated.through_version, roles: sorted }
}

function main(argv) {
    const generated = buildManifest()
    const committed = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { roles: {} }
    if (argv.includes('--check')) {
        const missing = missingFrom(committed, generated)
        if (missing.length) {
            process.stderr.write(`released-payloads.json is stale: run gen-released-payloads.mjs and commit the result\n  missing: ${missing.slice(0, 10).join('\n  missing: ')}\n`)
            process.exit(1)
        }
        process.stdout.write(`released-payloads.json OK (${Object.keys(committed.roles).length} roles, through ${committed.through_version})\n`)
        return
    }
    const manifest = mergeManifests(committed, generated)
    writeFileSync(MANIFEST, serialize(manifest))
    process.stdout.write(`wrote ${MANIFEST} (${Object.keys(manifest.roles).length} roles)\n`)
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
