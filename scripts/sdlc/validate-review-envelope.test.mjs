// Tests for the reviewer-envelope validator (ADR-003), the re-homed owner of the
// three rules review-primitives.md pins to the dispatch layer:
//   1. malformed/absent envelope        → contract violation (never "no findings")
//   2. reviewer_status: abstained       → escalate (never a clean accept)
//   3. ungrounded blocking finding      → contract violation

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    EXIT_ABSTAINED,
    EXIT_MALFORMED,
    EXIT_VALID,
    PR_SIDE_PREFIXES,
    findingId,
    stampEnvelope,
    validateEnvelope as validateRaw
} from './validate-review-envelope.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Most tests below probe one rule with a partial finding. This fills the fields an id hashes
 * (location, finding) and stamps the id, so each still exercises only the rule it names. The
 * id tests at the end call the raw validator.
 */
function complete(env) {
    if (!env || typeof env !== 'object' || !Array.isArray(env.findings)) return env
    const loc = env.artifact === 'spec' ? 'Problem' : 'src/a.ts:1'
    return stampEnvelope({
        ...env,
        findings: env.findings.map((f) => (f && typeof f === 'object' ? { location: loc, finding: 'x', ...f } : f)),
    })
}
const validateEnvelope = (env) => validateRaw(complete(env))
const CLI = join(HERE, 'validate-review-envelope.mjs')

// A clean envelope is a VERDICT of "nothing wrong", so it needs provenance like any
// other verdict — an inline clean envelope is a self-accept. Fixtures modelling a real
// dispatched review declare who produced them.
const clean = { artifact: 'pr', artifact_id: 'TASK-001', reviewed_by: 'agent:pr-reviewer', findings: [] }
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

const run = (input) => {
    let text = input
    try {
        text = JSON.stringify(complete(JSON.parse(input)))
    } catch {
        // not JSON: pass it through, so the malformed cases stay malformed
    }
    return spawnSync('node', [CLI, '-'], { input: text, encoding: 'utf8' }).status
}

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
    const { reviewed_by, ...noProvenance } = clean
    const res = validateEnvelope({ ...noProvenance, findings: [{ severity: 'major', criterion: 'ac:AC-001' }] })
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

test('a clean INLINE envelope is a self-accept and is rejected', () => {
    // This test previously asserted the opposite, on the premise that "nothing was
    // graded, so there is nothing to have graded independently". That premise is
    // wrong: `findings: []` is a verdict of "nothing wrong", which the severity->action
    // policy routes to accept. It is the self-serving output of an authoring context
    // grading its own work, and the original check let it through while rejecting a
    // self-review that found real problems - the gate backwards to its own threat.
    const res = validateEnvelope({ ...clean, reviewed_by: 'inline' })
    assert.equal(res.ok, false)
    assert.match(res.errors.join('\n'), /self-accept/)
})

test('a clean envelope with NO reviewed_by is also a self-accept', () => {
    const { reviewed_by, ...noProvenance } = clean
    assert.equal(validateEnvelope(noProvenance).ok, false)
})

test('a clean AGENT-graded envelope passes — that is a real accept', () => {
    assert.equal(validateEnvelope({ ...clean, reviewed_by: 'agent:spec-reviewer' }).ok, true)
})

test('the CLI exits 3 on an inline blocking grading', () => {
    const env = JSON.stringify(complete({ ...clean, reviewed_by: 'inline', findings: [{ severity: 'blocker', criterion: 'ac:AC-001' }] }))
    const res = spawnSync('node', [CLI, '-'], { input: env, encoding: 'utf8' })
    assert.equal(res.status, EXIT_MALFORMED)
})

// ── Content-addressed ids (SPEC-007 Lever 4, ADR-006) ─────────────────────────

const base = { location: 'Design > Lever 1', criterion: 'spec-schema:Design', finding: 'The cap is not stated.' }

test('AC-014: the same location key, criterion and finding give the same id in any round, and any change gives another', () => {
    const a = findingId(base, 'spec')
    assert.match(a, /^F-[0-9a-f]{8}$/)
    assert.equal(findingId({ ...base, severity: 'major' }, 'spec'), findingId({ ...base, severity: 'nit', suggested_fix: 'y' }, 'spec'))
    for (const field of ['location', 'criterion', 'finding']) {
        assert.notEqual(findingId({ ...base, [field]: `${base[field]}!` }, 'spec'), a, field)
    }
})

test('AC-015: a PR finding keeps its id when its line moves', () => {
    const f = { criterion: 'ac:AC-003', finding: 'AC not addressed' }
    assert.equal(findingId({ ...f, location: 'src/a.ts:40' }, 'pr'), findingId({ ...f, location: 'src/a.ts:57' }, 'pr'))
    assert.notEqual(findingId({ ...f, location: 'src/a.ts:40' }, 'pr'), findingId({ ...f, location: 'src/b.ts:40' }, 'pr'))
})

test('AC-016: a wrong id, or a missing id, location, criterion or finding, is a contract violation', () => {
    const good = stampEnvelope({ artifact: 'spec', reviewed_by: 'agent:spec-reviewer', findings: [{ severity: 'major', ...base }] })
    assert.equal(validateRaw(good).ok, true)
    const wrong = { ...good, findings: [{ ...good.findings[0], id: 'F-00000000' }] }
    assert.match(validateRaw(wrong).errors.join('\n'), /hashes to/)
    for (const field of ['id', 'location', 'finding']) {
        const { [field]: _, ...rest } = good.findings[0]
        assert.equal(validateRaw({ ...good, findings: [rest] }).ok, false, field)
    }
    const { criterion: _c, ...noCriterion } = good.findings[0]
    assert.equal(validateRaw({ ...good, findings: [noCriterion] }).ok, false, 'criterion')
    const res = spawnSync('node', [CLI, '-'], { input: JSON.stringify(wrong), encoding: 'utf8' })
    assert.equal(res.status, EXIT_MALFORMED)
})

test('AC-017: the citation alias is hashed as the criterion', () => {
    const { criterion, ...rest } = base
    const aliased = { ...rest, citation: criterion }
    assert.equal(findingId(aliased, 'spec'), findingId(base, 'spec'))
    const env = stampEnvelope({ artifact: 'spec', reviewed_by: 'agent:spec-reviewer', findings: [{ severity: 'nit', ...aliased }] })
    assert.equal(validateRaw(env).ok, true)
})

test('--stamp sets ids from content and validates, on stdin and in place', () => {
    const env = { artifact: 'spec', reviewed_by: 'agent:spec-reviewer', findings: [{ id: 'F-001', severity: 'major', ...base }] }
    const res = spawnSync('node', [CLI, '--stamp', '-'], { input: JSON.stringify(env), encoding: 'utf8' })
    assert.equal(res.status, EXIT_VALID, res.stderr)
    assert.equal(JSON.parse(res.stdout).findings[0].id, findingId(base, 'spec'))
    const dir = mkdtempSync(join(tmpdir(), 'sdlc-stamp-'))
    try {
        const file = join(dir, 'envelope.json')
        writeFileSync(file, JSON.stringify(env))
        assert.equal(spawnSync('node', [CLI, '--stamp', file], { encoding: 'utf8' }).status, EXIT_VALID)
        assert.equal(JSON.parse(readFileSync(file, 'utf8')).findings[0].id, findingId(base, 'spec'))
        writeFileSync(file, JSON.stringify(env))
        assert.equal(spawnSync('node', [CLI, file], { encoding: 'utf8' }).status, EXIT_MALFORMED, 'unstamped ordinal ids are rejected')
    } finally {
        rmSync(dir, { recursive: true, force: true })
    }
})
