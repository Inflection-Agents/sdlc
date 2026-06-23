#!/usr/bin/env node
// stop-handoff.mjs — Stop / SubagentStop advisory next-phase handoff hook.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Adapt freely; it is intentionally dependency-free (Node built-ins only) and
// FAILS SAFE (any error → exit 0 / no-op) so it can never wedge the agent.
//
// What it does
// ------------
// A Stop hook cannot print to the user — it can only BLOCK the stop and feed
// the agent a continuation `reason`. So at a phase-exit it blocks ONCE with the
// next-step handoff (next_phase + next_trigger drawn from the state machine) so
// the agent surfaces it to the user. It is a NO-OP whenever no phase-exit
// applies, and SILENT on any internal error.
//
// Phase-exit detection (the `_index.yaml` phase-block contract documented in
// the header of specs/sdlc-state-machine.yaml): each spec's
// specs/tasks/SPEC-NNN/_index.yaml may carry a `phase:` block
//
//   phase:
//     current: review                 # a phases[].id, or `none`
//     next_action: spec-completion    # the phase's next_phase (a phases[].id)
//     next_trigger: 'close out …'     # the phase's next_trigger string
//     exit_condition_met: true        # set by the owner_skill at phase exit
//     updated: 2026-06-22
//
// A phase-exit is "reached" when `phase.exit_condition_met` is truthy (the
// owner_skill flipped it on exit). We read `next_phase` + `next_trigger` from
// the state machine (specs/sdlc-state-machine.yaml — the single source of
// truth) keyed by `phase.current`, falling back to the values mirrored in the
// `_index.yaml` phase block. We DO NOT duplicate the transition table here.
//
// Block cap (do not loop): Claude Code sets `stop_hook_active: true` on the
// payload once a Stop hook has already blocked and the agent is continuing
// because of it. We block AT MOST ONCE per phase-exit by no-op'ing whenever
// `stop_hook_active` is set. We also no-op if `phase.handoff_surfaced` is
// already recorded, so a fresh session does not re-block a surfaced handoff.
//
// `claude -p` caveat: Stop hooks DO NOT FIRE under `claude -p` (non-interactive).
// In that mode the handoff is carried by the `_index.yaml` phase state and the
// UserPromptSubmit hook, not Stop.
//
// Advisory posture: this hook ONLY ever blocks-once to surface a handoff; it
// never hard-fails. There is therefore no SDLC_GUARD_MODE toggle here.
//
// Contract (Claude Code Stop / SubagentStop):
//   - stdin: JSON `{ session_id, cwd, stop_hook_active, ... }`.
//   - To BLOCK the stop and redirect the agent: exit 0 and print
//     `{"decision":"block","reason":"<handoff text>"}` on stdout.
//   - To allow the stop (NO-OP): exit 0 with empty stdout.
//   - On ANY internal error we fail SILENT (exit 0, no output).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOW = 0

/** No-op exit: allow the stop. The advisory hook never wedges. */
function noop() {
    process.exit(ALLOW)
}

/** Block the stop with a continuation reason, then exit 0. */
function block(reason) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason }))
    process.exit(ALLOW)
}

/**
 * Resolve the project root. Prefer the harness-provided CLAUDE_PROJECT_DIR;
 * otherwise walk up from this hook file to the dir containing `.claude`.
 */
function projectRoot() {
    if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR
    const dir = dirname(fileURLToPath(import.meta.url)) // .../.claude/hooks
    return resolve(dir, '..', '..') // hooks -> .claude -> <root>
}

/** Parse the hook payload from stdin; null on malformed input. */
function parsePayload() {
    let raw = ''
    try {
        raw = readFileSync(0, 'utf8')
    } catch {
        return null
    }
    if (!raw.trim()) return null
    try {
        return JSON.parse(raw)
    } catch {
        return null
    }
}

// ─── Minimal, dependency-free YAML reader for the state machine ────────────
//
// The framework keeps hooks on Node built-ins only (no npm packages). We parse
// just enough of specs/sdlc-state-machine.yaml to read each phase's `id`,
// `next_phase`, and `next_trigger`. This is a deliberately small subset reader:
// a list of `- id:` blocks under a top-level `phases:` key. It tolerates
// quoting and inline comments; on anything it can't read it returns [].

/** Strip a trailing unquoted `# comment` and surrounding quotes/whitespace. */
function scalar(raw) {
    if (raw == null) return null
    let s = String(raw).trim()
    // drop an inline comment only when the value is not quoted
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
 * Parse the `phases:` list out of the state-machine YAML text. Returns an
 * array of `{ id, next_phase, next_trigger }`. Empty array on any failure.
 */
function parsePhases(text) {
    const lines = String(text).split('\n')
    const phases = []
    let inPhases = false
    let current = null
    for (const line of lines) {
        if (/^\S/.test(line) && !/^phases\s*:/.test(line)) {
            // a new top-level key ends the phases block
            if (inPhases) break
            continue
        }
        if (/^phases\s*:/.test(line)) {
            inPhases = true
            continue
        }
        if (!inPhases) continue
        const item = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) phases.push(current)
            current = { id: scalar(item[1]), next_phase: null, next_trigger: null }
            continue
        }
        if (!current) continue
        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) {
            const key = kv[1]
            if (key === 'next_phase') current.next_phase = scalar(kv[2])
            else if (key === 'next_trigger') current.next_trigger = scalar(kv[2])
        }
    }
    if (current) phases.push(current)
    return phases.filter((p) => p.id)
}

