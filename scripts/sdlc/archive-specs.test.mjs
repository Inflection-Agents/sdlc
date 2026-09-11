// Tests for the archive boundary (the enforcement-tiers plan (M3)).
//
// `archivable` is pure so the denylist rules can be tested without touching the
// filesystem. The two guards below were shipped as blockers downstream before this
// port; both are cheap to hold and expensive to discover after a `git mv`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { archivable, LIVE_STATUSES, statusOf, isCompanion } from './archive-specs.mjs'

const spec = (id, status) => ({ id, status, path: `specs/${id}-x.md` })
const noProtection = { citedIds: new Set(), adrBoundIds: new Set() }

test('draft and active specs are never archivable', () => {
    assert.ok(LIVE_STATUSES.has('draft'))
    assert.ok(LIVE_STATUSES.has('active'))
    assert.deepEqual(archivable([spec('SPEC-010', 'active'), spec('SPEC-011', 'draft')], noProtection), [])
})

test('a completed spec with no protection is archivable', () => {
    assert.deepEqual(
        archivable([spec('SPEC-012', 'completed')], noProtection).map((s) => s.id),
        ['SPEC-012']
    )
})

test('denylist clause 1: a spec cited as spec of record is exempt', () => {
    const p = { citedIds: new Set(['SPEC-001']), adrBoundIds: new Set() }
    assert.deepEqual(archivable([spec('SPEC-001', 'completed')], p), [])
})

test('denylist clause 2: a spec bound by a live ADR is exempt', () => {
    const p = { citedIds: new Set(), adrBoundIds: new Set(['SPEC-006']) }
    assert.deepEqual(archivable([spec('SPEC-006', 'completed')], p), [])
})

test('superseded and cancelled are archivable - replaced is not protected', () => {
    const out = archivable([spec('SPEC-013', 'superseded'), spec('SPEC-014', 'cancelled')], noProtection)
    assert.deepEqual(
        out.map((s) => s.id).sort(),
        ['SPEC-013', 'SPEC-014']
    )
})

test('an unreadable status is treated as live, not archived', () => {
    assert.deepEqual(archivable([{ id: 'SPEC-015', status: null, path: 'x' }], noProtection), [])
})

// ── Status is read from frontmatter only ──────────────────────────────────────
// specs/SPEC-004 carries a template line `status: open | resolved | wontfix` in its
// BODY, so a bare `^status:` scan returns two values for that file.

test('statusOf reads the leading frontmatter block, not a body line', () => {
    const doc = ['---', 'id: SPEC-020', 'status: active', '---', '', '## Template', '', 'status: completed', ''].join(
        '\n'
    )
    assert.equal(statusOf(doc), 'active')
})

test('statusOf returns null when there is no frontmatter, so the spec stays live', () => {
    assert.equal(statusOf('# just a heading\n\nstatus: completed\n'), null)
})

test('a body status line cannot make a live spec archivable', () => {
    const doc = ['---', 'id: SPEC-021', 'status: active', '---', 'status: completed'].join('\n')
    assert.deepEqual(archivable([{ id: 'SPEC-021', status: statusOf(doc), path: 'x' }], noProtection), [])
})

// ── Companion sub-documents ───────────────────────────────────────────────────
// A companion declares `parent_spec` instead of its own `id`. The task tree is
// resolved from the FILENAME's id, so archiving a companion on its own would drag a
// LIVE parent's task tree behind the fence with no warning. Shipped as a blocker
// downstream; this repo has no companions today, so the guard is preventive.

test('isCompanion detects parent_spec without an id of its own', () => {
    assert.ok(isCompanion('---\nparent_spec: SPEC-016\nstatus: completed\n---\n'))
    assert.equal(isCompanion('---\nid: SPEC-016\nstatus: completed\n---\n'), false)
})

test('a companion is never archived on its own', () => {
    const rows = [{ id: 'SPEC-016', status: 'completed', path: 'x', companion: true }]
    assert.deepEqual(archivable(rows, noProtection), [])
})

// ── The fence must exist in a CONSUMING repo, not just this one ────────────────
// The fences were hand-committed upstream, so a repo that copied the framework got
// archiving with zero retrieval effect - a plain `git mv`. The archiver writes them.

