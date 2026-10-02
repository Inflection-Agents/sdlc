// SPEC-007 Lever 5: the durable spec review log, the owner's rulings, projection and suppression.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stampEnvelope } from './lib/finding-id.mjs'
import { appendRound, applyRulings, checkLog, emptyLog, project, resolveFinding } from './review-log.mjs'
import { layout2Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./review-log.mjs', import.meta.url))

const A = { severity: 'major', criterion: 'spec-schema:Design', location: 'Design', finding: 'The cap is not stated.' }
const B = { severity: 'nit', criterion: 'spec-authoring:wording', location: 'Problem', finding: 'A word is vague.' }
const C = { severity: 'blocker', criterion: 'spec-schema:Scope', location: 'Scope', finding: 'Out of scope is empty.' }
const env = (...findings) => ({ artifact: 'spec', artifact_id: 'SPEC-100', reviewed_by: 'agent:spec-reviewer', findings })
const idOf = (f) => stampEnvelope(env(f)).findings[0].id

function spec({ owner = 'franklin', overrides = '', disclosed = '' } = {}) {
    return [
        '---',
        'id: SPEC-100',
        `owner: ${owner}`,
        '---',
        '',
        '## Problem',
        '',
        'x',
        overrides && `\n## spec_review_overrides\n\n\`\`\`yaml\n${overrides}\n\`\`\``,
        disclosed && `\n## Disclosed, not reviewed-clean\n\n${disclosed}`,
        '',
    ].join('\n')
}

const override = (f, owner_severity) =>
    `- finding_id: ${idOf(f)}\n  reviewer_severity: ${f.severity}\n  owner_severity: ${owner_severity}\n  reason: "Intentional."\n  override_date: 2026-10-02`
const wontfix = (f) => `- finding_id: ${idOf(f)}\n  reviewer_severity: ${f.severity}\n  resolution: wontfix\n  reason: "Out of reach."\n  override_date: 2026-10-02`

const twoRounds = () => appendRound(appendRound(emptyLog('SPEC-100'), env(A, B), 1, 'd1'), env(A), 2, 'd2')

test('AC-019: the log records every finding with its id, first_round, rounds and resolution', () => {
    const log = twoRounds()
    const a = log.findings.find((e) => e.id === idOf(A))
    const b = log.findings.find((e) => e.id === idOf(B))
    assert.deepEqual([a.first_round, a.rounds, a.resolution], [1, [1, 2], 'open'])
    assert.deepEqual([b.first_round, b.rounds, b.resolution, b.fixed_in], [1, [1], 'fixed', 2])
    assert.deepEqual(log.rounds.map((r) => r.round), [1, 2])
})

test('a second envelope in the same round neither fixes nor duplicates the first one\'s findings', () => {
    const one = appendRound(emptyLog('SPEC-100'), env(A), 1)
    const both = appendRound(one, env(A, B), 1)
    assert.equal(both.findings.length, 2)
    assert.ok(both.findings.every((e) => e.resolution === 'open' && e.rounds.length === 1))
    const r2 = appendRound(both, env(B), 2)
    const reopened = appendRound(r2, env(A), 2)
    assert.equal(reopened.findings.find((e) => e.id === idOf(A)).resolution, 'open', 'reopened within round 2')
})

test('a round out of order, an invalid envelope and a PR envelope are refused', () => {
    assert.throws(() => appendRound(emptyLog('SPEC-100'), env(A), 2), /cannot follow round 0/)
    assert.throws(() => appendRound(emptyLog('SPEC-100'), env({ ...A, location: undefined }), 1), /not valid/)
    assert.throws(() => appendRound(emptyLog('SPEC-100'), { ...env(A), artifact: 'pr', findings: [{ ...A, criterion: 'ac:AC-001' }] }, 1), /spec reviews/)
    assert.throws(() => appendRound(emptyLog('SPEC-100'), { ...env(), reviewer_status: 'abstained' }, 1), /abstained/)
})

test('AC-005: a ruling is refused unless the owner records it and the spec body shows the same ruling', () => {
    const log = twoRounds()
    const ok = { id: idOf(A), resolution: 'overridden', recordedBy: 'franklin', reason: 'Intentional.', ownerSeverity: 'nit' }
    const paired = spec({ overrides: override(A, 'nit') })
    assert.equal(resolveFinding(log, paired, ok).findings.find((e) => e.id === idOf(A)).owner_severity, 'nit')
    assert.throws(() => resolveFinding(log, paired, { ...ok, recordedBy: 'claude' }), /only the spec's owner/)
    assert.throws(() => resolveFinding(log, spec(), ok), /no spec_review_overrides entry/)
    assert.throws(() => resolveFinding(log, spec({ overrides: override(A, 'suggestion') }), ok), /records suggestion/)
    assert.throws(() => resolveFinding(log, paired, { ...ok, reason: '' }), /--reason/)
    const w = { id: idOf(A), resolution: 'wontfix', recordedBy: 'franklin', reason: 'Out of reach.' }
    assert.throws(() => resolveFinding(log, paired, w), /lacks resolution: wontfix/)
    assert.throws(() => resolveFinding(log, spec({ overrides: wontfix(A) }), w), /Disclosed, not reviewed-clean/)
    const disclosed = spec({ overrides: wontfix(A), disclosed: `- id: ${idOf(A)}` })
    assert.equal(resolveFinding(log, disclosed, w).findings.find((e) => e.id === idOf(A)).resolution, 'wontfix')
})

test('AC-005: a refused ruling writes nothing', () => {
    const fx = layout2Repo()
    try {
        const specFile = write(fx.root, 'specs/SPEC-100-x.md', spec({ overrides: override(A, 'nit') }))
        const envFile = write(fx.root, 'round1.json', JSON.stringify(env(A, B)))
        const cli = (...a) => spawnSync(process.execPath, [SCRIPT, '--root', fx.root, ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } })
        assert.equal(cli('append', specFile, envFile, '--round', '1').status, 0)
        const logFile = join(fx.root, 'specs/review-logs/SPEC-100.json')
        const before = readFileSync(logFile, 'utf8')
        const bad = cli('resolve', specFile, idOf(A), '--resolution', 'overridden', '--recorded-by', 'claude', '--reason', 'x', '--owner-severity', 'nit')
        assert.equal(bad.status, 1)
        assert.match(bad.stderr, /nothing written/)
        assert.equal(readFileSync(logFile, 'utf8'), before)
        const good = cli('resolve', specFile, idOf(A), '--resolution', 'overridden', '--recorded-by', 'franklin', '--reason', 'x', '--owner-severity', 'nit')
        assert.equal(good.status, 0, good.stderr)
        assert.equal(cli('check').status, 0)
    } finally {
        fx.cleanup()
    }
})

test('AC-018: apply drops a wontfix and routes an override at the owner severity, from the log alone', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(A, B, C), 1)
    log = resolveFinding(log, spec({ overrides: override(A, 'nit') }), { id: idOf(A), resolution: 'overridden', recordedBy: 'franklin', reason: 'r', ownerSeverity: 'nit' })
    log = resolveFinding(log, spec({ overrides: wontfix(C), disclosed: idOf(C) }), { id: idOf(C), resolution: 'wontfix', recordedBy: 'franklin', reason: 'r' })
    const routed = applyRulings(env(A, B, C), log)
    assert.deepEqual(routed.findings.map((f) => [f.id, f.severity]), [[idOf(A), 'nit'], [idOf(B), 'nit']])
    assert.equal(routed.findings[0].reviewer_severity, 'major')
    const lower = applyRulings(env({ ...A, severity: 'major' }), log)
    assert.equal(lower.findings[0].severity, 'nit')
})

