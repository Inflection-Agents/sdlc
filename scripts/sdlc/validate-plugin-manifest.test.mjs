// Tests for the plugin manifest gate.
//
// The manifest is a new surface carrying an old hazard: a name that resolves to
// nothing. This repo has shipped three of those (a registry routing to an agent no
// repo defined, a changelog citing a nonexistent spec, a `std:` anchor with no
// heading). A manifest naming a missing hook fails worse than any of them, because
// the plugin installs cleanly and the hook simply never fires.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT_FOR_PAYLOAD = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

import { validate, commandsOf, pluginPathOf } from './validate-plugin-manifest.mjs'

/** A minimal well-formed plugin tree; `mutate` breaks exactly one thing. */
function fakePlugin(mutate = () => {}) {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-manifest-'))
    mkdirSync(join(root, '.claude-plugin'), { recursive: true })
    mkdirSync(join(root, 'hooks'), { recursive: true })
    mkdirSync(join(root, 'skills', 'demo'), { recursive: true })
    mkdirSync(join(root, 'agents'), { recursive: true })

    const state = {
        manifest: { name: 'sdlc', version: '0.1.0', description: 'd' },
        hooks: {
            Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/stop.mjs"' }] }]
        },
        hookFiles: ['stop.mjs'],
        skillMd: true,
        agent: '---\nname: task-reviewer\ntools: Read, Grep\n---\nbody\n'
    }
    mutate(state)

    writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify(state.manifest))
    writeFileSync(join(root, 'hooks', 'hooks.json'), JSON.stringify(state.hooks))
    for (const f of state.hookFiles) writeFileSync(join(root, 'hooks', f), '// hook\n')
    if (state.skillMd) writeFileSync(join(root, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
    if (state.agent !== null) writeFileSync(join(root, 'agents', 'task-reviewer.md'), state.agent)
    return root
}

const withPlugin = (mutate, fn) => {
    const root = fakePlugin(mutate)
    try {
        return fn(root)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
}

test('a well-formed plugin tree validates clean', () => {
    withPlugin(
        () => {},
        (root) => assert.deepEqual(validate(root), [])
    )
})

test('a hooks.json command naming a missing file is caught', () => {
    // The failure this gate exists for: the plugin installs, the hook never fires,
    // and nothing says so.
    withPlugin(
        (s) => {
            s.hookFiles = []
        },
        (root) => {
            const p = validate(root)
            assert.equal(p.length, 1)
            assert.match(p[0], /hooks\/stop\.mjs.*does not exist/)
        }
    )
})

test('a non-semver version is caught', () => {
    // Version is the only thing that delivers an update; a malformed one ships nothing.
    withPlugin(
        (s) => {
            s.manifest.version = 'v1'
        },
        (root) => assert.match(validate(root).join('\n'), /not semver/)
    )
})

test('a missing manifest field is caught', () => {
    withPlugin(
        (s) => {
            delete s.manifest.description
        },
        (root) => assert.match(validate(root).join('\n'), /missing `description`/)
    )
})

test('a skill directory with no SKILL.md is caught', () => {
    withPlugin(
        (s) => {
            s.skillMd = false
        },
        (root) => assert.match(validate(root).join('\n'), /skills\/demo\/ has no SKILL\.md/)
    )
})

test('an agent with no tools declaration is caught', () => {
    // A reviewer agent's tools line is the independence mechanism; an agent that
    // declares none has no enforced boundary at all.
    withPlugin(
        (s) => {
            s.agent = '---\nname: task-reviewer\n---\nbody\n'
        },
        (root) => assert.match(validate(root).join('\n'), /declares no `tools`/)
    )
})

test('an absent manifest is reported, not thrown on', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-empty-'))
    try {
        assert.match(validate(root).join('\n'), /missing/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})

test('commandsOf finds commands under every event shape', () => {
    const hooks = {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'a' }, { command: 'b' }] }],
        Stop: [{ hooks: [{ command: 'c' }] }]
    }
    assert.deepEqual(commandsOf(hooks).sort(), ['a', 'b', 'c'])
    assert.deepEqual(commandsOf(null), [])
})

test('pluginPathOf extracts the plugin-root-relative path, and ignores commands without one', () => {
    assert.equal(pluginPathOf('node "${CLAUDE_PLUGIN_ROOT}/hooks/x.mjs"'), 'hooks/x.mjs')
    assert.equal(pluginPathOf('echo hello'), null)
})

test('the REAL repo manifest validates', () => {
    // The reference must pass the gate it ships, or it is shipping a gate it fails.
    assert.deepEqual(validate(), [])
})

// ── The payload must not drift from the validators this repo runs ──────────────
// init-payload/scripts/sdlc/ holds COPIES. A copy that falls behind ships an adopter
// a gate this repo no longer runs, and nothing would say so — the propagation class
// that produced every worst defect in the previous piece of work here.

test('every payload validator is byte-identical to the one this repo runs', async () => {
    const { readdirSync, readFileSync, existsSync } = await import('node:fs')
    const { join, dirname } = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const payload = join(root, 'init-payload', 'scripts', 'sdlc')
    if (!existsSync(payload)) return

    for (const f of readdirSync(payload).filter((f) => f.endsWith('.mjs'))) {
        const live = join(root, 'scripts', 'sdlc', f)
        assert.ok(existsSync(live), `init-payload ships ${f}, which no longer exists in scripts/sdlc/`)
        assert.equal(
            readFileSync(join(payload, f), 'utf8'),
            readFileSync(live, 'utf8'),
            `init-payload/scripts/sdlc/${f} has drifted from scripts/sdlc/${f}`
        )
    }
})

test('the payload does not ship a validator that only makes sense upstream', () => {
    // A consuming repo CONSUMES the plugin; it does not ship one, so it has no
    // .claude-plugin/plugin.json for this gate to grade.
    assert.equal(
        existsSync(join(REPO_ROOT_FOR_PAYLOAD, 'init-payload', 'scripts', 'sdlc', 'validate-plugin-manifest.mjs')),
        false,
        'validate-plugin-manifest.mjs must not ship to adopters'
    )
})

test('every script the payload workflow invokes is IN the payload', async () => {
    // The gap that let a removed validator stay wired: the drift test compared
    // payload validators to repo validators, and nothing compared the payload
    // WORKFLOW to the payload's own contents. An adopter's first CI run dies on
    // MODULE_NOT_FOUND — the dangling-name class this repo keeps rediscovering.
    const { readdirSync, readFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const wfDir = join(REPO_ROOT_FOR_PAYLOAD, 'init-payload', '.github', 'workflows')
    if (!existsSync(wfDir)) return

    for (const wf of readdirSync(wfDir).filter((f) => f.endsWith('.yml'))) {
        const text = readFileSync(join(wfDir, wf), 'utf8')
        for (const m of text.matchAll(/node\s+(?:--test\s+)?(scripts\/sdlc\/[\w.-]+\.mjs)/g)) {
            const rel = m[1]
            if (rel.includes('*')) continue
            assert.ok(
                existsSync(join(REPO_ROOT_FOR_PAYLOAD, 'init-payload', rel)),
                `init-payload workflow ${wf} runs ${rel}, which the payload does not ship`
            )
        }
    }
})
