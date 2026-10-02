#!/usr/bin/env node
/**
 * Grade a repo's `.sdlc/config.yaml` (ADR-008, schema in skills/sdlc-config-schema.md).
 *
 * The config decides which gates run: rule 8 of validate-guide.mjs reads `workspaces`, the
 * hooks read `domain_routing`, and the state-machine loader appends `extensions`. A config
 * that is wrong in shape changes those gates without any of them failing, so this grades
 * the shape before anything reads it.
 *
 * What it grades:
 *   1. `layout` is 2.
 *   2. Every `paths` value is a string naming a path inside the repo.
 *   3. Workspace names are unique, each workspace `path` exists, and each
 *      `agent_executable` is yes, caution or human.
 *   4. No `extensions.phases` id repeats a framework phase id.
 *   5. `worktrees.setup`, when set, is one command string (SPEC-011 > D-014).
 *
 * A repo with no config is on layout 1 (or not on the SDLC), so there is nothing to grade
 * and it exits 0 with a line saying so.
 *
 * Usage:
 *   node .sdlc/scripts/validate-sdlc-config.mjs [--root <dir>]
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseYaml } from './lib/mini-yaml.mjs'
import { CONFIG_REL, isInside, readConfig, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

const ELIGIBILITY = new Set(['yes', 'caution', 'human'])

function frameworkPhaseIds(machineFile) {
    if (!existsSync(machineFile)) return []
    const machine = parseYaml(readFileSync(machineFile, 'utf8')) ?? {}
    return (machine.phases ?? []).map((p) => p?.id).filter(Boolean)
}

/** Every problem with `config`, as one line each. `root` resolves workspace paths. */
export function gradeConfig(config, { root, phaseIds = [] }) {
    const problems = []
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
        return ['the config is not a mapping']
    }
    if (config.layout === undefined) problems.push('`layout` is missing; it must be 2')
    else if (config.layout !== 2) problems.push(`\`layout\` is ${JSON.stringify(config.layout)}; it must be 2`)

    const paths = config.paths ?? {}
    if (typeof paths !== 'object' || Array.isArray(paths)) problems.push('`paths` must be a mapping')
    else {
        for (const [key, value] of Object.entries(paths)) {
            if (typeof value !== 'string') problems.push(`paths.${key} must be a string`)
            else if (!isInside(root, value)) problems.push(`paths.${key} ${JSON.stringify(value)} must be a relative path inside the repo`)
        }
    }

    const workspaces = config.workspaces ?? []
    if (!Array.isArray(workspaces)) problems.push('`workspaces` must be a list')
    else {
        const seen = new Set()
        workspaces.forEach((ws, i) => {
            const label = ws?.name ? `workspace "${ws.name}"` : `workspaces[${i}]`
            if (!ws?.name) problems.push(`${label} has no \`name\``)
            else if (seen.has(ws.name)) problems.push(`workspace name "${ws.name}" appears more than once`)
            else seen.add(ws.name)
            if (!ws?.path) problems.push(`${label} has no \`path\``)
            else if (!existsSync(join(root, ws.path))) problems.push(`${label}: path "${ws.path}" does not exist`)
            if (!ELIGIBILITY.has(ws?.agent_executable)) {
                problems.push(
                    `${label}: agent_executable ${JSON.stringify(ws?.agent_executable)} is not yes, caution or human`
                )
            }
        })
    }

    const extPhases = config.extensions?.phases ?? []
    if (!Array.isArray(extPhases)) problems.push('`extensions.phases` must be a list')
    else {
        const framework = new Set(phaseIds)
        for (const phase of extPhases) {
            if (!phase?.id) problems.push('an `extensions.phases` entry has no `id`')
            else if (framework.has(phase.id)) {
                problems.push(`extensions.phases id "${phase.id}" repeats a framework phase id`)
            }
        }
    }
    const extExempt = config.extensions?.exempt ?? []
    if (!Array.isArray(extExempt)) problems.push('`extensions.exempt` must be a list')
    const worktrees = config.worktrees
    if (worktrees != null) {
        if (typeof worktrees !== 'object' || Array.isArray(worktrees)) problems.push('`worktrees` must be a mapping')
        else if (worktrees.setup != null && (typeof worktrees.setup !== 'string' || !worktrees.setup.trim())) {
            problems.push('`worktrees.setup` must be one non-empty command string')
        }
    }
    return problems
}

function main(argv) {
    const { root } = takeRootArg(argv)
    sdlcPaths(root) // prints the one-line notice on a layout-1 repo, as every gate does
    let config
    try {
        config = readConfig(root)
    } catch (err) {
        process.stderr.write(`${err.message}\n`)
        process.exit(1)
    }
    if (config === null) {
        process.stdout.write(`no ${CONFIG_REL} in ${root} (layout 1 or not initialized): nothing to grade\n`)
        return
    }
    const phaseIds = frameworkPhaseIds(sdlcPaths(root).machine)
    const problems = gradeConfig(config, { root, phaseIds })
    if (problems.length) {
        process.stderr.write(`${CONFIG_REL} is invalid:\n${problems.map((p) => `  ${p}\n`).join('')}`)
        process.exit(1)
    }
    process.stdout.write(`${CONFIG_REL} OK (${(config.workspaces ?? []).length} workspace(s))\n`)
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
