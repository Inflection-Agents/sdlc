#!/usr/bin/env node
// validate-guide.mjs — the mechanical check on a spec's delivery guide (ADR-007).
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — minimal Markdown and YAML readers are inlined).
//
// A guide lives at specs/tasks/SPEC-NNN/GUIDE.md beside its _index.yaml. The guide is not
// graded by spec-reviewer (ADR-007 decision 3), so everything checkable about it is checked
// here, and CI runs this on every guide. Rules, numbered as in SPEC-008 Design > validate-guide.mjs:
//
//   1. every spec AC is covered by a step that is not `cancelled`
//   2. every `Covers:` id exists in the spec
//   3. every step has `Changes:` and `Verify:`
//   4. step ids, and owner-decision ids, match between GUIDE.md and _index.yaml, each once
//   5. the guide's `spec_version` equals the spec's `version`
//   6. the spec has a `## Acceptance criteria` section with at least one AC id, and every
//      checkbox under it carries an `AC-NNN` id (an empty or missing section fails closed)
//   7. every `After:` id names an earlier step
//   8. when the repo defines workspaces (.sdlc/config.yaml), every step has `Workspace:`
//   9. an approved guide has a KICKOFF.md of at most 3,800 characters
//
// AC ids are read only from checkbox lines under `## Acceptance criteria`, in either the
// `AC-NNN:` form or the legacy `AC-NNN —` form, so prose that mentions another spec's AC is
// ignored. Headings match only at the start of a line: a spec that quotes a heading inline
// must not move the section boundary.
//
// Usage:
//   node .sdlc/scripts/validate-guide.mjs specs/tasks/SPEC-NNN/GUIDE.md [...] [--root <dir>]
//
// Exit 0 when every guide passes, 1 when any fails, 2 on a usage error.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isSdlcRoot, readConfig, resolveRoot, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

// The owner's limit for the prompt that arms a delivery goal (SPEC-008 Design > The kickoff prompt).
export const KICKOFF_MAX_CHARS = 3800

const AC_LINE = /^\s*[-*+] \[[ xX]\] (AC-\d{3})(?::| —)/
const CHECKBOX = /^\s*[-*+] \[[ xX]\]/
const AC_ID = /\bAC-\d{3}\b/g
const FENCE = /^\s*(```|~~~)/
const STEP_HEADING = /^### (S\d+):/
const DECISION_LINE = /^- (D\d+):/
const FIELD = /^- (Covers|Changes|Verify|Workspace|Risk|After|Run by|Notes):\s*(.*)$/

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

/** Top-level `key: value` pairs from a leading `---` frontmatter block. */
export function parseFrontmatter(text) {
    const lines = String(text).split('\n')
    if (lines[0].trim() !== '---') return {}
    const out = {}
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i].trim() === '---') break
        const kv = lines[i].match(/^([A-Za-z_]+)\s*:\s*(.*)$/)
        if (kv) out[kv[1]] = scalar(kv[2])
    }
    return out
}

/** Lines outside fenced code blocks, so a quoted example can neither open nor fill a section. */
function unfenced(text) {
    let inFence = false
    return String(text)
        .split('\n')
        .filter((line) => {
            if (FENCE.test(line)) {
                inFence = !inFence
                return false
            }
            return !inFence
        })
}

/** How many line-anchored `## <name>` headings the text has outside fenced code. */
export function countSections(text, name) {
    return unfenced(text).filter((l) => l.trimEnd() === `## ${name}`).length
}

/** The lines of the first `## <name>` section, bounded by the next `## ` heading, fenced code excluded. */
export function sectionLines(text, name) {
    const lines = unfenced(text)
    const start = lines.findIndex((l) => l.trimEnd() === `## ${name}`)
    if (start === -1) return null
    const out = []
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^## /.test(lines[i])) break
        out.push(lines[i])
    }
    return out
}

/** Spec AC ids, the checkbox lines under Acceptance criteria that carry no id, and whether the section exists. */
export function parseSpecAcs(specText) {
    const section = sectionLines(specText, 'Acceptance criteria')
    const lines = section ?? []
    const ids = new Set()
    const idless = []
    for (const line of lines) {
        if (!CHECKBOX.test(line)) continue
        const m = line.match(AC_LINE)
        if (m) ids.add(m[1])
        else idless.push(line.trim())
    }
    return { ids, idless, hasSection: section !== null, sections: countSections(specText, 'Acceptance criteria') }
}

