// Tests for the legacy map's matching, rewrite and scan rules (SPEC-009 Design > Legacy map).
// These decide which bytes of an adopter's repo the migration changes, so each anchor
// rule and each flagged form is pinned, along with the near misses that must not match.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isHistory, mapEntries, mapPath, rewriteText, scanText } from './legacy-map.mjs'

const plugin = mapEntries()
const forked = mapEntries({ forked: true, projectTarget: '.sdlc/project.md' })
const always = () => true

test('mapPath maps prefixes and files, longest first', () => {
    assert.equal(mapPath('scripts/sdlc/validate-guide.mjs', plugin), '.sdlc/scripts/validate-guide.mjs')
    assert.equal(mapPath('.ai/sdlc/review-constraints.yaml', plugin), '.sdlc/review-constraints.yaml')
    assert.equal(mapPath('.ai/skills/review-primitives.md', plugin), '.sdlc/contracts/review-primitives.md')
    assert.equal(mapPath('.ai/skills/review-primitives.md', forked), '.sdlc/skills/review-primitives.md')
    assert.equal(mapPath('.ai/skills', forked), '.sdlc/skills')
    assert.equal(mapPath('templates/spec.md', plugin), '.sdlc/templates/spec.md')
    assert.equal(mapPath('templates/email.html', plugin), null, "an adopter's own template is not ours")
    assert.equal(mapPath('.ai/DESIGN.md', forked), null, 'a file the map does not cover stays')
})

test('root-relative paths are rewritten where anchored, and near misses are left alone', () => {
    const src = [
        'run: node scripts/sdlc/validate-guide.mjs',
        'see `.ai/project.md` and `specs/sdlc-state-machine.yaml`',
        'regex: ^(scripts/sdlc/|\\.ai/sdlc/)',
        'url: https://claude.ai/code',
        "import X from '@/components/templates/spec.md'",
        'plugin: ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/migrate-layout.mjs',
        'repo: $REPO_ROOT/scripts/sdlc/x.mjs and ${ROOT}/templates/guide.md',
        'backup: .ai/project.md.bak',
    ].join('\n')
    const { text } = rewriteText(src, { entries: plugin, oldRel: 'README.md' })
    assert.match(text, /node \.sdlc\/scripts\/validate-guide\.mjs/)
    assert.match(text, /`AGENTS\.md` and `\.sdlc\/state-machine\.yaml`/)
    assert.match(text, /\^\(\.sdlc\/scripts\/\|\\\.sdlc\/\)/, 'the regex escape is kept')
    assert.match(text, /https:\/\/claude\.ai\/code/)
    assert.match(text, /@\/components\/templates\/spec\.md/)
    assert.match(text, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/sdlc\/migrate-layout\.mjs/, 'the plugin path is never rewritten')
    assert.match(text, /\$REPO_ROOT\/\.sdlc\/scripts\/x\.mjs and \$\{ROOT\}\/\.sdlc\/templates\/guide\.md/)
    assert.match(text, /\.ai\/project\.md\.bak/)
})

test('a relative path is resolved before mapping and recomputed from the file\'s new location', () => {
    const existed = new Set(['.ai/sdlc/review-constraints.mjs', 'docs/runbooks/spec-execution.md'])
    const skill = rewriteText('import x from "../../sdlc/review-constraints.mjs"', {
        entries: forked,
        oldRel: '.ai/skills/pr-reviewer/SKILL.md',
        newRel: '.sdlc/skills/pr-reviewer/SKILL.md',
        existedBefore: (p) => existed.has(p),
    })
    assert.equal(skill.text, 'import x from "../../review-constraints.mjs"')
    const doc = rewriteText('[runbook](../docs/runbooks/spec-execution.md)', {
        entries: forked,
        oldRel: '.ai/sdlc.md',
        newRel: '.sdlc/agents/sdlc.md',
        existedBefore: (p) => existed.has(p),
    })
    assert.equal(doc.text, '[runbook](../../docs/runbooks/spec-execution.md)', 'an unmoved target is recomputed too')
    const untouched = rewriteText('see ../nowhere/x.md', { entries: forked, oldRel: '.ai/sdlc.md', newRel: '.sdlc/agents/sdlc.md' })
    assert.equal(untouched.text, 'see ../nowhere/x.md', 'a path that named nothing is left alone')
})

test('the scan flags each form a text rewrite cannot fix', () => {
    const code = [
        "const m = join(root, 'specs', 'sdlc-state-machine.yaml')",
        "const s = join(root, '.ai', 'skills')",
        "if (rel.startsWith('.ai/')) {}",
        "const t = join(HERE, '..', '..', 'skills')",
        'renderDbtContext(sm.domain_routing)',
        'const ALWAYS = [/^\\.ai\\//]',
    ].join('\n')
    const forms = scanText(code, { rel: '.sdlc/scripts/x.mjs', entries: forked, moved: true, depthChanged: true, existsNow: () => false }).map((h) => h.form)
    for (const f of ['quoted-segments', 'quoted-.ai', "'..'-join", 'domain_routing-read', 'escaped-regex']) assert.ok(forms.includes(f), f)
    const schema = scanText('{"required": ["phases", "domain_routing"]}', { rel: 'specs/schema/sm.schema.json', entries: forked })
    assert.deepEqual(schema.map((h) => h.form), ['schema-requires-domain_routing'])
    const skill = scanText('### Step 6: Update project.md — Workspace skills table', { rel: '.sdlc/skills/x/SKILL.md', entries: forked, inSkills: true })
    assert.deepEqual(skill.map((h) => h.form), ['workspace-table'])
})