/** Load + parse the state machine's phases. Returns [] on any failure. */
function loadPhases(root) {
    const path = join(root, 'specs', 'sdlc-state-machine.yaml')
    try {
        return parsePhases(readFileSync(path, 'utf8'))
    } catch {
        return []
    }
}

// ─── Phase-block reader (_index.yaml) ──────────────────────────────────────

/**
 * Extract the top-level `phase:` block fields from an `_index.yaml` text via a
 * minimal indentation-aware scan. Returns an object of the block's scalar
 * fields, or null if there is no `phase:` block.
 */
function parsePhaseBlock(text) {
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
        // dedent to the block level (or a new top-level key) ends the block
        if (indent < baseIndent || /^\S/.test(line)) break
        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) block[kv[1]] = scalar(kv[2])
    }
    return Object.keys(block).length ? block : null
}

/** Is the phase block's exit condition reached? (string-or-boolean tolerant) */
function exitConditionMet(phase) {
    const v = phase.exit_condition_met
    return v === true || v === 'true' || v === 'yes'
}

/** Has the handoff already been surfaced? */
function handoffSurfaced(phase) {
    const v = phase.handoff_surfaced
    return v === true || v === 'true' || v === 'yes'
}

/**
 * Find the spec whose `_index.yaml` phase block is at a reached phase-exit.
 * Scans each specs/tasks/SPEC-NNN/_index.yaml (newest by mtime first) and
 * returns the first whose `exit_condition_met` is truthy and whose handoff has
 * not already been surfaced. Tolerant of absence entirely (specs with no
 * `phase:` block are skipped). Returns { specId, phase } or null.
 */
function findPhaseExit(root) {
    const tasksDir = join(root, 'specs', 'tasks')
    if (!existsSync(tasksDir)) return null
    let entries
    try {
        entries = readdirSync(tasksDir)
    } catch {
        return null
    }
    const candidates = []
    for (const name of entries) {
        if (!/^SPEC-\d{3,}$/i.test(name)) continue
        const indexPath = join(tasksDir, name, '_index.yaml')
        if (!existsSync(indexPath)) continue
        let mtime = 0
        try {
            mtime = statSync(indexPath).mtimeMs
        } catch {
            mtime = 0
        }
        candidates.push({ specId: name.toUpperCase(), indexPath, mtime })
    }
    candidates.sort((a, b) => b.mtime - a.mtime)

    for (const c of candidates) {
        let phase
        try {
            phase = parsePhaseBlock(readFileSync(c.indexPath, 'utf8'))
        } catch {
            continue
        }
        if (!phase) continue
        if (handoffSurfaced(phase)) continue
        if (!exitConditionMet(phase)) continue
        return { specId: c.specId, phase }
    }
    return null
}

/**
 * Resolve next_phase + next_trigger for the phase being exited. Source of truth
 * is the state machine keyed by `phase.current`; falls back to the values
 * mirrored in the `_index.yaml` phase block. Never duplicates the table.
 */
function resolveHandoff(phases, phase) {
    const current = phase.current
    let nextPhase = null
    let nextTrigger = null
    const match = phases.find((p) => p && p.id === current)
    if (match) {
        nextPhase = match.next_phase ?? null
        nextTrigger = match.next_trigger ?? null
    }
    if (nextPhase == null) nextPhase = phase.next_action ?? phase.next_phase ?? null
    if (nextTrigger == null) nextTrigger = phase.next_trigger ?? null
    return { current, nextPhase, nextTrigger }
}

/** Render the continuation reason the agent must surface. */
function renderHandoff(specId, { current, nextPhase, nextTrigger }) {
    const from = current && current !== 'none' ? `\`${current}\`` : 'the current phase'
    if (!nextPhase || nextPhase === 'none') {
        return (
            `[SDLC handoff — advisory] ${specId} has reached the exit condition for ${from}. ` +
            `This is a terminal phase (no next phase). Surface to the user that the SDLC ` +
            `process for ${specId} is complete before stopping.`
        )
    }
    const trigger =
        nextTrigger && nextTrigger !== 'none'
            ? ` Surface the next step to the user: "${String(nextTrigger).replace(/SPEC-NNN/g, specId)}".`
            : ' Surface the next step to the user.'
    return (
        `[SDLC handoff — advisory] ${specId} has reached the exit condition for ${from}. ` +
        `The next phase is \`${nextPhase}\`.${trigger} ` +
        `Do not silently stop — state the handoff (next phase + trigger) so the process advances.`
    )
}

function main() {
    const payload = parsePayload()
    if (!payload) noop() // fail safe on no/bad input

    // Block cap: if we already blocked and the agent is continuing because of
    // it, allow the stop now (block at most once per phase-exit; never loop).
    if (payload.stop_hook_active === true) noop()

    const root = projectRoot()
    const phases = loadPhases(root)
    if (phases.length === 0) noop() // no source of truth → advisory no-op

    const exit = findPhaseExit(root)
    if (!exit) noop() // mid-phase / no phase block → no-op

    const handoff = resolveHandoff(phases, exit.phase)
    block(renderHandoff(exit.specId, handoff))
}

try {
    main()
} catch {
    noop()
}
