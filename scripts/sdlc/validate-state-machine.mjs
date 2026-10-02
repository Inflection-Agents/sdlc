#!/usr/bin/env node
// validate-state-machine.mjs — structural + referential validator for the SDLC
// state machine.
//
// Generic reference implementation shipped by the AI-native SDLC framework.
// Dependency-free (Node built-ins only — a minimal YAML reader is inlined so no
// npm package is required). Single source of truth: the state machine, .sdlc/state-machine.yaml.
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
//   node .sdlc/scripts/validate-state-machine.mjs
//   node .sdlc/scripts/validate-state-machine.mjs --machine <path> --skills <dir>
//
// Exits 0 when valid, 1 (with diagnostics on stderr) when invalid.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadMachine, pluginRoot, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

let REPO_ROOT

const STABLE_PHASE_FIELDS = [
    'id',
    'entry_triggers',
    'preconditions',
    'owner_skill',
    'exit_condition',
    'next_phase',
    'next_trigger'
]

function parseArgs(rawArgv) {
    const { root, rest: argv } = takeRootArg(rawArgv)
    REPO_ROOT = root
    const paths = sdlcPaths(root)
    const args = {
        root,
        machine: paths.machine,
        // The resolver's skills dir; in this repo the framework's own skills/ is searched too.
        skills: paths.skills ?? join(root, 'skills')
    }
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i]
        if (flag === '--machine') args.machine = resolve(argv[(i += 1)])
        else if (flag === '--skills') args.skills = resolve(argv[(i += 1)])
        else throw new Error(`Unknown argument: ${flag}`)
    }
    return args
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
        // loadMachine merges config.yaml's domain_routing and extensions on layout 2.
        machine = loadMachine(args.root, { machineFile: args.machine })
    } catch (err) {
        console.error(`error: ${err.message}`)
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
    const plugin = pluginRoot()
    const pluginSkills = plugin ? listSkills(join(plugin, 'skills')) : []

    // A CONSUMING repo gets its skills from the installed plugin, not from a local
    // skills/ directory - a plugin cannot write one into someone's repo. So a skill is
    // present when it is local or in the plugin, and only when neither can be listed
    // are the referential checks skipped rather than failed. The structural checks
    // above still run, which is the part that grades the adopter's own state machine.
    const skillsArePluginSide = skills.length === 0 && pluginSkills.length === 0
    for (const skill of skills) {
        if (!registered.has(skill)) {
            errors.push(
                `skill '${skill}' exists under ${relName(args.skills)} but is not registered in the ` +
                    `state machine (not an owner_skill, not a domain skill) and is not listed in ` +
                    `exempt: — add it as a phase owner_skill/domain skill or to the exempt array`
            )
        }
    }

    const skillSet = new Set([...skills, ...pluginSkills])
    // With no plugin installed, as in an adopter's CI, a name the repo does not hold may be a
    // plugin skill or a typo, and nothing here can tell which. Those names are not graded.
    const unchecked = []
    const resolves = (name) => {
        if (skillSet.has(name)) return true
        if (plugin) return false
        unchecked.push(name)
        return true
    }
    if (!skillsArePluginSide) {
        for (const owner of ownerSkills) {
            if (!resolves(owner)) {
                errors.push(`owner_skill '${owner}' does not resolve to a skill under ${relName(args.skills)} or the plugin`)
            }
        }
        for (const ds of domainSkills) {
            if (!resolves(ds)) {
                errors.push(`domain skill '${ds}' does not resolve to a skill under ${relName(args.skills)} or the plugin`)
            }
        }
    }

    if (errors.length > 0) {
        console.error('state-machine validation FAILED:')
        for (const e of errors) console.error(`  - ${e}`)
        process.exit(1)
    }

    console.log('state-machine validation OK')
    if (skillsArePluginSide) console.log('  skills: plugin-side (no local skills/ dir) — referential checks skipped')
    if (unchecked.length) console.log(`  skills: no plugin installed, so these are not checked: ${unchecked.sort().join(', ')}`)
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
