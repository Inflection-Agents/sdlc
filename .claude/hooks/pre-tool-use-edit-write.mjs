#!/usr/bin/env node
// pre-tool-use-edit-write.mjs — PreToolUse(Edit|Write) no-active-task gate.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only). ADVISORY by default (warn mode); a
// one-line constant flips it to enforce. FAILS OPEN: any internal error → exit
// 0 (no-op) so it never wedges an unrelated tool call.
//
// What it does
// ------------
// Blocks an Edit/Write to an IMPLEMENTATION-CODE path when there is no active
// task context (the branch does not match a work-branch prefix). PROCESS-
// ARTIFACT paths (specs/**, .ai/**, .claude/skills/**, docs/**, the state
// machine) are categorically EXEMPT — authoring them IS the SDLC. The intent
// is to keep implementation code anchored to a decomposed task instead of
// landing ad-hoc edits with no spec/task lineage.
//
// What counts as a path
// ---------------------
//   PROCESS-ARTIFACT (always allowed): specs/**, .ai/**, .claude/** (skills,
//     hooks, settings), docs/**, *.md at the repo root, and the state-machine
//     file. Editing these is the judgment/process work of the SDLC.
//   IMPLEMENTATION-CODE (gated): everything else inside the repo that is not a
//     process artifact. The generic rule is "if it is not a process artifact,
//     it is implementation code" — no repo-specific workspace list is baked in,
//     so this travels to any layout (apps/, packages/, src/, services/, …).
//
// Active-task context
// -------------------
// Deterministic: the current git branch matches one of the work-branch
// prefixes (`claude/SPEC-…`, `task/…`, `spec/…`, `feat/SPEC-…`). The wave-based
// execution loop creates `claude/SPEC-NNN-TASK-NNN` worktrees and a
// `feat/SPEC-NNN` integration branch, both of which satisfy this.
//
// Logged override hatch
// ---------------------
// The block is bypassable by the per-session override file written by the
// UserPromptSubmit hook (`.claude/.sdlc-override-<session_id>`, triggered by an
// `out-of-process: <reason>` line in the prompt). When present, the edit is
// ALLOWED and the bypass is RECORDED (appended to `.claude/.sdlc-override-log`
// — visible, never silent).
//
// Contract (Claude Code PreToolUse):
//   - stdin: JSON `{ tool_name, tool_input, session_id, cwd, ... }`.
//   - To BLOCK: exit code 2 with a human-readable reason on stderr (Claude
//     Code surfaces stderr to the agent on exit 2).
//   - To ALLOW: exit 0 (no-op). On ANY internal error we fail OPEN (exit 0).
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ALLOW = 0
const BLOCK = 2

// ─── SDLC_GUARD_MODE — advisory-by-default rollout toggle ──────────────────
//
// REFERENCE-IMPLEMENTATION DEFAULT: `warn` (advisory). These hooks ship with
// the framework as references; a repo soaks them in warn mode, then flips to
// `enforce` once it trusts the gate. To change the default, edit the fallback
// in the IIFE below (or set the SDLC_GUARD_MODE env var per-run).
//
//   enforce → block (exit 2 + deny reason on stderr).
//   warn    → DO NOT block; allow (exit 0) but print the would-block reason as
//             a visible `[SDLC guard — WARN, …]` warning on stderr.
//   off     → emergency kill-switch; no-op entirely (exit 0, no output).
const GUARD_MODE = (() => {
    const v = (process.env.SDLC_GUARD_MODE ?? '').trim().toLowerCase()
    if (v === 'enforce' || v === 'warn' || v === 'off') return v
    return 'warn' // ← reference default: advisory. Change to 'enforce' to gate.
})()

/** Apply the configured guard mode to a decided block. Always exits. */
function deny(reason) {
    if (GUARD_MODE === 'off') process.exit(ALLOW)
    if (GUARD_MODE === 'warn') {
        process.stderr.write(`[SDLC guard — WARN, would block in enforce mode]: ${reason}\n`)
        process.exit(ALLOW)
    }
    process.stderr.write(reason + '\n') // enforce
    process.exit(BLOCK)
}

function allow() {
    process.exit(ALLOW)
}

/** Parse the hook payload from stdin; null (→ fail open) on malformed input. */
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

/**
 * Resolve the project root. Prefer the harness-provided CLAUDE_PROJECT_DIR;
 * otherwise walk up from this hook file to the dir containing `.claude`.
 */
function projectRoot(cwd) {
    if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR
    const fromHook = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    if (existsSync(join(fromHook, '.claude'))) return fromHook
    if (cwd && existsSync(join(cwd, '.claude'))) return cwd
    return fromHook
}

/** Extract the Edit/Write target file path from the tool input. */
function targetPath(payload) {
    const ti = payload.tool_input ?? payload.toolInput ?? {}
    return ti.file_path ?? ti.filePath ?? ti.path ?? null
}

