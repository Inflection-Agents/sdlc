// Tests for the script runner (SPEC-009 AC-020). Skills give every repo-local script
// command through it, so it must find the repo's own copy on both layouts, fall back to
// the plugin's copy when the repo has none, and refuse loudly when neither exists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { layout1Repo, layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url))

function run(cwd, ...args) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CLAUDE_PLUGIN_ROOT
    return spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8', env })
}

for (const [label, build, rel] of [
    ['layout 1', layout1Repo, 'scripts/sdlc/probe-exit.mjs'],
    ['layout 2', layout2Repo, '.sdlc/scripts/probe-exit.mjs'],
]) {
    test(`${label}: runs the repo's own copy and passes its exit code through`, () => {
        const fx = build()
        try {
            write(fx.root, rel, "console.log('repo copy', process.argv.slice(2).join(' ')); process.exit(7)\n")
            const res = run(fx.root, 'probe-exit', 'a.md')
            assert.equal(res.status, 7)
            assert.match(res.stdout, /repo copy a\.md/)
            assert.doesNotMatch(res.stderr, /plugin's copy/)
        } finally {
            fx.cleanup()
        }
    })
}

test("falls back to the plugin's copy with --root when the repo has none", () => {
    const fx = layout2Repo()
    try {
        const res = run(fx.root, 'validate-sdlc-config')
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stderr, /running the plugin's copy/)
        assert.match(res.stdout, /config\.yaml OK/)
    } finally {
        fx.cleanup()
    }
})

test('exits 2 and names both directories when neither copy exists', () => {
    const fx = layout2Repo()
    try {
        const res = run(fx.root, 'no-such-script')
        assert.equal(res.status, 2)
        assert.match(res.stderr, /no script named no-such-script in .*\.sdlc\/scripts or .*scripts\/sdlc/)
    } finally {
        fx.cleanup()
    }
})

test('the runner itself prints no deprecation line on layout 1', () => {
    const fx = layout1Repo()
    try {
        write(fx.root, 'scripts/sdlc/probe-exit.mjs', 'process.exit(0)\n')
        const res = run(fx.root, 'probe-exit')
        assert.equal((res.stderr.match(/layout 1 detected/g) ?? []).length, 0)
    } finally {
        fx.cleanup()
    }
})

test('every script command a skill or agent gives uses run.mjs, or names a plugin-only script (AC-018)', () => {
    const repo = fileURLToPath(new URL('../..', import.meta.url))
    const shipped = new Set(readdirSync(join(repo, 'init-payload', '.sdlc', 'scripts')).filter((f) => f.endsWith('.mjs')))
    const files = ['skills', 'agents'].flatMap((d) => readdirSync(join(repo, d), { recursive: true }).map((f) => join(d, f)))
    const wrong = []
    for (const rel of files.filter((f) => f.endsWith('.md'))) {
        for (const [, path] of readFileSync(join(repo, rel), 'utf8').matchAll(/node\s+["']?([^\s"'`]+\.mjs)/g)) {
            const name = path.split('/').pop()
            const pluginOnly = path.startsWith('${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/') && !shipped.has(name)
            if (name !== 'run.mjs' && !pluginOnly) wrong.push(`${rel}: ${path}`)
        }
    }
    assert.deepEqual(wrong, [])
})
