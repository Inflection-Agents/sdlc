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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p) => readFileSync(p, 'utf8')

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Every `command` string in a hooks.json, whatever event nests it. */
export function commandsOf(hooks) {
    const out = []
    for (const entries of Object.values(hooks ?? {})) {
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
