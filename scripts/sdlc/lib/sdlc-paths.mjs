/**
 * Where the SDLC files live in a repo, on either layout (ADR-008).
 *
 * Every validator, hook and the script runner asks this module for a path, so a layout
 * change is one edit here and not one in every consumer. Layout 2 keeps the framework's
 * files under `.sdlc/` and is identified by `.sdlc/config.yaml`. Layout 1 is the older
 * `.ai/` + `scripts/sdlc/` shape. It still resolves, through `legacy-map.mjs`, and each
 * process that takes that path prints one deprecation line so an unmigrated repo is not
 * silent about it.
 */
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseYaml } from './mini-yaml.mjs'
import { CONTRACT_FILES, FRAMEWORK_TEMPLATES, LAYOUT1, LAYOUT1_MARKERS } from './legacy-map.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

export const CONFIG_REL = '.sdlc/config.yaml'
export const DEPRECATION = 'sdlc: layout 1 detected; run /sdlc-sync to migrate'

/** Layout-2 defaults, relative to the repo root. `processDoc` defaults to the plugin's copy. */
export const LAYOUT2_DEFAULTS = Object.freeze({
    config: CONFIG_REL,
    constraints: '.sdlc/review-constraints.yaml',
    machine: '.sdlc/state-machine.yaml',
    scripts: '.sdlc/scripts',
    templates: '.sdlc/templates',
    primitives: '.sdlc/contracts/review-primitives.md',
    envelopeSchema: '.sdlc/contracts/review-envelope.schema.json',
    skills: '.sdlc/skills',
    specs: 'specs',
    project: 'AGENTS.md',
})

/** `config.yaml` `paths` keys, by resolver key. `constraints`, `machine` and `config` are fixed. */
const OVERRIDES = Object.freeze({
    scripts: 'scripts',
    templates: 'templates',
    primitives: 'primitives',
    envelopeSchema: 'envelope_schema',
    skills: 'skills',
    specs: 'specs',
    project: 'project',
    processDoc: 'process_doc',
})

let warned = false

/**
 * The plugin's own root: `CLAUDE_PLUGIN_ROOT` when the host sets it, otherwise this file's
 * repo when that repo is the plugin source. An adopter's copy under `.sdlc/scripts/lib/`
 * has no plugin around it, so it returns null there.
 */
export function pluginRoot() {
    if (process.env.CLAUDE_PLUGIN_ROOT) return resolve(process.env.CLAUDE_PLUGIN_ROOT)
    const candidate = resolve(HERE, '..', '..', '..')
    return existsSync(join(candidate, '.claude-plugin', 'plugin.json')) ? candidate : null
}

export function isLayout1Root(dir) {
    return existsSync(join(dir, 'specs')) && LAYOUT1_MARKERS.some((m) => existsSync(join(dir, m)))
}

export function isSdlcRoot(dir) {
    return existsSync(join(dir, CONFIG_REL)) || isLayout1Root(dir)
}

/**
 * The repo root for `start`. `CLAUDE_PROJECT_DIR` wins when set. Otherwise walk up to the
 * first directory with `.sdlc/config.yaml`, or with `specs/` next to `.ai/` or
 * `scripts/sdlc/` (the layout-1 marker). With neither, `start` itself.
 */
export function resolveRoot(start = process.cwd()) {
    if (process.env.CLAUDE_PROJECT_DIR) return resolve(process.env.CLAUDE_PROJECT_DIR)
    let dir = resolve(start)
    for (;;) {
        if (isSdlcRoot(dir)) return dir
        const up = dirname(dir)
        if (up === dir) return resolve(start)
        dir = up
    }
}

/** The parsed `.sdlc/config.yaml`, or null when the repo has none. A file that does not parse throws. */
export function readConfig(root) {
    const file = join(root, CONFIG_REL)
    if (!existsSync(file)) return null
    try {
        return parseYaml(readFileSync(file, 'utf8')) ?? {}
    } catch (err) {
        throw new Error(`${CONFIG_REL} does not parse: ${err.message}`)
    }
}

