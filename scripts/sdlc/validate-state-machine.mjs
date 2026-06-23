#!/usr/bin/env node
// validate-state-machine.mjs — structural + referential validator for the SDLC
// state machine.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined so no
// npm package is required). Single source of truth: specs/sdlc-state-machine.yaml.
//
// It asserts:
//   1. Structural well-formedness of `phases[]` — every phase has the stable
//      contract fields (id, entry_triggers, preconditions, owner_skill,
//      exit_condition, next_phase, next_trigger); no duplicate ids.
//   2. Transition integrity — each `next_phase` resolves to a real phase id or
//      the terminal sentinel `none`; a terminal phase pairs next_phase=none with
//      next_trigger=none.
//   3. Skill registration — every SDLC skill under the skills dir (a `<name>/`
//      directory containing SKILL.md, or a top-level `<name>.md` reference doc)
//      is registered in the state machine as a phase owner_skill or a domain
//      skill, OR listed under top-level `exempt:`. And every owner_skill /
//      domain skill resolves to a real skill.
//
// Usage:
//   node scripts/sdlc/validate-state-machine.mjs
//   node scripts/sdlc/validate-state-machine.mjs --machine <path> --skills <dir>
//
// Exits 0 when valid, 1 (with diagnostics on stderr) when invalid.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

const STABLE_PHASE_FIELDS = [
    'id',
    'entry_triggers',
    'preconditions',
    'owner_skill',
    'exit_condition',
    'next_phase',
    'next_trigger'
]

function parseArgs(argv) {
    const args = {
        machine: join(REPO_ROOT, 'specs', 'sdlc-state-machine.yaml'),
        // Skills live under .ai/skills/ (the .claude/skills symlink points here).
        skills: join(REPO_ROOT, '.ai', 'skills')
    }
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i]
        if (flag === '--machine') args.machine = resolve(argv[(i += 1)])
        else if (flag === '--skills') args.skills = resolve(argv[(i += 1)])
        else throw new Error(`Unknown argument: ${flag}`)
    }
    return args
}

// ─── Minimal, dependency-free YAML reader ──────────────────────────────────
//
// Parses just the constructs the state machine uses: the `phases:` list (each a
// `- id:` block with scalar + list-valued fields), the top-level
// `domain_routing:` map, and the top-level `exempt:` list. Not a general YAML
// parser; it throws on input it cannot read so the caller fails closed.

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

function parseMachine(text) {
    const lines = String(text).split('\n')
    const phases = []
    const domain_routing = {}
    const exempt = []

    let section = null // 'phases' | 'domain_routing' | 'exempt' | null
    let current = null // current phase object
    let listKey = null // field currently accumulating `-` items within a phase
    let dr = null // current domain_routing workspace

    for (const line of lines) {
        // Top-level key boundaries.
        if (/^phases\s*:/.test(line)) {
            if (current) phases.push(current), (current = null)
            section = 'phases'
            continue
        }
        if (/^domain_routing\s*:/.test(line)) {
            if (current) phases.push(current), (current = null)
            section = 'domain_routing'
            continue
        }
        if (/^exempt\s*:/.test(line)) {
            if (current) phases.push(current), (current = null)
            section = 'exempt'
            continue
        }
        if (/^[A-Za-z0-9_]+\s*:/.test(line) && !/^\s/.test(line)) {
            // some other top-level scalar (e.g. version:) — leave the section.
            if (current) phases.push(current), (current = null)
            section = null
            continue
        }

        if (section === 'phases') {
            const item = line.match(/^(\s*)-\s*id\s*:\s*(.+)$/)
            if (item) {
                if (current) phases.push(current)
                current = {}
                for (const f of STABLE_PHASE_FIELDS) {
                    current[f] = f === 'entry_triggers' || f === 'preconditions' ? [] : null
                }
                current.id = scalar(item[2])
                listKey = null
                continue
            }
            if (!current) continue
            const li = line.match(/^\s*-\s*(.+)$/)
            if (li && listKey) {
                if (Array.isArray(current[listKey])) current[listKey].push(scalar(li[1]))
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
                    if (key in current) current[key] = scalar(val)
                }
            }
        } else if (section === 'domain_routing') {
            if (/^\s*#/.test(line) || line.trim() === '') continue
            const li = line.match(/^\s*-\s*(.+)$/)
            if (li && dr) {
                domain_routing[dr].push(scalar(li[1]))
                continue
            }
            const ws = line.match(/^\s*([A-Za-z0-9_./-]+)\s*:\s*(.*)$/)
            if (ws) {
                dr = scalar(ws[1])
                if (dr === '{}') {
                    dr = null
                    continue
                }
                domain_routing[dr] = []
            }
        } else if (section === 'exempt') {
            const li = line.match(/^\s*-\s*(.+)$/)
            if (li) exempt.push(scalar(li[1]))
        }
    }
    if (current) phases.push(current)
    return { phases, domain_routing, exempt }
}

