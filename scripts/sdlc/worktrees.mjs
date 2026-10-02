#!/usr/bin/env node
/**
 * Report, and optionally remove, stray git worktrees (SPEC-011 > Design > Detection, ADR-009).
 *
 * Every worktree belongs under the main checkout's `.claude/worktrees/` (`docs/worktrees.md`).
 * A linked worktree is a stray for exactly one reason, `agent` first and then in this order:
 *   agent        an Agent-tool worktree (`agent-<id>`) that still exists
 *   outside      not under `.claude/worktrees/`
 *   branch-gone  its branch has an upstream configured, and that upstream no longer exists
 *   detached     it has no branch
 *   spec-closed  it is `spec-NNN`, and that spec is neither draft nor active, or does not resolve
 *
 * List mode reads only `git worktree list` and local refs, so a hook can run it cheaply.
 * `--prune` removes only clean `branch-gone` and `spec-closed` strays under `.claude/worktrees/`:
 * removing a worktree also deletes its gitignored files, and the other three kinds may still be
 * in use (SPEC-011 > D-015). It never passes `--force` and never deletes a branch.
 *
 * Usage:
 *   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs worktrees [--json] [--fetch] [--prune] [--own SPEC-NNN|spec-NNN]
 *
 * Exit codes: 0 listed or pruned (strays are advice, not a failure); 2 not a git repo or bad usage.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORKTREES_REL, takeRootArg } from './lib/sdlc-paths.mjs'
import { findById } from './resolve.mjs'
import { parseFrontmatter } from './validate-guide.mjs'

export const REASONS = ['agent', 'outside', 'branch-gone', 'detached', 'spec-closed']
/** The kinds whose work is over, and so the only ones `--prune` may remove. */
export const REMOVABLE = new Set(['branch-gone', 'spec-closed'])
const LIVE_SPEC = new Set(['draft', 'active'])

function git(cwd, args) {
    const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
    if (res.error) throw new Error(`git could not run: ${res.error.message}`)
    return res
}

function real(p) {
    try {
        return realpathSync(p)
    } catch {
        return resolve(p)
    }
}

