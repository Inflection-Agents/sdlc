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
    // A blocking finding requires reviewer provenance: an inline grading carrying a
    // blocker is a contract violation, so every fixture that models a REAL dispatched
    // review declares who produced it.
    reviewed_by: 'agent:pr-reviewer',
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
        reviewed_by: 'agent:spec-reviewer',
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
        const res = validateEnvelope({ ...clean, reviewed_by: 'agent:pr-reviewer', findings: [{ severity: 'blocker', criterion: `${p}example` }] })
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

// ── Reviewer provenance (0.2.0) ───────────────────────────────────────────────
// A self-graded review and an independent one are byte-identical in the artifact.
// This is forensics rather than enforcement — the field is self-declared — but it
// catches the honest mistake, which is the common one.

test('an inline-graded envelope carrying a blocker is a contract violation', () => {
    const res = validateEnvelope({ ...clean, reviewed_by: 'inline', findings: [{ severity: 'blocker', criterion: 'ac:AC-001' }] })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /reviewed_by/)
})

test('an ABSENT reviewed_by is read as inline, not waved through', () => {
    // Every envelope written before this field existed was produced without dispatch
    // discipline, so absent must be the conservative reading.
    const res = validateEnvelope({ ...clean, findings: [{ severity: 'major', criterion: 'ac:AC-001' }] })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /absent, read as inline/)
})

test('an inline envelope with only nits and suggestions is allowed', () => {
    // The bar is on a BLOCKING grading. A nit from the authoring context costs nothing.
    const res = validateEnvelope({
        ...clean,
        reviewed_by: 'inline',
        findings: [{ severity: 'nit', criterion: 'ac:AC-001' }, { severity: 'suggestion', criterion: 'ac:AC-002' }]
    })
    assert.equal(res.ok, true)
})

test('a specialist added by REGISTRY EDIT ALONE is accepted', () => {
    // ADR-001: adding a specialist is a one-line registry edit, no engine change. An
    // enum here would have made it a schema edit and a version bump too - the
    // hardcoded map ADR-001 deleted, rebuilt in the schema layer.
    const res = validateEnvelope({ ...clean, reviewed_by: 'agent:a11y-reviewer', findings: [{ severity: 'blocker', criterion: 'lens:a11y' }] })
    assert.equal(res.ok, true)
})

test('a malformed reviewed_by is rejected by the pattern', () => {
    // `pattern` was silently ignored by checkProperty until this field needed it; an
    // enum had been covering that gap by accident.
    const res = validateEnvelope({ ...clean, reviewed_by: 'Agent:Bogus!', findings: [{ severity: 'blocker', criterion: 'ac:AC-001' }] })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /must match/)
})

test('an agent-graded envelope carrying a blocker passes', () => {
    const res = validateEnvelope({ ...clean, reviewed_by: 'agent:spec-reviewer', findings: [{ severity: 'blocker', criterion: 'ac:AC-001' }] })
    assert.equal(res.ok, true)
})

test('a clean inline envelope with no findings passes', () => {
    // Nothing was graded, so there is nothing to have graded independently.
    assert.equal(validateEnvelope({ ...clean, reviewed_by: 'inline' }).ok, true)
})

test('the CLI exits 3 on an inline blocking grading', () => {
    const env = JSON.stringify({ ...clean, reviewed_by: 'inline', findings: [{ severity: 'blocker', criterion: 'ac:AC-001' }] })
    const res = spawnSync('node', [CLI, '-'], { input: env, encoding: 'utf8' })
    assert.equal(res.status, EXIT_MALFORMED)
})
