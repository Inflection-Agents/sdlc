#!/usr/bin/env node
/**
 * Plant a violation per gate and check the gate still catches it (SPEC-009 Design > Gate
 * probes). A gate that cannot find its input usually exits 0, so matching exit codes
 * before and after a migration prove nothing. Each probe works in a throwaway
 * `git worktree` of the commit under test, plants one violation, and records whether the
 * gate caught it. Validator probes run the copy the repo's own workflow invokes. Hook
 * probes run every wired hook: the plugin's and each one in `.claude/settings.json`.
 *
 * | Probe | Plants | Caught when |
 * | --- | --- | --- |
 * | P1 | a guide step with no `Workspace:` | validate-guide exits 1 (rule 8) |
 * | P2 | a prompt naming a `domain_routing` workspace | each UserPromptSubmit hook prints its chain |
 * | P3 | an edit to a path a registry row matches | each edit-write hook prints the row id |
 * | P4 | a word in an archived spec | `rg -l -g '*.md'` does not list it |
 * | P5 | an unregistered skill directory | validate-state-machine exits 1 |
 * | P6 | a word in `.sdlc/scripts/` (layout 2) | plain `rg -l` lists it |
 * | P7 | nothing: workflow triggers | no moved file loses a workflow |
 * | P8 | a superseded-ADR citation in an always-loaded `.sdlc/` file | check-stale-citations exits 1 |
 *
 * Usage (plugin-only):
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/probe-gates.mjs --root . --rev <commit> [--json] [--repo-code]
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/probe-gates.mjs --root . --before <commit> --after <commit> [--repo-code]
 *
 * The plugin's hooks are always probed. The repo's own code (the hook commands in its
 * .claude/settings.json and the validators its workflows run) runs only with --repo-code;
 * each item is printed for every probed revision, and probes held back are listed.
 *
 * With --before/--after it exits 1 when a probe that caught before no longer catches after
 * (P1 to P5), or when P6 to P8 fail on the after commit; otherwise 0.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, matchesGlob, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { definesWorkspaces } from './validate-guide.mjs'
import { loadConstraints } from './reviewer-routing.mjs'
import { movesFromHistory } from './scan-legacy-paths.mjs'
import { assertWriteInside, isInside, loadMachine, sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '..', '..')
const PROBE_SPEC = 'SPEC-990'

// Hooks off for every git call: a checkout in the probe worktree would otherwise run the
// probed revision's post-checkout hook (husky, lefthook) without --repo-code.
const git = (cwd, args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 26 })

// A probe plants files in a worktree of a repo it does not trust: every write must stay inside
// it, through any symlink the repo tracks, or the worktree's removal would leave the file behind.
function write(root, rel, body) {
    if (!isInside(root, rel)) throw new Error(`refusing to write ${rel}: it is outside the worktree`)
    assertWriteInside(root, join(root, rel))
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body, 'utf8')
}

/** The path of `script` that the repo's own workflows run, else the resolved scripts dir's copy. */
export function workflowCopy(root, script) {
    const dir = join(root, '.github', 'workflows')
    if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
            const text = readFileSync(join(dir, f), 'utf8')
            const m = text.match(new RegExp(`node\\s+(?:--test\\s+)?([\\w./-]*/${script.replace('.', '\\.')})`))
            if (m && isInside(root, m[1]) && existsSync(join(root, m[1]))) return join(root, m[1])
        }
    }
    const fallback = join(sdlcPaths(root, { quiet: true }).scripts, script)
    return existsSync(fallback) ? fallback : null
}

function runNode(cwd, file, args = [], env = {}) {
    // CLAUDE_PROJECT_DIR wins in every resolver, so it must name the worktree under probe.
    const res = spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...env } })
    return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

/** Hook commands wired for `event`: the plugin's (hooks/hooks.json) and the repo's (.claude/settings.json). */
export function wiredHooks(root, event, matcher = null) {
    const out = []
    for (const [source, file] of [
        ['plugin', join(PLUGIN, 'hooks', 'hooks.json')],
        ['local', join(root, '.claude', 'settings.json')],
    ]) {
        if (!existsSync(file)) continue
        let json
        try {
            json = JSON.parse(readFileSync(file, 'utf8'))
        } catch {
            continue
        }
        for (const group of json.hooks?.[event] ?? []) {
            if (matcher && group.matcher && !new RegExp(group.matcher).test(matcher)) continue
            for (const h of group.hooks ?? []) if (h.type === 'command' && h.command) out.push({ source, command: h.command })
        }
    }
    return out
}