/** `git worktree list --porcelain`, parsed. The first entry is the main checkout. */
export function listWorktrees(cwd) {
    const res = git(cwd, ['worktree', 'list', '--porcelain'])
    if (res.status !== 0) throw new Error(`not a git repository: ${cwd}`)
    const out = []
    for (const block of res.stdout.split('\n\n')) {
        const lines = block.split('\n').filter(Boolean)
        if (!lines.length) continue
        const e = { path: '', branch: null, detached: false, prunable: false }
        for (const l of lines) {
            if (l.startsWith('worktree ')) e.path = l.slice(9)
            else if (l.startsWith('branch ')) e.branch = l.slice(7).replace(/^refs\/heads\//, '')
            else if (l === 'detached') e.detached = true
            else if (l.startsWith('prunable')) e.prunable = true
        }
        out.push(e)
    }
    return out
}

/** Local branches whose upstream is configured but gone, from local refs only. */
function goneBranches(cwd) {
    const res = git(cwd, ['for-each-ref', '--format=%(refname:short)%00%(upstream)%00%(upstream:track)', 'refs/heads'])
    const gone = new Set()
    for (const line of res.stdout.split('\n')) {
        const [name, upstream, track] = line.split('\0')
        if (name && upstream && track === '[gone]') gone.add(name)
    }
    return gone
}

function specIsLive(id, root) {
    for (const file of findById(id, root)) {
        const fm = parseFrontmatter(readFileSync(file, 'utf8'))
        if (fm.id === id) return LIVE_SPEC.has(fm.status)
    }
    return false
}

/** Why a linked worktree is a stray, or null when it is not. */
export function strayReason(wt, { base, gone, root }) {
    if (!real(wt.path).startsWith(base)) return 'outside'
    const name = basename(wt.path)
    if (/^agent-/.test(name)) return 'agent'
    if (wt.branch && gone.has(wt.branch)) return 'branch-gone'
    if (wt.detached || !wt.branch) return 'detached'
    const spec = name.match(/^spec-(\d{3})$/)
    if (spec && !specIsLive(`SPEC-${spec[1]}`, root)) return 'spec-closed'
    return null
}

/**
 * Every stray linked worktree of the repo at `cwd`, as `{ path, branch, reason }`. The main
 * checkout, the first entry, is never a stray, and spec status is read from it.
 */
export function findStrays(cwd) {
    return straysOf(listWorktrees(cwd))
}

function straysOf(all) {
    const main = all[0].path
    const base = real(join(main, WORKTREES_REL)) + sep
    const ctx = { base, gone: goneBranches(main), root: main }
    return all
        .slice(1)
        .filter((wt) => !wt.prunable)
        .map((wt) => ({ path: wt.path, branch: wt.branch, reason: strayReason(wt, ctx) }))
        .filter((s) => s.reason)
}

function isClean(path) {
    const res = git(path, ['status', '--porcelain'])
    return res.status === 0 && res.stdout.trim() === ''
}

/**
 * Remove what may be removed and report the rest. With `own`, only `.claude/worktrees/<own>`
 * is a candidate, whether or not it is a stray; without it, the clean REMOVABLE strays are.
 * Returns `{ removed, kept }`, each a list of `{ path, branch, reason, dirty? }`.
 */
export function prune(cwd, { own = null } = {}) {
    const all = listWorktrees(cwd)
    const main = all[0].path
    const strays = straysOf(all)
    const ownPath = own ? real(join(main, WORKTREES_REL, own)) : null
    const candidates = own
        ? all.slice(1).filter((wt) => real(wt.path) === ownPath).map((wt) => ({ path: wt.path, branch: wt.branch, reason: 'own' }))
        : strays.filter((s) => REMOVABLE.has(s.reason))
    const removed = []
    const kept = strays.filter((s) => !candidates.some((c) => real(c.path) === real(s.path)))
    for (const c of candidates) {
        if (!isClean(c.path)) {
            kept.push({ ...c, dirty: true })
            continue
        }
        const res = git(main, ['worktree', 'remove', c.path])
        if (res.status === 0) removed.push(c)
        else kept.push({ ...c, dirty: true, error: res.stderr.trim() })
    }
    git(main, ['worktree', 'prune'])
    return { removed, kept }
}

function formatStray(s) {
    return `${s.reason.padEnd(12)} ${s.path}  ${s.branch ?? '(detached)'}${s.dirty ? '  [dirty, kept]' : ''}`
}

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const json = rest.includes('--json')
    const ownAt = rest.indexOf('--own')
    let own = null
    if (ownAt !== -1) {
        const v = rest[ownAt + 1]
        const m = String(v ?? '').match(/^(?:SPEC|spec)-(\d{3})$/)
        if (!m) {
            process.stderr.write('worktrees: --own takes a spec id such as SPEC-011\n')
            process.exit(2)
        }
        own = `spec-${m[1]}`
    }
    if (!existsSync(root)) {
        process.stderr.write(`worktrees: no such directory ${root}\n`)
        process.exit(2)
    }
    try {
        if (rest.includes('--fetch')) {
            const f = git(root, ['fetch', '--prune', '--quiet'])
            if (f.status !== 0) process.stderr.write(`worktrees: git fetch --prune failed; branch-gone reflects the last fetch\n${f.stderr}`)
        }
        if (rest.includes('--prune')) {
            const { removed, kept } = prune(root, { own })
            if (json) process.stdout.write(`${JSON.stringify({ removed, kept }, null, 2)}\n`)
            else {
                for (const r of removed) process.stdout.write(`removed      ${r.path}\n`)
                for (const k of kept) process.stdout.write(`kept         ${formatStray(k)}\n`)
                process.stdout.write(`worktrees: ${removed.length} removed, ${kept.length} stray(s) left\n`)
            }
            return
        }
        const strays = findStrays(root)
        if (json) process.stdout.write(`${JSON.stringify(strays, null, 2)}\n`)
        else {
            for (const s of strays) process.stdout.write(`${formatStray(s)}\n`)
            process.stdout.write(`worktrees: ${strays.length} stray(s)\n`)
        }
    } catch (err) {
        process.stderr.write(`worktrees: ${err.message}\n`)
        process.exit(2)
    }
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
