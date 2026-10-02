// SPEC-007 Lever 5: the durable spec review log, the owner's rulings, projection and suppression.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { stampEnvelope } from './lib/finding-id.mjs'
import { appendRound, applyRulings, checkLog, emptyLog, project, resolveFinding } from './review-log.mjs'
import { symlinkSync, writeFileSync } from 'node:fs'
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
    assert.throws(() => appendRound(emptyLog('SPEC-100'), env(A), 2), /starts at round 1, not 2/)
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
    assert.match(checkLog(log, spec({ overrides: override(A, 'suggestion') })).join('\n'), /records suggestion/)
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

// ── Gate round 1 (PR #86) ────────────────────────────────────────────────────

const ruleWontfix = (log, f, disclosed = '') =>
    resolveFinding(log, spec({ overrides: wontfix(f), disclosed }), { id: idOf(f), resolution: 'wontfix', recordedBy: 'franklin', reason: 'r' })
const asSeverity = (f, severity) => {
    const e = stampEnvelope(env(f))
    e.findings[0].severity = severity
    return e
}

test('a ruling covers only the severity it was made at: raised higher, the finding routes and its entry reopens', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(B), 1)
    log = ruleWontfix(log, B)
    assert.equal(log.findings[0].ruled_severity, 'nit')
    const blocker = asSeverity(B, 'blocker')
    assert.deepEqual(applyRulings(blocker, log).findings.map((f) => f.severity), ['blocker'], 'a nit-level wontfix never drops a blocker')
    const next = appendRound(log, blocker, 2)
    const e = next.findings[0]
    assert.equal(e.resolution, 'open')
    assert.equal(e.superseded_ruling.resolution, 'wontfix')
    assert.deepEqual(checkLog(next, spec({ overrides: wontfix(B) })), [])
    assert.deepEqual(applyRulings(asSeverity(B, 'nit'), log).findings, [], 'at the ruled severity it is still dropped')
})

test('check holds a hand-written log to every rule resolve enforces', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(C), 1)
    const forged = structuredClone(log)
    Object.assign(forged.findings[0], { resolution: 'wontfix', recorded_by: 'mallory', reason: 'r', ruled_severity: 'blocker', date: 'd' })
    const body = `- finding_id: ${idOf(C)}\n  reviewer_severity: blocker\n  resolution: wontfix\n  override_date: 2026-10-02`
    const problems = checkLog(forged, spec({ overrides: body })).join('\n')
    assert.match(problems, /only the spec's owner/)
    assert.match(problems, /has no reason/)
    assert.match(problems, /Disclosed, not reviewed-clean/)
    const noSeverity = structuredClone(forged)
    Object.assign(noSeverity.findings[0], { recorded_by: 'franklin' })
    delete noSeverity.findings[0].ruled_severity
    assert.match(checkLog(noSeverity, spec({ overrides: wontfix(C), disclosed: idOf(C) })).join('\n'), /ruled_severity/)
    assert.match(checkLog({ ...log, spec: 'SPEC-999' }, spec(), 'SPEC-100').join('\n'), /named for SPEC-100/)
})

test('an amendment review restarts its policy round at 1 and continues the same log', () => {
    let log = appendRound(emptyLog('SPEC-100'), env(A), 1)
    log = appendRound(log, env(A), 2)
    log = appendRound(log, env(A), 3)
    assert.throws(() => appendRound(log, env(B), 1), /cannot follow its round 3/, 'the authoring review cannot go back to round 1')
    log = appendRound(log, env(B), 1, 'd', 'v2-amendment')
    assert.throws(() => appendRound(log, env(B), 3, 'd', 'v2-amendment'), /cannot follow its round 1/)
    log = appendRound(log, env(B), 2, 'd', 'v2-amendment')
    assert.deepEqual(log.rounds.map((r) => [r.round, r.review, r.review_round]), [[1, 'authoring', 1], [2, 'authoring', 2], [3, 'authoring', 3], [4, 'v2-amendment', 1], [5, 'v2-amendment', 2]])
    assert.deepEqual(log.findings.find((e) => e.id === idOf(B)).rounds, [4, 5])
    assert.equal(log.findings.find((e) => e.id === idOf(A)).resolution, 'fixed')
    assert.equal(project(log).round, 5)
})

test('apply refuses an invalid envelope, and append and apply refuse another spec\'s envelope', () => {
    const log = appendRound(emptyLog('SPEC-100'), env(A), 1)
    assert.throws(() => applyRulings(env({ ...A, location: 42 }), log), /not valid/)
    assert.throws(() => appendRound(log, { ...env(B), artifact_id: 'SPEC-999' }, 2), /for SPEC-999, not SPEC-100/)
    assert.throws(() => applyRulings({ ...env(B), artifact_id: 'SPEC-999' }, log), /for SPEC-999/)
})

test('the CLI exits 2 on a missing required flag, refuses a symlinked log, and check ignores the ledger', () => {
    const fx = layout2Repo()
    try {
        const specFile = write(fx.root, 'specs/SPEC-100-x.md', spec({ overrides: override(A, 'nit') }))
        write(fx.root, 'specs/decisions/SPEC-100.md', '# ledger, which a check must never read as the spec\n')
        const envFile = write(fx.root, 'r.json', JSON.stringify(env(A)))
        const run = (...a) => spawnSync(process.execPath, [SCRIPT, '--root', fx.root, ...a], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } })
        assert.equal(run('append', specFile, envFile).status, 2, 'no --round')
        assert.equal(run('resolve', specFile, idOf(A)).status, 2, 'no --resolution')
        assert.equal(run('append', specFile, envFile, '--round', '1').status, 0)
        assert.equal(run('resolve', specFile, idOf(A), '--resolution', 'overridden', '--owner-severity', 'nit', '--recorded-by', 'franklin', '--reason', 'r').status, 0)
        const checked = run('check')
        assert.equal(checked.status, 0, checked.stdout + checked.stderr)
        const logFile = join(fx.root, 'specs/review-logs/SPEC-100.json')
        const target = join(fx.root, 'elsewhere.json')
        writeFileSync(target, readFileSync(logFile, 'utf8'))
        rmSync(logFile)
        symlinkSync(target, logFile)
        const res = run('append', specFile, envFile, '--round', '1')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /symlink/)
    } finally {
        fx.cleanup()
    }
})
