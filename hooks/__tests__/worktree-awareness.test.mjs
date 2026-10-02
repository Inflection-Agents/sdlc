// SPEC-011 > Design > A nested worktree is its own tree (items 3 and 4) and the once-per-session
// nudge. Every case runs against a real repo with a bare remote and real `git worktree add`
// worktrees, with CLAUDE_PROJECT_DIR on the main checkout, as a delivery session has it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOKS = join(HERE, '..')
const REPO = join(HERE, '..', '..')

function put(root, rel, text) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text, 'utf8')
}

const index = (current) => `spec: SPEC-011\nsteps:\n  - id: S1\n    status: done\nphase:\n  current: ${current}\n  next_action: spec-completion\n  next_trigger: 'close out SPEC-011'\n  exit_condition_met: ${current === 'spec-execution'}\n  handoff_surfaced: false\n  updated: 2026-10-02\n`

/** Main checkout on `main` with SPEC-011 at spec-authoring; a spec worktree on a step branch at spec-execution. */
function fixture() {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'sdlc-hookwt-')))
    const root = join(tmp, 'repo')
    const remote = join(tmp, 'remote.git')
    const git = (cwd, ...a) => {
        const r = spawnSync('git', a, { cwd, encoding: 'utf8' })
        assert.equal(r.status, 0, `git ${a.join(' ')}: ${r.stderr}`)
        return r.stdout
    }
    git(tmp, 'init', '-q', '--bare', remote)
    git(tmp, 'init', '-q', '-b', 'main', root)
    git(root, 'config', 'user.email', 't@t')
    git(root, 'config', 'user.name', 't')
    put(root, '.sdlc/config.yaml', 'layout: 2\n')
    copyFileSync(join(REPO, '.sdlc', 'state-machine.yaml'), join(root, '.sdlc', 'state-machine.yaml'))
    put(root, 'specs/SPEC-011-x.md', '---\nid: SPEC-011\nstatus: active\n---\n')
    put(root, 'specs/tasks/SPEC-011/_index.yaml', index('spec-authoring'))
    put(root, 'src/a.ts', 'export {}\n')
    put(root, '.gitignore', '.claude/worktrees/\n.claude/.sdlc-*\n')
    git(root, 'add', '-A')
    git(root, 'commit', '-qm', 'init')
    git(root, 'remote', 'add', 'origin', remote)
    git(root, 'push', '-q', '-u', 'origin', 'main')
    git(root, 'worktree', 'add', '-q', '-b', 'feat/spec-011', join(root, '.claude/worktrees/spec-011'))
    const wt = join(root, '.claude/worktrees/spec-011')
    git(wt, 'checkout', '-q', '-b', 'claude/SPEC-011-S1')
    put(wt, 'specs/tasks/SPEC-011/_index.yaml', index('spec-execution'))
    git(wt, 'commit', '-qam', 'phase')
    git(root, 'worktree', 'add', '-q', '-b', 'misc', join(root, '.claude/worktrees/misc'))
    return { tmp, root, wt, git, cleanup: () => rmSync(tmp, { recursive: true, force: true }) }
}

function hook(name, root, payload, extraEnv = {}) {
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root, ...extraEnv }
    delete env.SDLC_EDIT_GATE_BRANCH
    return spawnSync(process.execPath, [join(HOOKS, name)], { input: JSON.stringify(payload), env, encoding: 'utf8' })
}

const edit = (root, file, cwd) => hook('pre-tool-use-edit-write.mjs', root, { tool_name: 'Edit', tool_input: { file_path: file }, cwd, session_id: 's-edit' }, { SDLC_GUARD_MODE: 'enforce' })

test('AC-011: an implementation edit inside the spec worktree is graded by that worktree\'s branch', () => {
    const fx = fixture()
    try {
        const ok = edit(fx.root, join(fx.wt, 'src/a.ts'), fx.wt)
        assert.equal(ok.status, 0, `the worktree is on claude/SPEC-011-S1, an active task: ${ok.stderr}`)
        const misc = edit(fx.root, join(fx.root, '.claude/worktrees/misc/src/a.ts'), fx.root)
        assert.equal(misc.status, 2, 'a worktree on a branch naming no task is gated')
        assert.match(misc.stderr, /File: src\/a\.ts/, 'and the file is named by its path inside the worktree')
        const main = edit(fx.root, join(fx.root, 'src/a.ts'), fx.root)
        assert.equal(main.status, 2, 'the main checkout on main is gated, exactly as before')
        const doc = edit(fx.root, join(fx.root, '.claude/worktrees/misc/specs/x.md'), fx.root)
        assert.equal(doc.status, 0, 'a process artifact inside a worktree is still a process artifact')
    } finally {
        fx.cleanup()
    }
})

