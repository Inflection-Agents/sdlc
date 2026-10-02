// Tests for the YAML subset parser (SPEC-009). The config and the state machine are read
// through it, so each shape those files use is pinned here, and so is the refusal to
// guess at a shape it does not support.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { emitYaml, parseYaml } from './mini-yaml.mjs'

test('maps, nested maps, block lists, flow lists and quoted scalars', () => {
    const doc = parseYaml(
        [
            'layout: 2',
            'paths:',
            '  skills: skills   # trailing comment',
            "  project: 'AGENTS.md'",
            'workspaces:',
            '  - name: web',
            '    path: "apps/web"',
            '    skills: [a, \'b c\']',
            '    agent_executable: yes',
            'domain_routing: {}',
            'extensions:',
            '  exempt: []',
            '',
        ].join('\n')
    )
    assert.deepEqual(doc, {
        layout: 2,
        paths: { skills: 'skills', project: 'AGENTS.md' },
        workspaces: [{ name: 'web', path: 'apps/web', skills: ['a', 'b c'], agent_executable: 'yes' }],
        domain_routing: {},
        extensions: { exempt: [] },
    })
})

test('a sequence may sit at its key\'s own indentation', () => {
    assert.deepEqual(parseYaml('exempt:\n- a\n- b\n'), { exempt: ['a', 'b'] })
})

test('a flow value on the line after its key, as the state machine writes domain_routing', () => {
    assert.deepEqual(parseYaml('domain_routing:\n    # comment\n    {}\nexempt:\n    - x\n'), {
        domain_routing: {},
        exempt: ['x'],
    })
})

test("single-quoted '' is an escaped quote", () => {
    assert.deepEqual(parseYaml("a: 'it''s'\n"), { a: "it's" })
})

test('unsupported or malformed input throws instead of being skipped', () => {
    assert.throws(() => parseYaml('a: [unterminated\n'), /unterminated flow sequence/)
    assert.throws(() => parseYaml('a: 1\n    b: 2\n'), /unexpected indentation/)
    assert.throws(() => parseYaml('\ta: 1\n'), /tab indentation/)
})

test("this repo's state machine parses, with its phase ids", () => {
    const file = fileURLToPath(new URL('../../../specs/sdlc-state-machine.yaml', import.meta.url))
    const machine = parseYaml(readFileSync(file, 'utf8'))
    const ids = machine.phases.map((p) => p.id)
    assert.ok(ids.includes('spec-authoring') && ids.includes('spec-execution'))
    assert.ok(Array.isArray(machine.exempt))
})

test('emitYaml round-trips the config shape', () => {
    const value = {
        layout: 2,
        framework_version: '0.4.0',
        paths: { skills: 'skills' },
        workspaces: [{ name: 'web', path: 'apps/web', skills: ['a'], notes: '' }],
        domain_routing: {},
        extensions: { phases: [], exempt: [] },
    }
    assert.deepEqual(parseYaml(emitYaml(value)), { ...value, workspaces: [{ ...value.workspaces[0], notes: '' }] })
})