/** Steps (in order, with their fields) and owner-decision ids from a GUIDE.md. */
export function parseGuide(text) {
    const steps = []
    let current = null
    for (const line of sectionLines(text, 'Steps') ?? []) {
        const h = line.match(STEP_HEADING)
        if (h) {
            current = { id: h[1], fields: {} }
            steps.push(current)
            continue
        }
        const f = current && line.match(FIELD)
        if (f) current.fields[f[1]] = f[2].trim()
    }
    const decisions = []
    for (const line of sectionLines(text, 'Owner decisions') ?? []) {
        const d = line.match(DECISION_LINE)
        if (d) decisions.push(d[1])
    }
    return { frontmatter: parseFrontmatter(text), steps, decisions }
}

/** `steps:` and `decisions:` lists (id + status) and `plan_review.approved` from an _index.yaml. */
export function parseIndex(text) {
    const out = { steps: [], decisions: [], approved: false }
    let list = null
    let inPlanReview = false
    for (const line of String(text).split('\n')) {
        if (/^\S/.test(line)) {
            if (/^steps\s*:\s*$/.test(line)) list = out.steps
            else if (/^decisions\s*:\s*$/.test(line)) list = out.decisions
            else list = null
            inPlanReview = /^plan_review\s*:\s*$/.test(line)
            continue
        }
        if (inPlanReview) {
            const a = line.match(/^\s+approved\s*:\s*(.+)$/)
            if (a) out.approved = scalar(a[1]) === 'true'
            continue
        }
        if (!list) continue
        const id = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (id) {
            list.push({ id: scalar(id[1]), status: null })
            continue
        }
        const st = line.match(/^\s+status\s*:\s*(.+)$/)
        if (st && list.length) list[list.length - 1].status = scalar(st[1])
    }
    return out
}

/**
 * Does the repo define workspaces? On layout 2, a non-empty `workspaces` list in
 * `.sdlc/config.yaml`. On layout 1, a `## Workspaces` table with at least one body row
 * in the project doc.
 */
export function definesWorkspaces(repoRoot) {
    const paths = sdlcPaths(repoRoot, { quiet: true })
    if (paths.layout === 2) return (readConfig(repoRoot)?.workspaces ?? []).length > 0
    const path = paths.project
    if (!existsSync(path)) return false
    const rows = (sectionLines(readFileSync(path, 'utf8'), 'Workspaces') ?? []).filter((l) => /^\s*\|/.test(l))
    // The first two table lines are the header and its `---` separator.
    return rows.length > 2
}

const diff = (a, b) => [...a].filter((x) => !b.has(x))
const duplicates = (ids) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]

/**
 * Validate one guide. The repo root is the nearest SDLC root above the guide, or three
 * levels up (specs/tasks/SPEC-NNN/GUIDE.md) when there is none, so a guide validates the
 * same from any cwd.
 * @returns {string[]} problems (empty = valid)
 */