test('a plain directory under .claude/worktrees/ is not a worktree, so its files stay .claude/ artifacts', () => {
    const fx = fixture()
    try {
        put(fx.root, '.claude/worktrees/plain/src/a.ts', '')
        assert.equal(edit(fx.root, join(fx.root, '.claude/worktrees/plain/src/a.ts'), fx.root).status, 0)
    } finally {
        fx.cleanup()
    }
})

test('AC-012: a goal armed at $CLAUDE_PROJECT_DIR/.claude/ blocks a stop made from inside the worktree', () => {
    const fx = fixture()
    try {
        put(fx.root, '.claude/.sdlc-goal-s1', JSON.stringify({ version: 1, spec: 'SPEC-011', statement: 'deliver', exit_criteria: ['x'], status: 'active', armed_at: new Date().toISOString() }))
        const res = hook('stop-handoff.mjs', fx.root, { session_id: 's1', hook_event_name: 'Stop', cwd: fx.wt })
        assert.equal(res.status, 0, res.stderr)
        assert.equal(JSON.parse(res.stdout).decision, 'block')
    } finally {
        fx.cleanup()
    }
})

test('AC-012: the Stop hook reads the phase block committed only in the spec worktree', () => {
    const fx = fixture()
    try {
        const res = hook('stop-handoff.mjs', fx.root, { session_id: 's2', hook_event_name: 'Stop', cwd: fx.root })
        assert.equal(res.status, 0, res.stderr)
        const out = JSON.parse(res.stdout)
        assert.equal(out.decision, 'block')
        assert.match(out.reason, /SPEC-011 has reached the exit condition for `spec-execution`/)
    } finally {
        fx.cleanup()
    }
})

test('AC-012: the prompt hook treats the spec as active from the worktree phase block', () => {
    const fx = fixture()
    try {
        const prompt = { prompt: 'execute SPEC-011', session_id: 's3', cwd: fx.root }
        const live = hook('user-prompt-submit.mjs', fx.root, prompt)
        assert.equal(live.status, 0, live.stderr)
        assert.doesNotMatch(live.stdout, /SDLC routing/, 'a run in flight gets no entry routing')
        fx.git(fx.root, 'worktree', 'remove', '--force', fx.wt)
        const after = hook('user-prompt-submit.mjs', fx.root, { ...prompt, session_id: 's4' })
        assert.match(after.stdout, /SDLC routing/, 'without the worktree, the main checkout\'s spec-authoring block applies')
    } finally {
        fx.cleanup()
    }
})

test('AC-008: the worktree nudge prints on the first prompt only, and never with no strays', () => {
    const fx = fixture()
    try {
        const ask = (session) => hook('user-prompt-submit.mjs', fx.root, { prompt: 'hello', session_id: session, cwd: fx.root })
        const clean = ask('s5')
        assert.equal(clean.status, 0)
        assert.doesNotMatch(clean.stdout, /stray worktree/, 'no strays, no nudge')
        fx.git(fx.root, 'worktree', 'add', '-q', '--detach', join(fx.root, '.claude/worktrees/det'))
        const first = ask('s6')
        assert.equal(first.status, 0, first.stderr)
        assert.match(first.stdout, /SDLC: 1 stray worktree\(s\) \(detached\)/)
        const second = ask('s6')
        assert.equal(second.status, 0)
        assert.doesNotMatch(second.stdout, /stray worktree/, 'once per session')
    } finally {
        fx.cleanup()
    }
})

test('an unreadable worktrees directory does not silence the prompt hook', () => {
    const fx = fixture()
    try {
        fx.git(fx.root, 'worktree', 'remove', '--force', fx.wt)
        fx.git(fx.root, 'worktree', 'remove', '--force', join(fx.root, '.claude/worktrees/misc'))
        rmSync(join(fx.root, '.claude/worktrees'), { recursive: true, force: true })
        // A file where the directory should be: listing it throws ENOTDIR.
        put(fx.root, '.claude/worktrees', 'not a directory\n')
        const res = hook('user-prompt-submit.mjs', fx.root, { prompt: 'execute SPEC-011', session_id: 's7', cwd: fx.root })
        assert.equal(res.status, 0)
        assert.match(res.stdout, /SDLC routing/, 'entry routing still prints')
    } finally {
        fx.cleanup()
    }
})
