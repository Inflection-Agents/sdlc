#!/usr/bin/env node
// gen-handoffs.mjs — generate the phase-handoff documentation FROM the state
// machine, so the narrative and per-skill footers never drift from the source.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined).
//
// From the single source of truth `specs/sdlc-state-machine.yaml`, it
// generates/refreshes:
//   (a) the phase-narrative section of `.ai/sdlc.md`, and
//   (b) a standardized `## Handoff` footer (Entry triggers / Preconditions /
//       Exit condition / Next step + trigger) on each phase OWNER-skill SKILL.md.
//
// Both generated regions are delimited by stable markers so generation is
// idempotent and hand-edits OUTSIDE the markers are preserved:
//
//     <!-- sdlc:handoff:start -->  …  <!-- sdlc:handoff:end -->   (per-skill footer)
//     <!-- sdlc:phases:start -->   …  <!-- sdlc:phases:end -->    (.ai/sdlc.md narrative)
//
// NEVER hand-edit inside the markers — re-run this generator instead.
//
// Footer scope: footers go on PHASE OWNER-SKILLS ONLY. Reviewer/standards
// skills (`pr-reviewer`, `spec-reviewer`, `sdlc-code-standards`) are excluded
// (FOOTER_EXCLUDE) to keep the footer surface to the process owner-skills —
// even though `pr-reviewer` is the `review` phase owner_skill.
//
// Usage:
//   node scripts/sdlc/gen-handoffs.mjs            # write the generated regions in place
//   node scripts/sdlc/gen-handoffs.mjs --check    # report drift only (no write)
//
// Exits 0 on success. With --check, exits 1 if any region is out of date.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..', '..')

// Reviewer/standards skills that are NEVER footered, even when a phase owner.
export const FOOTER_EXCLUDE = new Set(['pr-reviewer', 'spec-reviewer', 'sdlc-code-standards'])

export const SKILL_MARKER_START = '<!-- sdlc:handoff:start -->'
export const SKILL_MARKER_END = '<!-- sdlc:handoff:end -->'
export const SDLC_MARKER_START = '<!-- sdlc:phases:start -->'
export const SDLC_MARKER_END = '<!-- sdlc:phases:end -->'

export const DEFAULT_MACHINE_PATH = join(REPO_ROOT, 'specs', 'sdlc-state-machine.yaml')
// Skills live under .ai/skills/ (the .claude/skills symlink points here).
export const DEFAULT_SKILLS_DIR = join(REPO_ROOT, '.ai', 'skills')
export const DEFAULT_SDLC_DOC = join(REPO_ROOT, '.ai', 'sdlc.md')

const GENERATED_WARNING =
    '<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->'

// ─── Minimal, dependency-free YAML reader for `phases:` ────────────────────

function scalar(raw) {
    if (raw == null) return null
    let s = String(raw).trim()
    if (!/^['"]/.test(s)) {
        const hash = s.indexOf(' #')
        if (hash !== -1) s = s.slice(0, hash).trim()
    }
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1)
    }
    return s
}

/** Parse the `phases:` list with all fields the renderers need. */
export function parsePhases(text) {
    const lines = String(text).split('\n')
    const phases = []
    let inPhases = false
    let current = null
    let listKey = null
    for (const line of lines) {
        if (/^\S/.test(line) && !/^phases\s*:/.test(line)) {
            if (inPhases) break
            continue
        }
        if (/^phases\s*:/.test(line)) {
            inPhases = true
            continue
        }
        if (!inPhases) continue

        const item = line.match(/^(\s*)-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) phases.push(current)
            current = {
                id: scalar(item[2]),
                entry_triggers: [],
                preconditions: [],
                owner_skill: null,
                exit_condition: null,
                next_phase: null,
                next_trigger: null
            }
            listKey = null
            continue
        }
        if (!current) continue

        const li = line.match(/^\s*-\s*(.+)$/)
        if (li && listKey && Array.isArray(current[listKey])) {
            current[listKey].push(scalar(li[1]))
            continue
        }

        const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*)$/i)
        if (kv) {
            const key = kv[1]
            const val = kv[2]
            if (val.trim() === '') {
                listKey = key
            } else {
                listKey = null
                if (key in current && !Array.isArray(current[key])) current[key] = scalar(val)
            }
        }
    }
    if (current) phases.push(current)
    return phases.filter((p) => p.id)
}

