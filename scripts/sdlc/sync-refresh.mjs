#!/usr/bin/env node
/**
 * Refresh the framework-owned files of a layout-2 repo from the plugin (SPEC-009 Design >
 * /sdlc-sync, ADR-008). `/sdlc-sync` runs it after a plugin update.
 *
 * Each framework file is classified first:
 * - `current`: already identical to the plugin's copy;
 * - `add`: missing, so it is copied in;
 * - `replace`: identical to a released version (lib/released-payloads.json), so it is an
 *   older copy nobody edited and is replaced;
 * - `modified`: matches no release, so it is a local edit, and it is replaced only when
 *   the owner names it with `--accept <path>`.
 *
 * `.sdlc/state-machine.yaml` is framework-owned and is always refreshed, because the
 * adopter's own routing and phases live in `config.yaml`. In `config.yaml` only the
 * `framework_version` line changes; every other byte is kept. `review-constraints.yaml`,
 * the `AGENTS.md` content and `specs/` are never read for writing.
 *
 * Usage (plugin-only):
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/sync-refresh.mjs --root . --plan
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/sync-refresh.mjs --root . --apply [--accept <path>]...
 *
 * Exit codes: 0 done; 1 the repo is not on layout 2 (run migrate-layout.mjs first);
 * 2 `--apply` left at least one modified file unreplaced (listed, for the owner to decide).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadManifest, releasedVersions, roleOf } from './gen-released-payloads.mjs'
import { CONFIG_REL, detectLayout, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '..', '..')
export const DEFAULT_PAYLOAD = join(PLUGIN, 'init-payload')

/** Every file under `base/dir`, as `dir/...` paths with forward slashes, or [] when `dir` is missing. */
export function filesUnder(base, dir) {
    const abs = join(base, dir)
    if (!existsSync(abs)) return []
    const out = []
    for (const e of readdirSync(abs, { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) out.push(...filesUnder(base, rel))
        else out.push(rel)
    }
    return out
}

/** The plugin's version from `.claude-plugin/plugin.json`, or null when it cannot be read. */
export function pluginVersion() {
    try {
        return JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version
    } catch {
        return null
    }
}

/** Where each payload file lives in this repo, following the resolver for the contracts. */
function destinationOf(root, payloadRel) {
    const paths = sdlcPaths(root, { quiet: true })
    if (payloadRel === '.sdlc/contracts/review-primitives.md') return relative(root, paths.primitives)
    if (payloadRel === '.sdlc/contracts/review-envelope.schema.json') return relative(root, paths.envelopeSchema)
    if (payloadRel.startsWith('.sdlc/scripts/')) return relative(root, join(paths.scripts, payloadRel.slice('.sdlc/scripts/'.length)))
    if (payloadRel.startsWith('.sdlc/templates/')) return relative(root, join(paths.templates, payloadRel.slice('.sdlc/templates/'.length)))
    return payloadRel
}

/** Classify every framework file. @returns {{ file, source, status }[]} */
export function planRefresh(root, { payload = DEFAULT_PAYLOAD, manifest = loadManifest() } = {}) {
    if (detectLayout(root) !== 2) throw new Error(`${root} is not on layout 2; run migrate-layout.mjs first`)
    const shipped = [
        ...filesUnder(payload, '.sdlc/scripts'),
        ...filesUnder(payload, '.sdlc/templates'),
        ...filesUnder(payload, '.sdlc/contracts'),
        ...filesUnder(payload, '.github/workflows'),
        '.sdlc/state-machine.yaml',
    ]
    const plan = []
    for (const src of shipped) {
        const file = destinationOf(root, src)
        const target = join(root, file)
        const next = readFileSync(join(payload, src))
        let status
        if (!existsSync(target)) status = 'add'
        else {
            const have = readFileSync(target)
            if (have.equals(next)) status = 'current'
            else if (src === '.sdlc/state-machine.yaml') status = 'replace'
            else status = releasedVersions(manifest, roleOf(`init-payload/${src}`), have).length ? 'replace' : 'modified'
        }
        plan.push({ file, source: src, status })
    }
    return plan
}

/** Write `framework_version: <v>` into config.yaml, changing that one line and nothing else. */
export function writeFrameworkVersion(root, version) {
    const file = join(root, CONFIG_REL)
    const text = readFileSync(file, 'utf8')
    const line = `framework_version: ${version}`
    const next = /^framework_version:.*$/m.test(text)
        ? text.replace(/^framework_version:.*$/m, line)
        : text.replace(/^(layout:.*\n)/m, `$1${line}\n`)
    if (next !== text) writeFileSync(file, next, 'utf8')
    return next !== text
}

/** Carry out `plan`. Modified files are replaced only when listed in `accept`. @returns {string[]} modified files left as they were */
export function applyRefresh(root, plan, { payload = DEFAULT_PAYLOAD, accept = [], version = pluginVersion() } = {}) {
    const kept = []
    for (const { file, source, status } of plan) {
        if (status === 'current') continue
        if (status === 'modified' && !accept.includes(file)) {
            kept.push(file)
            continue
        }
        mkdirSync(dirname(join(root, file)), { recursive: true })
        writeFileSync(join(root, file), readFileSync(join(payload, source)))
    }
    if (version) writeFrameworkVersion(root, version)
    return kept
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const accept = rest.flatMap((a, i) => (a === '--accept' && rest[i + 1] ? [rest[i + 1]] : []))
    let plan
    try {
        plan = planRefresh(root)
    } catch (err) {
        process.stderr.write(`sync-refresh: ${err.message}\n`)
        process.exit(1)
    }
    for (const status of ['add', 'replace', 'modified']) {
        const files = plan.filter((p) => p.status === status).map((p) => p.file)
        if (files.length) process.stdout.write(`${status} (${files.length}):\n${files.map((f) => `  ${f}`).join('\n')}\n`)
    }
    process.stdout.write(`current: ${plan.filter((p) => p.status === 'current').length} file(s)\n`)
    if (!rest.includes('--apply')) return
    const kept = applyRefresh(root, plan, { accept })
    if (kept.length) {
        process.stderr.write(`\nkept ${kept.length} locally modified file(s); diff each and pass --accept <path> to replace it:\n${kept.map((f) => `  ${f}`).join('\n')}\n`)
        process.exit(2)
    }
    process.stdout.write('refreshed\n')
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
