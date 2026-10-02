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
//      `entry_triggers` table from `.sdlc/state-machine.yaml` (the single
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
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The path resolver (SPEC-009, ADR-008). The plugin ships it in its own lib/ beside scripts, and
// bootstrap.sh copies it to lib/ beside a repo-local hook. A hook that cannot find it
// throws, so the failure shows instead of the hook quietly checking nothing.
const LIB = (() => {
    for (const rel of ['../scripts/sdlc/lib/', './lib/']) {
        const url = new URL(rel, import.meta.url)
        if (existsSync(fileURLToPath(new URL('sdlc-paths.mjs', url)))) return url
    }
    throw new Error(`${fileURLToPath(import.meta.url)}: cannot find lib/sdlc-paths.mjs in the plugin or beside the hook`)
})()
const { isSdlcRoot, loadMachine, sdlcPaths, specIndexPaths } = await import(new URL('sdlc-paths.mjs', LIB).href)
const { LAYOUT1, LAYOUT1_AI_PREFIX } = await import(new URL('legacy-map.mjs', LIB).href)

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
 * Resolve the project root.
 *
 * Order matters. `CLAUDE_PROJECT_DIR` is authoritative. `cwd` comes next because it
 * is the repo under work. Walking up from this file is LAST and is only correct when
 * the hook ships inside the repo: from a plugin cache it resolves to the plugin's own
 * directory, and because this hook fails open the result is a silent no-op rather than
 * an error.
 */
function projectRoot(cwd) {
    const looksLikeRepo = (d) => d && existsSync(join(d, '.claude'))
    if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR
    if (looksLikeRepo(cwd)) return cwd
    // Ascend by MARKER, not by counting levels. This walked up exactly two, which was
    // right at .claude/hooks/ and is one too high at hooks/ - Node realpaths
    // import.meta.url through the symlink, so it landed on the repo's PARENT, and any
    // parent holding a .claude passed the check. The hook then bound to the wrong root
    // and failed open silently.
    let dir = dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 6; i += 1) {
        if (isSdlcRoot(dir)) return dir
        const up = dirname(dir)
        if (up === dir) break
        dir = up
    }
    const fromHook = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    if (looksLikeRepo(fromHook)) return fromHook
    return cwd || fromHook
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

// ─── State machine ─────────────────────────────────────────────────────────

/**
 * The parsed machine through the shared loader (SPEC-009), which takes
 * `domain_routing` and `extensions` from `.sdlc/config.yaml` on layout 2. Null on
 * any failure: this hook is advisory and stays silent.
 */
function loadStateMachine(root) {
    try {
        return loadMachine(root)
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
    // A spec delivered in `.claude/worktrees/spec-nnn` is read from there (SPEC-011).
    // Reading the index is the only fallible step, and a throw here would silence every other
    // block this hook prints, the worktree nudge included, so it reads as "not active" instead.
    try {
        const path = specIndexPaths(root).find((s) => s.specId === specId)?.indexPath
        if (!path) return { active: false, specId }
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

const LAYOUT_NUDGE = `SDLC: this repo is on layout 1 (${LAYOUT1_AI_PREFIX} and ${LAYOUT1.scripts}/). Run /sdlc-sync to migrate it to .sdlc/ (ADR-008).`

/**
 * The once-per-session layout-1 nudge, or null. The per-session marker file is what
 * makes it once: a repeat on every prompt would train the reader to skip it.
 */
function layoutNudge(root, sessionId) {
    let layout
    try {
        layout = sdlcPaths(root, { quiet: true }).layout
    } catch {
        return null
    }
    if (layout !== 1 || !sessionId) return null
    const marker = join(root, '.claude', `.sdlc-layout-nudge-${sessionId}`)
    if (existsSync(marker)) return null
    try {
        mkdirSync(dirname(marker), { recursive: true })
        writeFileSync(marker, `${new Date().toISOString()}\n`, 'utf8')
    } catch {
        return null
    }
    return LAYOUT_NUDGE
}

/**
 * The once-per-session worktree nudge, or null (SPEC-011). It runs `worktrees.mjs` list mode,
 * which reads only `git worktree list` and local refs, behind a per-session marker, so a session
 * pays for one check. It is advice, not a gate: a missing script or a failing check prints
 * nothing, and the marker is written either way so a broken check is not retried every prompt.
 */
function worktreeNudge(root, sessionId) {
    // Only an SDLC repo hears about its worktrees, so a plain repo gets no marker and no nudge.
    if (!sessionId || !isSdlcRoot(root)) return null
    const marker = join(root, '.claude', `.sdlc-worktree-nudge-${sessionId}`)
    if (existsSync(marker)) return null
    try {
        mkdirSync(dirname(marker), { recursive: true })
        writeFileSync(marker, `${new Date().toISOString()}\n`, 'utf8')
    } catch {
        return null
    }
    const script = [
        fileURLToPath(new URL('../scripts/sdlc/worktrees.mjs', import.meta.url)),
        join(sdlcPaths(root, { quiet: true }).scripts, 'worktrees.mjs'),
    ].find((p) => existsSync(p))
    if (!script) return null
    const res = spawnSync(process.execPath, [script, '--root', root, '--json'], { encoding: 'utf8', timeout: 5000 })
    if (res.status !== 0) return null
    let strays
    try {
        strays = JSON.parse(res.stdout)
    } catch {
        return null
    }
    if (!Array.isArray(strays) || strays.length === 0) return null
    const kinds = [...new Set(strays.map((s) => s.reason))].join(', ')
    return `SDLC: ${strays.length} stray worktree(s) (${kinds}). List them with \`node \${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees\`; \`--prune\` removes the finished ones (docs/worktrees.md).`
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
    const root = projectRoot(payload.cwd ?? payload.workingDir ?? null)

    // (3) Override capture runs first and unconditionally — it must record the
    // reason even on a prompt that would otherwise be silent.
    const overrideReason = detectOverride(prompt)
    if (overrideReason) {
        writeOverride(root, sessionId, overrideReason)
        // Capturing an override is itself a "the user is steering" signal; do
        // not also inject entry routing on the same prompt. Stay silent.
        silent()
    }

    const blocks = []

    // (0) A layout-1 repo hears once per session that /sdlc-sync migrates it (SPEC-009).
    const nudge = layoutNudge(root, sessionId)
    if (nudge) blocks.push(nudge)
    const strays = worktreeNudge(root, sessionId)
    if (strays) blocks.push(strays)

    const sm = loadStateMachine(root)
    if (!sm) {
        if (blocks.length) inject(blocks.join('\n\n'))
        silent() // no source of truth → stay silent (advisory)
    }

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
