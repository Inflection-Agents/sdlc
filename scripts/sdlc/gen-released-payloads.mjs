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
 * each commit. Regenerate it in every release commit (docs/RELEASING.md).
 *
 * Usage (plugin source only):
 *   node scripts/sdlc/gen-released-payloads.mjs           # write lib/released-payloads.json
 *   node scripts/sdlc/gen-released-payloads.mjs --check   # exit 1 when the file is stale
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
export const MANIFEST = join(HERE, 'lib', 'released-payloads.json')

const git = (args, opts = {}) => execFileSync('git', args, { cwd: REPO, maxBuffer: 1 << 28, ...opts })

/**
 * The adopter-side role of a payload path, on either payload layout, or null for a file
 * the migration never classifies (workflows, stubs, the README).
 */
export function roleOf(payloadRel) {
    const p = payloadRel.replace(/^init-payload\//, '')
    let m
    if ((m = p.match(/^(?:scripts\/sdlc|\.sdlc\/scripts)\/(.+\.mjs)$/))) return m[1].includes('.test.') ? null : `scripts/${m[1]}`
    if ((m = p.match(/^(?:templates|\.sdlc\/templates)\/([^/]+\.md)$/))) return `templates/${m[1]}`
    if ((m = p.match(/^(?:\.ai\/skills|\.sdlc\/contracts)\/(review-primitives\.md|review-envelope\.schema\.json)$/))) {
        return `contracts/${m[1]}`
    }
    if (p === 'sdlc-state-machine.yaml' || p === '.sdlc/state-machine.yaml') return 'state-machine'
    if ((m = p.match(/^\.github\/workflows\/([^/]+\.ya?ml)$/))) return `workflows/${m[1]}`
    return null
}

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
    const commits = git(['rev-list', '--reverse', bump, '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    const roles = {}
    for (const commit of commits) {
        const version = versionAt(commit)
        if (!version) continue
        const listing = git(['ls-tree', '-r', commit, '--', 'init-payload/'], { encoding: 'utf8' }).split('\n').filter(Boolean)
        for (const line of listing) {
            const [meta, path] = line.split('\t')
            const role = roleOf(path)
            if (!role) continue
            const blob = meta.split(' ')[2]
            const hash = sha256(git(['cat-file', 'blob', blob]))
            roles[role] ??= {}
            roles[role][hash] ??= version
        }
    }
    const sorted = Object.fromEntries(Object.keys(roles).sort().map((r) => [r, roles[r]]))
    return { through: bump, roles: sorted }
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
            process.stderr.write('released-payloads.json is stale: run node scripts/sdlc/gen-released-payloads.mjs\n')
            process.exit(1)
        }
        process.stdout.write(`released-payloads.json OK (${Object.keys(manifest.roles).length} roles, through ${manifest.through.slice(0, 7)})\n`)
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
