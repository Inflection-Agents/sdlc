#!/usr/bin/env node
// reviewer-routing.mjs — lens → reviewer resolution (ADR-001).
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined).
//
// The lens→reviewer binding is DATA on the constraint that already owns the lens:
// each `.ai/skills/review-constraints.yaml` constraint may name its own `agent:`.
// A lens with no such constraint folds into the generic `task-reviewer`.
//
// This module was re-homed out of the retired `execute-spec` Workflow (ADR-003)
// so the binding survives the engine's deletion. Its consumer is now the agent
// running `spec-execution` (and `pr-reviewer`), which resolves each lens at the
// integration gate instead of an engine resolving it per task.
//
// Usage:
//   node scripts/sdlc/reviewer-routing.mjs <lens>      # print the reviewer for one lens
//   node scripts/sdlc/reviewer-routing.mjs --list      # print the whole lens → reviewer table
//   node scripts/sdlc/reviewer-routing.mjs --registry <path> <lens>
//
// Exits 0 always (an unmapped lens is a valid answer: `task-reviewer`), 1 only
// when the registry cannot be read.
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
export const DEFAULT_REGISTRY = join(REPO_ROOT, '.ai', 'skills', 'review-constraints.yaml')

/** The reviewer a lens with no registered specialist folds into. */
export const GENERIC_REVIEWER = 'task-reviewer'

/**
 * Resolve a lens to its reviewer agentType. Pure: depends only on the parsed
 * constraints and the lens. An unmapped lens (no matching constraint, or one that
 * declares no `agent:`) folds into the generic reviewer. Integration-scope
 * constraints carry no `agent:` — they are graded by the `integration-reviewer` at
 * the gate, which is a property of the gate, not of this lookup.
 */
export function agentForLens(constraints, lens) {
    return ((constraints || []).find((c) => c.lens === lens && c.agent) || {}).agent || GENERIC_REVIEWER
}

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

/**
 * Parse the `constraints:` list out of the registry YAML text, keeping only the
 * scalar fields this module and its callers route on (`id`, `lens`, `agent`,
 * `scope`, `severity`). Nested/blocked fields (`when:`, `check:`) are skipped —
 * matching a constraint to a task's touches is the reviewer's job, not routing's.
 * Returns [] on anything it cannot read.
 */
export function parseConstraints(text) {
    const lines = String(text).split('\n')
    const out = []
    let inList = false
    let current = null
    // Indent of an open block scalar (`check: >` / `check: |`). Every line more
    // indented than its key belongs to that block and is PROSE, not YAML. Without
    // this, a `check:` paragraph containing a line that starts `agent: ...` silently
    // overwrote the constraint's real routing — free-text hijacking a reviewer.
    let blockIndent = null
    const KEYS = new Set(['id', 'lens', 'agent', 'scope', 'severity'])
    const indentOf = (l) => l.match(/^(\s*)/)[1].length
    for (const line of lines) {
        if (/^constraints\s*:/.test(line)) {
            inList = true
            continue
        }
        if (!inList) continue
        if (blockIndent !== null) {
            if (line.trim() === '' || indentOf(line) > blockIndent) continue // still inside the block
            blockIndent = null // dedented out of it
        }
        // Only a real top-level key ends the list — a column-0 `- id:` item is a
        // legal (if unusual) YAML style and must still be read.
        if (/^[A-Za-z_]/.test(line)) break
        const item = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) out.push(current)
            current = { id: scalar(item[1]) }
            continue
        }
        if (!current) continue
        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (!kv) continue
        if (/^[>|]/.test(kv[2].trim())) {
            blockIndent = indentOf(line) // a block scalar opens here
            continue
        }
        if (KEYS.has(kv[1]) && kv[2].trim() !== '') current[kv[1]] = scalar(kv[2])
    }
    if (current) out.push(current)
    return out.filter((c) => c.id)
}

/** Read + parse the registry. Throws only if the file cannot be read. */
export function loadConstraints(registryPath = DEFAULT_REGISTRY) {
    return parseConstraints(readFileSync(registryPath, 'utf8'))
}

/**
 * Glob to RegExp. `**` crosses path separators, `*` does not, and every other
 * regex metacharacter is escaped so a literal dot cannot act as a wildcard.
 *
 * One pass, because the alternation tries `**` before `*`. Do NOT rewrite this as
 * chained .replace() calls with a placeholder between the `**` and `*` passes: the
 * placeholder must be a byte no glob can contain, and every such byte is a control
 * character that corrupts whatever file it is written into.
 */
export const globToRe = (g) =>
    new RegExp(
        '^' +
            g.replace(/\*\*|\*|[.+^${}()|[\]\\?]/g, (m) =>
                m === '**' ? '.*' : m === '*' ? '[^/]*' : '\\' + m
            ) +
            '$'
    )

/**
 * The task-scope constraints registered against one file path.
 *
 * `scope: integration` rows grade a whole spec diff at the gate, so a single edit
 * is not the artifact they grade and they are excluded. A row with no
 * `when.touches` (workspace- or task_has-gated) cannot be matched against a bare
 * path and is skipped rather than treated as a match.
 */
export const applicableConstraints = (rows, relPath) =>
    (Array.isArray(rows) ? rows : []).filter((c) => {
        if ((c?.scope ?? 'task') !== 'task') return false
        const globs = c?.when?.touches
        return Array.isArray(globs) && globs.some((g) => globToRe(g).test(relPath))
    })

function main(argv) {
    const args = [...argv]
    let registry = DEFAULT_REGISTRY
    const rIdx = args.indexOf('--registry')
    if (rIdx !== -1) {
        registry = args[rIdx + 1]
        args.splice(rIdx, 2)
    }
    let constraints
    try {
        constraints = loadConstraints(registry)
    } catch (err) {
        process.stderr.write(`reviewer-routing: cannot read registry ${registry}: ${err.message}\n`)
        process.exit(1)
    }
    if (args.includes('--list') || args.length === 0) {
        const lenses = [...new Set(constraints.map((c) => c.lens).filter(Boolean))].sort()
        for (const lens of lenses) {
            const scope = constraints.find((c) => c.lens === lens)?.scope ?? 'task'
            process.stdout.write(`${lens}\t${agentForLens(constraints, lens)}\t(scope: ${scope})\n`)
        }
        process.exit(0)
    }
    process.stdout.write(`${agentForLens(constraints, args[0])}\n`)
    process.exit(0)
}


/**
 * Is this module the process entry point? Compares realpath to realpath —
 * `import.meta.url` is already resolved by Node, so an unresolved `process.argv[1]`
 * (any symlinked path or symlinked ancestor directory) would never match, silently
 * turning this CLI into a no-op that still exits 0.
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
// realpathSync BOTH sides: `import.meta.url` is already realpath'd by Node, so
// comparing it against an unresolved argv[1] makes the guard fail — and a failed
// guard here is SILENT (the CLI exits 0 having done nothing, which callers read as
// success). Invoking through a symlinked ancestor directory reproduced exactly that.
const invokedDirectly = isMain(import.meta.url)
if (invokedDirectly) main(process.argv.slice(2))
