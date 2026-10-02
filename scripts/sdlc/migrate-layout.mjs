#!/usr/bin/env node
/**
 * Migrate a repo from SDLC layout 1 (the agent-config folder and top-level validators) to layout 2 (`.sdlc/`)
 * (SPEC-009 Design > Migration, ADR-008 decision 5).
 *
 * It runs from the plugin, because a layout-1 repo has no copy of it. It computes the
 * whole plan before touching anything, so `--dry-run` prints exactly what `--apply`
 * would do, and a refusal (a dirty tree, an unreadable workspace table) leaves the repo
 * as it was. `--apply` commits the migration as one commit on `chore/sdlc-layout-v2` and
 * then scans for layout-1 references a text rewrite could not fix. A hit is printed as
 * file:line and the command exits 3; the owner fixes it in further commits on the branch.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/migrate-layout.mjs --root . (--dry-run | --apply) [--exclude <glob>]...
 *
 * Exit codes: 0 migrated, or nothing to migrate; 1 refused; 3 committed with scan hits.
 */
import { execFileSync } from 'node:child_process'
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    realpathSync,
    rmdirSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs'
import { basename, dirname, join, matchesGlob, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadManifest, releasedVersions, roleOf } from './gen-released-payloads.mjs'
import { appendLines, appendPrettierIgnore, ensureClaudeImport, insertAgentsBlock, BLOCK_BEGIN } from './install-payload.mjs'
import {
    AGENT_FILES,
    CONTRACT_FILES,
    FRAMEWORK_TEMPLATES,
    LAYOUT1,
    LAYOUT1_DIRS,
    frontmatterStatus,
    isHistory,
    isUnder,
    mapEntries,
    mapPath,
    rewriteText,
} from './lib/legacy-map.mjs'
import { emitYaml, parseYaml } from './lib/mini-yaml.mjs'
import { CONFIG_REL, assertWriteInside, isLayout1Root, readConfig, takeRootArg } from './lib/sdlc-paths.mjs'
import { BINARY, readText, scanRepo } from './scan-legacy-paths.mjs'
import { filesUnder, pluginVersion } from './sync-refresh.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '..', '..')
const PAYLOAD = join(PLUGIN, 'init-payload')
export const BRANCH = 'chore/sdlc-layout-v2'
export const COMMIT_MESSAGE = 'sdlc: migrate to layout 2'
/** Project prose up to this size goes inline in AGENTS.md: half of what Codex reads from it by default. */
export const AGENTS_BUDGET = 16 * 1024

export class Refusal extends Error {}

function git(root, args, opts = {}) {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts })
}

function localBranches(root) {
    return git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean)
}

// ─── Workspace tables (SPEC-009 Design > Migration > Workspace tables) ──────

const TABLES = {
    workspaces: /^#{2,4}\s+Workspaces\s*$/i,
    eligibility: /^#{2,4}\s+Agent eligibility by workspace\s*$/i,
    skills: /^#{2,4}\s+Workspace skills\s*$/i,
}
const POINTER = 'Listed in `.sdlc/config.yaml` `workspaces` (ADR-008).'

// A GFM `\|` is a pipe inside a cell, as in `pnpm test 2>&1 \| tee t.log`, not a column break.
const cells = (line) =>
    line
        .trim()
        .replace(/^\|/, '')
        .replace(/(?<!\\)\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, '|'))
const unwrap = (cell) => (/^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : cell)
const isPlaceholder = (row) => /^\[.*\]$/.test(unwrap(row[0] ?? ''))
const commandOf = (cell) => (/^`[^`]+`$/.test(cell) ? cell.slice(1, -1) : null)

function eligibility(value) {
    const v = value.toLowerCase().replace(/`/g, '')
    if (v.includes('caution')) return 'caution'
    if (v.startsWith('yes')) return 'yes'
    if (v.startsWith('no') || v.includes('human')) return 'human'
    return null
}

