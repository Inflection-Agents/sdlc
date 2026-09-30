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
//   4. step ids, and owner-decision ids, match between GUIDE.md and _index.yaml
//   5. the guide's `spec_version` equals the spec's `version`
//   6. every checkbox under `## Acceptance criteria` carries an `AC-NNN` id
//   7. every `After:` id names an earlier step
//   8. when .ai/project.md defines workspaces, every step has `Workspace:`
//   9. an approved guide has a KICKOFF.md of at most 3,800 characters
//
// AC ids are read only from checkbox lines under `## Acceptance criteria`, in either the
// `AC-NNN:` form or the legacy `AC-NNN —` form, so prose that mentions another spec's AC is
// ignored. Headings match only at the start of a line: a spec that quotes a heading inline
// must not move the section boundary.
//
// Usage:
//   node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-NNN/GUIDE.md [...]
//
// Exit 0 when every guide passes, 1 when any fails, 2 on a usage error.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The owner's limit for the prompt that arms a delivery goal (SPEC-008 Design > The kickoff prompt).
export const KICKOFF_MAX_CHARS = 3800

const AC_LINE = /^\s*- \[[ xX]\] (AC-\d{3})(?::| —)/
const CHECKBOX = /^\s*- \[[ xX]\]/
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

/** The lines of a `## <name>` section, bounded by the next line-anchored `## ` heading. */
export function sectionLines(text, name) {
    const lines = String(text).split('\n')
    const start = lines.findIndex((l) => l.trim() === `## ${name}`)
    if (start === -1) return null
    const out = []
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^## /.test(lines[i])) break
        out.push(lines[i])
    }
    return out
}

/** Spec AC ids, plus the checkbox lines under Acceptance criteria that carry no id. */
export function parseSpecAcs(specText) {
    const lines = sectionLines(specText, 'Acceptance criteria') ?? []
    const ids = new Set()
    const idless = []
    for (const line of lines) {
        if (!CHECKBOX.test(line)) continue
        const m = line.match(AC_LINE)
        if (m) ids.add(m[1])
        else idless.push(line.trim())
    }
    return { ids, idless }
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

/** Does .ai/project.md define workspaces (a `## Workspaces` table with at least one body row)? */
export function definesWorkspaces(repoRoot) {
    const path = join(repoRoot, '.ai', 'project.md')
    if (!existsSync(path)) return false
    const rows = (sectionLines(readFileSync(path, 'utf8'), 'Workspaces') ?? []).filter((l) => /^\s*\|/.test(l))
    // The first two table lines are the header and its `---` separator.
    return rows.length > 2
}

const diff = (a, b) => [...a].filter((x) => !b.has(x))

/**
 * Validate one guide. The repo root is three levels above the guide
 * (specs/tasks/SPEC-NNN/GUIDE.md), so a guide validates the same from any cwd.
 * @returns {string[]} problems (empty = valid)
 */
export function validateGuide(guidePath) {
    const problems = []
    const dir = dirname(resolve(guidePath))
    const repoRoot = resolve(dir, '..', '..', '..')
    const guide = parseGuide(readFileSync(guidePath, 'utf8'))
    const specId = guide.frontmatter.spec
    if (!specId) return ['frontmatter: missing `spec:`']

    const specsDir = join(repoRoot, 'specs')
    const matches = existsSync(specsDir)
        ? readdirSync(specsDir).filter((f) => f.startsWith(`${specId}-`) && f.endsWith('.md'))
        : []
    if (matches.length !== 1) {
        return [`spec: expected exactly one specs/${specId}-*.md, found ${matches.length}`]
    }
    const specText = readFileSync(join(specsDir, matches[0]), 'utf8')
    const { ids: acIds, idless } = parseSpecAcs(specText)

    const indexPath = join(dir, '_index.yaml')
    const index = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : null
    if (!index) problems.push('rule 4: _index.yaml not found beside the guide')
    const statusOf = new Map((index?.steps ?? []).map((s) => [s.id, s.status]))

    // Rule 1: coverage counts only steps that are not cancelled.
    const covered = new Set()
    const coversIds = new Set()
    for (const step of guide.steps) {
        const ids = (step.fields.Covers ?? '').match(/AC-\d{3}/g) ?? []
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

    // Rule 6
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
            if (!step.fields.Workspace) problems.push(`rule 8: ${step.id} has no Workspace:, and .ai/project.md defines workspaces`)
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
    const args = process.argv.slice(2)
    if (args.length === 0) {
        console.error('usage: node scripts/sdlc/validate-guide.mjs <GUIDE.md> [<GUIDE.md> ...]')
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