export function loadMachine(machinePath = DEFAULT_MACHINE_PATH) {
    return { phases: parsePhases(readFileSync(machinePath, 'utf8')) }
}

// ─── Model helpers ─────────────────────────────────────────────────────────

// The owner-skills that receive a `## Handoff` footer: every phase owner_skill,
// minus FOOTER_EXCLUDE, de-duplicated, in first-seen phase order.
export function footerOwnerSkills(machine) {
    const seen = new Set()
    const skills = []
    for (const phase of machine.phases ?? []) {
        const owner = phase?.owner_skill
        if (!owner || FOOTER_EXCLUDE.has(owner) || seen.has(owner)) continue
        seen.add(owner)
        skills.push(owner)
    }
    return skills
}

function phaseForOwner(machine, owner) {
    return (machine.phases ?? []).find((p) => p?.owner_skill === owner)
}

function fmtList(items) {
    return (items ?? []).map((item) => `- ${item}`).join('\n')
}

// ─── Region rendering ──────────────────────────────────────────────────────

export function renderFooterBody(phase) {
    const nextStep =
        phase.next_phase === 'none'
            ? '`none` (terminal phase — no next phase)'
            : `\`${phase.next_phase}\` — trigger: "${phase.next_trigger}"`
    return [
        GENERATED_WARNING,
        '',
        '## Handoff',
        '',
        `This phase is **${phase.id}** in the SDLC state machine (\`specs/sdlc-state-machine.yaml\`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.`,
        '',
        '**Entry triggers:**',
        '',
        fmtList(phase.entry_triggers),
        '',
        '**Preconditions:**',
        '',
        fmtList(phase.preconditions),
        '',
        `**Exit condition:** ${phase.exit_condition}`,
        '',
        `**Next step:** ${nextStep}`
    ].join('\n')
}

export function renderFooterBlock(phase) {
    return `${SKILL_MARKER_START}\n${renderFooterBody(phase)}\n${SKILL_MARKER_END}`
}

export function renderSdlcPhaseBody(machine) {
    const lines = [
        GENERATED_WARNING,
        '',
        '## SDLC phases',
        '',
        'The phases below are generated from `specs/sdlc-state-machine.yaml` — the single,',
        'machine-readable source of truth for the SDLC state machine. Each phase is owned by',
        'a skill, has documented entry triggers, and hands off to the next phase on its exit',
        'condition. **Do not hand-edit this section** — change the YAML and re-run',
        '`node scripts/sdlc/gen-handoffs.mjs`.',
        ''
    ]
    for (const phase of machine.phases ?? []) {
        const nextStep =
            phase.next_phase === 'none'
                ? '`none` (terminal phase)'
                : `\`${phase.next_phase}\` — trigger: "${phase.next_trigger}"`
        lines.push(`### ${phase.id}`)
        lines.push('')
        lines.push(`- **Owner skill:** \`${phase.owner_skill}\``)
        lines.push(
            `- **Entry triggers:** ${(phase.entry_triggers ?? []).map((t) => `"${t}"`).join(', ')}`
        )
        lines.push(`- **Preconditions:** ${(phase.preconditions ?? []).join('; ')}`)
        lines.push(`- **Exit condition:** ${phase.exit_condition}`)
        lines.push(`- **Next step:** ${nextStep}`)
        lines.push('')
    }
    while (lines.length && lines[lines.length - 1] === '') lines.pop()
    return lines.join('\n')
}

export function renderSdlcPhaseBlock(machine) {
    return `${SDLC_MARKER_START}\n${renderSdlcPhaseBody(machine)}\n${SDLC_MARKER_END}`
}

