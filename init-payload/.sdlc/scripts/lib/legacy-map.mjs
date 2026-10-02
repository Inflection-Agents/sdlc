/**
 * The one table of layout-1 paths (ADR-008).
 *
 * The resolver's fallback, the migration and the legacy-path scan all read it, so a
 * layout-1 path is spelled in exactly one file. Any consumer that must still recognize
 * a layout-1 path takes it from an export here and never from its own literal; the scan
 * exempts this file and flags a literal anywhere else.
 */

/** Layout-1 locations of the files the resolver serves, relative to the repo root. */
export const LAYOUT1 = Object.freeze({
    constraints: '.ai/sdlc/review-constraints.yaml',
    machine: 'specs/sdlc-state-machine.yaml',
    scripts: 'scripts/sdlc',
    project: '.ai/project.md',
    processDoc: '.ai/sdlc.md',
    skillsCandidates: ['.ai/skills', 'skills'],
    templatesCandidates: ['templates', 'specs/templates'],
    contractDirs: ['.ai/skills', '.ai/sdlc'],
})

/** The layout-1 agent-config folder and its two subfolders the migration moves whole. */
export const LAYOUT1_DIRS = Object.freeze({ ai: '.ai', aiSdlc: '.ai/sdlc', aiSkills: '.ai/skills' })

/** Whether a repo-relative path sits under `dir`. */
export const isUnder = (rel, dir) => rel === dir || rel.startsWith(`${dir}/`)

/** Directory prefixes whose presence (next to `specs/`) marks a layout-1 repo. */
export const LAYOUT1_MARKERS = Object.freeze(['.ai', 'scripts/sdlc'])

/** Top-level directory prefix of the layout-1 agent config. */
export const LAYOUT1_AI_PREFIX = '.ai/'

/** Escaped regular expression that matches a repo-relative path under the layout-1 agent config. */
export const LAYOUT1_AI_PATTERN = /^\.ai\//

/** Every template file name the framework ships or has shipped. Other files in a templates directory are the adopter's own. */
export const FRAMEWORK_TEMPLATES = Object.freeze([
    'adr.md',
    'bug.md',
    'completion-report.md',
    'cross-cutting-skill.md',
    'decisions.md',
    'gap.md',
    'guide.md',
    'initiatives.md',
    'kickoff.md',
    'project.md',
    'spec.md',
    'task.md',
])

export const CONTRACT_FILES = Object.freeze({
    primitives: 'review-primitives.md',
    envelopeSchema: 'review-envelope.schema.json',
})

/** Agent entry files that a forked repo keeps in `.ai/` and the migration moves to `.sdlc/agents/`. */
export const AGENT_FILES = Object.freeze(['sdlc.md', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'setup.md'])

// ─── Map entries ────────────────────────────────────────────────────────────

/**
 * The layout-1 to layout-2 path map for one repo, longest `from` first (SPEC-009 Design >
 * Legacy map). `kind: 'prefix'` maps everything under a directory; `kind: 'file'` maps one
 * path. `forked` repos move `.ai/skills/` whole; plugin-init repos move only the contracts
 * out of it. `projectTarget` and `contracts` carry the migration's own decisions: where the
 * project prose went, and where a forked repo's contracts landed after the moves.
 */
export function mapEntries({ forked = false, projectTarget = 'AGENTS.md', contracts = null } = {}) {
    const entries = [
        { from: '.ai/project.md', to: projectTarget, kind: 'file' },
        { from: '.ai/sdlc/', to: '.sdlc/', kind: 'prefix' },
        { from: LAYOUT1.machine, to: '.sdlc/state-machine.yaml', kind: 'file' },
        { from: `${LAYOUT1.scripts}/`, to: '.sdlc/scripts/', kind: 'prefix' },
        ...AGENT_FILES.map((f) => ({ from: `.ai/${f}`, to: `.sdlc/agents/${f}`, kind: 'file' })),
        ...LAYOUT1.templatesCandidates.flatMap((dir) =>
            FRAMEWORK_TEMPLATES.map((t) => ({ from: `${dir}/${t}`, to: `.sdlc/templates/${t}`, kind: 'file' }))
        ),
    ]
    if (forked) {
        entries.push({ from: '.ai/skills/', to: '.sdlc/skills/', kind: 'prefix' })
        if (contracts) {
            for (const [key, file] of Object.entries(CONTRACT_FILES)) {
                if (contracts[key]) {
                    for (const dir of LAYOUT1.contractDirs) entries.push({ from: `${dir}/${file}`, to: contracts[key], kind: 'file' })
                }
            }
        }
    } else {
        for (const file of Object.values(CONTRACT_FILES)) {
            entries.push({ from: `.ai/skills/${file}`, to: `.sdlc/contracts/${file}`, kind: 'file' })
        }
    }
    return entries.sort((a, b) => b.from.length - a.from.length)
}

