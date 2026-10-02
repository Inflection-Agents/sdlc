#!/usr/bin/env node
/**
 * Install the layout-2 payload into a repo (SPEC-009, ADR-008).
 *
 * `/sdlc-init` and `bootstrap.sh` both call this, and `migrate-layout.mjs` reuses its
 * merge helpers, so a repo gets the same files and the same root-file merges whichever
 * way it was set up. It never overwrites: a file that exists is kept, and the root files
 * an adopter already has (`.ignore`, `.gitignore`, `.gitattributes`, `AGENTS.md`,
 * `CLAUDE.md`) get only the lines or block they are missing. A second run writes nothing.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/install-payload.mjs [--root <dir>] [--contracts-in-skills]
 *
 * `--contracts-in-skills` is for bootstrap.sh, which copies the whole skills tree into
 * `.sdlc/skills/`: the contracts are already there, so they are not copied again and
 * `config.yaml` points the resolver at them instead.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { takeRootArg } from './lib/sdlc-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const DEFAULT_PAYLOAD = resolve(HERE, '..', '..', 'init-payload')

export const BLOCK_BEGIN = '<!-- BEGIN SDLC -->'
export const BLOCK_END = '<!-- END SDLC -->'
export const CLAUDE_IMPORT = '@AGENTS.md'

/** Root files merged line by line rather than copied. */
export const MERGED_ROOT_FILES = ['.ignore', '.gitignore', '.gitattributes']
const NOT_COPIED = new Set(['README.md', 'AGENTS.sdlc-block.md', ...MERGED_ROOT_FILES])

function walk(dir, base = dir, out = []) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory()) walk(p, base, out)
        else if (e.isFile()) out.push(relative(base, p))
    }
    return out
}

/**
 * Append each payload line the target lacks. A missing target gets the whole payload file,
 * comments included. Comment and blank lines are never appended to an existing file.
 * @returns {string[]} the lines added
 */
export function appendLines(targetFile, payloadText) {
    if (!existsSync(targetFile)) {
        mkdirSync(dirname(targetFile), { recursive: true })
        writeFileSync(targetFile, payloadText, 'utf8')
        return payloadText.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
    }
    const current = readFileSync(targetFile, 'utf8')
    const have = new Set(current.split(/\r?\n/))
    const add = payloadText.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !have.has(l))
    if (add.length) {
        const sep = current === '' || current.endsWith('\n') ? '' : '\n'
        writeFileSync(targetFile, `${current}${sep}${add.join('\n')}\n`, 'utf8')
    }
    return add
}

/** What to write before appended content so it starts after one blank line. */
function blankLineAfter(current) {
    if (current === '') return ''
    return current.endsWith('\n') ? '\n' : '\n\n'
}

/**
 * Put `body` between the SDLC markers at the end of AGENTS.md, keeping every existing byte.
 * A file that already has the markers is left alone.
 * @returns {boolean} whether the block was written
 */
export function insertAgentsBlock(root, body) {
    const file = join(root, 'AGENTS.md')
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current.includes(BLOCK_BEGIN)) return false
    const text = body.endsWith('\n') ? body : `${body}\n`
    writeFileSync(file, `${current}${blankLineAfter(current)}${BLOCK_BEGIN}\n${text}${BLOCK_END}\n`, 'utf8')
    return true
}

/** Add `@AGENTS.md` to CLAUDE.md unless a line already says exactly that. @returns {boolean} */
export function ensureClaudeImport(root) {
    const file = join(root, 'CLAUDE.md')
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current.split(/\r?\n/).includes(CLAUDE_IMPORT)) return false
    writeFileSync(file, `${current}${blankLineAfter(current)}${CLAUDE_IMPORT}\n`, 'utf8')
    return true
}

/**
 * Install `payload` into `root`.
 * @returns {{ created: string[], kept: string[], appended: Record<string, string[]>, block: boolean, claudeImport: boolean }}
 */
export function installPayload(root, { payload = DEFAULT_PAYLOAD, contractsInSkills = false } = {}) {
    const report = { created: [], kept: [], appended: {}, block: false, claudeImport: false }
    for (const dir of ['specs/adrs', 'specs/bugs', 'specs/tasks']) mkdirSync(join(root, dir), { recursive: true })

    for (const rel of walk(payload).sort()) {
        const posix = rel.split('\\').join('/')
        if (NOT_COPIED.has(posix)) continue
        if (contractsInSkills && posix.startsWith('.sdlc/contracts/')) continue
        const dest = posix.replace('.stub.', '.')
        const target = join(root, dest)
        if (existsSync(target)) {
            report.kept.push(dest)
            continue
        }
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(join(payload, rel), target)
        report.created.push(dest)
        if (contractsInSkills && dest === '.sdlc/config.yaml') {
            const cfg = readFileSync(target, 'utf8').replace(
                /^paths: \{\}$/m,
                'paths:\n  primitives: .sdlc/skills/review-primitives.md\n  envelope_schema: .sdlc/skills/review-envelope.schema.json'
            )
            writeFileSync(target, cfg, 'utf8')
        }
    }

    for (const name of MERGED_ROOT_FILES) {
        const src = join(payload, name)
        if (!existsSync(src)) continue
        const added = appendLines(join(root, name), readFileSync(src, 'utf8'))
        if (added.length) report.appended[name] = added
    }
    report.block = insertAgentsBlock(root, readFileSync(join(payload, 'AGENTS.sdlc-block.md'), 'utf8'))
    report.claudeImport = ensureClaudeImport(root)
    return report
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const report = installPayload(root, { contractsInSkills: rest.includes('--contracts-in-skills') })
    for (const f of report.created) process.stdout.write(`created  ${f}\n`)
    for (const f of report.kept) process.stdout.write(`kept     ${f}\n`)
    for (const [f, lines] of Object.entries(report.appended)) process.stdout.write(`appended ${f}: ${lines.join(', ')}\n`)
    if (report.block) process.stdout.write('appended AGENTS.md: the SDLC block\n')
    if (report.claudeImport) process.stdout.write(`appended CLAUDE.md: ${CLAUDE_IMPORT}\n`)
    const wrote = report.created.length + Object.keys(report.appended).length + Number(report.block) + Number(report.claudeImport)
    process.stdout.write(wrote ? `installed into ${root}\n` : `nothing to install: ${root} already has every payload file\n`)
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