// ─── Idempotent splice ─────────────────────────────────────────────────────

export function spliceBlock(content, startMarker, endMarker, block) {
    const startIdx = content.indexOf(startMarker)
    const endIdx = content.indexOf(endMarker)
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = content.slice(0, startIdx)
        const after = content.slice(endIdx + endMarker.length)
        return `${before}${block}${after}`
    }
    if (startIdx !== -1 || endIdx !== -1) {
        throw new Error(`unbalanced ${startMarker} / ${endMarker} markers — refusing to splice`)
    }
    const trimmed = content.replace(/\s*$/, '')
    return `${trimmed}\n\n${block}\n`
}

// ─── Computed (in-memory) outputs ──────────────────────────────────────────

export function computeSkillTargets(machine, skillsDir = DEFAULT_SKILLS_DIR) {
    return footerOwnerSkills(machine).map((owner) => {
        const phase = phaseForOwner(machine, owner)
        const path = join(skillsDir, owner, 'SKILL.md')
        return { owner, phase, path, block: renderFooterBlock(phase) }
    })
}

export function expectedSkillContent(currentContent, block) {
    return spliceBlock(currentContent, SKILL_MARKER_START, SKILL_MARKER_END, block)
}

export function expectedSdlcContent(machine, currentContent) {
    const block = renderSdlcPhaseBlock(machine)
    return spliceBlock(currentContent, SDLC_MARKER_START, SDLC_MARKER_END, block)
}

// ─── Driver ────────────────────────────────────────────────────────────────

function run({
    machinePath = DEFAULT_MACHINE_PATH,
    skillsDir = DEFAULT_SKILLS_DIR,
    sdlcDoc = DEFAULT_SDLC_DOC,
    check = false
} = {}) {
    const machine = loadMachine(machinePath)
    const drifts = []
    const written = []

    // (b) per-skill footers
    for (const target of computeSkillTargets(machine, skillsDir)) {
        if (!existsSync(target.path)) {
            drifts.push(`missing owner-skill SKILL.md: ${target.path}`)
            continue
        }
        const current = readFileSync(target.path, 'utf8')
        const expected = expectedSkillContent(current, target.block)
        if (current !== expected) {
            if (check) {
                drifts.push(
                    `${target.owner}/SKILL.md ## Handoff footer is out of date (re-run gen-handoffs.mjs)`
                )
            } else {
                writeFileSync(target.path, expected)
                written.push(`${target.owner}/SKILL.md`)
            }
        }
    }

    // (a) .ai/sdlc.md phase narrative
    if (!existsSync(sdlcDoc)) {
        drifts.push(`missing .ai/sdlc.md at ${sdlcDoc}`)
    } else {
        const current = readFileSync(sdlcDoc, 'utf8')
        const expected = expectedSdlcContent(machine, current)
        if (current !== expected) {
            if (check) {
                drifts.push('.ai/sdlc.md phase section is out of date (re-run gen-handoffs.mjs)')
            } else {
                writeFileSync(sdlcDoc, expected)
                written.push('.ai/sdlc.md')
            }
        }
    }

    return { drifts, written }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
    const check = process.argv.includes('--check')
    const { drifts, written } = run({ check })
    if (check) {
        if (drifts.length > 0) {
            console.error('gen-handoffs --check: regions are OUT OF DATE:')
            for (const d of drifts) console.error(`  - ${d}`)
            process.exit(1)
        }
        console.log('gen-handoffs --check: all generated regions are up to date.')
        process.exit(0)
    }
    if (drifts.length > 0) {
        console.error('gen-handoffs: could not generate:')
        for (const d of drifts) console.error(`  - ${d}`)
        process.exit(1)
    }
    if (written.length === 0) {
        console.log('gen-handoffs: no changes — all generated regions already current.')
    } else {
        console.log(`gen-handoffs: wrote ${written.length} file(s):`)
        for (const w of written) console.log(`  - ${w}`)
    }
    process.exit(0)
}
