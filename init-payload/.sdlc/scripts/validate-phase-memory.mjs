#!/usr/bin/env node
// validate-phase-memory.mjs — validator for the optional `phase:` block in
// specs/tasks/SPEC-NNN/_index.yaml (the phase-memory contract documented in the
// header of specs/sdlc-state-machine.yaml).
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined).
//
// The block is ADDITIVE and OPTIONAL: an `_index.yaml` with no `phase:` block is
// accepted. When a `phase:` block IS present:
//   - `current` and `next_action` must each be a valid state-machine phase id
//     (a `phases[].id` in specs/sdlc-state-machine.yaml) or the sentinel `none`;
//     an unrecognized phase id is REJECTED. A RETIRED id (listed under the machine's
//     top-level `retired_phases:`) is accepted with a warning: an `_index.yaml` written
//     before the phase was removed must not turn CI red (ADR-007).
//   - `next_trigger` and `updated` must be present.
//   - the optional `exit_condition_met` / `handoff_surfaced` flags, if present,
//     must be booleans (or the YAML-ish strings true/false/yes/no).
//
// Usage:
//   node .sdlc/scripts/validate-phase-memory.mjs <_index.yaml> [<_index.yaml> ...]
//   node .sdlc/scripts/validate-phase-memory.mjs --machine <path> <_index.yaml> ...
//
// Exit 0 if every file is compliant; 1 otherwise (listing problems per file).
// Exposes validatePhaseBlock(...) + loadPhaseIds(...) + parsePhaseBlock(...) as
// a module so a fixture test can drive blocks without spawning a child process.
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMachine, resolveRoot, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

const NONE = 'none'
const REQUIRED_FIELDS = ['current', 'next_action', 'next_trigger', 'updated']
const PHASE_ID_FIELDS = ['current', 'next_action']
const BOOLEAN_FLAGS = ['exit_condition_met', 'handoff_surfaced']

// ─── Minimal, dependency-free YAML reads ───────────────────────────────────

function scalar(raw) {
    if (raw == null) return null
    let s = String(raw).trim()
    if (!/^['"]/.test(s)) {
        const hash = s.indexOf(' #')
        if (hash !== -1) s = s.slice(0, hash).trim()
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1)
    }
    return s
}

/**
 * The valid phase ids: the machine's own phases plus, on layout 2, the adopter's
 * `extensions.phases` from `.sdlc/config.yaml` (loadMachine merges them).
 * @param {string} [machinePath] defaults to the resolved machine of `root`
 * @param {string} [root] the repo the machine belongs to
 * @returns {Set<string>}
 */
export function loadPhaseIds(machinePath, root = resolveRoot(machinePath ? dirname(machinePath) : undefined)) {
    return new Set(loadMachine(root, { machineFile: machinePath }).phases.map((p) => p.id).filter(Boolean))
}

/**
 * The retired phase ids from the machine's top-level `retired_phases:` list. A machine
 * without the list retires nothing.
 * @param {string} [machinePath] defaults to the resolved machine of `root`
 * @param {string} [root] the repo the machine belongs to
 * @returns {Set<string>}
 */
export function loadRetiredIds(machinePath, root = resolveRoot(machinePath ? dirname(machinePath) : undefined)) {
    return new Set(loadMachine(root, { machineFile: machinePath }).retired_phases.filter(Boolean))
}

/**
 * Warnings for `current` / `next_action` values that name a retired phase.
 * @param {Record<string,unknown>|null|undefined} phase
 * @param {Set<string>} retiredIds
 * @returns {string[]}
 */
export function retiredWarnings(phase, retiredIds) {
    if (!phase || typeof phase !== 'object') return []
    return PHASE_ID_FIELDS.filter((field) => retiredIds.has(phase[field])).map(
        (field) =>
            `phase.${field}: '${phase[field]}' is a retired phase id; ` +
            `write this spec's delivery guide ("write the guide for SPEC-NNN")`
    )
}

/**
 * Extract the top-level `phase:` block from an `_index.yaml` text. Returns an
 * object of the block's scalar fields, or null/undefined if there is no
 * `phase:` block (so callers can treat absence as compliant).
 * @param {string} text
 * @returns {Record<string,string>|null}
 */
export function parsePhaseBlock(text) {
    const lines = String(text).split('\n')
    let inBlock = false
    let baseIndent = null
    const block = {}
    for (const line of lines) {
        if (/^phase\s*:\s*$/.test(line)) {
            inBlock = true
            continue
        }
        if (!inBlock) continue
        if (line.trim() === '') continue
        const indent = line.match(/^(\s*)/)[1].length
        if (baseIndent === null) baseIndent = indent
        if (indent < baseIndent || /^\S/.test(line)) break
        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) block[kv[1]] = scalar(kv[2])
    }
    return Object.keys(block).length ? block : null
}

function toBool(v) {
    if (typeof v === 'boolean') return v
    if (v === 'true' || v === 'yes') return true
    if (v === 'false' || v === 'no') return false
    return undefined // not boolean-coercible
}

/**
 * Validate a single `phase:` block (object) against the set of valid phase ids.
 * A `null`/`undefined` block (no `phase:` key) is COMPLIANT (additive/optional).
 * A retired id is accepted here; retiredWarnings reports it.
 * @param {Record<string,unknown>|null|undefined} phase
 * @param {Set<string>} phaseIds
 * @param {Set<string>} [retiredIds]
 * @returns {string[]} human-readable problems (empty = compliant)
 */
