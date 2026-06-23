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
//     an unrecognized phase id is REJECTED.
//   - `next_trigger` and `updated` must be present.
//   - the optional `exit_condition_met` / `handoff_surfaced` flags, if present,
//     must be booleans (or the YAML-ish strings true/false/yes/no).
//
// Usage:
//   node scripts/sdlc/validate-phase-memory.mjs <_index.yaml> [<_index.yaml> ...]
//   node scripts/sdlc/validate-phase-memory.mjs --machine <path> <_index.yaml> ...
//
// Exit 0 if every file is compliant; 1 otherwise (listing problems per file).
// Exposes validatePhaseBlock(...) + loadPhaseIds(...) + parsePhaseBlock(...) as
// a module so a fixture test can drive blocks without spawning a child process.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const DEFAULT_MACHINE = join(REPO_ROOT, 'specs', 'sdlc-state-machine.yaml')

const NONE = 'none'
const REQUIRED_FIELDS = ['current', 'next_action', 'next_trigger', 'updated']
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
 * Load the set of valid phase ids from the state-machine source by scanning the
 * `phases:` list for `- id:` lines.
 * @param {string} [machinePath]
 * @returns {Set<string>}
 */
export function loadPhaseIds(machinePath = DEFAULT_MACHINE) {
    const text = readFileSync(machinePath, 'utf8')
    const ids = new Set()
    let inPhases = false
    for (const line of text.split('\n')) {
        if (/^phases\s*:/.test(line)) {
            inPhases = true
            continue
        }
        if (inPhases && /^\S/.test(line)) break
        if (!inPhases) continue
        const m = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (m) ids.add(scalar(m[1]))
    }
    return ids
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
 * @param {Record<string,unknown>|null|undefined} phase
 * @param {Set<string>} phaseIds
 * @returns {string[]} human-readable problems (empty = compliant)
 */
export function validatePhaseBlock(phase, phaseIds) {
    const problems = []
    if (phase === undefined || phase === null) return problems
    if (typeof phase !== 'object' || Array.isArray(phase)) {
        return ['`phase:` must be a mapping when present']
    }

    for (const field of REQUIRED_FIELDS) {
        if (!(field in phase)) problems.push(`phase: missing required field '${field}'`)
    }

    for (const field of ['current', 'next_action']) {
        if (!(field in phase)) continue
        const v = phase[field]
        if (v === NONE) continue
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
 * @returns {string[]}
 */
export function validateFile(path, phaseIds) {
    let text
    try {
        text = readFileSync(path, 'utf8')
    } catch (err) {
        return [`cannot read file: ${err.message}`]
    }
    return validatePhaseBlock(parsePhaseBlock(text), phaseIds)
}

function parseArgs(argv) {
    const args = { machine: DEFAULT_MACHINE, files: [] }
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--machine') args.machine = resolve(argv[(i += 1)])
        else args.files.push(argv[i])
    }
    return args
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.files.length === 0) {
        console.error(
            'usage: node scripts/sdlc/validate-phase-memory.mjs <_index.yaml> [<_index.yaml> ...]'
        )
        process.exit(2)
    }
    if (!existsSync(args.machine)) {
        console.error(`error: state-machine source not found at ${args.machine}`)
        process.exit(2)
    }
    const phaseIds = loadPhaseIds(args.machine)

    let failed = false
    for (const file of args.files) {
        const problems = validateFile(file, phaseIds)
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

if (import.meta.url === `file://${process.argv[1]}`) main()