// The repo's own code, its .claude/settings.json hook commands and the validators its
// workflows run, executes with the developer's environment. It runs only when the caller
// passes --repo-code, and each item is printed for the probed revision first, so what the
// owner approves is what runs.
let runRepoCode = false
let revLabel = ''
const noted = new Set()

function note(kind, what) {
    // JSON-quoted, so a control character in a command cannot disguise what runs.
    const line = `${revLabel}: ${runRepoCode ? 'running' : 'skipping (pass --repo-code to run)'} the repo's ${kind}: ${JSON.stringify(what)}`
    if (!noted.has(line)) process.stderr.write(`${line}\n`)
    noted.add(line)
}

/** The hooks a probe may run, and whether any of the repo's were held back. */
function probedHooks(root, event, matcher) {
    const all = wiredHooks(root, event, matcher)
    for (const h of all) if (h.source === 'local') note('hook', h.command)
    const hooks = all.filter((h) => h.source === 'plugin' || runRepoCode)
    return { hooks, skipped: all.length - hooks.length }
}

/** The repo's validator a probe runs, or why it is not run. */
function repoValidator(root, script) {
    const file = workflowCopy(root, script)
    if (!file) return { skip: `no ${script} copy` }
    note('validator', relTo(root, file))
    return runRepoCode ? { file } : { skip: `${relTo(root, file)} not run (pass --repo-code)` }
}

function runHook(root, command, payload, env = {}) {
    const res = spawnSync('sh', ['-c', command], {
        cwd: root,
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_ROOT: PLUGIN, ...env },
    })
    return `${res.stdout ?? ''}`
}

/**
 * Run ripgrep over the repo. stdin is closed and the path is explicit: with no path and a
 * readable stdin, rg searches stdin, and every probe built on it passes vacuously.
 */
