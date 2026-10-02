#!/usr/bin/env node
/**
 * Set every finding's content-addressed id, then validate the envelope (ADR-006). This is the one
 * command the skills run on a returned reviewer envelope.
 *
 * It is its own script, not only `validate-review-envelope --stamp`, because `run.mjs` prefers a
 * repo's copy of a script over the plugin's. A repo synced before ids existed has a validator that
 * reads `--stamp` as the envelope path and rejects every envelope. This name is absent from such a
 * repo, so `run.mjs` runs the plugin's copy, and its sibling validator is the plugin's too.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs stamp-envelope <envelope.json>   # stamp in place
 *   … | node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs stamp-envelope -             # stamped JSON on stdout
 *
 * Exit codes are the validator's: 0 valid and assessed, 2 abstained, 3 malformed or ungrounded.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const VALIDATOR = join(dirname(fileURLToPath(import.meta.url)), 'validate-review-envelope.mjs')

function main(argv) {
    const res = spawnSync(process.execPath, [VALIDATOR, '--stamp', ...argv], { stdio: 'inherit' })
    if (res.error || res.status === null) {
        process.stderr.write(`stamp-envelope: the validator did not run (${res.error?.message ?? `signal ${res.signal}`})\n`)
        process.exit(3)
    }
    process.exit(res.status)
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
