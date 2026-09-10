#!/usr/bin/env node
/**
 * Validate the plugin manifest against what is actually on disk.
 *
 * The manifest is a new surface with an old hazard. Every dangling-reference defect
 * this repo has hit came from a name that resolved to nothing: a registry routing to
 * an `invariants-reviewer` no repo defined, a changelog citing a SPEC-007 that does
 * not exist, a `std:` anchor with no heading behind it. A manifest naming a hook file
 * that is not there fails the same way, and worse: the plugin installs, the hook never
 * fires, and nothing says so.
 *
 * Checks:
 *   1. plugin.json parses and carries name, version, description.
 *   2. version is semver — it is the ONLY thing that delivers an update to a user.
 *   3. every hooks.json command path exists after ${CLAUDE_PLUGIN_ROOT} substitution.
 *   4. every directory under skills/ holds a SKILL.md.
 *   5. every agents/*.md carries `name` and `tools` frontmatter.
 *
 * Usage:
 *   node scripts/sdlc/validate-plugin-manifest.mjs
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(p, 'utf8')

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Event names a hooks.json may declare, nested under its top-level `hooks` object. */
const HOOK_EVENTS = new Set([
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'Stop',
    'SubagentStop',
    'SessionStart',
    'SessionEnd',
    'Notification',
    'PreCompact',
    'PermissionRequest'
])

/**
 * Every `command` string in a hooks.json.
 *
 * Events nest under a top-level `hooks` object. An earlier version of this function
 * read `Object.values(manifest)` directly, which validated the WRONG shape (events at
 * the top level, which the loader rejects) and found zero commands in the RIGHT one —
 * so a hooks.json naming a missing file passed clean. Fail-open in both directions at
 * once, in the gate written to prevent exactly that.
 */
export function commandsOf(manifest) {
    const hooks = manifest?.hooks ?? {}
    const out = []
    for (const entries of Object.values(hooks)) {
        if (!Array.isArray(entries)) continue
        for (const entry of entries) {
            for (const h of entry?.hooks ?? []) {
                if (typeof h?.command === 'string') out.push(h.command)
            }
        }
    }
    return out
}

/**
 * The file a hook command invokes, relative to the plugin root.
 *
 * Commands look like `node "${CLAUDE_PLUGIN_ROOT}/hooks/x.mjs"`. Returns null for a
 * command that names no plugin-root path, which is legal — it is simply not ours
 * to check.
 */
export function pluginPathOf(command) {
    const m = String(command).match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"'\s]+)/)
    return m ? m[1] : null
}

/** Frontmatter field lookup, leading block only. */
function frontmatterField(text, field) {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) return null
    const f = m[1].match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
    return f ? f[1].trim() : null
}

export function validate(root = ROOT) {
    const problems = []

    const manifestPath = join(root, '.claude-plugin', 'plugin.json')
    if (!existsSync(manifestPath)) return [`missing ${manifestPath}`]

    let manifest
    try {
        manifest = JSON.parse(read(manifestPath))
    } catch (err) {
        return [`.claude-plugin/plugin.json does not parse: ${err.message}`]
    }

    for (const field of ['name', 'version', 'description']) {
        if (!manifest[field]) problems.push(`plugin.json is missing \`${field}\``)
    }
    // `author` as a bare string fails schema validation at INSTALL time, before any
    // other check in this file has a chance to matter.
    if (manifest.author !== undefined) {
        if (typeof manifest.author !== 'object' || manifest.author === null || Array.isArray(manifest.author)) {
            problems.push('plugin.json `author` must be an object ({ name, url }) — a string blocks installation')
        } else if (!manifest.author.name) {
            problems.push('plugin.json `author` object has no `name`')
        }
    }
    if (manifest.version && !SEMVER.test(manifest.version)) {
        problems.push(
            `plugin.json version "${manifest.version}" is not semver — a user receives an update ONLY when this string changes`
        )
    }

    const hooksPath = join(root, 'hooks', 'hooks.json')
    if (existsSync(hooksPath)) {
        let hooks
        try {
            hooks = JSON.parse(read(hooksPath))
        } catch (err) {
            problems.push(`hooks/hooks.json does not parse: ${err.message}`)
            hooks = null
        }
        // The loader requires every event under a top-level `hooks` object. Events at
        // the top level install and then fail to load, so not one hook fires.
        for (const key of Object.keys(hooks ?? {})) {
            if (HOOK_EVENTS.has(key)) {
                problems.push(
                    `hooks.json declares \`${key}\` at the top level; events must nest under a \`hooks\` object, ` +
                        `or the plugin loads with zero hooks`
                )
            }
        }
        for (const cmd of commandsOf(hooks)) {
            const rel = pluginPathOf(cmd)
            if (!rel) continue
            if (!existsSync(join(root, rel))) {
                problems.push(`hooks.json names \`${rel}\`, which does not exist — the hook would never fire`)
            }
        }
    }

    const skillsDir = join(root, 'skills')
    if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir)) {
            const p = join(skillsDir, entry)
            let isDir = false
            try {
                isDir = statSync(p).isDirectory()
            } catch {
                continue
            }
            if (!isDir) continue
            if (!existsSync(join(p, 'SKILL.md'))) problems.push(`skills/${entry}/ has no SKILL.md`)
        }
    }

    // Every `subagent_type:` a skill names must resolve to a shipped agent. This is a
    // new dangling-name surface and every dangling-name defect this repo has hit came
    // from exactly that shape - a registry routing to an agent no repo defined, a
    // changelog citing a spec that does not exist, a `std:` anchor with no heading.
    // A skill telling the model to dispatch `spec-reviewer` when agents/spec-reviewer.md
    // is absent fails the worst way: nothing dispatches and nothing says so.
    const skillsForDispatch = join(root, 'skills')
    if (existsSync(skillsForDispatch)) {
        const walk = (dir) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const p = join(dir, entry.name)
                if (entry.isDirectory()) walk(p)
                else if (entry.isFile() && entry.name.endsWith('.md')) {
                    for (const m of read(p).matchAll(/subagent_type:\s*`?([a-z0-9-]+)`?/gi)) {
                        const agent = m[1]
                        if (!existsSync(join(root, 'agents', `${agent}.md`))) {
                            problems.push(
                                `${relative(root, p)} names \`subagent_type: ${agent}\`, but agents/${agent}.md ` +
                                    `does not exist - nothing would dispatch`
                            )
                        }
                    }
                }
            }
        }
        walk(skillsForDispatch)
    }

    const agentsDir = join(root, 'agents')
    if (existsSync(agentsDir)) {
        for (const f of readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
            const text = read(join(agentsDir, f))
            if (!frontmatterField(text, 'name')) problems.push(`agents/${f} declares no \`name\``)
            if (!frontmatterField(text, 'tools')) problems.push(`agents/${f} declares no \`tools\``)
        }
    }

    return problems
}

function main() {
    const problems = validate()
    if (problems.length) {
        process.stderr.write(`plugin manifest is invalid:\n${problems.map((p) => `  ${p}\n`).join('')}`)
        process.exit(1)
    }
    process.stdout.write('plugin manifest OK\n')
}

/**
 * Direct-invocation guard. `import.meta.url` is realpath'd by Node and `argv[1]` is
 * not, so a raw comparison makes this a silent no-op through a symlinked path —
 * `cli-invocation.test.mjs` is the regression suite for exactly that.
 */
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