function rg(root, args) {
    const res = spawnSync('rg', [...args, '.'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    if (res.error) return null
    return res.stdout ?? ''
}

const token = () => `sdlcprobe${process.pid}${Math.random().toString(36).slice(2, 8)}`

/** `abs` relative to `root`, for a path known to sit inside it. */
function relTo(root, abs) {
    return abs.slice(root.length + 1)
}

/** One `source:caught` or `source:missed` word per hook result. */
function hookVerdicts(results) {
    return results.map((r) => `${r.source}:${r.caught ? 'caught' : 'missed'}`).join(' ')
}

// ─── Probes ─────────────────────────────────────────────────────────────────

function p1(root) {
    if (!definesWorkspaces(root)) return { ran: false, detail: 'no workspaces defined' }
    const { file: validator, skip } = repoValidator(root, 'validate-guide.mjs')
    if (!validator) return { ran: false, detail: skip }
    const specs = sdlcPaths(root, { quiet: true }).specs
    const rel = (p) => relTo(root, p)
    write(root, `${rel(specs)}/${PROBE_SPEC}-probe.md`, `---\nid: ${PROBE_SPEC}\nstatus: active\nversion: 1\n---\n\n## Acceptance criteria\n\n- [ ] AC-001: probe\n`)
    write(root, `${rel(specs)}/tasks/${PROBE_SPEC}/GUIDE.md`, `---\nspec: ${PROBE_SPEC}\nspec_version: 1\n---\n\n## Steps\n\n### S1: probe\n- Covers: AC-001\n- Changes: \`x\`\n- Verify: \`true\`\n\n## Owner decisions\n\nNone at sign-off.\n`)
    write(root, `${rel(specs)}/tasks/${PROBE_SPEC}/_index.yaml`, `spec: ${PROBE_SPEC}\nplan_review:\n  status: approve-ready\n  approved: false\n  reviewed: 2026-10-02\nsteps:\n  - id: S1\n    status: pending\ndecisions: []\n`)
    const r = runNode(root, validator, [join(specs, 'tasks', PROBE_SPEC, 'GUIDE.md')])
    return { ran: true, caught: r.status === 1 && /rule 8/.test(r.out), detail: rel(validator) }
}

function p2(root) {
    let routing
    try {
        routing = loadMachine(root).domain_routing ?? {}
    } catch (err) {
        return { ran: false, detail: err.message }
    }
    const [ws, chain] = Object.entries(routing).find(([, c]) => Array.isArray(c) && c.length) ?? []
    if (!ws) return { ran: false, detail: 'domain_routing is empty' }
    const { hooks, skipped } = probedHooks(root, 'UserPromptSubmit')
    if (!hooks.length) return { ran: false, detail: skipped ? "the repo's hooks not run (pass --repo-code)" : 'no UserPromptSubmit hook wired' }
    const results = hooks.map((h) => ({
        ...h,
        caught: runHook(root, h.command, { prompt: `please change ${ws}/src/probe.ts`, session_id: 'sdlc-probe', cwd: root }).includes(chain[0]),
    }))
    return { ran: true, caught: results.every((r) => r.caught), detail: `${hookVerdicts(results)}${skipped ? ' local:skipped' : ''}` }
}

function p3(root) {
    let rows
    try {
        rows = loadConstraints(sdlcPaths(root, { quiet: true }).constraints)
            .map((c) => ({ ...c, touches: c.when?.touches ?? [] }))
            .filter((c) => c.touches.length && (c.scope ?? 'task') === 'task')
    } catch {
        return { ran: false, detail: 'no readable registry' }
    }
    if (!rows.length) return { ran: false, detail: 'the registry has no rows with touches' }
    const tracked = git(root, ['ls-files']).split('\n').filter(Boolean)
    let pick = null
    for (const row of rows) {
        const file = tracked.find((f) => row.touches.some((g) => matchesGlob(f, g)))
        if (file) {
            pick = { row, file }
            break
        }
    }
    if (!pick) {
        const planted = rows
            .map((row) => ({ row, file: row.touches[0].replace(/\*\*/g, 'probe').replace(/\*/g, 'probe') }))
            .find((c) => isInside(root, c.file))
        if (!planted) return { ran: false, detail: 'no touches glob names a path inside the repo' }
        pick = planted
        write(root, pick.file, '// probe\n')
    }
    const { hooks, skipped } = probedHooks(root, 'PreToolUse', 'Edit')
    if (!hooks.length) return { ran: false, detail: skipped ? "the repo's hooks not run (pass --repo-code)" : 'no edit hook wired' }
    const payload = { tool_name: 'Edit', tool_input: { file_path: join(root, pick.file) }, session_id: 'sdlc-probe', cwd: root }
    const results = hooks.map((h) => ({ ...h, caught: runHook(root, h.command, payload).includes(pick.row.id) }))
    return { ran: true, caught: results.every((r) => r.caught), detail: `${pick.row.id} on ${pick.file}: ${hookVerdicts(results)}${skipped ? ' local:skipped' : ''}` }
}

function p4(root) {
    const specs = sdlcPaths(root, { quiet: true }).specs
    if (!existsSync(join(specs, 'archive'))) return { ran: false, detail: 'no specs/archive/' }
    const word = token()
    const rel = `${relTo(root, specs)}/archive/specs/${word}.md`
    write(root, rel, `${word}\n`)
    const out = rg(root, ['-l', '-g', '*.md', word])
    if (out === null) return { ran: false, detail: 'rg is not installed' }
    return { ran: true, caught: !out.includes(word), detail: rel }
}

function p5(root) {
    const { file: validator, skip } = repoValidator(root, 'validate-state-machine.mjs')
    if (!validator) return { ran: false, detail: skip }
    const paths = sdlcPaths(root, { quiet: true })
    const skills = paths.skills ?? join(root, 'skills')
    const name = 'sdlc-probe-unregistered'
    write(root, `${relTo(root, skills)}/${name}/SKILL.md`, `---\nname: ${name}\n---\n`)
    const r = runNode(root, validator, [])
    return { ran: true, caught: r.status === 1 && r.out.includes(name), detail: relTo(root, validator) }
}

function p6(root) {
    if (sdlcPaths(root, { quiet: true }).layout !== 2) return { ran: false, detail: 'layout 1' }
    const word = token()
    write(root, `.sdlc/scripts/${word}.mjs`, `// ${word}\n`)
    const out = rg(root, ['-l', word])
    if (out === null) return { ran: false, detail: 'rg is not installed' }
    return { ran: true, caught: out.includes(word), detail: 'plain rg finds .sdlc/' }
}

/** The `paths` and `paths-ignore` filters per event in a workflow's `on:` block. */
export function workflowFilters(text) {
    const lines = text.split('\n')
    const on = lines.findIndex((l) => /^(?:on|'on'|"on")\s*:/.test(l))
    const events = {}
    if (on === -1) return events
    let event = null
    let key = null
    for (let i = on + 1; i < lines.length && (/^\s/.test(lines[i]) || lines[i] === ''); i += 1) {
        const l = lines[i]
        let m
        if ((m = l.match(/^ {2}(\w[\w_-]*)\s*:/))) {
            event = m[1]
            events[event] ??= { paths: null, ignore: null }
            key = null
            continue
        }
        if (event && (m = l.match(/^\s{4,}(paths|paths-ignore)\s*:\s*(\[(.*)\])?\s*$/))) {
            key = m[1] === 'paths' ? 'paths' : 'ignore'
            events[event][key] = m[3] !== undefined ? m[3].split(',').map((g) => g.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []
            if (m[3] !== undefined) key = null
            continue
        }
        if (event && key && (m = l.match(/^\s+-\s*(.+?)\s*$/))) {
            events[event][key].push(m[1].replace(/^['"]|['"]$/g, ''))
            continue
        }
        if (/^\s{4,}\S/.test(l)) key = null
    }
    return events
}

function selects(filters, file) {
    return Object.values(filters).some(({ paths, ignore }) => {
        if (paths) return paths.some((g) => !g.startsWith('!') && matchesGlob(file, g))
        if (ignore) return !ignore.some((g) => matchesGlob(file, g))
        return true
    })
}

function workflowsAt(root, rev) {
    const files = git(root, ['ls-tree', '--name-only', rev, '.github/workflows/']).split('\n').filter((f) => /\.ya?ml$/.test(f))
    return files.map((f) => ({ name: f.split('/').pop(), filters: workflowFilters(git(root, ['show', `${rev}:${f}`])) }))
}

function p7(root) {
    const moves = movesFromHistory(root)
    if (!moves.size) return { ran: false, detail: 'no migration commit in history' }
    const commit = git(root, ['log', '-1', '--format=%H', '--fixed-strings', '--grep=sdlc: migrate to layout 2']).trim()
    const before = workflowsAt(root, `${commit}^`)
    const after = workflowsAt(root, 'HEAD')
    const lost = []
    const gained = []
    for (const [from, to] of moves) {
        const was = new Set(before.filter((w) => selects(w.filters, from)).map((w) => w.name))
        const now = new Set(after.filter((w) => selects(w.filters, to)).map((w) => w.name))
        for (const w of was) if (!now.has(w)) lost.push(`${to} no longer triggers ${w}`)
        for (const w of now) if (!was.has(w)) gained.push(`${to} now also triggers ${w}`)
    }
    return { ran: true, caught: lost.length === 0, detail: [...lost, ...gained.slice(0, 5)].join('; ') || 'triggers unchanged' }
}

function p8(root) {
    const paths = sdlcPaths(root, { quiet: true })
    if (paths.layout !== 2) return { ran: false, detail: 'layout 1' }
    const adrs = join(paths.specs, 'adrs')
    const superseded = existsSync(adrs)
        ? readdirSync(adrs)
              .map((f) => readFileSync(join(adrs, f), 'utf8'))
              .map((t) => [t.match(/^id:\s*(ADR-\d+)/m)?.[1], /^status:\s*superseded/m.test(t) && /^superseded_by:\s*ADR-\d+/m.test(t)])
              .find(([id, s]) => id && s)?.[0]
        : null
    if (!superseded) return { ran: false, detail: 'no superseded ADR' }
    const { file: checker, skip } = repoValidator(root, 'check-stale-citations.mjs')
    if (!checker) return { ran: false, detail: skip }
    write(root, '.sdlc/agents/sdlc-probe.md', `Per ${superseded}, do the thing.\n`)
    const r = runNode(root, checker, [])
    return { ran: true, caught: r.status === 1, detail: relTo(root, checker) }
}

export const PROBES = { P1: p1, P2: p2, P3: p3, P4: p4, P5: p5, P6: p6, P7: p7, P8: p8 }

/** Run every probe against `rev` in a throwaway worktree of `root`; the worktree and its branch are always removed. */
export function probeRev(root, rev, { repoCode = false } = {}) {
    runRepoCode = repoCode
    revLabel = `${rev} (${git(root, ['rev-parse', rev]).trim()})`
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sdlc-probe-')))
    const branch = `claude/${PROBE_SPEC}-probe-${process.pid}-${Date.now()}`
    rmSync(dir, { recursive: true, force: true })
    git(root, ['worktree', 'add', '-q', '-b', branch, dir, rev])
    // A repo's own hooks and validators can import its packages. Without them in the
    // worktree, a gate fails open on the import and its probe records a miss the real
    // repo would not have.
    if (existsSync(join(root, 'node_modules'))) symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'))
    try {
        const results = []
        for (const [id, probe] of Object.entries(PROBES)) {
            try {
                results.push({ id, ...probe(dir) })
            } catch (err) {
                // A plant the repo's layout would send outside the worktree is not run. Any other
                // crash has not shown the gate works, so it counts as missed.
                if (/^refusing to write/.test(err.message)) results.push({ id, ran: false, detail: err.message })
                else results.push({ id, ran: true, caught: false, detail: `probe error: ${err.message}` })
            }
            git(dir, ['checkout', '-q', '--', '.'])
            git(dir, ['clean', '-fdq', '-e', 'node_modules'])
        }
        return results
    } finally {
        git(root, ['worktree', 'remove', '--force', dir])
        git(root, ['branch', '-D', branch])
    }
}

/** P1 to P5 must not regress from `before` to `after`; P6 to P8 must pass wherever they run on `after`. */
export function compare(before, after) {
    const problems = []
    const at = (list, id) => list.find((r) => r.id === id) ?? { ran: false }
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5']) {
        const b = at(before, id)
        const a = at(after, id)
        if (b.ran && b.caught && !(a.ran && a.caught)) problems.push(`${id} caught before and not after (${a.detail ?? 'did not run'})`)
    }
    for (const id of ['P6', 'P7', 'P8']) {
        const a = at(after, id)
        if (a.ran && !a.caught) problems.push(`${id} failed after: ${a.detail}`)
    }
    return problems
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const arg = (name) => rest[rest.indexOf(name) + 1]
    const repoCode = rest.includes('--repo-code')
    // What the run could not show, so a green comparison is not read as full coverage.
    const unprobed = (results) =>
        results.filter((r) => (!r.ran && /--repo-code/.test(r.detail ?? '')) || /local:skipped/.test(r.detail ?? '')).map((r) => r.id)
    const sayUnprobed = (ids) => {
        if (ids.length) process.stderr.write(`not probed without --repo-code: ${[...new Set(ids)].join(', ')}\n`)
    }
    if (rest.includes('--before')) {
        const before = probeRev(root, arg('--before'), { repoCode })
        const after = probeRev(root, arg('--after') ?? 'HEAD', { repoCode })
        const problems = compare(before, after)
        const skipped = [...unprobed(before), ...unprobed(after)]
        process.stdout.write(`${JSON.stringify({ before, after, problems, repo_code: repoCode, unprobed: [...new Set(skipped)] }, null, 2)}\n`)
        sayUnprobed(skipped)
        if (problems.length) {
            process.stderr.write(`gate probes regressed:\n  ${problems.join('\n  ')}\n`)
            process.exit(1)
        }
        return
    }
    const results = probeRev(root, arg('--rev') ?? 'HEAD', { repoCode })
    if (rest.includes('--json')) process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
    else for (const r of results) process.stdout.write(`${r.id}  ${r.ran ? (r.caught ? 'caught' : 'MISSED') : 'not run'}  ${r.detail ?? ''}\n`)
    sayUnprobed(unprobed(results))
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
