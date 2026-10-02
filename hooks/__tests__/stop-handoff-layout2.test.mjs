// The stop hook's phase-exit handoff on layout 2 reads its phases through loadMachine, so a
// phase that lives in .sdlc/config.yaml extensions hands off like a framework one.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'stop-handoff.mjs')

function write(root, rel, text) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text, 'utf8')
}

test('an extension phase at its exit hands off to the next phase its config names', () => {
    const root = mkdtempSync(join(tmpdir(), 'sdlc-stop-l2-'))
    try {
        write(root, '.claude/.keep', '')
        write(root, '.sdlc/state-machine.yaml', [
            'version: 1',
            'phases:',
            '    - id: intent-triage',
            "      entry_triggers: ['brain dump']",
            "      preconditions: ['an idea']",
            '      owner_skill: intent-triage',
            "      exit_condition: 'an intent is picked'",
            '      next_phase: none',
            '      next_trigger: none',
            'exempt: []',
            '',
        ].join('\n'))
        write(root, '.sdlc/config.yaml', [
            'layout: 2',
            'extensions:',
            '  phases:',
            '    - id: roadmap-sync',
            "      entry_triggers: ['sync the roadmap']",
            "      preconditions: ['a roadmap']",
            '      owner_skill: roadmap-sync',
            "      exit_condition: 'an initiative is picked'",
            '      next_phase: intent-triage',
            "      next_trigger: 'open initiative INI-N'",
            '  exempt: []',
            'domain_routing: {}',
            '',
        ].join('\n'))
        write(root, 'specs/tasks/SPEC-001/_index.yaml', 'spec: SPEC-001\nphase:\n  current: roadmap-sync\n  exit_condition_met: true\n')
        const res = spawnSync(process.execPath, [HOOK], {
            input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'stop-l2' }),
            env: { ...process.env, CLAUDE_PROJECT_DIR: root },
            encoding: 'utf8',
        })
        assert.equal(res.status, 0, res.stderr)
        assert.match(res.stdout, /intent-triage/)
        assert.match(res.stdout, /open initiative INI-N/)
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