/** Map one root-relative path through `entries`, or return null when no entry covers it. */
export function mapPath(rel, entries) {
    for (const e of entries) {
        if (e.kind === 'file' && rel === e.from) return e.to
        if (e.kind === 'prefix' && (rel === e.from.slice(0, -1) || rel.startsWith(e.from))) {
            return rel === e.from.slice(0, -1) ? e.to.slice(0, -1) : e.to + rel.slice(e.from.length)
        }
    }
    return null
}

// ─── Matching (SPEC-009 Design > Legacy map > Matching) ─────────────────────

const PATH_CHAR = /[A-Za-z0-9_@.\-/]/
const NAME_CHAR = /[A-Za-z0-9_-]/

/**
 * Whether a match at `i` starts a root-relative path. The character before it must not
 * be a path character, except a `/` that follows an expansion naming the repo root
 * (`$NAME/`, `${NAME}/`, `$(...)/`). `${CLAUDE_PLUGIN_ROOT}` names the plugin, so a path
 * after it is never root-relative.
 */
export function isRootAnchored(text, i) {
    if (i === 0) return true
    const prev = text[i - 1]
    if (prev !== '/') return !PATH_CHAR.test(prev)
    const before = text.slice(Math.max(0, i - 64), i)
    if (/(?:\$\{CLAUDE_PLUGIN_ROOT\}|\$CLAUDE_PLUGIN_ROOT)\/$/.test(before)) return false
    return /(?:\$\{\w+\}|\$\w+|\$\([^)]*\))\/$/.test(before)
}

/** Whether a file-kind match ending at `end` stops at a name boundary (not `project.md.bak`). */
function endsAtBoundary(text, end) {
    const next = text[end]
    if (next === undefined) return true
    if (NAME_CHAR.test(next)) return false
    if (next === '.' && NAME_CHAR.test(text[end + 1] ?? '')) return false
    return true
}

function matchAt(text, i, entries) {
    for (const e of entries) {
        if (!text.startsWith(e.from, i)) continue
        if (e.kind === 'file' && !endsAtBoundary(text, i + e.from.length)) continue
        return e
    }
    return null
}

// A relative path token: one or more ./ or ../ steps, then path characters.
const RELATIVE = /(?<![A-Za-z0-9_@.\-/])((?:\.\.?\/)+)([A-Za-z0-9_@.\-][A-Za-z0-9_@.\-/]*)/g

const posixJoin = (...parts) => {
    const out = []
    for (const seg of parts.join('/').split('/')) {
        if (seg === '' || seg === '.') continue
        if (seg === '..') {
            if (out.length === 0 || out.at(-1) === '..') out.push('..')
            else out.pop()
        } else out.push(seg)
    }
    return out.join('/')
}
const posixDir = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '')
function posixRelative(fromDir, to) {
    const a = fromDir ? fromDir.split('/') : []
    const b = to.split('/')
    let k = 0
    while (k < a.length && k < b.length && a[k] === b[k]) k += 1
    const up = a.slice(k).map(() => '..')
    const rel = [...up, ...b.slice(k)].join('/')
    return up.length ? rel : `./${rel}`
}

/**
 * Rewrite the layout-1 paths in one file's text (SPEC-009 Design > Migration > Rewrites).
 *
 * `oldRel` and `newRel` are the file's own path before and after the moves. `existedBefore`
 * answers whether a root-relative path named a tracked file or directory before the moves.
 * A relative path is resolved against the file's old directory first, mapped, and then
 * recomputed from the file's new directory, whether or not its target moved. A
 * root-relative path is mapped where the matching rule anchors it.
 * @returns {{ text: string, changes: number }}
 */
