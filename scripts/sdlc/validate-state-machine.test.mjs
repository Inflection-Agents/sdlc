// Tests for the state-machine loader as validate-state-machine.mjs sees it (SPEC-009 AC-007).
// On layout 2 the adopter's routing and extensions live in .sdlc/config.yaml, the machine
// file is framework-owned, and a machine that still carries domain_routing is rejected.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { loadMachine } from './lib/sdlc-paths.mjs'
import { layout1Repo, layout2Repo, MACHINE, write } from './__fixtures__/layouts/build.mjs'

delete process.env.CLAUDE_PROJECT_DIR

const SCRIPT = fileURLToPath(new URL('./validate-state-machine.mjs', import.meta.url))

function validate(root) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    return spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env })
}

const CONFIG = [
    'layout: 2',
    'domain_routing:',
    '  web: [web-patterns]',
    'extensions:',
    '  phases:',
    '    - id: roadmap-sync',
    "      entry_triggers: ['sync the roadmap']",
    "      preconditions: ['a roadmap exists']",
    '      owner_skill: roadmap-sync',
    "      exit_condition: 'the roadmap is current'",
    '      next_phase: none',
    '      next_trigger: none',
    '  exempt: [local-only]',
    '',
].join('\n')

test('layout 2: loadMachine appends extension phases, merges exempt, and takes routing from config', () => {
    const fx = layout2Repo({ config: CONFIG })
    try {
        const m = loadMachine(fx.root)
        assert.deepEqual(m.phases.map((p) => p.id), ['spec-authoring', 'roadmap-sync'])
        assert.ok(m.exempt.includes('review-primitives') && m.exempt.includes('local-only'))
        assert.deepEqual(m.domain_routing, { web: ['web-patterns'] })
        assert.deepEqual(m.phases[1].entry_triggers, ['sync the roadmap'])
    } finally {
        fx.cleanup()
    }
})

test('layout 2: a skill named only in extensions.exempt is registered', () => {
    const fx = layout2Repo({ config: CONFIG })
    try {
        write(fx.root, '.sdlc/skills/local-only/SKILL.md', '# local\n')
        write(fx.root, '.sdlc/skills/roadmap-sync/SKILL.md', '# roadmap\n')
        write(fx.root, '.sdlc/skills/web-patterns/SKILL.md', '# web\n')
        write(fx.root, '.sdlc/skills/spec-authoring/SKILL.md', '# authoring\n')
        write(fx.root, '.sdlc/skills/review-primitives/SKILL.md', '# primitives\n')
        const res = validate(fx.root)
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stdout, /phases: 2/)
    } finally {
        fx.cleanup()
    }
})

test('layout 2: a machine that still carries domain_routing exits 1 and says where routing lives', () => {
    const fx = layout2Repo({ config: CONFIG })
    try {
        write(fx.root, '.sdlc/state-machine.yaml', MACHINE)
        const res = validate(fx.root)
        assert.equal(res.status, 1)
        assert.match(res.stderr, /carries domain_routing:.*config\.yaml/)
    } finally {
        fx.cleanup()
    }
})

test('layout 1: loadMachine returns the machine file unchanged, routing included', () => {
    const fx = layout1Repo()
    try {
        const m = loadMachine(fx.root)
        assert.deepEqual(m.phases.map((p) => p.id), ['spec-authoring'])
        assert.deepEqual(m.domain_routing, { web: ['web-patterns'] })
    } finally {
        fx.cleanup()
    }
})

test('an unparseable machine throws, and the validator exits 1 naming the file', () => {
    const fx = layout2Repo()
    try {
        write(fx.root, '.sdlc/state-machine.yaml', "phases:\n  - id: 'unterminated\n")
        assert.throws(() => loadMachine(fx.root), /does not parse/)
        const res = validate(fx.root)
        assert.equal(res.status, 1)
    } finally {
        fx.cleanup()
    }
})
