#!/usr/bin/env node
/**
 * Decide the mechanical share of a spec review before any reviewer sees the draft
 * (SPEC-007 > Design > Lever 2). Findings use the review envelope, so the routing policy in
 * review-primitives.md folds them exactly as it folds a reviewer's.
 *
 * Checks:
 * - every required section is present and non-empty, in order;
 * - the optional sections, when present, follow the order skills/spec-schema.md declares;
 * - frontmatter carries every required field, with a valid value and a legal `status`;
 * - every ADR-NNN the body names resolves to a file;
 * - In scope is non-empty and Out of scope has at least two items;
 * - every `workspaces:` entry is named by at least one acceptance criterion;
 * - no placeholder marker survives in prose (code spans and fenced blocks are ignored);
 * - every `depends_on` entry resolves.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-spec specs/SPEC-NNN-x.md [--json]
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-spec --ci
 *
 * Exit codes: 0 clean; 1 findings; 2 usage or an unreadable file. Under --ci, which grades
 * every live spec, only an `active` spec's findings exit 1, and every other status's are
 * printed as warnings (SPEC-007 > D-014).
 */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findById } from './resolve.mjs'
import { parseFrontmatter, sectionLines } from './validate-guide.mjs'
import { sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

export const REQUIRED_SECTIONS = ['Problem', 'Success criteria', 'Scope', 'Design', 'Acceptance criteria', 'Risks & constraints']
export const OPTIONAL_ORDER = ['Migration', 'spec_review_overrides', 'spec_followups', 'Disclosed, not reviewed-clean', 'Changelog']
export const STATUSES = ['draft', 'active', 'completed', 'superseded', 'deprecated']
export const PLACEHOLDERS = [/\bTBD\b/, /\bTODO\b/, /\bXXX\b/, /\bto be determined\b/i]

const REQUIRED_FIELDS = {
    id: /^SPEC-\d{3}$/,
    title: /\S/,
    status: null,
    version: /^\d+$/,
    initiative: /^INI-\d+$/,
    owner: /\S/,
    created: /^\d{4}-\d{2}-\d{2}$/,
    updated: /^\d{4}-\d{2}-\d{2}$/,
}
const LIST_FIELDS = ['workspaces', 'tags', 'depends_on']
const FENCE = /^\s*(```|~~~)/

/** Body lines outside fenced code, with their 1-based line numbers. */
function bodyLines(text) {
    const lines = String(text).split('\n')
    let start = 0
    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
        start = end === -1 ? 0 : end + 1
    }
    const out = []
    let inFence = false
    for (let i = start; i < lines.length; i += 1) {
        if (FENCE.test(lines[i])) {
            inFence = !inFence
            continue
        }
        if (!inFence) out.push({ n: i + 1, text: lines[i] })
    }
    return out
}

/** `[a, b]` → ['a', 'b']; a missing or empty value → []. Null when the value is not a list. */
export function parseList(raw) {
    if (raw == null || raw === '') return []
    const s = String(raw).trim()
    if (!/^\[.*\]$/.test(s)) return null
    return s
        .slice(1, -1)
        .split(',')
        .map((x) => x.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
}

/** Which known section a `## ` heading opens: the name before any ` (` qualifier. */
function sectionName(heading) {
    return heading.replace(/^##\s+/, '').replace(/\s+\(.*\)\s*$/, '').trim()
}

const nonEmpty = (lines) => (lines ?? []).some((l) => l.trim() !== '' && !/^#{3,}\s/.test(l))

/** List items (`- `, `* `, `+ `, `1. `) at any indent within a subsection. */
function subsectionItems(lines, name) {
    const start = lines.findIndex((l) => l.trim() === `### ${name}`)
    if (start === -1) return null
    const items = []
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^###\s/.test(lines[i])) break
        if (/^\s*([-*+]|\d+\.)\s+\S/.test(lines[i]) && !/^\s{2,}/.test(lines[i])) items.push(lines[i])
    }
    return items
}

/**
 * Every mechanical defect in one spec's text, as envelope findings.
 * @param {string} text the spec file
 * @param {{ root: string, resolveId?: (id: string) => boolean }} opts
 */
export function checkSpec(text, { root, resolveId = (id) => findById(id, root).length > 0 }) {
    const findings = []
    const add = (severity, criterion, location, finding) =>
        findings.push({ id: `F-${String(findings.length + 1).padStart(3, '0')}`, severity, criterion, location, finding, altitude: 'implementation' })

    // Frontmatter.
    const fm = parseFrontmatter(text)
    if (!String(text).startsWith('---')) add('blocker', 'spec-schema:frontmatter', 'frontmatter', 'The spec has no YAML frontmatter block.')
    for (const [field, shape] of Object.entries(REQUIRED_FIELDS)) {
        const value = fm[field]
        if (value == null || value === '') add('blocker', `spec-schema:${field}`, `frontmatter > ${field}`, `Required field \`${field}\` is missing or empty.`)
        else if (field === 'status' && !STATUSES.includes(value)) add('blocker', 'spec-schema:status', 'frontmatter > status', `\`status: ${value}\` is not one of ${STATUSES.join(', ')}.`)
        else if (shape && !shape.test(value)) add('blocker', `spec-schema:${field}`, `frontmatter > ${field}`, `\`${field}: ${value}\` does not have the form the schema requires.`)
    }
    for (const field of LIST_FIELDS) {
        if (field in fm && parseList(fm[field]) === null) add('blocker', `spec-schema:${field}`, `frontmatter > ${field}`, `\`${field}\` must be a list such as \`[a, b]\`.`)
    }

    // Section presence and order.
    const lines = bodyLines(text)
    const headings = lines.filter((l) => /^## /.test(l.text)).map((l) => sectionName(l.text))
    for (const name of REQUIRED_SECTIONS) {
        if (!headings.includes(name)) add('blocker', `spec-schema:${name}`, name, `Required section \`## ${name}\` is missing.`)
        else if (!nonEmpty(sectionLines(text, headingFor(text, name)))) add('blocker', `spec-schema:${name}`, name, `Required section \`## ${name}\` is empty.`)
    }
    const required = headings.filter((h) => REQUIRED_SECTIONS.includes(h))
    if (required.join('\n') !== REQUIRED_SECTIONS.filter((n) => required.includes(n)).join('\n')) {
        add('blocker', 'spec-schema:Body structure', 'Body structure', `Required sections are out of order: ${required.join(' → ')}.`)
    }
    const lastRequired = Math.max(...REQUIRED_SECTIONS.map((n) => headings.indexOf(n)))
    const optional = headings.filter((h) => OPTIONAL_ORDER.includes(h))
    const rank = optional.map((h) => OPTIONAL_ORDER.indexOf(h))
    if (rank.some((r, i) => i > 0 && r < rank[i - 1]) || optional.some((h) => headings.indexOf(h) < lastRequired)) {
        add('major', 'spec-schema:Section ordering', 'Section ordering', `Optional sections must follow the required ones in the order ${OPTIONAL_ORDER.join(' → ')}; found ${optional.join(' → ')}.`)
    }

    // Scope.
    const scope = sectionLines(text, headingFor(text, 'Scope'))
    if (scope) {
        const inScope = subsectionItems(scope, 'In scope')
        const outScope = subsectionItems(scope, 'Out of scope')
        if (!inScope?.length) add('major', 'spec-authoring:step-9-self-review-mandatory', 'Scope > In scope', 'In scope lists nothing.')
        if (!outScope || outScope.length < 2) add('major', 'spec-authoring:step-9-self-review-mandatory', 'Scope > Out of scope', `Out of scope lists ${outScope?.length ?? 0} item(s); at least 2 are required.`)
    }

    // Workspaces named by an acceptance criterion.
    const workspaces = parseList(fm.workspaces) ?? []
    const acText = (sectionLines(text, headingFor(text, 'Acceptance criteria')) ?? []).join('\n')
    for (const ws of workspaces) {
        if (!new RegExp(`(^|[^\\w-])${ws.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`).test(acText)) {
            add('major', 'monorepo:workspaces', 'Acceptance criteria', `Workspace \`${ws}\` is declared in frontmatter but no acceptance criterion names it.`)
        }
    }

    // Placeholders, outside code spans.
    for (const { n, text: line } of lines) {
        const prose = line.replace(/`[^`]*`/g, '')
        if (PLACEHOLDERS.some((re) => re.test(prose))) add('major', 'spec-authoring:step-9-self-review-mandatory', `line ${n}`, `A placeholder marker is left in the prose: "${line.trim().slice(0, 80)}".`)
    }

    // References that must resolve.
    const adrs = new Set(lines.flatMap((l) => l.text.match(/\bADR-\d{3}\b/g) ?? []))
    for (const id of [...adrs].sort()) {
        if (!resolveId(id)) add('blocker', 'spec-schema:Design', 'Design', `${id} is referenced but no file resolves it.`)
    }
    for (const id of parseList(fm.depends_on) ?? []) {
        if (!resolveId(id)) add('blocker', 'spec-schema:depends_on', 'frontmatter > depends_on', `\`depends_on\` names ${id}, which no file resolves.`)
    }
    return findings
}

/** The exact heading text a section opens with, qualifier included, for sectionLines. */
function headingFor(text, name) {
    const h = bodyLines(text).find((l) => /^## /.test(l.text) && sectionName(l.text) === name)
    return h ? h.text.replace(/^##\s+/, '').trimEnd() : name
}

export function envelope(specId, findings) {
    return { artifact: 'spec', artifact_id: specId ?? null, reviewed_by: 'agent:validate-spec', reviewer_status: 'assessed', findings }
}

/** Every live spec file: `specs/SPEC-*.md`, not the archive. */
export function liveSpecs(root) {
    const specs = sdlcPaths(root, { quiet: true }).specs
    if (!existsSync(specs)) return []
    return readdirSync(specs)
        .filter((f) => /^SPEC-\d+.*\.md$/i.test(f))
        .sort()
        .map((f) => join(specs, f))
}

function report(root, file, findings, label = '') {
    for (const f of findings) process.stdout.write(`${label}${relative(root, file)}: ${f.severity} [${f.criterion}] ${f.location}: ${f.finding}\n`)
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const json = rest.includes('--json')
    if (rest.includes('--ci')) {
        let failed = 0
        for (const file of liveSpecs(root)) {
            const text = readFileSync(file, 'utf8')
            const findings = checkSpec(text, { root })
            if (!findings.length) continue
            const gating = parseFrontmatter(text).status === 'active'
            report(root, file, findings, gating ? '' : 'warning: ')
            if (gating) failed += 1
        }
        if (failed) {
            process.stderr.write(`validate-spec: ${failed} active spec(s) have mechanical defects\n`)
            process.exit(1)
        }
        process.stdout.write('validate-spec: every active spec passes\n')
        return
    }
    const files = rest.filter((a) => !a.startsWith('--'))
    if (!files.length) {
        process.stderr.write('usage: validate-spec.mjs [--root <dir>] (<spec.md>... [--json] | --ci)\n')
        process.exit(2)
    }
    let any = false
    for (const arg of files) {
        const file = resolve(arg)
        if (!existsSync(file)) {
            process.stderr.write(`validate-spec: cannot read ${arg}\n`)
            process.exit(2)
        }
        const text = readFileSync(file, 'utf8')
        const findings = checkSpec(text, { root })
        if (json) process.stdout.write(`${JSON.stringify(envelope(parseFrontmatter(text).id, findings), null, 2)}\n`)
        else if (findings.length) report(root, file, findings)
        else process.stdout.write(`OK   ${relative(root, file)}\n`)
        any ||= findings.length > 0
    }
    process.exit(any ? 1 : 0)
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