export function rewriteText(text, { entries, oldRel, newRel = oldRel, existedBefore = () => false }) {
    let changes = 0
    const oldDir = posixDir(oldRel)
    const newDir = posixDir(newRel)
    const moved = oldDir !== newDir

    // Pass 1: relative paths. Pass 2's anchor rule never matches inside one.
    const out = text.replace(RELATIVE, (whole, dots, rest) => {
        const target = posixJoin(oldDir, dots + rest)
        if (target.startsWith('..') || !existedBefore(target)) return whole
        const mapped = mapPath(target, entries) ?? target
        if (mapped === target && !moved) return whole
        let rel = posixRelative(newDir, mapped) + (rest.endsWith('/') ? '/' : '')
        if (!dots.startsWith('./') && rel.startsWith('./')) rel = rel.slice(2)
        if (rel === whole) return whole
        changes += 1
        return rel
    })

    // Pass 2: root-relative paths, scanned left to right, longest entry first at each spot.
    let result = ''
    for (let i = 0; i < out.length; ) {
        const e = isRootAnchored(out, i) ? matchAt(out, i, entries) : null
        if (e) {
            result += e.to
            i += e.from.length
            changes += 1
        } else {
            result += out[i]
            i += 1
        }
    }
    return { text: result, changes }
}

// ─── Scan (SPEC-009 Design > Legacy map > Forms the scan flags) ─────────────