/** 2 when `.sdlc/config.yaml` exists (or its own `layout:` value), 1 for the layout-1 marker, 0 for neither. */
export function detectLayout(root, config = readConfig(root)) {
    if (config) return config.layout ?? 2
    return isLayout1Root(root) ? 1 : 0
}

function holdsSkill(dir) {
    if (!existsSync(dir)) return false
    return readdirSync(dir, { withFileTypes: true }).some(
        (e) => (e.isDirectory() || e.isSymbolicLink()) && existsSync(join(dir, e.name, 'SKILL.md'))
    )
}

function holdsTemplate(dir) {
    return existsSync(dir) && FRAMEWORK_TEMPLATES.some((name) => existsSync(join(dir, name)))
}

function pluginTemplates(plugin) {
    if (!plugin) return null
    const payload = join(plugin, 'init-payload', '.sdlc', 'templates')
    return existsSync(payload) ? payload : join(plugin, 'templates')
}

function pluginProcessDoc(plugin) {
    return plugin ? join(plugin, 'docs', 'sdlc.md') : null
}

function layout1Paths(root, plugin) {
    const at = (rel) => join(root, rel)
    const contract = (file) => {
        const local = LAYOUT1.contractDirs.map((d) => at(join(d, file))).find((p) => existsSync(p))
        return local ?? (plugin ? join(plugin, 'skills', file) : null)
    }
    const skills = LAYOUT1.skillsCandidates.map(at).find(holdsSkill) ?? null
    const templates = LAYOUT1.templatesCandidates.map(at).find(holdsTemplate) ?? pluginTemplates(plugin)
    const processDoc = existsSync(at(LAYOUT1.processDoc)) ? at(LAYOUT1.processDoc) : pluginProcessDoc(plugin)
    return {
        layout: 1,
        root,
        config: at(CONFIG_REL),
        constraints: at(LAYOUT1.constraints),
        machine: at(LAYOUT1.machine),
        scripts: at(LAYOUT1.scripts),
        templates,
        primitives: contract(CONTRACT_FILES.primitives),
        envelopeSchema: contract(CONTRACT_FILES.envelopeSchema),
        skills,
        specs: at('specs'),
        project: at(LAYOUT1.project),
        processDoc,
    }
}

/**
 * Absolute paths for every resolver key, plus `layout` and `root`.
 *
 * Order per key: the `config.yaml` override, then the layout-2 default when the config
 * exists, then the layout-1 path when it does not. Pass `{ quiet: true }` to suppress the
 * deprecation line, as the hooks do: they nudge once per session instead.
 */
export function sdlcPaths(root, { quiet = false } = {}) {
    const config = readConfig(root)
    const layout = detectLayout(root, config)
    const plugin = pluginRoot()
    if (layout === 1) {
        if (!quiet && !warned) {
            warned = true
            process.stderr.write(`${DEPRECATION}\n`)
        }
        return layout1Paths(root, plugin)
    }
    const overrides = config?.paths ?? {}
    // An override that is absolute or climbs out of the repo is ignored, so no reader or
    // writer is pointed outside the repo by its config. validate-sdlc-config.mjs reports it.
    const safe = (v) => (typeof v === 'string' && v && isInside(root, v) ? v : undefined)
    const paths = { layout, root }
    for (const [key, rel] of Object.entries(LAYOUT2_DEFAULTS)) {
        const override = OVERRIDES[key] ? safe(overrides[OVERRIDES[key]]) : undefined
        paths[key] = resolve(root, override || rel)
    }
    const doc = safe(overrides.process_doc)
    paths.processDoc = doc ? resolve(root, doc) : pluginProcessDoc(plugin)
    return paths
}

