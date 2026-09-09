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
import { parseRegistryTouches } from './check-review-constraint-globs.mjs'

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
    // Normalize CRLF once: every row regex below ends `$` without the `m` flag, so on a
    // Windows checkout (core.autocrlf=true) not one line would match and the registry
    // would silently parse to zero rows.
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
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
    const text = readFileSync(registryPath, 'utf8')
    return enrich(parseConstraints(text), text)
}

/**
 * Join the routing rows with the two fields a write-time reader needs and
 * `parseConstraints` deliberately does not read: the `when.touches` globs and the
 * `check:` block scalar.
 *
 * Touches come from `parseRegistryTouches`, which already handles both the flow and
 * block YAML forms and the block-scalar hazard. Parsing them a second time here is
 * exactly the two-copies drift ADR-001 deleted the hardcoded lens map to prevent.
 */
export function enrich(rows, text) {
    const touchesById = new Map(parseRegistryTouches(text).map((r) => [r.id, r.touches]))
    const extras = parseRowExtras(text)
    return rows.map((c) => ({
        ...c,
        when: { ...(c.when ?? {}), touches: touchesById.get(c.id) ?? c.when?.touches ?? [] },
        check: c.check ?? extras.get(c.id)?.check ?? null,
        cite: c.cite ?? extras.get(c.id)?.cite ?? null
    }))
}

/**
 * The `check:` block scalar and the `cite:` scalar per constraint id.
 *
 * `parseConstraints` skips block scalars because a `check:` paragraph containing a
 * line like `agent: x` would otherwise hijack a constraint's routing, and it reads
 * only routing keys so its output shape stays pinned. That is right for routing and
 * wrong for a reader that wants the prose, so this reads both deliberately — and
 * never lets a line inside an open block become a key.
 */
export function parseRowExtras(text) {
    const out = new Map()
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
    const indentOf = (l) => l.match(/^(\s*)/)[1].length
    let id = null
    let collecting = null
    let keyIndent = 0
    let skipIndent = null
    const row = (i) => {
        if (!out.has(i)) out.set(i, { check: null, cite: null })
        return out.get(i)
    }
    const flush = () => {
        if (id && collecting && collecting.length) row(id).check = collecting.join(' ').trim()
        collecting = null
    }
    for (const line of lines) {
        if (skipIndent !== null) {
            if (line.trim() === '' || indentOf(line) > skipIndent) continue
            skipIndent = null
        }
        if (collecting) {
            if (line.trim() === '' || indentOf(line) > keyIndent) {
                if (line.trim() !== '') collecting.push(line.trim())
                continue
            }
            flush()
        }
        const item = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (item) {
            flush()
            id = item[1].trim().replace(/^["']|["']$/g, '')
            continue
        }
        const opensAny = line.match(/^(\s*)[a-z_]+\s*:\s*[>|]/i)
        if (opensAny) {
            const isCheck = /^\s*check\s*:/.test(line)
            if (isCheck && id) {
                keyIndent = opensAny[1].length
                collecting = []
            } else {
                // Any OTHER block scalar is prose too. Without this, a `cite:` line
                // inside a `notes: |` block is captured as the row's citation - and a
                // reviewer grounds a blocker on that value.
                skipIndent = opensAny[1].length
            }
            continue
        }
        const cite = line.match(/^\s*cite\s*:\s*(.+)$/)
        if (cite && id) row(id).cite = cite[1].trim().replace(/^["']|["']$/g, '')
    }
    flush()
    return out
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
            // A LEADING `**/` matches zero or more segments, which is what git,
            // minimatch and fs.globSync all do. Compiling it as `.*\/` would require at
            // least one directory, so `**/domain/**` would miss a root-level `domain/`
            // while check-review-constraint-globs (which uses globSync) called the same
            // glob healthy - two engines disagreeing about the same registry row.
            g.replace(/^\*\*\//, '\u0000')
                .replace(/\*\*|\*|[.+^${}()|[\]\\?]/g, (m) =>
                    m === '**' ? '.*' : m === '*' ? '[^/]*' : '\\' + m
                )
                .replace(/\u0000/, '(?:.*\\/)?') +
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
        return Array.isArray(globs) && globs.some((g) => typeof g === 'string' && globToRe(g).test(relPath))
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
