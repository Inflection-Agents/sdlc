#!/usr/bin/env node
/**
 * Run a repo-local SDLC script by name, on either layout.
 *
 * Skills give every repo-local script command in this form, so one command works in a
 * repo still on layout 1 (`scripts/sdlc/`), a migrated one (`.sdlc/scripts/`), and this
 * repo. When the repo has no copy of the script, which is the case for a script added after
 * the repo's last `/sdlc-sync`, the plugin's own copy runs against the repo with `--root`,
 * and one line on stderr says so. The exit code is the script's own.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs <name> [args...]
 *
 * Exit codes: the script's own, or 2 when neither the repo nor the plugin has `<name>`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveRoot, sdlcPaths } from './lib/sdlc-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Which copy of `<name>` to run for `root`, and whether it needs `--root`. Null when neither exists. */
export function locate(name, root, pluginScripts = HERE) {
    const file = name.endsWith('.mjs') ? name : `${name}.mjs`
    // quiet: the script it runs prints the deprecation line itself, so a layout-1 run shows it once.
    const repoDir = sdlcPaths(root, { quiet: true }).scripts
    const repoCopy = join(repoDir, file)
    if (existsSync(repoCopy)) return { file: repoCopy, fallback: false, searched: [repoDir] }
    const pluginCopy = join(pluginScripts, file)
    if (existsSync(pluginCopy)) return { file: pluginCopy, fallback: true, searched: [repoDir, pluginScripts] }
    return { file: null, fallback: false, searched: [repoDir, pluginScripts] }
}

function main(argv) {
    const [name, ...args] = argv
    if (!name) {
        process.stderr.write('usage: node run.mjs <script-name> [args...]\n')
        process.exit(2)
    }
    const root = resolveRoot(process.cwd())
    const hit = locate(name, root)
    if (!hit.file) {
        process.stderr.write(`sdlc: no script named ${name} in ${hit.searched.join(' or ')}\n`)
        process.exit(2)
    }
    if (hit.fallback) {
        process.stderr.write(`sdlc: ${name} is not in ${hit.searched[0]}; running the plugin's copy against ${root}\n`)
    }
    const finalArgs = hit.fallback ? ['--root', root, ...args] : args
    const result = spawnSync(process.execPath, [hit.file, ...finalArgs], { cwd: root, stdio: 'inherit' })
    if (result.error) throw result.error
    process.exit(result.status ?? 1)
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
