#!/usr/bin/env node
/**
 * Run a repo-local SDLC script by name, on either layout.
 *
 * Skills give every repo-local script command in this form, so one command works in a
 * repo still on layout 1, a migrated one (`.sdlc/scripts/`), and this
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
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

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
    // A bare script name only: a path would let the runner execute any file the caller names.
    if (!/^[a-z0-9][a-z0-9-]*(\.mjs)?$/.test(name)) {
        process.stderr.write(`sdlc: ${JSON.stringify(name)} is not a script name (lowercase letters, digits and dashes)\n`)
        process.exit(2)
    }
    const { root, rest } = takeRootArg(args)
    const hit = locate(name, root)
    if (!hit.file) {
        process.stderr.write(`sdlc: no script named ${name} in ${hit.searched.join(' or ')}\n`)
        process.exit(2)
    }
    if (hit.fallback) {
        process.stderr.write(`sdlc: ${name} is not in ${hit.searched[0]}; running the plugin's copy against ${root}\n`)
    }
    // The plugin's copy needs --root to find the repo. The repo's own copy gets the arguments
    // as given, minus --root, which a 0.3.0 copy does not accept.
    const finalArgs = hit.fallback ? ['--root', root, ...rest] : rest
    // Relative arguments mean what they meant to the caller, so the caller's directory is
    // kept when it is inside the repo.
    const here = process.cwd()
    const cwd = relative(root, here).startsWith('..') || isAbsolute(relative(root, here)) ? root : here
    const result = spawnSync(process.execPath, [hit.file, ...finalArgs], { cwd, stdio: 'inherit' })
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
