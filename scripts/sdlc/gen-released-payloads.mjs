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
 * It covers every commit that touched `init-payload/` up to and including the latest
 * commit that changed the plugin version, so the manifest only changes at a release.
 * The repo has no release tags; the version comes from `.claude-plugin/plugin.json` at
 * each commit. Regenerate it in every release commit (docs/RELEASING.md). While that
 * commit is being made, the working tree's `plugin.json` is ahead of the last bump, so the
 * manifest then covers every commit to HEAD plus the working tree's payload under the new
 * version. After the commit the same rule gives the same file, so `--check` stays green.
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
    const bump = git(['log', '-1', '--format=%H', '-G', '"version"', '--', '.claude-plugin/plugin.json'], { encoding: 'utf8' }).trim()
    if (!bump) throw new Error('no commit sets a version in .claude-plugin/plugin.json')
    const working = JSON.parse(readFileSync(join(REPO, '.claude-plugin', 'plugin.json'), 'utf8')).version
    const releasing = working !== versionAt(bump)
    const upTo = releasing ? 'HEAD' : bump
    const commits = git(['rev-list', '--reverse', upTo, '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
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
    if (releasing) {
        const tracked = git(['ls-files', '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
        for (const path of tracked) {
            const role = roleOf(path)
            if (role && existsSync(join(REPO, path))) add(role, readFileSync(join(REPO, path)), working)
        }
    }
    const sorted = Object.fromEntries(Object.keys(roles).sort().map((r) => [r, roles[r]]))
    return { through_version: releasing ? working : versionAt(bump), roles: sorted }
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

function main(argv) {
    const manifest = buildManifest()
    const text = serialize(manifest)
    if (argv.includes('--check')) {
        const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : ''
        if (current !== text) {
            process.stderr.write('released-payloads.json is stale: run gen-released-payloads.mjs and commit the result\n')
            process.exit(1)
        }
        process.stdout.write(`released-payloads.json OK (${Object.keys(manifest.roles).length} roles, through ${manifest.through_version})\n`)
        return
    }
    writeFileSync(MANIFEST, text)
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