/** Find each table under its heading: { header, rows, start, end } with line indexes into `lines`. */
function findTable(lines, headingRe) {
    const h = lines.findIndex((l) => headingRe.test(l))
    if (h === -1) return null
    let i = h + 1
    while (i < lines.length && !lines[i].trim().startsWith('|') && !/^#{1,4}\s/.test(lines[i])) i += 1
    if (i >= lines.length || !lines[i].trim().startsWith('|')) return { heading: h, header: [], rows: [], start: -1, end: -1 }
    const start = i
    while (i < lines.length && lines[i].trim().startsWith('|')) i += 1
    const table = lines.slice(start, i)
    const header = cells(table[0] ?? '').map((c) => c.toLowerCase())
    const rows = table.slice(2).map(cells).filter((r) => r.some((c) => c !== ''))
    return { heading: h, header, rows, start, end: i }
}

const col = (header, ...names) => header.findIndex((h) => names.some((n) => h.includes(n)))

/**
 * Read the three workspace tables out of a project doc.
 * @returns {{ workspaces: object[], prose: string, dropped: string[], noted: string[], problems: string[] }}
 */
export function parseWorkspaceTables(text) {
    const lines = text.split('\n')
    const t = Object.fromEntries(Object.entries(TABLES).map(([k, re]) => [k, findTable(lines, re)]))
    const problems = []
    const dropped = []
    const noted = []
    const live = (table) => {
        const keep = []
        for (const r of table?.rows ?? []) {
            const name = Object.keys(TABLES).find((k) => t[k] === table)
            // A short row renders with empty trailing cells; a long one means a pipe split a cell.
            if (table.header.length && r.length > table.header.length) {
                problems.push(`${name} table: row "${r[0]}" has ${r.length} cells for ${table.header.length} columns`)
                continue
            }
            while (r.length < table.header.length) r.push('')
            if (isPlaceholder(r)) dropped.push(`${r[0]} (${Object.keys(TABLES).find((k) => t[k] === table)} table)`)
            else keep.push(r)
        }
        return keep
    }

    const ws = []
    if (t.workspaces) {
        const h = t.workspaces.header
        const at = { name: col(h, 'workspace'), path: col(h, 'path'), package: col(h, 'package'), stack: col(h, 'stack'), test: col(h, 'test'), build: col(h, 'build') }
        for (const r of live(t.workspaces)) {
            const entry = { name: unwrap(r[at.name] ?? ''), path: unwrap(r[at.path] ?? '').replace(/\/$/, '') }
            if (at.package !== -1) entry.package = unwrap(r[at.package] ?? '')
            if (at.stack !== -1) entry.stack = r[at.stack] ?? ''
            const notes = []
            for (const key of ['test', 'build']) {
                if (at[key] === -1) continue
                const cell = r[at[key]] ?? ''
                const cmd = commandOf(cell)
                entry[key] = cmd ?? ''
                if (!cmd && cell) {
                    notes.push(`${key}: ${cell}`)
                    noted.push(`${entry.name}.${key}`)
                }
            }
            entry._notes = { cmd: notes }
            ws.push(entry)
        }
    }
    const byName = new Map(ws.map((w) => [w.name, w]))

    for (const r of live(t.eligibility)) {
        const name = unwrap(r[0] ?? '')
        const w = byName.get(name)
        if (!w) {
            problems.push(`Agent eligibility by workspace: row "${name}" names no workspace in the Workspaces table`)
            continue
        }
        const h = t.eligibility.header
        const valueCell = r[col(h, 'executable', 'eligib')] ?? r[1] ?? ''
        const mapped = eligibility(valueCell)
        if (!mapped) problems.push(`Agent eligibility by workspace: row "${name}" value "${valueCell}" maps to none of yes, caution, human`)
        else w.agent_executable = mapped
        const notesCell = r[col(h, 'note')] ?? ''
        if (col(h, 'note') !== -1 && notesCell) w._notes.eligibility = notesCell
    }
    for (const r of live(t.skills)) {
        const name = unwrap(r[0] ?? '')
        const w = byName.get(name)
        if (!w) {
            problems.push(`Workspace skills: row "${name}" names no workspace in the Workspaces table`)
            continue
        }
        const h = t.skills.header
        const skillsCell = r[col(h, 'skill')] ?? r[1] ?? ''
        w.skills = skillsCell.split(',').map((s) => unwrap(s.trim())).filter(Boolean)
        const purpose = r[col(h, 'purpose')] ?? ''
        if (col(h, 'purpose') !== -1 && purpose) w._notes.skills = purpose
    }
    for (const w of ws) {
        if (!w.agent_executable) problems.push(`Workspaces: "${w.name}" has no row in Agent eligibility by workspace`)
        w.skills ??= []
        const parts = []
        if (w._notes.eligibility) parts.push(`eligibility: ${w._notes.eligibility}`)
        if (w._notes.skills) parts.push(`skills: ${w._notes.skills}`)
        parts.push(...w._notes.cmd)
        w.notes = parts.join('; ')
        delete w._notes
    }

    // Replace each table's lines with the pointer, bottom-up so the indexes hold.
    const tables = Object.values(t).filter((x) => x && x.start !== -1).sort((a, b) => b.start - a.start)
    for (const x of tables) lines.splice(x.start, x.end - x.start, POINTER)
    return { workspaces: ws, prose: lines.join('\n'), dropped, noted, problems }
}

// ─── State machine ──────────────────────────────────────────────────────────

/** The raw `domain_routing:` block of a machine's text, through the line before the next top-level key. */
export function cutDomainRouting(text) {
    const lines = text.split('\n')
    const start = lines.findIndex((l) => /^domain_routing\s*:/.test(l))
    if (start === -1) return null
    let end = start + 1
    while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]) || /^#/.test(lines[end]))) {
        if (/^#/.test(lines[end]) && !/^\s/.test(lines[end])) {
            // A top-level comment belongs to the next key unless more block lines follow it.
            const rest = lines.slice(end).find((l) => l !== '' && !/^#/.test(l))
            if (rest === undefined || !/^\s/.test(rest)) break
        }
        end += 1
    }
    while (end > start + 1 && lines[end - 1].trim() === '') end -= 1
    return lines.slice(start, end).join('\n')
}

// ─── The plan ───────────────────────────────────────────────────────────────

function tracked(root) {
    return git(root, ['ls-files', '-z']).split('\0').filter(Boolean)
}

