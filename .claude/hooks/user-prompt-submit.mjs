#!/usr/bin/env node
// user-prompt-submit.mjs — UserPromptSubmit advisory routing hook.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only) and ADVISORY: it never blocks and is
// SILENT when uncertain or on any internal error.
//
// What it does
// ------------
// This is the only hook that sees the raw prompt text, so it does three jobs,
// all DETERMINISTIC (no per-prompt model call):
//
//   1. SDLC entry routing. A deterministic keyword classifier reads the
//      `entry_triggers` table from specs/sdlc-state-machine.yaml (the single
//      source of truth — this hook does NOT duplicate the trigger lists). On a
//      prompt whose text contains an entry_trigger AND no task is active for
//      the referenced spec, it injects routing context naming the matched
//      phase, its owner skill, and the trigger words that fired. It stays
//      SILENT when no keyword matches OR a task is active.
//
//   2. Domain routing (optional). If the prompt references a workspace path
//      that the state machine's `domain_routing` maps to a skill chain, it
//      injects that chain (plan → execute) as advisory context. The
//      `domain_routing` block is illustrative/empty by default in the generic
//      state machine, so this is a no-op until a repo populates it.
//
//   3. Override capture. It detects an `out-of-process: <reason>` token in the
//      prompt and writes the reason to a per-session state file
//      (`.claude/.sdlc-override-<session_id>`). This is the contract the
//      PreToolUse(Edit|Write) gate reads to honor a logged override. See the
//      OVERRIDE CONTRACT block below.
//
// Contract (Claude Code UserPromptSubmit):
//   - stdin: JSON `{ prompt, session_id, cwd, ... }`.
//   - To INJECT advisory context: exit 0 and print the context on stdout
//     (Claude Code appends UserPromptSubmit stdout to the model context).
//   - To stay SILENT: exit 0 with empty stdout.
//   - On ANY internal error we fail SILENT (exit 0, no output).
//
// ─── OVERRIDE CONTRACT (consumed by the PreToolUse(Edit|Write) gate) ───────
//   Path:    <project>/.claude/.sdlc-override-<session_id>
//   Trigger: prompt contains the token `out-of-process: <reason>`
//            (case-insensitive `out-of-process:` prefix; reason = the
//             remainder of that line, trimmed).
//   Format:  UTF-8 plain text, contents = the reason string (no JSON; readers
//            should trim()).
//   Scope:   per-session and short-lived. The file is keyed by the hook's
//            `session_id`; the PreToolUse gate reads it to allow an edit that
//            would otherwise be blocked, recording the reason. (Its
//            lifecycle/cleanup is owned by the gate, not this hook.)
// ───────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOW = 0

/** Fail-silent exit: advisory hook never blocks and never pollutes. */
function silent() {
    process.exit(ALLOW)
}

/** Emit advisory context to stdout, then exit 0. */
function inject(text) {
    if (text && text.trim()) process.stdout.write(text.trimEnd() + '\n')
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
// The framework keeps hooks on Node built-ins only. We parse just enough of
// specs/sdlc-state-machine.yaml to read each phase's id, owner_skill,
// entry_triggers, next_phase, next_trigger, plus the top-level
// `domain_routing` map. This is a deliberately small subset reader; on
// anything it can't read it returns conservative empties.

/** Strip a trailing unquoted `# comment` and surrounding quotes/whitespace. */
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
 * Parse the `phases:` list. Returns an array of
 * `{ id, owner_skill, entry_triggers[], next_phase, next_trigger }`.
 */
function parsePhases(text) {
    const lines = String(text).split('\n')
    const phases = []
    let inPhases = false
    let current = null
    let listKey = null // the field currently accumulating `-` items
    for (const line of lines) {
        if (/^\S/.test(line) && !/^phases\s*:/.test(line)) {
            if (inPhases) break
            continue
        }
        if (/^phases\s*:/.test(line)) {
            inPhases = true
            continue
        }
        if (!inPhases) continue

        const item = line.match(/^(\s*)-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) phases.push(current)
            current = {
                id: scalar(item[2]),
                owner_skill: null,
                entry_triggers: [],
                next_phase: null,
                next_trigger: null
            }
            listKey = null
            continue
        }
        if (!current) continue

        // a list item belonging to the most-recent list-valued key
        const li = line.match(/^\s*-\s*(.+)$/)
        if (li && listKey) {
            if (listKey === 'entry_triggers') current.entry_triggers.push(scalar(li[1]))
            continue
        }

        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) {
            const key = kv[1]
            const val = kv[2]
            if (val.trim() === '') {
                listKey = key // a list/block follows on subsequent lines
            } else {
                listKey = null
                if (key === 'owner_skill') current.owner_skill = scalar(val)
                else if (key === 'next_phase') current.next_phase = scalar(val)
                else if (key === 'next_trigger') current.next_trigger = scalar(val)
            }
        }
    }
    if (current) phases.push(current)
    return phases.filter((p) => p.id)
}

