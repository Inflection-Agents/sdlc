// Tests for the reviewer-envelope validator (ADR-003), the re-homed owner of the
// three rules review-primitives.md pins to the dispatch layer:
//   1. malformed/absent envelope        → contract violation (never "no findings")
//   2. reviewer_status: abstained       → escalate (never a clean accept)
//   3. ungrounded blocking finding      → contract violation

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    EXIT_ABSTAINED,
    EXIT_MALFORMED,
    EXIT_VALID,
    PR_SIDE_PREFIXES,
    validateEnvelope
} from './validate-review-envelope.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'validate-review-envelope.mjs')

const clean = { artifact: 'pr', artifact_id: 'TASK-001', findings: [] }
const withBlocker = {
    artifact: 'pr',
    artifact_id: 'TASK-001',
    findings: [{ id: 'F-001', severity: 'blocker', criterion: 'ac:AC-003', finding: 'AC not addressed' }]
}

test('a clean assessed envelope validates', () => {
    const res = validateEnvelope(clean)
    assert.equal(res.ok, true)
    assert.equal(res.abstained, false)
})

test('a grounded blocking finding validates', () => {
    assert.equal(validateEnvelope(withBlocker).ok, true)
})

test('non-objects, arrays and a missing findings array are contract violations', () => {
    assert.equal(validateEnvelope(null).ok, false)
    assert.equal(validateEnvelope([1, 2]).ok, false)
    assert.equal(validateEnvelope('nope').ok, false)
    assert.equal(validateEnvelope({ artifact: 'pr' }).ok, false) // findings is required
    assert.equal(validateEnvelope({ artifact: 'pr', findings: 'none' }).ok, false)
})

test('an out-of-enum severity or reviewer_status is a contract violation', () => {
    assert.equal(
        validateEnvelope({ ...clean, findings: [{ severity: 'critical', criterion: 'ac:AC-001' }] }).ok,
        false
    )
    assert.equal(validateEnvelope({ ...clean, reviewer_status: 'maybe' }).ok, false)
})

test('a finding with no criterion and no citation is ungrounded', () => {
    const res = validateEnvelope({ ...clean, findings: [{ severity: 'nit', finding: 'style' }] })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /grounded citation/)
})

test('the citation alias satisfies the grounding anyOf', () => {
    assert.equal(validateEnvelope({ ...clean, findings: [{ severity: 'nit', citation: 'std:naming' }] }).ok, true)
})

test('a blocking finding with an unrecognized prefix is rejected', () => {
    const res = validateEnvelope({
        ...clean,
        findings: [{ severity: 'major', criterion: 'vibes:this-feels-wrong', finding: 'x' }]
    })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /ungrounded/)
})

test('a nit with an unrecognized prefix is allowed (only blocking severities must ground)', () => {
    assert.equal(validateEnvelope({ ...clean, findings: [{ severity: 'nit', criterion: 'vibes:x' }] }).ok, true)
})

test('spec-side envelopes are exempt from the PR-side prefix set', () => {
    const res = validateEnvelope({
        artifact: 'spec',
        findings: [{ severity: 'blocker', criterion: 'spec-schema:success_criteria' }]
    })
    assert.equal(res.ok, true)
})

test('abstained is reported separately from malformed', () => {
    const res = validateEnvelope({ ...clean, reviewer_status: 'abstained' })
    assert.equal(res.ok, true)
    assert.equal(res.abstained, true)
})

test('every canonical prefix grounds a blocking finding', () => {
    for (const p of PR_SIDE_PREFIXES) {
        const res = validateEnvelope({ ...clean, findings: [{ severity: 'blocker', criterion: `${p}example` }] })
        assert.equal(res.ok, true, `prefix ${p} should ground a blocker: ${res.errors.join('; ')}`)
    }
})

// ── CLI exit codes: the branch points a caller routes on ──────────────────────

const run = (input) => spawnSync('node', [CLI, '-'], { input, encoding: 'utf8' }).status

test('CLI exit codes distinguish valid / abstained / malformed', () => {
    assert.equal(run(JSON.stringify(clean)), EXIT_VALID)
    assert.equal(run(JSON.stringify({ ...clean, reviewer_status: 'abstained' })), EXIT_ABSTAINED)
    assert.equal(run('{not json'), EXIT_MALFORMED)
    assert.equal(run(''), EXIT_MALFORMED)
    assert.equal(run(JSON.stringify({ artifact: 'pr' })), EXIT_MALFORMED)
})