const CODE_FILE = /\.(?:mjs|cjs|js|jsx|ts|tsx|py|sh)$/
const QUOTED_RUN = /(['"`])([^'"`\n]+)\1(?:\s*,\s*(['"`])([^'"`\n]+)\3)+/g
const QUOTED_AI = /(['"`])\.ai\/?\1/g
const DOTDOT_JOIN = /\b(?:join|resolve)\([^)\n]*(['"`])\.\.\1/
const ESCAPED_PREFIX = /\\\.ai\\\/|scripts\\\/sdlc/
const ROUTING_READ = /\.domain_routing\b|\[\s*['"]domain_routing['"]\s*\]/
const SCHEMA_REQUIRES = /"required"\s*:\s*\[[^\]]*"domain_routing"/
const TABLE_EDIT = /(Workspace skills|Agent eligibility(?: by workspace)?|Workspaces) table|project\.md\s*(?:→|->)\s*(Workspace skills|Agent eligibility)/i

function lineOf(text, index) {
    return text.slice(0, index).split('\n').length
}

/**
 * Every layout-1 reference left in one file, as `{ line, form, snippet }`.
 *
 * `moved` and `depthChanged` say whether the file itself moved and whether its directory
 * depth changed. `existsNow` answers whether a root-relative path exists after the moves,
 * so a relative path is a hit only when its target is missing. `inSkills` marks a file in
 * the resolved skills directory, where a table edit is checked.
 */
export function scanText(text, { rel, entries, moved = false, depthChanged = false, existsNow = () => true, inSkills = false }) {
    const hits = []
    const push = (index, form, snippet) => hits.push({ line: lineOf(text, index), form, snippet: snippet.slice(0, 120) })
    const code = CODE_FILE.test(rel)

    for (let i = 0; i < text.length; i += 1) {
        if (!isRootAnchored(text, i)) continue
        const e = matchAt(text, i, entries)
        if (e) {
            push(i, 'path', e.from)
            i += e.from.length - 1
        }
    }
    for (const m of text.matchAll(RELATIVE)) {
        const target = posixJoin(posixDir(rel), m[1] + m[2])
        if (!target.startsWith('..') && !existsNow(target) && (mapPath(target, entries) || moved)) {
            push(m.index, 'relative', m[0])
        }
    }
    if (code) {
        for (const m of text.matchAll(QUOTED_RUN)) {
            const segs = m[0].match(/(['"`])([^'"`\n]+)\1/g).map((s) => s.slice(1, -1))
            const joined = segs.join('/').replace(/\/+/g, '/')
            if (entries.some((e) => joined === e.from || joined === e.from.replace(/\/$/, '') || joined.startsWith(e.from))) {
                push(m.index, 'quoted-segments', m[0])
            }
        }
        for (const m of text.matchAll(QUOTED_AI)) push(m.index, 'quoted-.ai', m[0])
        if (depthChanged) {
            text.split('\n').forEach((line, n) => {
                if (DOTDOT_JOIN.test(line)) hits.push({ line: n + 1, form: "'..'-join", snippet: line.trim().slice(0, 120) })
            })
        }
        // Reading routing off loadMachine()'s merged result is the supported path.
        if (!/(^|\/)sdlc-paths\.mjs$/.test(rel) && !/\bloadMachine\b/.test(text)) {
            text.split('\n').forEach((line, n) => {
                if (ROUTING_READ.test(line)) hits.push({ line: n + 1, form: 'domain_routing-read', snippet: line.trim().slice(0, 120) })
            })
        }
    }
    text.split('\n').forEach((line, n) => {
        if (ESCAPED_PREFIX.test(line)) hits.push({ line: n + 1, form: 'escaped-regex', snippet: line.trim().slice(0, 120) })
    })
    if (rel.endsWith('.json') && SCHEMA_REQUIRES.test(text)) {
        push(text.search(SCHEMA_REQUIRES), 'schema-requires-domain_routing', '"required": [... "domain_routing" ...]')
    }
    if (inSkills && rel.endsWith('.md')) {
        text.split('\n').forEach((line, n) => {
            if (TABLE_EDIT.test(line)) hits.push({ line: n + 1, form: 'workspace-table', snippet: line.trim().slice(0, 120) })
        })
    }
    return hits
}

// ─── History: what neither the rewrite nor the scan touches ─────────────────

const LIVE_SPEC = new Set(['active', 'draft'])
const LIVE_ADR = new Set(['proposed', 'accepted'])

/** The frontmatter `status:` of a markdown document, lower-cased, or null. */
export function frontmatterStatus(text) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return null
    const s = m[1].match(/^status:\s*['"]?([A-Za-z0-9_-]+)/m)
    return s ? s[1].toLowerCase() : null
}

/**
 * Whether a tracked file is history the migration leaves as written (SPEC-009 Design >
 * Migration > Rewrites): anything archived, every review log and decision ledger, every
 * DECISIONS.md and *.jsonl, a spec not `active` or `draft` with its task tree, and an ADR
 * not `proposed` or `accepted`. `specsRel` is the specs directory; `specStatus(id)` reads
 * a spec's status by id; `read(rel)` reads a file.
 */
export function isHistory(rel, { specsRel = 'specs', specStatus = () => null, read = () => '' }) {
    const s = `${specsRel}/`
    if (rel.startsWith(`${s}archive/`) || rel.startsWith(`${s}review-logs/`) || rel.startsWith(`${s}decisions/`)) return true
    if (/(^|\/)DECISIONS\.md$/.test(rel) || rel.endsWith('.jsonl')) return true
    const spec = rel.match(new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(SPEC-\\d+)[^/]*\\.md$`))
    if (spec) return !LIVE_SPEC.has(frontmatterStatus(read(rel)) ?? 'active')
    const task = rel.match(new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}tasks/(SPEC-\\d+)/`))
    if (task) return !LIVE_SPEC.has(specStatus(task[1]) ?? 'active')
    if (rel.startsWith(`${s}adrs/`) && rel.endsWith('.md')) return !LIVE_ADR.has(frontmatterStatus(read(rel)) ?? 'accepted')
    return false
}

/**
 * Files the scan never reads: the map itself, the resolver, the manifest, the repo's own
 * `.sdlc/config.yaml` (whose `paths` and `scan.allow` name paths on purpose), and tests.
 */
export function isBuiltInExempt(rel) {
    if (rel === '.sdlc/config.yaml') return true
    if (/(^|\/)lib\/(legacy-map\.mjs|sdlc-paths\.mjs|released-payloads\.json)$/.test(rel)) return true
    return /(^|\/)(__tests__|__fixtures__)\//.test(rel) || /\.test\.[cm]?[jt]sx?$/.test(rel)
}

// ─── Payload roles (the released-payload manifest) ──────────────────────────

/**
 * The adopter-side role of a payload path, on either payload layout, or null for a file
 * the manifest does not track (stubs, the README). Layout-1 payloads shipped validators
 * under `scripts/sdlc/`, templates under `templates/` and contracts under `.ai/skills/`.
 */
export function payloadRoleOf(payloadRel) {
    const p = payloadRel.replace(/^init-payload\//, '')
    const under = (dirs) => dirs.map((d) => `${d}/`).find((d) => p.startsWith(d))
    let dir
    if ((dir = under([LAYOUT1.scripts, '.sdlc/scripts'])) && p.endsWith('.mjs')) {
        const name = p.slice(dir.length)
        return name.includes('.test.') ? null : `scripts/${name}`
    }
    if ((dir = under(['templates', '.sdlc/templates'])) && p.endsWith('.md') && !p.slice(dir.length).includes('/')) {
        return `templates/${p.slice(dir.length)}`
    }
    if ((dir = under([LAYOUT1_DIRS.aiSkills, '.sdlc/contracts'])) && Object.values(CONTRACT_FILES).includes(p.slice(dir.length))) {
        return `contracts/${p.slice(dir.length)}`
    }
    if (p === 'sdlc-state-machine.yaml' || p === '.sdlc/state-machine.yaml') return 'state-machine'
    if ((dir = under(['.github/workflows'])) && /\.ya?ml$/.test(p) && !p.slice(dir.length).includes('/')) {
        return `workflows/${p.slice(dir.length)}`
    }
    return null
}