/** Whether `rel` is a relative path that stays inside `root` once resolved. */
export function isInside(root, rel) {
    if (isAbsolute(rel)) return false
    const r = relative(resolve(root), resolve(root, rel))
    return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/**
 * Throw unless writing `abs` stays inside `root`: the target, when it exists, and its
 * nearest existing ancestor must both resolve, through any symlink, under the repo. A
 * repo can hold a symlink to a shared file elsewhere, and a write through it would change
 * that file outside the commit the owner reviews.
 */
export function assertWriteInside(root, abs) {
    const top = realpathSync(root)
    const under = (p) => {
        const r = relative(top, p)
        return r === '' || (!r.startsWith('..') && !isAbsolute(r))
    }
    let probe = resolve(abs)
    let target = true
    for (;;) {
        let st = null
        try {
            st = lstatSync(probe)
        } catch {
            // not there yet: check its parent
        }
        if (st) {
            if (!under(realpathSync(probe))) {
                throw new Error(`refusing to write ${abs}: ${target ? 'it' : probe} resolves outside ${root}`)
            }
            return
        }
        const up = dirname(probe)
        if (up === probe) throw new Error(`refusing to write ${abs}: no existing ancestor`)
        probe = up
        target = false
    }
}

/** Read a `--root <dir>` argument out of argv, returning the root and the remaining arguments. */
export function takeRootArg(argv, start = process.cwd()) {
    const rest = []
    let root = null
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--root') {
            if (!argv[i + 1]) throw new Error('--root needs a directory')
            root = resolve(argv[i + 1])
            i += 1
        } else if (argv[i].startsWith('--root=')) {
            root = resolve(argv[i].slice('--root='.length))
        } else rest.push(argv[i])
    }
    return { root: root ?? resolveRoot(start), rest }
}

function asList(v) {
    if (Array.isArray(v)) return v
    if (v == null) return []
    return [v]
}

function normalizePhase(p) {
    return { ...p, entry_triggers: asList(p?.entry_triggers), preconditions: asList(p?.preconditions) }
}

/**
 * The state machine as every reader should see it (ADR-008 decision 3).
 *
 * On layout 2 the machine file is framework-owned and refreshed by every sync, so the
 * adopter's own data lives in `config.yaml`: `domain_routing`, plus `extensions.phases`
 * (appended after the framework phases) and `extensions.exempt` (merged into `exempt`).
 * A layout-2 machine that still carries `domain_routing:` is an error, because two
 * sources for the same routing is how one of them goes stale unnoticed. On layout 1 the
 * machine file is returned as it is. A missing or unparseable machine throws.
 *
 * `machineFile` overrides the resolved path, for validators run with `--machine`.
 */
export function loadMachine(root, { machineFile } = {}) {
    const paths = sdlcPaths(root, { quiet: true })
    const file = machineFile ?? paths.machine
    if (!existsSync(file)) throw new Error(`state machine not found at ${file}`)
    let raw
    try {
        raw = parseYaml(readFileSync(file, 'utf8')) ?? {}
    } catch (err) {
        throw new Error(`state machine ${file} does not parse: ${err.message}`)
    }
    const machine = {
        ...raw,
        phases: asList(raw.phases).map(normalizePhase),
        exempt: asList(raw.exempt),
        retired_phases: asList(raw.retired_phases),
        domain_routing: raw.domain_routing ?? {},
    }
    if (paths.layout !== 2) return machine

    if (Object.hasOwn(raw, 'domain_routing')) {
        throw new Error(
            `${file} carries domain_routing:, which lives in .sdlc/config.yaml on layout 2 (ADR-008); move it there`
        )
    }
    const config = readConfig(root) ?? {}
    const ext = config.extensions ?? {}
    machine.phases.push(...asList(ext.phases).map(normalizePhase))
    machine.exempt = [...new Set([...machine.exempt, ...asList(ext.exempt)])]
    machine.domain_routing = config.domain_routing ?? {}
    return machine
}