test('SC-4: an override never raises a finding above the reviewer severity', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(A), 1)
    log = resolveFinding(log, spec({ overrides: override(A, 'nit') }), { id: idOf(A), resolution: 'overridden', recordedBy: 'franklin', reason: 'r', ownerSeverity: 'nit' })
    // the same id later raised as a suggestion: routing at the owner's nit would raise it
    const later = stampEnvelope(env(A))
    later.findings[0].severity = 'suggestion'
    assert.equal(applyRulings(later, log).findings[0].severity, 'suggestion')
})

test('AC-020: previous_output is projected from the latest round of the log', () => {
    const out = project(twoRounds())
    assert.equal(out.round, 2)
    assert.deepEqual(out.findings.map((f) => f.id), [idOf(A)])
    assert.deepEqual(Object.keys(out.findings[0]).sort(), ['carried_forward_from_previous', 'criterion', 'finding', 'id', 'location', 'severity', 'suggested_fix'])
    assert.equal(project(emptyLog('SPEC-100')), null)
})

test('check reports a log ruling the spec body does not show', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(A), 1)
    log = resolveFinding(log, spec({ overrides: override(A, 'nit') }), { id: idOf(A), resolution: 'overridden', recordedBy: 'franklin', reason: 'r', ownerSeverity: 'nit' })
    assert.deepEqual(checkLog(log, spec({ overrides: override(A, 'nit') })), [])
    assert.match(checkLog(log, spec()).join('\n'), /no spec_review_overrides entry/)
    assert.match(checkLog(log, spec({ overrides: override(A, 'suggestion') })).join('\n'), /differs/)
})

test('the CLI writes the log under specs/review-logs and exits 2 on usage', () => {
    const fx = layout2Repo()
    try {
        const specFile = write(fx.root, 'specs/SPEC-100-x.md', spec())
        const envFile = write(fx.root, 'r.json', JSON.stringify(env(A)))
        const run = (...a) => spawnSync(process.execPath, [SCRIPT, '--root', fx.root, ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } })
        assert.equal(run('append', specFile, envFile, '--round', '1').status, 0)
        assert.ok(existsSync(join(fx.root, 'specs/review-logs/SPEC-100.json')))
        assert.equal(JSON.parse(run('project', specFile).stdout).findings.length, 1)
        assert.equal(run('bogus').status, 2)
    } finally {
        fx.cleanup()
    }
})
