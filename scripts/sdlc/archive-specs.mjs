#!/usr/bin/env node
/**
 * Move specs whose authority has expired out of the default retrieval path.
 *
 * A spec is written in future tense and never rewritten, so once it merges its
 * description of the system is a snapshot that keeps reading as current. Marking it
 * stale does not help: every spec already carries a status, and a model shown a
 * labelled-stale document overrides its own correct prior more than half the time.
 * Position does help, because the search tool enforces it and the reader cannot
 * forget to check.
 *
 * Nothing is deleted. `git mv` preserves history, the archive stays tracked, and
 * `scripts/sdlc/resolve.mjs` addresses it by id.
 *
 * TWO DENYLIST CLAUSES, both derived at runtime rather than hardcoded:
 *   1. A spec whose id appears anywhere under `.ai/skills/**`. A token scan, not a
 *      spec-of-record test, and deliberately over-broad — see collectCitedIds.
 *   2. A spec that is the `spec:` binding of a non-archived ADR. Archiving it would
 *      orphan an ADR that is still cited as current authority.
 *
 * Usage:
 *   node scripts/sdlc/archive-specs.mjs            # move eligible specs
 *   node scripts/sdlc/archive-specs.mjs --check    # exit 1 if any are misplaced
 *   node scripts/sdlc/archive-specs.mjs --dry-run  # print the plan only
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SPECS = join(ROOT, 'specs')
const ARCHIVE = join(SPECS, 'archive')
const ARCHIVE_SPECS = join(ARCHIVE, 'specs')
const ARCHIVE_TASKS = join(ARCHIVE, 'tasks')

/** Statuses whose spec still governs work in flight and must stay searchable. */
export const LIVE_STATUSES = new Set(['draft', 'active'])

const SPEC_FILE = /^spec-\d+.*\.md$/i
const read = (p) => readFileSync(p, 'utf8')

/** The leading `---` frontmatter block, or null when the document has none. */
function frontmatter(text) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    return m ? m[1] : null
}

/**
 * A spec's status, read from frontmatter ONLY.
 *
 * `specs/SPEC-004-artifact-completeness-ports.md` carries a template line
 * `status: open | resolved | wontfix` in its body, so a bare `^status:` scan returns
 * two values for that file. A document with no frontmatter returns null, which the
 * caller treats as live: refusing to move a file we cannot read is the safe default
 * when the move is a `git mv`.
 */
