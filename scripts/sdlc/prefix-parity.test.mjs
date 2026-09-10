// PR-side prefix parity test (SPEC-006 / TASK-210, re-anchored by ADR-003).
//
// The canonical PR-side allowed-prefix set is owned by review-primitives.md's
// "PR-side canonical prefix table". Its consumers MUST stay in lockstep with it:
//   - the schema:    skills/review-envelope.schema.json -> properties.criterion.description
//   - the validator: scripts/sdlc/validate-review-envelope.mjs -> PR_SIDE_PREFIXES
//   - the reviewer:  skills/pr-reviewer/SKILL.md -> the GROUNDING block
//
// The third leg used to be the retired execute-spec Workflow's ALLOWED_PREFIX
// literal; ADR-003 deleted that engine and the envelope validator inherited the
// role of the runtime enforcer, so parity is asserted against it instead. Any
// divergence fails loudly so the contract cannot drift.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PR_SIDE_PREFIXES } from './validate-review-envelope.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..') // scripts/sdlc -> repo root

const PRIMITIVES = join(REPO, 'skills', 'review-primitives.md')
const SCHEMA = join(REPO, 'skills', 'review-envelope.schema.json')
const PRREVIEWER = join(REPO, '.ai', 'skills', 'pr-reviewer', 'SKILL.md')

const read = (p) => readFileSync(p, 'utf8')
const sorted = (s) => [...s].sort()