/**
 * Parse the top-level `domain_routing:` block into { workspace: [skills] }.
 * Tolerant of the illustrative empty/`{}` default; returns {} when absent.
 */
function parseDomainRouting(text) {
    const lines = String(text).split('\n')
    let inBlock = false
    let baseIndent = null
    let currentWs = null
    const routing = {}
    for (const line of lines) {
        if (/^domain_routing\s*:/.test(line)) {
            inBlock = true
            continue
        }
        if (!inBlock) continue
        if (line.trim() === '' || /^\s*#/.test(line)) continue
        if (/^\S/.test(line)) break // next top-level key ends the block
        const indent = line.match(/^(\s*)/)[1].length
        if (baseIndent === null) baseIndent = indent
        const li = line.match(/^\s*-\s*(.+)$/)
        if (li && currentWs) {
            routing[currentWs].push(scalar(li[1]))
            continue
        }
        const ws = line.match(/^\s*([A-Za-z0-9_./-]+)\s*:\s*(.*)$/)
        if (ws) {
            currentWs = scalar(ws[1])
            if (currentWs === '{}') {
                currentWs = null
                continue
            }
            routing[currentWs] = []
        }
    }
    return routing
}

/** Load the parsed state machine, or null on failure. */
function loadStateMachine(root) {
    const path = join(root, 'specs', 'sdlc-state-machine.yaml')
    let text
    try {
        text = readFileSync(path, 'utf8')
    } catch {
        return null
    }
    try {
        return { phases: parsePhases(text), domain_routing: parseDomainRouting(text) }
    } catch {
        return null
    }
}

// ─── Active-task detection ─────────────────────────────────────────────────

/** Detect a SPEC-NNN id referenced in the prompt. Returns "SPEC-051" or null. */
function detectSpecId(prompt) {
    const m = String(prompt || '').match(/\bSPEC-\d{3,}\b/i)
    return m ? m[0].toUpperCase() : null
}

/**
 * Minimal, dependency-free check of an _index.yaml for in-process work.
 * Returns true when `phase.current` is `spec-execution` OR any task status is
 * in_progress / in-progress / executing / active. Tolerant; never throws.
 */
function indexLooksActive(text) {
    if (typeof text !== 'string') return false
    if (/\n\s*current:\s*spec-execution\b/.test(text)) return true
    if (/\n\s*status:\s*(in[_-]progress|executing|active)\b/i.test(text)) return true
    return false
}

/**
 * Decide whether a task is currently ACTIVE for the spec referenced in the
 * prompt. Conservative: when in doubt, treat work as in-process and report
 * active (so entry routing stays silent over live work). No spec referenced →
 * not active.
 */
function readSpecPhase(root, prompt) {
    const specId = detectSpecId(prompt)
    if (!specId) return { active: false, specId: null }
    const path = join(root, 'specs', 'tasks', specId, '_index.yaml')
    if (!existsSync(path)) return { active: false, specId }
    try {
        return { active: indexLooksActive(readFileSync(path, 'utf8')), specId }
    } catch {
        return { active: false, specId }
    }
}

// ─── Entry classifier ──────────────────────────────────────────────────────

/**
 * Deterministic entry classifier. For each phase, test whether the prompt
 * contains any of its entry_triggers (case-insensitive substring). Returns the
 * FIRST matching phase (phases are ordered upstream→downstream) with the list
 * of trigger words that fired.
 */
function classifyEntry(prompt, phases) {
    const text = String(prompt || '').toLowerCase()
    for (const phase of phases || []) {
        const triggers = Array.isArray(phase?.entry_triggers) ? phase.entry_triggers : []
        const fired = triggers.filter((t) => {
            const needle = String(t || '')
                .toLowerCase()
                // normalize the schema's literal "SPEC-NNN"/"X"/"N" placeholders
                // so "execute SPEC-NNN" still matches "execute SPEC-051".
                .replace(/\bspec-nnn\b/g, 'spec-')
                .replace(/\bspec-n\b/g, 'spec-')
                .replace(/\bx\b/g, '')
                .trim()
            if (!needle) return false
            return text.includes(needle)
        })
        if (fired.length > 0) return { phase, fired }
    }
    return null
}

// ─── Domain routing ────────────────────────────────────────────────────────

/**
 * Find the first workspace in `domain_routing` whose name appears as a path
 * segment in the prompt (e.g. a `web-app/` reference). Returns { workspace,
 * chain } or null. Generic: there are no hard-coded workspace names here.
 */
function classifyDomain(prompt, domainRouting) {
    const text = String(prompt || '')
    for (const [workspace, chain] of Object.entries(domainRouting || {})) {
        if (!Array.isArray(chain) || chain.length === 0) continue
        // match `<workspace>/` as a path-ish reference, case-insensitively
        const re = new RegExp(`(^|[\\s"'\`(./])${escapeRe(workspace)}/`, 'i')
        if (re.test(text)) return { workspace, chain }
    }
    return null
}

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Override capture ──────────────────────────────────────────────────────

/** Detect `out-of-process: <reason>`; returns the trimmed reason or null. */
function detectOverride(prompt) {
    const m = String(prompt || '').match(/out-of-process:[ \t]*([^\n\r]*)/i)
    if (!m) return null
    const reason = m[1].trim()
    return reason.length > 0 ? reason : null
}

/** Write the override reason to the per-session state file. Best-effort. */
function writeOverride(root, sessionId, reason) {
    if (!sessionId) return null
    const path = join(root, '.claude', `.sdlc-override-${sessionId}`)
    try {
        writeFileSync(path, reason, 'utf8')
        return path
    } catch {
        return null
    }
}

// ─── Renderers ─────────────────────────────────────────────────────────────

function renderEntryContext({ phase, fired }) {
    const owner = phase.owner_skill ? ` (owner skill: \`${phase.owner_skill}\`)` : ''
    const next =
        phase.next_phase && phase.next_phase !== 'none'
            ? `\n- After this phase, the next phase is \`${phase.next_phase}\`` +
              (phase.next_trigger && phase.next_trigger !== 'none'
                  ? ` (trigger: "${phase.next_trigger}").`
                  : '.')
            : ''
    return (
        `[SDLC routing — advisory] This prompt looks like the entry to the ` +
        `\`${phase.id}\` phase${owner}.\n` +
        `- Matched trigger word(s): ${fired.map((t) => `"${t}"`).join(', ')}.\n` +
        `- No active task was detected, so this is upstream SDLC work — start ` +
        `in the \`${phase.id}\` phase via its owner skill before writing code.` +
        next
    )
}

function renderDomainContext({ workspace, chain }) {
    const chainText =
        chain.length >= 2
            ? `\`${chain[0]}\` (plan) → ${chain
                  .slice(1)
                  .map((s) => `\`${s}\``)
                  .join(' → ')} (execute)`
            : `\`${chain[0]}\``
    return (
        `[SDLC domain routing — advisory] This prompt touches the \`${workspace}/\` ` +
        `workspace. Work there routes through ${chainText}, per the state-machine ` +
        `\`domain_routing.${workspace}\`. Plan the change with the planning skill ` +
        `before executing with the implementation skill.`
    )
}