function plannedMoves(files, forked) {
    const moves = new Map()
    const dirMoves = []
    const conflicts = []
    const contractNames = new Set(Object.values(CONTRACT_FILES))
    const take = (from, to) => (moves.has(from) ? null : moves.set(from, to))
    if (files.some((f) => isUnder(f, LAYOUT1_DIRS.aiSdlc))) dirMoves.push([LAYOUT1_DIRS.aiSdlc, '.sdlc'])
    if (forked) dirMoves.push([LAYOUT1_DIRS.aiSkills, '.sdlc/skills'])
    if (files.some((f) => f.startsWith(`${LAYOUT1.scripts}/`))) dirMoves.push([LAYOUT1.scripts, '.sdlc/scripts'])
    for (const f of files) {
        const dm = dirMoves.find(([d]) => f.startsWith(`${d}/`))
        if (dm) {
            take(f, dm[1] + f.slice(dm[0].length))
            continue
        }
        const name = basename(f)
        if (!forked && dirname(f) === LAYOUT1_DIRS.aiSkills && contractNames.has(name)) take(f, `.sdlc/contracts/${name}`)
        else if (dirname(f) === LAYOUT1_DIRS.ai && AGENT_FILES.includes(name)) take(f, `.sdlc/agents/${name}`)
        else if (f === LAYOUT1.machine) take(f, '.sdlc/state-machine.yaml')
        else if (LAYOUT1.templatesCandidates.includes(dirname(f)) && FRAMEWORK_TEMPLATES.includes(name)) {
            const to = `.sdlc/templates/${name}`
            if ([...moves.values()].includes(to)) conflicts.push(`${f} (a framework template of the same name already moves to ${to})`)
            else take(f, to)
        }
    }
    return { moves, dirMoves, conflicts }
}

/**
 * Compute the whole migration for `root` without writing anything. Throws `Refusal`
 * when the repo cannot be migrated as it stands.
 */
