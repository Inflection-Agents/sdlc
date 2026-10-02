// Tests for the script runner (SPEC-009 AC-020). Skills give every repo-local script
// command through it, so it must find the repo's own copy on both layouts, fall back to
// the plugin's copy when the repo has none, and refuse loudly when neither exists.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { layout1Repo, layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const RUN = fileURLToPath(new URL('./run.mjs', import.meta.url))

const HERE = fileURLToPath(new URL('.', import.meta.url))

function runIn(cwd, extraEnv, ...args) {
    const env = { ...process.env, ...extraEnv }
    delete env.CLAUDE_PLUGIN_ROOT
    return spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8', env })
}

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

test('a --root given from another directory picks that repo, for the fallback and for its own copy', () => {
    const l2 = layout2Repo()
    const l1 = layout1Repo()
    try {
        // A session's CLAUDE_PROJECT_DIR names another repo, and the cwd is inside that repo too,
        // so only the forwarded --root, or the child's env, can pick l2.
        const elsewhere = layout1Repo()
        try {
            const fallback = runIn(elsewhere.root, { CLAUDE_PROJECT_DIR: elsewhere.root }, 'validate-sdlc-config', '--root', l2.root)
            assert.equal(fallback.status, 0, fallback.stderr)
            assert.match(fallback.stdout, /config\.yaml OK/)
            write(l1.root, 'scripts/sdlc/whoami.mjs', "import { resolveRoot } from './lib/sdlc-paths.mjs'\nconsole.log(resolveRoot())\n")
            write(l1.root, 'scripts/sdlc/lib/sdlc-paths.mjs', readFileSync(join(HERE, 'lib', 'sdlc-paths.mjs'), 'utf8'))
            for (const f of ['legacy-map.mjs', 'mini-yaml.mjs']) write(l1.root, `scripts/sdlc/lib/${f}`, readFileSync(join(HERE, 'lib', f), 'utf8'))
            const own = runIn(elsewhere.root, { CLAUDE_PROJECT_DIR: elsewhere.root }, 'whoami', '--root', l1.root)
            assert.equal(own.status, 0, own.stderr)
            assert.equal(realpathSync(own.stdout.trim()), realpathSync(l1.root), 'the repo copy resolves the --root repo')
        } finally {
            elsewhere.cleanup()
        }
    } finally {
        l2.cleanup()
        l1.cleanup()
    }
})

test('a name that is a path is refused before anything runs', () => {
    const fx = layout2Repo()
    try {
        for (const name of ['../../outside/evil', 'lib/sdlc-paths', '/abs/x.mjs']) {
            const res = run(fx.root, name)
            assert.equal(res.status, 2, name)
            assert.match(res.stderr, /is not a script name/)
        }
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

test("the plugin's copy is given --root <repo> on fallback (AC-020)", () => {
    // A runner in a scratch plugin whose only extra script prints its argv.
    const plugin = mkdtempSync(join(tmpdir(), 'sdlc-plugin-'))
    const fx = layout2Repo()
    try {
        cpSync(join(HERE, 'run.mjs'), join(plugin, 'scripts', 'sdlc', 'run.mjs'), { recursive: true })
        cpSync(join(HERE, 'lib'), join(plugin, 'scripts', 'sdlc', 'lib'), { recursive: true })
        write(plugin, 'scripts/sdlc/argv.mjs', 'console.log(JSON.stringify(process.argv.slice(2)))\n')
        const env = { ...process.env }
        delete env.CLAUDE_PROJECT_DIR
        delete env.CLAUDE_PLUGIN_ROOT
        const res = spawnSync(process.execPath, [join(plugin, 'scripts', 'sdlc', 'run.mjs'), 'argv', 'x'], { cwd: fx.root, encoding: 'utf8', env })
        assert.equal(res.status, 0, res.stderr)
        const [flag, dir, ...rest] = JSON.parse(res.stdout)
        assert.equal(flag, '--root')
        assert.equal(realpathSync(dir), realpathSync(fx.root))
        assert.deepEqual(rest, ['x'])
    } finally {
        rmSync(plugin, { recursive: true, force: true })
        fx.cleanup()
    }
})

test("run.mjs keeps the caller's directory when it is inside the repo", () => {
    const fx = layout2Repo()
    try {
        write(fx.root, '.sdlc/scripts/pwd.mjs', 'console.log(process.cwd())\n')
        write(fx.root, 'specs/tasks/.keep', '')
        const res = run(join(fx.root, 'specs', 'tasks'), 'pwd')
        assert.equal(res.status, 0, res.stderr)
        assert.equal(realpathSync(res.stdout.trim()), realpathSync(join(fx.root, 'specs', 'tasks')))
    } finally {
        fx.cleanup()
    }
})
