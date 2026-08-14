#!/usr/bin/env node
// plan-gate.mjs — the plan-review gate (ADR-002), fail-closed.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined).
//
// A spec may not be executed until its PLAN — the spec *and* the decomposition
// that will actually run — has been reviewed and approved. The verdict is a
// top-level `plan_review:` block in `specs/tasks/SPEC-NNN/_index.yaml`:
//
//   plan_review:
//       approved: true            # the OWNER sets this; task-decomposition stamps false
//       status: reviewed          # `needs-rework` vetoes the approval
//       reviewer: spec-reviewer
//       date: 2026-08-14
//
// A MISSING block is treated exactly like an unapproved one — HALT. The block is
// additive to the `_index.yaml` schema (files without it stay schema-valid); the
// gate is what fails closed on it.
//
// Re-homed out of the retired `execute-spec` Workflow (ADR-003): the gate is now
// checked by the agent entering `spec-execution` (skill §1) and by CI, rather than
// by an engine at its Plan phase.
//
// Usage:
//   node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml [...]
//
// Exits 0 when every given plan is approved, 1 otherwise (diagnostics on stderr).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The gate predicate. A plan is approved ONLY when the block is present, approved,
 * and not flagged for rework. Absent block ⇒ undefined ⇒ false (fail-closed).
 */
export const planApproved = (pr) => !!pr && pr.approved === true && pr.status !== 'needs-rework'

/** Strip a trailing unquoted `# comment` and surrounding quotes/whitespace. */
function scalar(raw) {
    if (raw == null) return null
    let s = String(raw).trim()
    if (!/^['"]/.test(s)) {
        const hash = s.indexOf(' #')
        if (hash !== -1) s = s.slice(0, hash).trim()
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1)
    return s
}

/** Coerce a YAML scalar to a boolean where it reads as one, else leave the string. */
function coerce(v) {
    if (v === 'true') return true
    if (v === 'false') return false
    return v
}

/**
 * Extract the top-level `plan_review:` block from an `_index.yaml` text via a
 * minimal indentation-aware scan. Returns the block's scalar fields, or null when
 * there is no block (which the gate treats as unapproved).
 */
export function parsePlanReviewBlock(text) {
    const lines = String(text).split('\n')
    let inBlock = false
    let baseIndent = null
    const block = {}
    for (const line of lines) {
        if (/^plan_review\s*:\s*$/.test(line)) {
            inBlock = true
            continue
        }
        if (!inBlock) continue
        if (line.trim() === '') continue
        const indent = line.match(/^(\s*)/)[1].length
        if (baseIndent === null) baseIndent = indent
        if (indent < baseIndent || /^\S/.test(line)) break
        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) block[kv[1]] = coerce(scalar(kv[2]))
    }
    return Object.keys(block).length ? block : null
}

/** Read one `_index.yaml` and return `{ path, block, approved, reason }`. */
export function checkPlanGate(path) {
    let text
    try {
        text = readFileSync(path, 'utf8')
    } catch (err) {
        return { path, block: null, approved: false, reason: `cannot read ${path}: ${err.message}` }
    }
    const block = parsePlanReviewBlock(text)
    if (!block) {
        return {
            path,
            block: null,
            approved: false,
            reason: 'no plan_review: block — the gate is fail-closed, so an unreviewed plan HALTs'
        }
    }
    if (!planApproved(block)) {
        return {
            path,
            block,
            approved: false,
            reason: `plan_review present but not approved (approved: ${block.approved}, status: ${block.status})`
        }
    }
    return { path, block, approved: true, reason: null }
}

function main(argv) {
    if (argv.length === 0) {
        process.stderr.write('usage: node scripts/sdlc/plan-gate.mjs <_index.yaml> [...]\n')
        process.exit(1)
    }
    let ok = true
    for (const path of argv) {
        const res = checkPlanGate(path)
        if (res.approved) {
            process.stdout.write(`plan-gate: APPROVED ${res.path}\n`)
        } else {
            ok = false
            process.stderr.write(`plan-gate: HALT ${res.path} — ${res.reason}\n`)
        }
    }
    if (!ok) {
        process.stderr.write(
            'Run plan review, then set plan_review.approved: true (status must not be needs-rework).\n'
        )
    }
    process.exit(ok ? 0 : 1)
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main(process.argv.slice(2))