export function planMigration(root, { exclude = [] } = {}) {
    try {
        git(root, ['rev-parse', '--show-toplevel'])
    } catch {
        throw new Refusal(`${root} is not a git repository`)
    }
    if (readConfig(root)) {
        // Only a committed config means the migration happened. An untracked one is a leftover,
        // for example from an apply that failed before its commit.
        try {
            git(root, ['cat-file', '-e', `HEAD:./${CONFIG_REL}`])
            return { nothing: true }
        } catch {
            throw new Refusal(`${CONFIG_REL} exists but is not committed; remove the untracked .sdlc/ and run again`)
        }
    }
    if (!isLayout1Root(root)) throw new Refusal(`${root} matches neither layout: no .sdlc/config.yaml, and no specs/ beside ${LAYOUT1_DIRS.ai}/ or ${LAYOUT1.scripts}/`)
    const dirty = git(root, ['status', '--porcelain', '--untracked-files=no']).trim()
    if (dirty) throw new Refusal(`tracked files have uncommitted changes; commit or stash them first:\n${dirty}`)

    const files = tracked(root)
    const trackedSet = new Set(files)
    const known = new Set(files)
    for (const f of files) for (let d = posix.dirname(f); d !== '.' && !known.has(d); d = posix.dirname(d)) known.add(d)
    const existedBefore = (rel) => known.has(rel.replace(/\/$/, ''))
    const forked = files.some((f) => isUnder(f, LAYOUT1_DIRS.aiSkills) && f.split('/').length === 4 && f.endsWith('/SKILL.md'))
    const { moves, dirMoves, conflicts } = plannedMoves(files, forked)
    // git mv into an existing directory nests the source inside it instead of renaming it.
    if (lstatExists(join(root, '.sdlc'))) throw new Refusal('.sdlc/ already exists; move it aside and run again')
    for (const [from, to] of [...dirMoves, ...moves]) {
        if (dirMoves.some(([d]) => from !== d && from.startsWith(`${d}/`))) continue
        if (lstatExists(join(root, to))) throw new Refusal(`${from} cannot move: ${to} already exists`)
    }
    // The rollback restores what git tracks and removes what the migration created. Anything
    // else in its way is refused up front, so a failed apply cannot lose a file git never had.
    const list = (args) => git(root, ['ls-files', ...args]).split('\n').filter(Boolean)
    // These block --apply but not the dry run, so the owner sees the plan and the list together.
    const blockers = []
    const loose = [...new Set(dirMoves.flatMap(([from]) => [...list(['--others', '--', from]), ...list(['--others', '--ignored', '--exclude-standard', '--', from])]))]
    for (const f of loose) blockers.push(`${f}: untracked or ignored, in a directory the migration moves; commit, move or delete it`)
    for (const f of files) {
        if (![...dirMoves.map(([d]) => d), ...moves.keys()].some((src) => f === src || f.startsWith(`${src}/`))) continue
        if (!lstatSync(join(root, f), { throwIfNoEntry: false })?.isSymbolicLink()) continue
        try {
            assertWriteInside(root, join(root, f))
        } catch {
            throw new Refusal(`${f} is a symlink out of the repo inside a path the migration moves; replace it with a real file or directory first`)
        }
    }
    const plan = {
        root,
        forked,
        moves,
        dirMoves,
        conflicts,
        writes: new Map(),
        deletes: [],
        repoints: [],
        replaced: [],
        added: [],
        modified: [],
        rewritten: [],
        extensions: { phases: [], exempt: [] },
        replacedPhases: [],
        phaseDiffs: {},
        dropped: [],
        noted: [],
        appended: {},
        report: {},
    }
    const read = (rel) => readText(join(root, rel)) ?? ''

    // Project context.
    let projectTarget = 'AGENTS.md'
    let workspaces = []
    let agentsBody = null
    if (trackedSet.has(LAYOUT1.project)) {
        const parsed = parseWorkspaceTables(read(LAYOUT1.project))
        if (parsed.problems.length) {
            throw new Refusal(`${LAYOUT1.project}: the workspace tables cannot be migrated as they stand:\n  ${parsed.problems.join('\n  ')}`)
        }
        workspaces = parsed.workspaces
        plan.dropped = parsed.dropped
        plan.noted = parsed.noted
        const inline = Buffer.byteLength(parsed.prose) <= AGENTS_BUDGET
        projectTarget = inline ? 'AGENTS.md' : '.sdlc/project.md'
        plan.projectInline = inline
        plan.projectProse = parsed.prose
    }

    // Contracts: where they land after the moves, in a forked repo.
    const contracts = {}
    if (forked) {
        for (const [key, file] of Object.entries(CONTRACT_FILES)) {
            const src = LAYOUT1.contractDirs.map((d) => `${d}/${file}`).find((p) => trackedSet.has(p))
            if (src) contracts[key] = moves.get(src)
        }
    }
    const entries = mapEntries({ forked, projectTarget, contracts })
    plan.entries = entries

    // Prose: relative links recomputed from the doc's old directory.
    if (plan.projectProse !== undefined) {
        const prose = rewriteText(plan.projectProse, { entries, oldRel: LAYOUT1.project, newRel: projectTarget, existedBefore }).text
        if (plan.projectInline) {
            agentsBody = prose
            plan.deletes.push(LAYOUT1.project)
        } else {
            moves.set(LAYOUT1.project, '.sdlc/project.md')
            plan.writes.set('.sdlc/project.md', prose)
            agentsBody = 'Project context for this repo is in `.sdlc/project.md`, and the workspaces are in `.sdlc/config.yaml`.\n'
        }
    }
    plan.agentsBody = agentsBody
    plan.blockers = blockers
    // Only the root files this run will write: AGENTS.md when there is project prose, and
    // .prettierignore when the repo has one.
    const rootWrites = ROOT_WRITES.filter((n) => (n !== 'AGENTS.md' || agentsBody !== null) && (n !== '.prettierignore' || lstatExists(join(root, n))))
    for (const name of rootWrites) {
        if (lstatExists(join(root, name)) && !trackedSet.has(name)) {
            blockers.push(`${name}: exists but is not committed, and the migration would change it; commit it or move it aside`)
        } else if (!lstatExists(join(root, name)) && ignored(root, name)) {
            blockers.push(`${name}: gitignored, so the migration could not commit the one it writes; un-ignore it`)
        }
        try {
            assertWriteInside(root, join(root, name))
        } catch (err) {
            throw new Refusal(`${name} is a symlink to a file outside the repo, which the migration would change: ${err.message}`)
        }
    }
    if (agentsBody !== null && (readText(join(root, 'AGENTS.md')) ?? '').includes(BLOCK_BEGIN)) {
        throw new Refusal(`AGENTS.md already has an SDLC block (${BLOCK_BEGIN}); remove it so the migration can write the project context there`)
    }

    // State machine: the payload's, with the adopter's additions moved to config.yaml.
    const payloadMachineText = readFileSync(join(PAYLOAD, '.sdlc', 'state-machine.yaml'), 'utf8')
    let routingBlock = null
    if (trackedSet.has(LAYOUT1.machine)) {
        const own = read(LAYOUT1.machine)
        const mine = parseYaml(own) ?? {}
        const theirs = parseYaml(payloadMachineText) ?? {}
        const frameworkById = new Map((theirs.phases ?? []).map((p) => [p.id, p]))
        for (const p of mine.phases ?? []) {
            if (!frameworkById.has(p.id)) plan.extensions.phases.push(p)
            else if (JSON.stringify(p) !== JSON.stringify(frameworkById.get(p.id))) {
                plan.replacedPhases.push(p.id)
                plan.phaseDiffs[p.id] = phaseDiff(p, frameworkById.get(p.id))
            }
        }
        const frameworkExempt = new Set(theirs.exempt ?? [])
        plan.extensions.exempt = (mine.exempt ?? []).filter((e) => !frameworkExempt.has(e))
        routingBlock = cutDomainRouting(own)
    }
    plan.writes.set('.sdlc/state-machine.yaml', payloadMachineText)

    // config.yaml.
    const paths = {}
    if (!forked && files.some((f) => /^skills\/[^/]+\/SKILL\.md$/.test(f))) paths.skills = 'skills'
    if (forked && contracts.primitives) paths.primitives = contracts.primitives
    if (forked && contracts.envelopeSchema) paths.envelope_schema = contracts.envelopeSchema
    if (projectTarget !== 'AGENTS.md') paths.project = projectTarget
    if (moves.has(LAYOUT1.processDoc)) paths.process_doc = moves.get(LAYOUT1.processDoc)
    const config = {
        layout: 2,
        framework_version: pluginVersion() ?? '',
        paths,
        workspaces,
        extensions: { phases: plan.extensions.phases, exempt: plan.extensions.exempt },
        scan: { allow: [] },
    }
    const header = '# SDLC config (ADR-008), written by migrate-layout.mjs. Schema: skills/sdlc-config-schema.md in the plugin.\n'
    let emitted
    try {
        emitted = emitYaml(config)
    } catch (err) {
        throw new Refusal(`the config cannot be written: ${err.message}`)
    }
    // The config is read back by the subset parser in every gate, so it must round-trip.
    if (JSON.stringify(parseYaml(emitted)) !== JSON.stringify(JSON.parse(JSON.stringify(config)))) {
        throw new Refusal('the config the migration would write does not read back as written; report this with your project.md and state machine')
    }
    plan.writes.set('.sdlc/config.yaml', `${header}${emitted}${routingBlock ?? 'domain_routing: {}'}\n`)
    plan.routingBlock = routingBlock

    // Framework files: unmodified ones are replaced with the plugin's copy, modified ones kept.
    const manifest = loadManifest()
    const landed = new Map([...moves].map(([o, n]) => [n, o]))
    const shipped = [...filesUnder(PAYLOAD, '.sdlc/scripts'), ...filesUnder(PAYLOAD, '.sdlc/templates'), ...filesUnder(PAYLOAD, '.sdlc/contracts')]
    for (const rel of shipped) {
        let dest = rel
        if (rel.startsWith('.sdlc/contracts/')) {
            const key = Object.entries(CONTRACT_FILES).find(([, f]) => f === basename(rel))?.[0]
            dest = (forked && contracts[key]) || rel
        }
        const fresh = readFileSync(join(PAYLOAD, rel), 'utf8')
        const old = landed.get(dest)
        if (old === undefined) {
            plan.writes.set(dest, fresh)
            plan.added.push(dest)
            continue
        }
        const bytes = readFileSync(join(root, old))
        const role = roleOf(`init-payload/${rel}`)
        if (role && releasedVersions(manifest, role, bytes).length) {
            plan.writes.set(dest, fresh)
            plan.replaced.push(dest)
        } else if (bytes.toString('utf8') !== fresh) {
            plan.modified.push(dest)
        }
    }
    // Workflows stay where they are. A released copy is replaced, so the repo's CI gains the
    // 0.4.0 steps (the scan among them); an edited one is kept and only its paths change below.
    // A workflow the repo deleted is not added back.
    for (const rel of filesUnder(PAYLOAD, '.github/workflows')) {
        if (!trackedSet.has(rel)) continue
        const role = roleOf(`init-payload/${rel}`)
        if (role && releasedVersions(manifest, role, readFileSync(join(root, rel))).length) {
            plan.writes.set(rel, readFileSync(join(PAYLOAD, rel), 'utf8'))
            plan.replaced.push(rel)
        } else plan.modified.push(rel)
    }

    // Rewrites, over every live tracked text file.
    const specsRel = 'specs'
    const specStatus = (id) => {
        const hit = files.find((f) => f.startsWith(`${specsRel}/${id}-`) && f.endsWith('.md'))
        return hit ? frontmatterStatus(read(hit)) : null
    }
    const excluded = (rel) => exclude.some((g) => matchesGlob(rel, g))
    for (const oldRel of files) {
        const newRel = moves.get(oldRel) ?? oldRel
        if (plan.writes.has(newRel) || plan.deletes.includes(oldRel)) continue
        if (newRel.startsWith('.sdlc/scripts/lib/') || BINARY.test(oldRel)) continue
        if (excluded(oldRel) || excluded(newRel)) continue
        if (isHistory(oldRel, { specsRel, specStatus, read })) continue
        const text = readText(join(root, oldRel))
        if (text === null) continue
        let { text: next } = rewriteText(text, { entries, oldRel, newRel, existedBefore })
        if (/^\.github\/workflows\/[^/]+\.ya?ml$/.test(oldRel)) next = widenPathFilters(next, [...moves.keys()])
        if (next !== text) {
            plan.writes.set(newRel, next)
            plan.rewritten.push(newRel)
        }
    }

    // Symlinks whose target moved, or that move themselves. A relative link that changes
    // depth would otherwise point somewhere else, outside the repo even, from its new place.
    const seen = new Set()
    for (const link of ['.claude/skills', '.agents/skills', ...files]) {
        if (seen.has(link)) continue
        seen.add(link)
        const abs = join(root, link)
        let isLink = false
        try {
            isLink = lstatSync(abs).isSymbolicLink()
        } catch {
            continue
        }
        if (!isLink) continue
        const target = readlinkSync(abs)
        if (posix.isAbsolute(target)) continue
        const resolvedOld = posix.normalize(posix.join(posix.dirname(link), target))
        const dm = dirMoves.find(([d]) => resolvedOld === d || resolvedOld.startsWith(`${d}/`))
        const mapped = dm ? dm[1] + resolvedOld.slice(dm[0].length) : mapPath(resolvedOld, entries)
        const finalTarget = mapped && mapped !== resolvedOld ? mapped : resolvedOld
        const ldm = dirMoves.find(([d]) => link.startsWith(`${d}/`))
        const newLink = moves.get(link) ?? (ldm ? ldm[1] + link.slice(ldm[0].length) : link)
        if (newLink === link && finalTarget === resolvedOld) continue
        if (newLink !== link && (finalTarget === '..' || finalTarget.startsWith('../'))) {
            throw new Refusal(`${link} points outside the repo and would still after it moves to ${newLink}; replace it with a real file or directory first`)
        }
        // A link the repo does not track (bootstrap.sh makes .claude/skills per checkout) is
        // repointed in place but not committed, and a rollback puts it back.
        plan.repoints.push({ link: newLink, from: target, to: posix.relative(posix.dirname(newLink), finalTarget), tracked: trackedSet.has(link) })
    }

    // Report.
    plan.report = buildReport(root, plan, { files, forked })
    return plan
}