/** Path relative to root, POSIX-separated, no leading "./". null if outside root. */
function relPosix(root, abs) {
    if (!abs) return null
    const rel = relative(root, resolve(abs))
    if (rel.startsWith('..')) return null
    return rel.split(sep).join('/')
}

// ─── Path classification (generic) ─────────────────────────────────────────
//
// PROCESS-ARTIFACT paths are categorically exempt (authoring them IS the SDLC).
// Anything that is NOT a process artifact, and is inside the repo, is treated
// as implementation code and gated by the no-active-task rule. No repo-specific
// workspace names are baked in.

/** Is this a PROCESS-ARTIFACT path (exempt from the gate)? */
function isProcessArtifact(rel) {
    if (!rel) return false
    if (rel === 'specs/sdlc-state-machine.yaml') return true
    if (!rel.includes('/') && /\.md$/i.test(rel)) return true // root-level docs
    return (
        rel.startsWith('specs/') ||
        rel.startsWith('.ai/') ||
        rel.startsWith('.agents/') ||
        rel.startsWith('.claude/') ||
        rel.startsWith('docs/') ||
        rel.startsWith('templates/') ||
        rel.startsWith('.github/')
    )
}

/** Is this an IMPLEMENTATION-CODE path (gated)? Generic: not a process artifact. */
function isImplementationCode(rel) {
    if (!rel) return false
    return !isProcessArtifact(rel)
}

// ─── Active-task context ───────────────────────────────────────────────────

/** Current git branch, or null if it can't be resolved. */
function currentBranch(root) {
    // Test seam: tests/CI can inject a branch without a git checkout.
    if (process.env.SDLC_EDIT_GATE_BRANCH != null) {
        return process.env.SDLC_EDIT_GATE_BRANCH || null
    }
    try {
        return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim()
    } catch {
        return null
    }
}

/**
 * Is there an active task context? Deterministic: the branch matches one of the
 * work-branch prefixes (claude/SPEC-… | task/… | spec/… | feat/SPEC-…).
 */
function hasActiveTask(root) {
    const branch = currentBranch(root)
    if (!branch) return false
    return /^(claude\/SPEC-|task\/|spec\/|feat\/SPEC-)/i.test(branch)
}

// ─── Override (per-session state file from UserPromptSubmit) ────────────────

function overridePath(root, sessionId) {
    if (!sessionId) return null
    return join(root, '.claude', `.sdlc-override-${sessionId}`)
}

/** The override reason if the session override file is present, else null. */
function readOverride(root, sessionId) {
    const path = overridePath(root, sessionId)
    if (!path || !existsSync(path)) return null
    try {
        return readFileSync(path, 'utf8').trim() || '(no reason recorded)'
    } catch {
        return null
    }
}

/** Record a logged bypass (visible, never silent). Best-effort; never throws. */
function recordBypass(root, { sessionId, rel, reason }) {
    try {
        const line =
            JSON.stringify({
                ts: new Date().toISOString(),
                hook: 'pre-tool-use-edit-write',
                event: 'override-bypass',
                session_id: sessionId ?? null,
                target: rel,
                reason
            }) + '\n'
        appendFileSync(join(root, '.claude', '.sdlc-override-log'), line, 'utf8')
    } catch {
        // recording is best-effort; never block on a logging failure.
    }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
    if (GUARD_MODE === 'off') allow() // emergency kill-switch: no-op, no I/O

    const payload = parsePayload()
    if (!payload) allow() // fail open on no/bad input

    const toolName = payload.tool_name ?? payload.toolName
    if (toolName !== 'Edit' && toolName !== 'Write') allow()

    const cwd = payload.cwd ?? payload.workingDir ?? null
    const root = projectRoot(cwd)
    const sessionId = payload.session_id ?? payload.sessionId ?? null

    const rel = relPosix(root, targetPath(payload))
    if (!rel) allow() // target outside the project root → not our concern

    // Implementation-code edit with no active task context.
    if (isImplementationCode(rel)) {
        if (hasActiveTask(root)) allow() // active task → fine

        // No active task. Honor a logged override if present.
        const reason = readOverride(root, sessionId)
        if (reason) {
            recordBypass(root, { sessionId, rel, reason })
            allow()
        }

        deny(
            `BLOCKED by the no-active-task implementation-code gate (SDLC phase spine).\n` +
                `File: ${rel}\n` +
                `This is an implementation-code path and no active task context was detected ` +
                `(branch does not match claude/SPEC-… | task/… | spec/… | feat/SPEC-…).\n` +
                `Start a task (create a work branch) so the change is anchored to the SDLC, or — ` +
                `for a genuine exception — add an \`out-of-process: <reason>\` line to your prompt; ` +
                `the override is recorded (visible, never silent) and the edit then proceeds.`
        )
    }

    // Process-artifact and out-of-repo paths are never gated.
    allow()
}

try {
    main()
} catch {
    allow() // fail open
}
