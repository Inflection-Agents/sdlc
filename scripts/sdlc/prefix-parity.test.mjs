// PR-side prefix parity test (SPEC-006 / TASK-210).
//
// The canonical PR-side allowed-prefix set is owned by review-primitives.md's
// "PR-side canonical prefix table" (SPEC-001 contract). Two consumers MUST stay
// in lockstep with it:
//   - the engine: .claude/workflows/execute-spec.js  -> ALLOWED_PREFIX array literal
//   - the schema: .ai/skills/review-envelope.schema.json -> properties.criterion.description
//
// This test parses the PR-side prefix set from each of the three sources WITHOUT
// importing the engine (a Workflow-runtime script, not importable) and asserts the
// three are set-equal. Any divergence fails loudly so the contract cannot drift.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..') // scripts/sdlc -> repo root

const PRIMITIVES = join(REPO, '.ai', 'skills', 'review-primitives.md')
const ENGINE = join(REPO, '.claude', 'workflows', 'execute-spec.js')
const SCHEMA = join(REPO, '.ai', 'skills', 'review-envelope.schema.json')

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

// (b) execute-spec.js — pull the ALLOWED_PREFIX array literal and extract its string entries.
function parseEngine(js) {
    const m = js.match(/const\s+ALLOWED_PREFIX\s*=\s*\[([^\]]*)\]/)
    assert.ok(m, 'ALLOWED_PREFIX array literal not found in execute-spec.js')
    const set = new Set()
    for (const lit of m[1].matchAll(/['"]([^'"]+)['"]/g)) set.add(lit[1])
    assert.ok(set.size > 0, 'parsed zero prefixes from ALLOWED_PREFIX')
    return set
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

test('PR-side prefix set is identical across review-primitives.md, ALLOWED_PREFIX, and the schema', () => {
    const fromPrimitives = parsePrimitives(read(PRIMITIVES))
    const fromEngine = parseEngine(read(ENGINE))
    const fromSchema = parseSchema(read(SCHEMA))

    assert.deepEqual(
        sorted(fromEngine),
        sorted(fromPrimitives),
        `ALLOWED_PREFIX diverges from review-primitives.md PR-side table.\n  primitives: ${sorted(fromPrimitives)}\n  engine:     ${sorted(fromEngine)}`
    )
    assert.deepEqual(
        sorted(fromSchema),
        sorted(fromPrimitives),
        `schema criterion diverges from review-primitives.md PR-side table.\n  primitives: ${sorted(fromPrimitives)}\n  schema:     ${sorted(fromSchema)}`
    )
})

test('every PR-side canonical prefix is accepted by ALLOWED_PREFIX (startsWith semantics)', () => {
    const fromPrimitives = parsePrimitives(read(PRIMITIVES))
    const allowed = [...parseEngine(read(ENGINE))]
    // A sample criterion for each prefix must be grounded by some allowed prefix.
    for (const p of fromPrimitives) {
        const sample = `${p}example`
        assert.ok(
            allowed.some((a) => sample.startsWith(a)),
            `canonical prefix ${p} is NOT accepted by ALLOWED_PREFIX (${allowed.join(', ')})`
        )
    }
})