/** Add `.sdlc/**` beside each `paths:` glob that matched a moved file, once per list. `paths-ignore:` is never widened. */
export function widenPathFilters(yaml, movedFrom) {
    const lines = yaml.split('\n')
    const out = []
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        out.push(line)
        const flow = line.match(/^(\s*)paths:\s*\[(.*)\]\s*$/)
        if (flow) {
            const globs = flow[2].split(',').map((g) => g.trim().replace(/^['"]|['"]$/g, ''))
            if (!globs.includes('.sdlc/**') && globs.some((g) => movedFrom.some((f) => matchesGlob(f, g)))) {
                out[out.length - 1] = `${flow[1]}paths: [${flow[2].trim()}, '.sdlc/**']`
            }
            continue
        }
        const block = line.match(/^(\s*)paths:\s*$/)
        if (!block) continue
        const items = []
        let j = i + 1
        while (j < lines.length && /^\s*-\s/.test(lines[j])) items.push(lines[j++])
        const globs = items.map((l) => l.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''))
        out.push(...items)
        if (!globs.includes('.sdlc/**') && globs.some((g) => movedFrom.some((f) => matchesGlob(f, g)))) {
            const indent = items[0]?.match(/^(\s*-\s*)/)?.[1] ?? `${block[1]}    - `
            const quote = items[0]?.includes('"') ? '"' : "'"
            out.push(`${indent}${quote}.sdlc/**${quote}`)
        }
        i = j - 1
    }
    return out.join('\n')
}

function hookBasenames(file) {
    const text = readText(file)
    if (!text) return []
    return [...text.matchAll(/([\w.-]+\.mjs)/g)].map((m) => m[1])
}

function buildReport(root, plan, { files, forked }) {
    const report = {}
    if (forked) {
        const pluginSkills = existsSync(join(PLUGIN, 'skills')) ? new Set(readdirSync(join(PLUGIN, 'skills'))) : new Set()
        report.shadowedSkills = [...new Set(files.filter((f) => isUnder(f, LAYOUT1_DIRS.aiSkills) && f.split('/').length > 3).map((f) => f.split('/')[2]))].filter((n) =>
            pluginSkills.has(n)
        )
    }
    const local = new Set(hookBasenames(join(root, '.claude', 'settings.json')))
    report.doubleWiredHooks = hookBasenames(join(PLUGIN, 'hooks', 'hooks.json')).filter((h) => local.has(h))
    const movedOrDeleted = new Set([...plan.moves.keys(), ...plan.deletes])
    const insideMovedDir = (f) => plan.dirMoves.some(([d]) => f.startsWith(`${d}/`))
    report.unrecognized = files.filter(
        (f) => [LAYOUT1_DIRS.ai, ...LAYOUT1.templatesCandidates].some((d) => isUnder(f, d)) && !movedOrDeleted.has(f) && !insideMovedDir(f)
    )
    const ignore = readText(join(root, '.ignore')) ?? ''
    report.proposedExcludes = ignore
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('!') && l.endsWith('/') && l !== 'specs/archive/')
        .map((l) => `${l}**`)
    // What Claude will load: the rewritten text when the migration rewrites AGENTS.md.
    const agents = plan.writes.get('AGENTS.md') ?? readText(join(root, 'AGENTS.md')) ?? ''
    const outside = agents.includes(BLOCK_BEGIN) ? agents.slice(0, agents.indexOf(BLOCK_BEGIN)) : agents
    report.agentsOutsideBlock = outside.trim()
    report.agentsPointsTo = [...new Set([...outside.matchAll(/`([^`\s]+\.[a-z]+)`|\]\(([^)\s]+)\)/g)].map((m) => m[1] ?? m[2]))].filter(
        (p) => !p.includes('://') && existsSync(join(root, p))
    )
    report.openBranches = openBranchesTouching(root, [...plan.moves.keys(), ...plan.deletes])
    return report
}

function openBranchesTouching(root, paths) {
    const out = []
    let current
    try {
        current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    } catch {
        return out
    }
    const set = new Set(paths)
    for (const b of localBranches(root)) {
        if (b === current) continue
        try {
            const changed = git(root, ['diff', '--name-only', `${current}...${b}`]).split('\n').filter(Boolean)
            const touched = changed.filter((f) => set.has(f) || isUnder(f, LAYOUT1_DIRS.ai) || isUnder(f, LAYOUT1.scripts) || f === LAYOUT1.machine)
            if (touched.length) out.push({ branch: b, files: touched.length })
        } catch {
            // An unrelated history (no merge base) cannot be compared; it is not a migration input.
        }
    }
    return out
}

// ─── Apply ──────────────────────────────────────────────────────────────────

/** Root files the migration may write; each must stay inside the repo. */
const ROOT_WRITES = ['AGENTS.md', 'CLAUDE.md', '.gitignore', '.ignore', '.prettierignore']

function writeFile(root, rel, content) {
    const abs = join(root, rel)
    assertWriteInside(root, abs)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
}

function removeEmptyDirs(root, rel) {
    const abs = join(root, rel)
    if (!existsSync(abs)) return
    for (const e of readdirSync(abs, { withFileTypes: true })) {
        if (e.isDirectory()) removeEmptyDirs(root, join(rel, e.name))
    }
    if (readdirSync(abs).length === 0) rmdirSync(abs)
}

/**
 * Carry out `plan` as one commit on BRANCH. Any failure before the commit lands, a
 * pre-commit hook included, puts the repo back on its branch at its commit, with nothing
 * left behind, and then rethrows.
 */
export function applyMigration(root, plan) {
    if (plan.blockers?.length) {
        throw new Refusal(`the migration cannot apply until these are resolved:\n  ${plan.blockers.join('\n  ')}`)
    }
    if (localBranches(root).includes(BRANCH)) throw new Refusal(`branch ${BRANCH} already exists; delete it or finish that migration first`)
    const startBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    const startHead = git(root, ['rev-parse', 'HEAD']).trim()
    const created = []
    const restore = []
    git(root, ['switch', '-q', '-c', BRANCH])
    try {
        applyOnBranch(root, plan, created, restore)
    } catch (err) {
        // planMigration refused every untracked or ignored file in the migration's way, so the
        // reset restores everything git had and only the files this run created remain.
        const failed = []
        const step = (what, fn) => {
            try {
                fn()
            } catch (e) {
                failed.push(`${what}: ${e.message.trim().split('\n')[0]}`)
            }
        }
        step('reset', () => git(root, ['reset', '-q', '--hard', startHead]))
        for (const rel of created) {
            step(`remove ${rel}`, () => {
                if (lstatExists(join(root, rel))) rmSync(join(root, rel), { force: true })
            })
        }
        for (const r of restore) {
            step(`restore ${r.link}`, () => {
                rmSync(join(root, r.link), { force: true })
                symlinkSync(r.from, join(root, r.link))
            })
        }
        step('remove .sdlc', () => removeEmptyDirs(root, '.sdlc'))
        step('switch back', () => git(root, startBranch === 'HEAD' ? ['switch', '-q', '--detach', startHead] : ['switch', '-q', startBranch]))
        step(`delete ${BRANCH}`, () => git(root, ['branch', '-q', '-D', BRANCH]))
        const cause = err.message.trim().split('\n').slice(0, 6).join('\n')
        if (failed.length) {
            const back = startBranch === 'HEAD' ? `git switch --detach ${startHead}` : `git switch ${startBranch}`
            throw new Refusal(
                `the migration failed (${cause}), and the rollback did not finish:\n  ${failed.join('\n  ')}\n` +
                    `Recover with: git reset --hard ${startHead} && ${back} && git branch -D ${BRANCH}`
            )
        }
        throw new Refusal(`the migration failed and was rolled back, so the repo is as it was: ${cause}`)
    }
    return plan
}

/** Whether git ignores `rel`. */
function ignored(root, rel) {
    try {
        git(root, ['check-ignore', '-q', '--', rel])
        return true
    } catch {
        return false
    }
}

function applyOnBranch(root, plan, created, restore) {
    const staged = new Set()
    // Every move lands inside the repo, even after an earlier move put a symlink on its path.
    const move = (from, to) => {
        assertWriteInside(root, join(root, to))
        mkdirSync(dirname(join(root, to)), { recursive: true })
        git(root, ['mv', from, to])
    }
    for (const [from, to] of plan.dirMoves) {
        if (existsSync(join(root, from))) move(from, to)
    }
    for (const [from, to] of plan.moves) {
        if (plan.dirMoves.some(([d]) => from.startsWith(`${d}/`))) continue
        if (existsSync(join(root, from))) move(from, to)
    }
    for (const rel of plan.deletes) {
        if (existsSync(join(root, rel))) git(root, ['rm', '-q', rel])
    }
    for (const [rel, content] of plan.writes) {
        const isNew = !lstatExists(join(root, rel))
        writeFile(root, rel, content)
        // Recorded once written, so the rollback never chases a path that was never made.
        if (isNew) created.push(rel)
        staged.add(rel)
    }
    for (const r of plan.repoints) {
        const abs = join(root, r.link)
        assertWriteInside(root, dirname(abs))
        if (!r.tracked) restore.push(r)
        unlinkSync(abs)
        symlinkSync(r.to, abs)
        if (r.tracked) staged.add(r.link)
    }
    for (const name of ROOT_WRITES) if (!lstatExists(join(root, name))) created.push(name)
    for (const name of ['.ignore', '.gitignore']) {
        const added = appendLines(join(root, name), readFileSync(join(PAYLOAD, name), 'utf8'), root)
        if (added.length) plan.appended[name] = added
        staged.add(name)
    }
    const prettier = appendPrettierIgnore(root)
    if (prettier.length) {
        plan.appended['.prettierignore'] = prettier
        staged.add('.prettierignore')
    }
    if (plan.agentsBody !== null && insertAgentsBlock(root, plan.agentsBody)) staged.add('AGENTS.md')
    if (ensureClaudeImport(root)) staged.add('CLAUDE.md')
    // A move leaves its source's parent behind when the parent held nothing else (scripts/, templates/).
    const parents = new Set([...plan.dirMoves.map(([d]) => d), ...plan.moves.keys(), ...plan.deletes].map((p) => posix.dirname(p)))
    for (const d of [...parents].sort((a, b) => b.length - a.length)) {
        for (let cur = d; cur !== '.' && cur !== ''; cur = posix.dirname(cur)) {
            const abs = join(root, cur)
            if (!existsSync(abs) || readdirSync(abs).length) break
            rmdirSync(abs)
        }
    }
    removeEmptyDirs(root, LAYOUT1_DIRS.ai)

    // -f: a framework file the repo's ignore rules happen to match (a `lib/` rule) is still committed.
    git(root, ['add', '-A', '-f', '--', ...[...staged].filter((p) => lstatExists(join(root, p)))])
    git(root, ['commit', '-q', '-m', COMMIT_MESSAGE])
}

/** Whether anything is at `abs`, a dangling symlink included (existsSync follows links and says no). */
function lstatExists(abs) {
    try {
        lstatSync(abs)
        return true
    } catch {
        return false
    }
}

/**
 * What replacing the repo's copy of a framework phase with the plugin's changes, one line
 * per field value: `- field: value` for the repo's, `+ field: value` for the plugin's. A
 * list field shows only the items that differ.
 */
export function phaseDiff(mine, theirs) {
    const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
    const lines = []
    for (const key of new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})])) {
        const a = mine?.[key]
        const b = theirs?.[key]
        if (JSON.stringify(a) === JSON.stringify(b)) continue
        if (Array.isArray(a) && Array.isArray(b)) {
            const inB = new Set(b.map(show))
            const inA = new Set(a.map(show))
            for (const x of a) if (!inB.has(show(x))) lines.push(`- ${key}: ${show(x)}`)
            for (const x of b) if (!inA.has(show(x))) lines.push(`+ ${key}: ${show(x)}`)
        } else {
            if (a !== undefined) lines.push(`- ${key}: ${show(a)}`)
            if (b !== undefined) lines.push(`+ ${key}: ${show(b)}`)
        }
    }
    return lines
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function printPlan(plan, out = process.stdout) {
    const w = (s) => out.write(`${s}\n`)
    const list = (title, items) => {
        if (!items.length) return
        w(`\n${title} (${items.length}):`)
        for (const i of items) w(`  ${i}`)
    }
    w(`migrate-layout: ${plan.forked ? 'forked' : 'plugin-init'} repo at ${plan.root}`)
    list('Directory moves (git mv)', plan.dirMoves.map(([a, b]) => `${a}/ -> ${b}/`))
    list(
        'File moves (git mv)',
        [...plan.moves].filter(([a]) => !plan.dirMoves.some(([d]) => a.startsWith(`${d}/`))).map(([a, b]) => `${a} -> ${b}`)
    )
    list('Deleted after merging', plan.deletes)
    list('Symlinks repointed', plan.repoints.map((r) => `${r.link}: ${r.from} -> ${r.to}${r.tracked ? '' : ' (local link, not committed)'}`))
    if (plan.projectProse !== undefined) {
        w(`\nProject context: ${plan.projectInline ? 'inline in the AGENTS.md SDLC block' : '.sdlc/project.md (over the 16 KiB AGENTS.md budget)'}`)
    }
    list('Extension phases (to config.yaml extensions.phases)', plan.extensions.phases.map((p) => p.id))
    list('Extension exempt skills (to config.yaml extensions.exempt)', plan.extensions.exempt)
    if (plan.replacedPhases.length) {
        w(`\nFramework phases replaced by the plugin version (${plan.replacedPhases.length}). Lines marked - are this repo's and are dropped:`)
        for (const id of plan.replacedPhases) {
            w(`  ${id}`)
            for (const line of plan.phaseDiffs[id] ?? []) w(`      ${line}`)
        }
    }
    w(`\ndomain_routing: ${plan.routingBlock ? 'moved byte-for-byte to config.yaml' : 'none; config.yaml gets domain_routing: {}'}`)
    list('Framework files replaced with the plugin copy (unmodified)', plan.replaced)
    list('Framework files added', plan.added)
    list('Modified framework files kept, paths rewritten only', plan.modified)
    list('Files with paths rewritten', plan.rewritten)
    list('Workspace cells moved to notes', plan.noted)
    list('Placeholder rows dropped', plan.dropped)
    list('Template name conflicts left in place', plan.conflicts)
    const r = plan.report
    list('Local skills that shadow a plugin skill', r.shadowedSkills ?? [])
    list('Hooks wired locally and by the plugin', r.doubleWiredHooks ?? [])
    list('Unrecognized files left in place', r.unrecognized ?? [])
    list('Proposed --exclude globs (fenced in your .ignore)', r.proposedExcludes ?? [])
    list('Open branches that touch moved paths', (r.openBranches ?? []).map((b) => `${b.branch} (${b.files} file(s))`))
    if (r.agentsOutsideBlock) {
        w('\nAGENTS.md content every Claude session will load once CLAUDE.md imports it:')
        for (const line of r.agentsOutsideBlock.split('\n').slice(0, 40)) w(`  | ${line}`)
        list('Files that text tells a reader to open', r.agentsPointsTo ?? [])
    }
}

/** Exit 1 with the refusal's message; anything else is a bug and propagates. */
function exitOnRefusal(err) {
    if (!(err instanceof Refusal)) throw err
    process.stderr.write(`migrate-layout: refused: ${err.message}\n`)
    process.exit(1)
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const apply = rest.includes('--apply')
    if (!apply && !rest.includes('--dry-run')) {
        process.stderr.write('usage: migrate-layout.mjs --root <dir> (--dry-run | --apply) [--exclude <glob>]...\n')
        process.exit(1)
    }
    const exclude = []
    rest.forEach((a, i) => {
        if (a === '--exclude' && rest[i + 1]) exclude.push(rest[i + 1])
        else if (a.startsWith('--exclude=')) exclude.push(a.slice('--exclude='.length))
    })
    let plan
    try {
        plan = planMigration(root, { exclude })
    } catch (err) {
        exitOnRefusal(err)
    }
    if (plan.nothing) {
        process.stdout.write('nothing to migrate: this repo is on layout 2\n')
        return
    }
    printPlan(plan)
    if (plan.blockers.length) {
        process.stdout.write(`\nBlocks --apply (${plan.blockers.length}):\n${plan.blockers.map((b) => `  ${b}`).join('\n')}\n`)
    }
    if (!apply) {
        process.stdout.write('\nDry run: nothing was written. Run with --apply to migrate on a new branch.\n')
        return
    }
    try {
        applyMigration(root, plan)
    } catch (err) {
        exitOnRefusal(err)
    }
    process.stdout.write(`\nCommitted "${COMMIT_MESSAGE}" on ${BRANCH}.\n`)
    for (const [f, lines] of Object.entries(plan.appended)) process.stdout.write(`appended ${f}: ${lines.join(', ')}\n`)
    const hits = scanRepo(root, { moves: plan.moves })
    if (hits.length) {
        process.stdout.write('\nLayout-1 references a text rewrite could not fix:\n')
        for (const h of hits) process.stdout.write(`  ${h.file}:${h.line}  [${h.form}]  ${h.snippet}\n`)
        process.stderr.write(`\n${hits.length} scan hit(s). Fix them in commits on ${BRANCH}, then run scan-legacy-paths.mjs until it exits 0.\n`)
        process.exit(3)
    }
    process.stdout.write('\nScan clean: no layout-1 references left.\n')
}

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