// ─── Skill discovery ───────────────────────────────────────────────────────
//
// A "skill" is either a `<name>/` directory containing a SKILL.md, OR a
// top-level `<name>.md` reference doc in the skills dir (e.g. review-primitives.md).

function listSkills(skillsDir) {
    if (!existsSync(skillsDir)) return []
    const names = new Set()
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            const skillFile = join(skillsDir, entry.name, 'SKILL.md')
            if (existsSync(skillFile) && statSync(skillFile).isFile()) names.add(entry.name)
        } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
            names.add(entry.name.replace(/\.md$/i, ''))
        }
    }
    return [...names].sort()
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
    const args = parseArgs(process.argv.slice(2))
    const errors = []

    if (!existsSync(args.machine)) {
        console.error(`error: state-machine source not found at ${args.machine}`)
        process.exit(1)
    }

    let machine
    try {
        machine = parseMachine(readFileSync(args.machine, 'utf8'))
    } catch (err) {
        console.error(`error: failed to parse ${args.machine}: ${err.message}`)
        process.exit(1)
    }

    const phases = Array.isArray(machine.phases) ? machine.phases : []
    if (phases.length === 0) errors.push('#/phases: no phases parsed (empty or malformed)')

    // 1. Structural well-formedness.
    for (const phase of phases) {
        for (const f of STABLE_PHASE_FIELDS) {
            const v = phase[f]
            const missing =
                v == null ||
                ((f === 'entry_triggers' || f === 'preconditions') &&
                    (!Array.isArray(v) || v.length === 0))
            if (missing) {
                errors.push(`#/phases (${phase.id ?? '?'}): missing or empty field '${f}'`)
            }
        }
    }

    // duplicate ids
    const seen = new Set()
    for (const id of phases.map((p) => p.id)) {
        if (id == null) continue
        if (seen.has(id)) errors.push(`#/phases: duplicate phase id '${id}'`)
        seen.add(id)
    }

    // 2. Transition integrity.
    const phaseIds = new Set(phases.map((p) => p.id).filter(Boolean))
    for (const phase of phases) {
        if (phase.next_phase && phase.next_phase !== 'none' && !phaseIds.has(phase.next_phase)) {
            errors.push(
                `#/phases (${phase.id}): next_phase '${phase.next_phase}' does not resolve to a known phase id`
            )
        }
        const terminal = phase.next_phase === 'none' || phase.next_trigger === 'none'
        if (terminal && !(phase.next_phase === 'none' && phase.next_trigger === 'none')) {
            errors.push(
                `#/phases (${phase.id}): a terminal phase must set BOTH next_phase and next_trigger to 'none'`
            )
        }
    }

    // 3. Skill-registration check.
    const ownerSkills = new Set(phases.map((p) => p.owner_skill).filter(Boolean))
    const domainSkills = new Set(
        Object.values(machine.domain_routing ?? {})
            .flat()
            .filter(Boolean)
    )
    const exempt = new Set(machine.exempt ?? [])
    const registered = new Set([...ownerSkills, ...domainSkills, ...exempt])

    const skills = listSkills(args.skills)
    for (const skill of skills) {
        if (!registered.has(skill)) {
            errors.push(
                `skill '${skill}' exists under ${relName(args.skills)} but is not registered in the ` +
                    `state machine (not an owner_skill, not a domain skill) and is not listed in ` +
                    `exempt: — add it as a phase owner_skill/domain skill or to the exempt array`
            )
        }
    }

    const skillSet = new Set(skills)
    for (const owner of ownerSkills) {
        if (!skillSet.has(owner)) {
            errors.push(`owner_skill '${owner}' does not resolve to a skill under ${relName(args.skills)}`)
        }
    }
    for (const ds of domainSkills) {
        if (!skillSet.has(ds)) {
            errors.push(`domain skill '${ds}' does not resolve to a skill under ${relName(args.skills)}`)
        }
    }

    if (errors.length > 0) {
        console.error('state-machine validation FAILED:')
        for (const e of errors) console.error(`  - ${e}`)
        process.exit(1)
    }

    console.log('state-machine validation OK')
    console.log(`  phases: ${phases.length}`)
    console.log(`  owner skills: ${[...ownerSkills].sort().join(', ')}`)
    console.log(`  domain skills: ${[...domainSkills].sort().join(', ') || '(none)'}`)
    console.log(`  exempt: ${[...exempt].sort().join(', ') || '(none)'}`)
    console.log(`  skills scanned: ${skills.length}`)
    process.exit(0)
}

function relName(abs) {
    const rel = abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length + 1) : abs
    return rel || abs
}

main()
