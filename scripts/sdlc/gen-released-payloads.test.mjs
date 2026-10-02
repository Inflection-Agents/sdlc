// Tests for the released-payload manifest (SPEC-009 AC-022). The migration replaces a
// framework file only when its bytes match a shipped one, so the manifest must be current
// and the match must be exact to the byte.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { loadManifest, releasedVersions, roleOf } from './gen-released-payloads.mjs'

const SCRIPT = fileURLToPath(new URL('./gen-released-payloads.mjs', import.meta.url))
const REPO = fileURLToPath(new URL('../..', import.meta.url))

test('the committed manifest is current (--check exits 0)', () => {
    const res = spawnSync(process.execPath, [SCRIPT, '--check'], { encoding: 'utf8' })
    assert.equal(res.status, 0, res.stderr)
})

test('it covers 0.1.0, 0.2.0 and 0.3.0', () => {
    const versions = new Set(Object.values(loadManifest().roles).flatMap((r) => Object.values(r)))
    for (const v of ['0.1.0', '0.2.0', '0.3.0']) assert.ok(versions.has(v), v)
})

test('the 0.2.0 validate-state-machine.mjs is unmodified, and one changed byte makes it modified', () => {
    const bytes = execFileSync('git', ['show', '4a4446a:init-payload/scripts/sdlc/validate-state-machine.mjs'], { cwd: REPO })
    const manifest = loadManifest()
    assert.ok(releasedVersions(manifest, 'scripts/validate-state-machine.mjs', bytes).length > 0)
    const edited = Buffer.from(bytes)
    edited[0] = edited[0] === 0x23 ? 0x24 : 0x23
    assert.deepEqual(releasedVersions(manifest, 'scripts/validate-state-machine.mjs', edited), [])
})

test('roleOf maps both payload layouts to one role', () => {
    assert.equal(roleOf('init-payload/scripts/sdlc/plan-gate.mjs'), 'scripts/plan-gate.mjs')
    assert.equal(roleOf('init-payload/.sdlc/scripts/lib/sdlc-paths.mjs'), 'scripts/lib/sdlc-paths.mjs')
    assert.equal(roleOf('init-payload/templates/spec.md'), 'templates/spec.md')
    assert.equal(roleOf('init-payload/.ai/skills/review-primitives.md'), 'contracts/review-primitives.md')
    assert.equal(roleOf('init-payload/sdlc-state-machine.yaml'), 'state-machine')
    assert.equal(roleOf('init-payload/.github/workflows/sdlc-validate.yml'), null)
})