function main() {
    const payload = parsePayload()
    if (!payload) silent() // fail silent on no/bad input

    const prompt = payload.prompt ?? payload.user_prompt ?? payload.text ?? ''
    const sessionId = payload.session_id ?? payload.sessionId ?? null
    const root = projectRoot()

    // (3) Override capture runs first and unconditionally — it must record the
    // reason even on a prompt that would otherwise be silent.
    const overrideReason = detectOverride(prompt)
    if (overrideReason) {
        writeOverride(root, sessionId, overrideReason)
        // Capturing an override is itself a "the user is steering" signal; do
        // not also inject entry routing on the same prompt. Stay silent.
        silent()
    }

    const sm = loadStateMachine(root)
    if (!sm) silent() // no source of truth → stay silent (advisory)

    const blocks = []

    // (1) Entry routing — only when NO task is active for the spec in play.
    const { active } = readSpecPhase(root, prompt)
    if (!active) {
        const match = classifyEntry(prompt, sm.phases)
        if (match) blocks.push(renderEntryContext(match))
    }

    // (2) Domain routing — independent of entry routing.
    const domain = classifyDomain(prompt, sm.domain_routing)
    if (domain) blocks.push(renderDomainContext(domain))

    if (blocks.length === 0) silent()
    inject(blocks.join('\n\n'))
}

try {
    main()
} catch {
    silent()
}