export function statusOf(text) {
    const front = frontmatter(text)
    if (!front) return null
    const m = front.match(/^status:\s*['"]?([A-Za-z-]+)/m)
    return m ? m[1].toLowerCase() : null
}

/**
 * A companion sub-document: it declares `parent_spec` and no `id` of its own.
 *
 * The task tree is resolved from the FILENAME's id, so archiving a companion alone
 * would move a LIVE parent's task tree behind the fence with no warning. Companions
 * follow their parent in both directions or they do not move.
 */
export function isCompanion(text) {
    const front = frontmatter(text)
    if (!front) return false
    return /^parent_spec:\s*\S/m.test(front) && !/^id:\s*\S/m.test(front)
}

/**
 * The specs eligible to move, given the two protection sets.
 *
 * Pure: every filesystem read happens in the callers below, so the rules can be
 * tested without a repo.
 */
export function archivable(specs, { citedIds, adrBoundIds }) {
    return specs.filter((s) => {
        if (s.companion) return false
        if (!s.status) return false
        if (LIVE_STATUSES.has(s.status)) return false
        if (citedIds.has(s.id)) return false
        if (adrBoundIds.has(s.id)) return false
        return true
    })
}

/**
 * Every `SPEC-NNN` token appearing anywhere under `.ai/skills/**`.
 *
 * Deliberately over-broad: it is a token scan, not a spec-of-record test, so it also
 * protects ids that appear only as illustrative examples in skill prose (SPEC-026,
 * SPEC-042 and SPEC-099 are matched today and do not exist in this corpus). That is
 * the safe direction for an operation ending in `git mv` — a false protect leaves a
 * document searchable, a false archive hides one the skills still route readers to.
 */
export function collectCitedIds(root = ROOT, knownIds = null) {
    const ids = new Set()
    const skills = join(root, '.ai', 'skills')
    const walk = (dir) => {
        if (!existsSync(dir)) return
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const p = join(dir, entry.name)
            // Do not follow symlinks: .claude/skills points at .ai/skills, and a
            // following walk would read every skill twice.
            if (entry.isDirectory()) walk(p)
            else if (entry.isFile() && entry.name.endsWith('.md')) {
                for (const m of read(p).matchAll(/\b(SPEC-\d{3})\b/g)) ids.add(m[1])
            }
        }
    }
    walk(skills)
    // The constraints registry sits outside .ai/skills on purpose (that tree ships in
    // the plugin and is overwritten on update), so it is read from its own path.
    for (const p of [join(skills, 'review-primitives.md'), join(root, '.ai', 'sdlc', 'review-constraints.yaml')]) {
        if (existsSync(p)) for (const m of read(p).matchAll(/\b(SPEC-\d{3})\b/g)) ids.add(m[1])
    }
    // Keep only ids that name a spec THIS repo actually has. The shipped skills cite
    // the framework's own SPEC-001/002/004/006 as provenance, so an unfiltered scan
    // pinned those four numbers as permanently unarchivable in every repo that copied
    // the framework - ids that have nothing to do with that repo's specs.
    if (!knownIds) return ids
    return new Set([...ids].filter((id) => knownIds.has(id)))
}

/** Spec ids bound by an ADR that is not itself archived. */
export function collectAdrBoundIds(root = ROOT) {
    const ids = new Set()
    const dir = join(root, 'specs', 'adrs')
    if (!existsSync(dir)) return ids
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.md')) continue
        const front = frontmatter(read(join(dir, name)))
        if (!front) continue
        const m = front.match(/^spec:\s*['"]?(SPEC-\d{3})/m)
        if (m) ids.add(m[1])
    }
    return ids
}

/** Spec files sitting directly in `specs/`, with their status and companion flag. */
function scanLive() {
    if (!existsSync(SPECS)) return []
    return readdirSync(SPECS)
        .filter((f) => SPEC_FILE.test(f))
        .map((f) => {
            const path = join(SPECS, f)
            const text = read(path)
            return {
                id: (f.match(/^(SPEC-\d+)/i) || [])[1],
                file: f,
                path,
                status: statusOf(text),
                companion: isCompanion(text)
            }
        })
}

/** Archived spec files that should NOT be there (status reverted to live). */
function scanArchived() {
    if (!existsSync(ARCHIVE_SPECS)) return []
    return readdirSync(ARCHIVE_SPECS)
        .filter((f) => SPEC_FILE.test(f))
        .map((f) => {
            const path = join(ARCHIVE_SPECS, f)
            const text = read(path)
            return {
                id: (f.match(/^(SPEC-\d+)/i) || [])[1],
                file: f,
                path,
                status: statusOf(text),
                companion: isCompanion(text)
            }
        })
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })

/**
 * Write the ripgrep fence for an archive directory.
 *
 * The fence is what makes archiving mean anything: without it the move is a plain
 * `git mv` with zero retrieval effect. It was hand-committed in the framework repo
 * and therefore did not exist in any repo that copied the framework, so archiving
 * downstream hid nothing. Each directory carries its OWN `*` because a repo-root
 * pattern leaks whenever ripgrep is given several path arguments and the walk root
 * shifts.
 */
function ensureFence(dir) {
    mkdirSync(dir, { recursive: true })
    const fence = join(dir, '.ignore')
    if (!existsSync(fence)) writeFileSync(fence, '*\n')
}

function move(from, to) {
    ensureFence(ARCHIVE)
    ensureFence(dirname(to))
    git(['mv', from, to])
}

function main(argv) {
    const check = argv.includes('--check')
    const dryRun = argv.includes('--dry-run')

    const live = scanLive()
    const knownIds = new Set([...live, ...scanArchived()].map((s) => s.id).filter(Boolean))
    const protections = { citedIds: collectCitedIds(ROOT, knownIds), adrBoundIds: collectAdrBoundIds() }
    const toArchive = archivable(live, protections)
    // A spec whose status went back to draft/active is restored by the same run.
    const toRestore = scanArchived().filter((s) => s.status && LIVE_STATUSES.has(s.status))

    if (check) {
        const problems = [
            ...toArchive.map((s) => `misplaced (should be archived): specs/${s.file} [${s.status}]`),
            ...toRestore.map((s) => `misplaced (should be live): specs/archive/specs/${s.file} [${s.status}]`)
        ]
        if (problems.length) {
            process.stderr.write(
                `archive boundary is incorrect:\n  ${problems.join('\n  ')}\n\n` +
                    `Run: node scripts/sdlc/archive-specs.mjs\n`
            )
            process.exit(1)
        }
        process.stdout.write('archive boundary OK\n')
        return
    }

    if (!toArchive.length && !toRestore.length) {
        process.stdout.write('nothing to archive or restore.\n')
        return
    }

    for (const s of toArchive) {
        const target = join(ARCHIVE_SPECS, s.file)
        const tasks = join(SPECS, 'tasks', s.id)
        const tasksTarget = join(ARCHIVE_TASKS, s.id)
        if (dryRun) {
            process.stdout.write(`archive  ${s.file} [${s.status}]\n`)
            if (existsSync(tasks)) process.stdout.write(`         + tasks/${s.id}/\n`)
            continue
        }
        move(s.path, target)
        if (existsSync(tasks)) move(tasks, tasksTarget)
    }

    for (const s of toRestore) {
        const target = join(SPECS, s.file)
        const tasks = join(ARCHIVE_TASKS, s.id)
        const tasksTarget = join(SPECS, 'tasks', s.id)
        if (dryRun) {
            process.stdout.write(`restore  ${s.file} [${s.status}]\n`)
            continue
        }
        move(s.path, target)
        if (existsSync(tasks)) move(tasks, tasksTarget)
    }

    if (dryRun) {
        process.stdout.write(`\n${toArchive.length} to archive, ${toRestore.length} to restore.\n`)
        return
    }
    process.stdout.write(`archived ${toArchive.length} spec(s), restored ${toRestore.length}.\n`)
}

/**
 * Whether this file was invoked directly.
 *
 * `import.meta.url` is already realpath'd by Node; `process.argv[1]` is not, so a raw
 * comparison silently turns the CLI into a no-op that still exits 0 when invoked
 * through a symlinked path or symlinked ancestor directory. This repo fixed that once
 * already; `cli-invocation.test.mjs` is the regression suite.
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

if (isMain(import.meta.url)) main(process.argv.slice(2))