export function validateGuide(guidePath) {
    const problems = []
    const dir = dirname(resolve(guidePath))
    const found = resolveRoot(dir)
    const repoRoot = isSdlcRoot(found) ? found : resolve(dir, '..', '..', '..')
    const guide = parseGuide(readFileSync(guidePath, 'utf8'))
    const specId = guide.frontmatter.spec
    if (!specId) return ['frontmatter: missing `spec:`']

    const specsDir = sdlcPaths(repoRoot, { quiet: true }).specs
    const matches = existsSync(specsDir)
        ? readdirSync(specsDir).filter((f) => f.startsWith(`${specId}-`) && f.endsWith('.md'))
        : []
    if (matches.length !== 1) {
        return [`spec: expected exactly one ${relative(repoRoot, specsDir) || 'specs'}/${specId}-*.md, found ${matches.length}`]
    }
    const specText = readFileSync(join(specsDir, matches[0]), 'utf8')
    const { ids: acIds, idless, hasSection, sections } = parseSpecAcs(specText)

    const indexPath = join(dir, '_index.yaml')
    const index = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : null
    if (!index) problems.push('rule 4: _index.yaml not found beside the guide')
    const statusOf = new Map((index?.steps ?? []).map((s) => [s.id, s.status]))

    // Rule 1: coverage counts only steps that are not cancelled.
    const covered = new Set()
    const coversIds = new Set()
    for (const step of guide.steps) {
        const ids = (step.fields.Covers ?? '').match(AC_ID) ?? []
        for (const id of ids) coversIds.add(id)
        if (statusOf.get(step.id) !== 'cancelled') for (const id of ids) covered.add(id)
    }
    for (const id of diff(acIds, covered)) problems.push(`rule 1: ${id} is covered by no step that is not cancelled`)

    // Rule 2
    for (const id of diff(coversIds, acIds)) problems.push(`rule 2: Covers names ${id}, which the spec does not define`)

    // Rule 3
    for (const step of guide.steps) {
        for (const field of ['Changes', 'Verify']) {
            if (!step.fields[field]) problems.push(`rule 3: ${step.id} has no ${field}:`)
        }
    }

    // Rule 4
    // A repeated id would let one `done` status mark two steps done on resume.
    for (const [where, ids] of [
        ['GUIDE.md', guide.steps.map((s) => s.id)],
        ['GUIDE.md', guide.decisions],
        ['_index.yaml', (index?.steps ?? []).map((s) => s.id)],
        ['_index.yaml', (index?.decisions ?? []).map((d) => d.id)],
    ]) {
        for (const id of duplicates(ids)) problems.push(`rule 4: ${id} appears more than once in ${where}`)
    }
    if (index) {
        const guideSteps = new Set(guide.steps.map((s) => s.id))
        const indexSteps = new Set(index.steps.map((s) => s.id))
        for (const id of diff(guideSteps, indexSteps)) problems.push(`rule 4: step ${id} is in GUIDE.md but not _index.yaml`)
        for (const id of diff(indexSteps, guideSteps)) problems.push(`rule 4: step ${id} is in _index.yaml but not GUIDE.md`)
        const guideDecisions = new Set(guide.decisions)
        const indexDecisions = new Set(index.decisions.map((d) => d.id))
        for (const id of diff(guideDecisions, indexDecisions)) problems.push(`rule 4: decision ${id} is in GUIDE.md but not _index.yaml`)
        for (const id of diff(indexDecisions, guideDecisions)) problems.push(`rule 4: decision ${id} is in _index.yaml but not GUIDE.md`)
    }

    // Rule 5
    const specVersion = parseFrontmatter(specText).version
    if (String(guide.frontmatter.spec_version) !== String(specVersion)) {
        problems.push(`rule 5: guide spec_version ${guide.frontmatter.spec_version} differs from spec version ${specVersion}`)
    }

    // Rule 6: an absent or id-less section would make rule 1 pass vacuously, so it fails closed.
    if (!hasSection) problems.push('rule 6: the spec has no line-anchored `## Acceptance criteria` section')
    else if (sections > 1) problems.push(`rule 6: the spec has ${sections} \`## Acceptance criteria\` sections; it must have one`)
    else if (acIds.size === 0) problems.push('rule 6: the spec\'s `## Acceptance criteria` section has no `- [ ] AC-NNN:` line')
    for (const line of idless) problems.push(`rule 6: acceptance criterion has no AC-NNN id: "${line.slice(0, 60)}"`)

    // Rule 7
    const order = guide.steps.map((s) => s.id)
    guide.steps.forEach((step, i) => {
        for (const id of (step.fields.After ?? '').match(/S\d+/g) ?? []) {
            const at = order.indexOf(id)
            if (at === -1) problems.push(`rule 7: ${step.id} After: names ${id}, which is not a step`)
            else if (at >= i) problems.push(`rule 7: ${step.id} After: names ${id}, which is not an earlier step`)
        }
    })

    // Rule 8
    if (definesWorkspaces(repoRoot)) {
        for (const step of guide.steps) {
            if (!step.fields.Workspace) problems.push(`rule 8: ${step.id} has no Workspace:, and the repo defines workspaces`)
        }
    }

    // Rule 9: characters, not bytes, so a multi-byte character counts once.
    if (index?.approved) {
        const kickoff = join(dir, 'KICKOFF.md')
        if (!existsSync(kickoff)) {
            problems.push('rule 9: the guide is approved but KICKOFF.md is missing')
        } else {
            const chars = [...readFileSync(kickoff, 'utf8')].length
            if (chars > KICKOFF_MAX_CHARS) {
                problems.push(`rule 9: KICKOFF.md holds ${chars} characters, over the ${KICKOFF_MAX_CHARS} limit`)
            }
        }
    }

    return problems
}

const looksLikeGlob = (s) => /[*?[\]]/.test(s)

function main() {
    const { root, rest: args } = takeRootArg(process.argv.slice(2))
    sdlcPaths(root)
    if (args.length === 0) {
        console.error('usage: node .sdlc/scripts/validate-guide.mjs <GUIDE.md> [<GUIDE.md> ...] [--root <dir>]')
        process.exit(2)
    }
    // An unmatched glob (a repo with no guides yet) is "nothing to check", as in the other validators.
    const files = args.filter((f) => existsSync(f) || !looksLikeGlob(f))
    if (files.length === 0) {
        console.log('validate-guide: nothing to check (no matching files)')
        process.exit(0)
    }
    let failed = false
    for (const file of files) {
        const problems = existsSync(file) ? validateGuide(file) : [`cannot read file: ${file}`]
        if (problems.length === 0) {
            console.log(`OK   ${file}`)
        } else {
            failed = true
            console.error(`FAIL ${file}`)
            for (const p of problems) console.error(`       - ${p}`)
        }
    }
    process.exit(failed ? 1 : 0)
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

if (isMain(import.meta.url)) main()