// (a) review-primitives.md — extract the `prefix:` values from the first column of the
//     "PR-side canonical prefix table". The table begins at the "#### PR-side canonical
//     prefix table" heading and ends at the next "####"/"---"/"##" boundary. Each data row
//     looks like: | `ac:` | `ac:AC-NNN` | ... |. We take the leading backtick-wrapped token
//     of the first cell, normalize it to its `word:` prefix, and collect the distinct set.
function parsePrimitives(md) {
    const start = md.indexOf('#### PR-side canonical prefix table')
    assert.notEqual(start, -1, 'PR-side canonical prefix table heading not found in review-primitives.md')
    const rest = md.slice(start + 1)
    // first section boundary after the heading line
    const endRel = rest.search(/\n(?:#### |## |---)/)
    const section = endRel === -1 ? rest : rest.slice(0, endRel)
    const set = new Set()
    for (const line of section.split('\n')) {
        const m = line.match(/^\s*\|\s*`([a-z]+:[^`]*)`/)
        if (!m) continue
        const firstCell = m[1]
        // header row is "| Prefix | ..." (no backticks) so it won't match; separators won't either.
        const prefix = firstCell.match(/^([a-z]+:)/)
        if (prefix) set.add(prefix[1])
    }
    assert.ok(set.size > 0, 'parsed zero prefixes from the PR-side canonical prefix table')
    return set
}

// (b) the runtime enforcer — the envelope validator's exported PR_SIDE_PREFIXES.
//     This is the set an ungrounded blocking finding is actually rejected against,
//     so it is the leg that must never silently diverge from the doc.
function parseValidator(prefixes) {
    assert.ok(Array.isArray(prefixes) && prefixes.length > 0, 'PR_SIDE_PREFIXES is not a non-empty array')
    return new Set(prefixes)
}

// (c) review-envelope.schema.json — read criterion.description and parse the explicit
//     machine-parseable list `PR_SIDE_PREFIXES = [ac:, adr:, ...]` it carries. Keying off
//     that delimited list (rather than scanning the surrounding prose) avoids capturing
//     incidental `word:` tokens from example citations or sentence wording.
function parseSchema(jsonText) {
    const schema = JSON.parse(jsonText)
    const desc = schema?.properties?.findings?.items?.properties?.criterion?.description
    assert.ok(typeof desc === 'string' && desc.length, 'criterion.description not found in schema')
    const listMatch = desc.match(/PR_SIDE_PREFIXES\s*=\s*\[([^\]]*)\]/)
    assert.ok(listMatch, 'PR_SIDE_PREFIXES = [...] list not found in criterion.description')
    const set = new Set()
    for (const m of listMatch[1].matchAll(/([a-z]+:)/g)) set.add(m[1])
    assert.ok(set.size > 0, 'parsed zero prefixes from PR_SIDE_PREFIXES list')
    // The PR-side list must never carry spec-side-only prefixes. Guard explicitly:
    for (const banned of ['spec-schema:', 'spec-authoring:', 'intent:']) {
        assert.ok(!set.has(banned), `schema criterion PR_SIDE_PREFIXES leaked spec-side prefix ${banned}`)
    }
    return set
}

test('PR-side prefix set is identical across review-primitives.md, the validator, and the schema', () => {
    const fromPrimitives = parsePrimitives(read(PRIMITIVES))
    const fromValidator = parseValidator(PR_SIDE_PREFIXES)
    const fromSchema = parseSchema(read(SCHEMA))

    assert.deepEqual(
        sorted(fromValidator),
        sorted(fromPrimitives),
        `validate-review-envelope.mjs PR_SIDE_PREFIXES diverges from review-primitives.md PR-side table.\n  primitives: ${sorted(fromPrimitives)}\n  validator:  ${sorted(fromValidator)}`
    )
    assert.deepEqual(
        sorted(fromSchema),
        sorted(fromPrimitives),
        `schema criterion diverges from review-primitives.md PR-side table.\n  primitives: ${sorted(fromPrimitives)}\n  schema:     ${sorted(fromSchema)}`
    )
})

// (d) pr-reviewer/SKILL.md — the GROUNDING block instructs reviewers which prefixes to cite.
//     It must cite the canonical PR-side set in colon form and must NOT instruct a legacy bare
//     form (AC-NNN / ADR-NNN / sdlc-code-standards:) that the validator rejects — otherwise a
//     reviewer obeying its own skill gets escalated as ungrounded (SPEC-006 AC).
function groundingBlock(md) {
    const g = md.indexOf('GROUNDING')
    assert.notEqual(g, -1, 'GROUNDING block not found in pr-reviewer/SKILL.md')
    const after = md.slice(g)
    const end = after.indexOf('\nSEVERITY')
    return end === -1 ? after : after.slice(0, end)
}

test('pr-reviewer GROUNDING cites the canonical PR-side prefixes in colon form, with no legacy bare forms', () => {
    const block = groundingBlock(read(PRREVIEWER))
    const canonical = parsePrimitives(read(PRIMITIVES))
    // coverage: every canonical colon-prefix is cited
    for (const p of canonical) {
        assert.ok(block.includes(p), `pr-reviewer GROUNDING does not cite canonical PR-side prefix ${p}`)
    }
    // regression guard: no BARE legacy form (AC-NNN not as ac:AC-NNN, ADR-NNN not as adr:ADR-NNN,
    // and no sdlc-code-standards: — replaced by std:). Lookbehind exempts the canonical colon form.
    assert.ok(!/(?<!ac:)AC-NNN/.test(block), 'pr-reviewer GROUNDING still instructs the bare legacy form AC-NNN (the validator rejects it)')
    assert.ok(!/(?<!adr:)ADR-NNN/.test(block), 'pr-reviewer GROUNDING still instructs the bare legacy form ADR-NNN (the validator rejects it)')
    assert.ok(!block.includes('sdlc-code-standards:'), 'pr-reviewer GROUNDING still instructs sdlc-code-standards: (replaced by std:)')
})

test('every PR-side canonical prefix is accepted by the validator (startsWith semantics)', () => {
    const fromPrimitives = parsePrimitives(read(PRIMITIVES))
    // A sample criterion for each prefix must be grounded by some allowed prefix.
    for (const p of fromPrimitives) {
        const sample = `${p}example`
        assert.ok(
            PR_SIDE_PREFIXES.some((a) => sample.startsWith(a)),
            `canonical prefix ${p} is NOT accepted by PR_SIDE_PREFIXES (${PR_SIDE_PREFIXES.join(', ')})`
        )
    }
})
