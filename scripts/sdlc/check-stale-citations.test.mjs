// Tests for the stale-citation gate (the enforcement-tiers plan (M4)).
//
// Scoped by BLAST RADIUS, not by document. A superseded decision cited as current
// in always-loaded context is what misleads an agent on its next run; the same
// citation in a spec body or a test name is legitimate history. A gate that cries
// wolf on the second case gets deleted, which is how the first case survives.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { blastRadius, classify, isAcknowledged, supersededIds } from './check-stale-citations.mjs'

test('always-loaded paths are hard failures', () => {
    assert.equal(blastRadius('.ai/CLAUDE.md'), 'fail')
    assert.equal(blastRadius('.ai/skills/pr-reviewer/SKILL.md'), 'fail')
    assert.equal(blastRadius('.ai/sdlc.md'), 'fail')
})

test('spec bodies and tests are reported, not failed', () => {
    assert.equal(blastRadius('specs/SPEC-002-x.md'), 'report')
    assert.equal(blastRadius('scripts/sdlc/foo.test.mjs'), 'report')
    assert.equal(blastRadius('docs/plans/a-plan.md'), 'report')
})

test('the ADR that records a supersession is not graded against itself', () => {
    assert.equal(blastRadius('specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md'), 'skip')
})

test('a line naming the successor counts as acknowledged', () => {
    assert.ok(isAcknowledged('ADR-003 (superseded by ADR-004) said X', 'ADR-003', 'ADR-004'))
    assert.ok(isAcknowledged('see ADR-003, now ADR-004', 'ADR-003', 'ADR-004'))
    assert.equal(isAcknowledged('per ADR-003, the gate is uncapped', 'ADR-003', 'ADR-004'), false)
})

test('acknowledgement requires the successor, not merely any other id', () => {
    assert.equal(isAcknowledged('ADR-003 and ADR-001 both apply', 'ADR-003', 'ADR-004'), false)
})

test('a ROW-level reversal is not a document supersession', () => {
    // ADR-003 has one row reversed by ADR-004 and is otherwise live authority. An
    // earlier revision matched the inline row annotation and flagged all 97 valid
    // citations of ADR-003's other rows, 32 as build failures. No automated check
    // can tell which row a citation relies on; that is a reviewer's judgment.
    const docs = [
        {
            id: 'ADR-003',
            text: '---\nid: ADR-003\nstatus: accepted\nsuperseded_by:\n---\n\n| x | **SUPERSEDED by ADR-004 at the gate** | y |'
        }
    ]
    assert.deepEqual([...supersededIds(docs)], [])
})

test('supersededIds reads a frontmatter superseded_by', () => {
    const docs = [{ id: 'ADR-009', text: '---\nid: ADR-009\nsuperseded_by: ADR-010\n---\n' }]
    assert.deepEqual([...supersededIds(docs)], [['ADR-009', 'ADR-010']])
})

test('an ADR with neither marker is not superseded', () => {
    const docs = [{ id: 'ADR-001', text: '---\nid: ADR-001\nsuperseded_by:\n---\nbody' }]
    assert.deepEqual([...supersededIds(docs)], [])
})

// ── The failure path, exercised by fixture ────────────────────────────────────
// This repo has no wholly-superseded ADR, so the corpus cannot exercise the FAIL
// branch. A gate whose failure branch has never run is a gate nobody has tested.

const superseded = new Map([['ADR-900', 'ADR-901']])

test('a stale citation in always-loaded context is a build failure', () => {
    const files = [{ path: '.ai/skills/some-skill/SKILL.md', text: 'always follow ADR-900 here' }]
    const { failures, reports } = classify(files, superseded)
    assert.equal(failures.length, 1)
    assert.equal(reports.length, 0)
    assert.match(failures[0], /ADR-900/)
})

test('the same citation in a spec body is reported, not failed', () => {
    const files = [{ path: 'specs/SPEC-099-x.md', text: 'decided under ADR-900' }]
    const { failures, reports } = classify(files, superseded)
    assert.equal(failures.length, 0)
    assert.equal(reports.length, 1)
})

test('naming the successor clears the failure', () => {
    const files = [{ path: '.ai/CLAUDE.md', text: 'ADR-900 (superseded by ADR-901) applied then' }]
    assert.deepEqual(classify(files, superseded), { failures: [], reports: [] })
})

test('the ADR corpus is skipped, so a supersession record is not its own defect', () => {
    const files = [{ path: 'specs/adrs/ADR-900-old.md', text: 'ADR-900 body' }]
    assert.deepEqual(classify(files, superseded), { failures: [], reports: [] })
})

test('top-level skills/ and agents/ are always-loaded', () => {
    // After the plugin restructure these are the REAL locations and .ai/skills and
    // .claude/agents are symlinks the walker skips. Without them in ALWAYS_LOADED the
    // framework's own instruction files silently drop to `report`, so a superseded
    // decision cited as current in a skill would stop failing the build.
    assert.equal(blastRadius('skills/spec-execution/SKILL.md'), 'fail')
    assert.equal(blastRadius('agents/task-reviewer.md'), 'fail')
    assert.equal(blastRadius('skills/review-primitives.md'), 'fail')
})

test('a test file under the new locations is still history, not always-loaded', () => {
    assert.equal(blastRadius('skills/review-primitives/examples/x.test.mjs'), 'report')
})