test('ensureFence is exercised: archiving writes a .ignore beside what it moves', async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const repo = mkdtempSync(join(tmpdir(), 'sdlc-consumer-'))
    try {
        const git = (args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
        git(['init', '-q', '.'])
        git(['config', 'user.email', 't@t'])
        git(['config', 'user.name', 't'])
        mkdirSync(join(repo, 'specs'), { recursive: true })
        mkdirSync(join(repo, 'scripts', 'sdlc'), { recursive: true })
        for (const f of ['archive-specs.mjs']) {
            writeFileSync(join(repo, 'scripts', 'sdlc', f), readFileSync(join(import.meta.dirname, f), 'utf8'))
        }
        writeFileSync(join(repo, 'specs', 'SPEC-009-demo.md'), '---\nid: SPEC-009\nstatus: completed\n---\n\nbody\n')
        git(['add', '-A'])
        git(['commit', '-qm', 'init'])

        execFileSync('node', [join(repo, 'scripts', 'sdlc', 'archive-specs.mjs')], { cwd: repo, encoding: 'utf8' })

        assert.ok(existsSync(join(repo, 'specs', 'archive', '.ignore')), 'archive root fence')
        assert.ok(existsSync(join(repo, 'specs', 'archive', 'specs', '.ignore')), 'archived-specs fence')
        assert.equal(readFileSync(join(repo, 'specs', 'archive', 'specs', '.ignore'), 'utf8').trim(), '*')
        assert.ok(existsSync(join(repo, 'specs', 'archive', 'specs', 'SPEC-009-demo.md')), 'spec moved')
    } finally {
        rmSync(repo, { recursive: true, force: true })
    }
})

// ── Clause 1 must read the skill tree WHERE IT ACTUALLY LIVES ─────────────────
// This framework authors its skills at `skills/`; a repo that adopted the framework
// receives them at `.ai/skills/` and has no top-level `skills/`. A scanner that only
// read `skills/` collected nothing in every consuming repo, so clause 1 protected
// nothing there — the false-archive direction the denylist exists to prevent.

const withRepo = async (fn) => {
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const repo = mkdtempSync(join(tmpdir(), 'sdlc-cited-'))
    try {
        return await fn(repo)
    } finally {
        rmSync(repo, { recursive: true, force: true })
    }
}

test('clause 1 collects a citation from .ai/skills (the consuming-repo layout)', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { collectCitedIds } = await import('./archive-specs.mjs')

    await withRepo((repo) => {
        mkdirSync(join(repo, '.ai', 'skills', 'pr-reviewer'), { recursive: true })
        writeFileSync(join(repo, '.ai', 'skills', 'pr-reviewer', 'SKILL.md'), 'Defined by SPEC-001.\n')
        assert.equal(existsSync(join(repo, 'skills')), false, 'fixture has no top-level skills/')
        assert.deepEqual([...collectCitedIds(repo)], ['SPEC-001'])
    })
})

test('clause 1 still collects a citation from skills/ (this framework repo layout)', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { collectCitedIds } = await import('./archive-specs.mjs')

    await withRepo((repo) => {
        mkdirSync(join(repo, 'skills', 'pr-reviewer'), { recursive: true })
        writeFileSync(join(repo, 'skills', 'pr-reviewer', 'SKILL.md'), 'Defined by SPEC-002.\n')
        assert.deepEqual([...collectCitedIds(repo)], ['SPEC-002'])
    })
})

test('a .ai/skills symlink to skills/ resolves to the same ids, without error', async () => {
    const { mkdirSync, writeFileSync, symlinkSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { collectCitedIds } = await import('./archive-specs.mjs')

    await withRepo((repo) => {
        mkdirSync(join(repo, 'skills'), { recursive: true })
        mkdirSync(join(repo, '.ai'), { recursive: true })
        writeFileSync(join(repo, 'skills', 'review-primitives.md'), 'See SPEC-004 and SPEC-004.\n')
        symlinkSync('../skills', join(repo, '.ai', 'skills'))
        // Double-walking a symlinked root is invisible in a Set, so this asserts the
        // reachable property: the layout this repo actually has resolves cleanly.
        assert.deepEqual([...collectCitedIds(repo)], ['SPEC-004'])
    })
})

test('regression: a consuming repo does not archive a spec its .ai/skills still cites', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { collectCitedIds, archivable } = await import('./archive-specs.mjs')

    await withRepo((repo) => {
        mkdirSync(join(repo, '.ai', 'skills'), { recursive: true })
        mkdirSync(join(repo, 'specs'), { recursive: true })
        writeFileSync(join(repo, '.ai', 'skills', 'review-primitives.md'), 'Grades against SPEC-007.\n')
        const cited = collectCitedIds(repo, new Set(['SPEC-007']))
        const out = archivable([spec('SPEC-007', 'completed')], { citedIds: cited, adrBoundIds: new Set() })
        assert.deepEqual(out, [], 'cited spec must stay in the live corpus')
    })
})