export function validatePhaseBlock(phase, phaseIds, retiredIds = new Set()) {
    const problems = []
    if (phase === undefined || phase === null) return problems
    if (typeof phase !== 'object' || Array.isArray(phase)) {
        return ['`phase:` must be a mapping when present']
    }

    for (const field of REQUIRED_FIELDS) {
        if (!(field in phase)) problems.push(`phase: missing required field '${field}'`)
    }

    for (const field of PHASE_ID_FIELDS) {
        if (!(field in phase)) continue
        const v = phase[field]
        if (v === NONE || retiredIds.has(v)) continue
        if (typeof v !== 'string' || !phaseIds.has(v)) {
            problems.push(
                `phase.${field}: ${JSON.stringify(v)} is not a valid state-machine phase id ` +
                    `(expected one of ${[...phaseIds].sort().join(', ')}, or '${NONE}')`
            )
        }
    }

    for (const flag of BOOLEAN_FLAGS) {
        if (flag in phase && toBool(phase[flag]) === undefined) {
            problems.push(`phase.${flag}: must be a boolean when present`)
        }
    }

    return problems
}

/**
 * Validate one `_index.yaml` file.
 * @param {string} path
 * @param {Set<string>} phaseIds
 * @param {Set<string>} [retiredIds]
 * @returns {string[]}
 */
export function validateFile(path, phaseIds, retiredIds = new Set()) {
    return checkFile(path, phaseIds, retiredIds).problems
}

/**
 * Validate one `_index.yaml` file and collect retired-id warnings.
 * @param {string} path
 * @param {Set<string>} phaseIds
 * @param {Set<string>} [retiredIds]
 * @returns {{problems: string[], warnings: string[]}}
 */
export function checkFile(path, phaseIds, retiredIds = new Set()) {
    let text
    try {
        text = readFileSync(path, 'utf8')
    } catch (err) {
        return { problems: [`cannot read file: ${err.message}`], warnings: [] }
    }
    const phase = parsePhaseBlock(text)
    return {
        problems: validatePhaseBlock(phase, phaseIds, retiredIds),
        warnings: retiredWarnings(phase, retiredIds),
    }
}

/** Does this argument look like an unexpanded shell glob (contains * ? [ )? */
const looksLikeGlob = (s) => /[*?[\]]/.test(s)

function parseArgs(rawArgv) {
    const { root, rest: argv } = takeRootArg(rawArgv)
    const args = { root, machine: sdlcPaths(root).machine, files: [] }
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--machine') {
            const value = argv[i + 1]
            if (value === undefined) {
                console.error('usage: --machine requires a path argument')
                process.exit(2)
            }
            args.machine = resolve(value)
            i += 1
        } else {
            args.files.push(argv[i])
        }
    }
    return args
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.files.length === 0) {
        console.error(
            'usage: node .sdlc/scripts/validate-phase-memory.mjs <_index.yaml> [<_index.yaml> ...] [--root <dir>]'
        )
        process.exit(2)
    }
    // A glob that matched nothing (e.g. no specs/tasks/ directory yet) is passed
    // through by the shell as a literal string with no `nullglob`. Treat an
    // UNMATCHED glob-looking argument as "nothing to validate", not "missing
    // file" — a fresh repo has nothing under specs/tasks/ yet, and that must not
    // fail CI on the first PR. An explicit literal path that is genuinely absent
    // still fails, since that intent is unambiguous.
    const files = args.files.filter((f) => existsSync(f) || !looksLikeGlob(f))
    if (files.length === 0) {
        console.log('validate-phase-memory: nothing to check (no matching files)')
        process.exit(0)
    }
    if (!existsSync(args.machine)) {
        console.error(`error: state-machine source not found at ${args.machine}`)
        process.exit(2)
    }
    let phaseIds, retiredIds
    try {
        phaseIds = loadPhaseIds(args.machine, args.root)
        retiredIds = loadRetiredIds(args.machine, args.root)
    } catch (err) {
        console.error(`error: ${err.message}`)
        process.exit(2)
    }

    let failed = false
    for (const file of files) {
        const { problems, warnings } = checkFile(file, phaseIds, retiredIds)
        for (const w of warnings) console.log(`WARN ${file}: ${w}`)
        if (problems.length === 0) {
            console.log(`OK   ${file}`)
        } else {
            failed = true
            console.error(`FAIL ${file}`)
            for (const p of problems) console.error(`       - ${p}`)
        }
    }
    process.exit(failed ? 1 : 0)
}

/**
 * Is this module the process entry point? realpath BOTH sides — `import.meta.url`
 * is already resolved by Node, so an unresolved `process.argv[1]` (a symlinked
 * path, or a path needing percent-encoding like a space) would never match, and
 * this CLI — wired into CI at `.github/workflows/sdlc-validate.yml` — would
 * silently validate nothing and still exit 0.
 */
function isMain(metaUrl) {
    const entry = process.argv[1]
    if (!entry) return false
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl))
    } catch {
        return resolve(entry) === fileURLToPath(metaUrl)
    }
}

if (isMain(import.meta.url)) main()