test('the scan stays quiet on current paths, the plugin path, and loadMachine readers', () => {
    const clean = [
        'node .sdlc/scripts/validate-guide.mjs',
        'node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide',
        "import { x } from '../scripts/sdlc/lib/sdlc-paths.mjs'",
        'const m = loadMachine(root); route(m.domain_routing)',
    ].join('\n')
    assert.deepEqual(scanText(clean, { rel: 'hooks/h.mjs', entries: plugin, existsNow: always }), [])
})

test('isHistory leaves closed records and logs as written', () => {
    const texts = {
        'specs/SPEC-001-a.md': '---\nstatus: snapshot\n---\n',
        'specs/SPEC-002-b.md': '---\nstatus: active\n---\n',
        'specs/adrs/ADR-007-x.md': '---\nstatus: retired\n---\n',
        'specs/adrs/ADR-008-y.md': '---\nstatus: accepted\n---\n',
    }
    const ctx = { read: (r) => texts[r] ?? '', specStatus: (id) => (id === 'SPEC-001' ? 'snapshot' : 'active') }
    assert.equal(isHistory('specs/SPEC-001-a.md', ctx), true)
    assert.equal(isHistory('specs/SPEC-002-b.md', ctx), false)
    assert.equal(isHistory('specs/tasks/SPEC-001/GUIDE.md', ctx), true)
    assert.equal(isHistory('specs/tasks/SPEC-002/GUIDE.md', ctx), false)
    assert.equal(isHistory('specs/adrs/ADR-007-x.md', ctx), true)
    assert.equal(isHistory('specs/adrs/ADR-008-y.md', ctx), false)
    for (const r of ['specs/archive/specs/S.md', 'specs/review-logs/SPEC-002.json', 'specs/decisions/SPEC-002.md', 'specs/tasks/SPEC-002/DECISIONS.md', 'x/run.jsonl']) {
        assert.equal(isHistory(r, ctx), true, r)
    }
})

test('a relative path in a moved file is a hit only when the move broke it', () => {
    const forked = mapEntries({ forked: true })
    // After the move: .ai/skills/x/ -> .sdlc/skills/x/, and docs/guide.md is unmoved.
    const now = new Set(['.sdlc/skills/x/SKILL.md', 'docs/guide.md'])
    const existsNow = (p) => now.has(p)
    const scan = (text) =>
        scanText(text, { rel: '.sdlc/agents/setup.md', old: '.ai/setup.md', moved: true, entries: forked, existsNow }).map((h) => h.snippet)
    // From .ai/, ../docs/guide.md worked. From .sdlc/agents/ it does not.
    assert.deepEqual(scan('see ../docs/guide.md'), ['../docs/guide.md'])
    // A link into a moved directory is followed to its new place, which exists.
    assert.deepEqual(scan('see ./skills/x/SKILL.md'), ['./skills/x/SKILL.md'])
    // A cwd-relative command never resolved from .ai/, so the move did not break it.
    assert.deepEqual(scan('run ./tools/dev/setup-sdlc.sh'), [])
})

test("a moved file's '..' join is a hit only when its target is gone", () => {
    const forked = mapEntries({ forked: true })
    const now = new Set(['.sdlc/review-constraints.mjs'])
    const scan = (code) =>
        scanText(code, { rel: '.sdlc/__tests__/x.test.mjs', old: '.ai/sdlc/__tests__/x.test.mjs', moved: true, depthChanged: true, entries: forked, existsNow: (p) => now.has(p) })
            .filter((h) => h.form === "'..'-join")
            .map((h) => h.snippet)
    // The directory moved as a whole, so its sibling is still one level up.
    assert.deepEqual(scan("const pure = join(HERE, '..', 'review-constraints.mjs')"), [])
    // Two levels up from the old place was .ai/; from the new place it is the repo root.
    assert.deepEqual(scan("const P = join(here, '..', '..', 'skills', 'review-primitives.md')"), ["const P = join(here, '..', '..', 'skills', 'review-primitives.md')"])
})

test('code that reads the Workspaces section of project.md is a hit', () => {
    const forked = mapEntries({ forked: true })
    const code = "const path = join(root, '.sdlc', 'project.md')\nconst rows = sectionLines(text, 'Workspaces')\n"
    const hits = scanText(code, { rel: '.sdlc/scripts/validate-guide.mjs', entries: forked }).filter((h) => h.form === 'workspace-table-read')
    assert.deepEqual(hits.map((h) => h.line), [2])
    assert.deepEqual(scanText("const rows = config.workspaces // 'Workspaces'\n", { rel: 'a.mjs', entries: forked }), [])
})
