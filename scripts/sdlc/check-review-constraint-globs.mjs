#!/usr/bin/env node
/**
 * check-review-constraint-globs.mjs — resolvability gate for the review registry.
 *
 * Generic reference implementation shipped by the AI-native SDLC framework.
 * Dependency-free (Node built-ins only; uses `fs.globSync`, Node ≥ 22).
 *
 * WHY THIS EXISTS. ADR-003 retired the deterministic engine and made
 * `.ai/skills/review-constraints.yaml` the SDLC's only mechanical review
 * guarantee: where a constraint's `when` matches, its lens must review; everything
 * else is the agent's judgment. That elevation turns a latent bug into a live one
 * — a `when.touches` glob that matches nothing in the repo silently advertises
 * coverage that can never fire. Under an unconditional base panel such a dead glob
 * is invisible; without one it means the change earns no mandatory reviewer at all.
 *
 *   RESOLVABILITY — every `when.touches` glob on every constraint should resolve to
 *   at least one real file. A glob that resolves to nothing is worse than an honest
 *   gap, because the skill advertises it as covered.
 *
 * Deliberately NOT checked here (out of scope, stated so the gap is explicit):
 *   - `when.workspace` values (a name, not a path — nothing to resolve).
 *   - `when.task_has` fields (task frontmatter, not a path).
 *   - whether the registry's COVERAGE is adequate. ADR-003 records, as an owner
 *     decision, that a change matching no constraint gets no mandatory reviewer;
 *     this gate only guarantees that the rows which DO exist are honest.
 *   - that a concrete-path task declaration matches the constraints its files fall
 *     under. Matching is a bidirectional glob-overlap test, so a narrowly declared
 *     scope can miss a constraint whose glob covers the same files.
 *
 * Posture: WARN by default, like the framework's other advisory gates — the
 * registry ships with illustrative example rows that intentionally resolve to
 * nothing in a fresh repo. Pass `--enforce` (or set REVIEW_GLOBS_MODE=enforce)
 * once a repo has replaced them with its own, and wire that form into CI.
 *
 * Usage:
 *   node scripts/sdlc/check-review-constraint-globs.mjs [--enforce] [--registry <path>]
 *
 * Exit 0 when every glob resolves (or in warn mode), 1 on an unresolvable glob
 * under --enforce.
 */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const REPO_ROOT = process.env.REVIEW_CONSTRAINTS_ROOT ?? resolve(__dirname, '..', '..')
export const REGISTRY_REL = '.ai/skills/review-constraints.yaml'
export const REGISTRY_FILE = process.env.REVIEW_CONSTRAINTS_FILE ?? join(REPO_ROOT, REGISTRY_REL)

/** Path segments never worth counting as a match when resolving a glob. */
const IGNORED_SEGMENTS = ['node_modules', '.git', 'dist', 'build', '.next']

/**
 * Parse `{ id, touches[] }` rows out of the registry text. Handles both the inline
 * flow form (`when: { touches: ["a/**", "b/**"] }`) and the block form
 * (`when:` / `  touches:` / `    - a/**`). Returns [] on anything unreadable.
 */
export function parseRegistryTouches(text) {
    const lines = String(text).split('\n')
    const rows = []
    let current = null
    let inTouchesBlock = false
    const pushLiterals = (s, target) => {
        for (const m of String(s).matchAll(/["']([^"']+)["']/g)) target.push(m[1])
    }
    for (const line of lines) {
        const item = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) rows.push(current)
            current = { id: item[1].trim().replace(/^["']|["']$/g, ''), touches: [] }
            inTouchesBlock = false
            continue
        }
        if (!current) continue
        const flow = line.match(/^\s*when\s*:\s*\{(.*)\}\s*$/)
        if (flow) {
            const t = flow[1].match(/touches\s*:\s*\[([^\]]*)\]/)
            if (t) pushLiterals(t[1], current.touches)
            inTouchesBlock = false
            continue
        }
        const inlineList = line.match(/^\s*touches\s*:\s*\[([^\]]*)\]\s*$/)
        if (inlineList) {
            pushLiterals(inlineList[1], current.touches)
            inTouchesBlock = false
            continue
        }
        if (/^\s*touches\s*:\s*$/.test(line)) {
            inTouchesBlock = true
            continue
        }
        if (inTouchesBlock) {
            const entry = line.match(/^\s*-\s*(.+)$/)
            if (entry) {
                current.touches.push(entry[1].trim().replace(/^["']|["']$/g, ''))
                continue
            }
            inTouchesBlock = false
        }
    }
    if (current) rows.push(current)
    return rows.filter((r) => r.touches.length > 0)
}

/** Does this glob match at least one real file under `root`? */
export function globResolves(glob, root = REPO_ROOT) {
    try {
        const hits = globSync(glob, {
            cwd: root,
            exclude: (p) => String(p).split('/').some((seg) => IGNORED_SEGMENTS.includes(seg))
        })
        return hits.length > 0
    } catch {
        return false
    }
}

/** Returns the list of `{ id, glob }` pairs that resolve to nothing. */
export function findDeadGlobs(rows, root = REPO_ROOT) {
    const dead = []
    for (const row of rows) {
        for (const glob of row.touches) {
            if (!globResolves(glob, root)) dead.push({ id: row.id, glob })
        }
    }
    return dead
}

function main(argv) {
    let registry = REGISTRY_FILE
    const rIdx = argv.indexOf('--registry')
    if (rIdx !== -1) registry = argv[rIdx + 1]
    const enforce = argv.includes('--enforce') || process.env.REVIEW_GLOBS_MODE === 'enforce'

    let text
    try {
        text = readFileSync(registry, 'utf8')
    } catch (err) {
        process.stderr.write(`check-review-constraint-globs: cannot read ${registry}: ${err.message}\n`)
        process.exit(enforce ? 1 : 0)
    }
    const rows = parseRegistryTouches(text)
    const dead = findDeadGlobs(rows, REPO_ROOT)

    if (dead.length === 0) {
        process.stdout.write(
            `✓ every when.touches glob resolves (${rows.length} constraint${rows.length === 1 ? '' : 's'} checked)\n`
        )
        process.exit(0)
    }
    const label = enforce ? '✖ DEAD GLOB' : '⚠ dead glob (warn mode)'
    for (const d of dead) process.stderr.write(`${label} — ${d.id}: ${d.glob} matches no file\n`)
    process.stderr.write(
        enforce
          ? 'A constraint that matches nothing advertises coverage it cannot deliver. Fix the glob or delete the row.\n'
          : 'Warn mode: the shipped registry ships illustrative rows. Replace them with this repo\'s real constraints, then run with --enforce in CI.\n'
    )
    process.exit(enforce ? 1 : 0)
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main(process.argv.slice(2))
