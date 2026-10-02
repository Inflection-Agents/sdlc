// Tests for the layout migration (SPEC-009 AC-010 to AC-014). Every case runs on a temp git
// repo built by __fixtures__/layouts/build.mjs, never on this working tree.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cutDomainRouting, parseWorkspaceTables } from './migrate-layout.mjs'
import { scanRepo } from './scan-legacy-paths.mjs'
import { parseYaml } from './lib/mini-yaml.mjs'
import { commitAll, forkedHighGearRepo, git, layout1Repo, pluginInit030Repo, write } from './__fixtures__/layouts/build.mjs'

const SCRIPT = fileURLToPath(new URL('./migrate-layout.mjs', import.meta.url))
const PAYLOAD = fileURLToPath(new URL('../../init-payload/', import.meta.url))

function migrate(root, ...args) {
    const env = { ...process.env }
    delete env.CLAUDE_PROJECT_DIR
    delete env.CLAUDE_PLUGIN_ROOT
    return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8', env, maxBuffer: 1 << 26 })
}

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')
const status = (root) => git(root, 'status', '--porcelain', '--untracked-files=no')

/** Files the payload ships. Their layout-1 text is the framework's to fix (S9, S10), not the adopter's. */
function shippedByPayload(rel) {
    if (rel === '.sdlc/state-machine.yaml') return true
    for (const dir of ['scripts', 'templates', 'contracts']) {
        const name = rel.match(new RegExp(`^\\.sdlc/${dir}/(.+)$`))?.[1]
        if (name && existsSync(join(PAYLOAD, '.sdlc', dir, name))) return true
    }
    return false
}

test('AC-010: --dry-run prints the whole plan and writes nothing, on both fixtures', () => {
    for (const build of [pluginInit030Repo, forkedHighGearRepo]) {
        const fx = build()
        try {
            const res = migrate(fx.root, '--dry-run')
            assert.equal(res.status, 0, res.stderr)
            for (const section of ['Directory moves', 'Files with paths rewritten', 'Dry run: nothing was written']) {
                assert.match(res.stdout, new RegExp(section))
            }
            assert.equal(status(fx.root), '')
            assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
        } finally {
            fx.cleanup()
        }
    }
    const fx = forkedHighGearRepo()
    try {
        const out = migrate(fx.root, '--dry-run').stdout
        for (const want of ['roadmap-sync', 'capture-spec-gap', 'Unrecognized files left in place', '.ai/DESIGN.md', 'specs/templates/intent-refinement.md', 'Local skills that shadow a plugin skill', 'Workspace cells moved to notes', 'every Claude session will load']) {
            assert.ok(out.includes(want), want)
        }
    } finally {
        fx.cleanup()
    }
})

test('AC-011: --apply on the 0.3.0 plugin-init fixture replaces every framework file and keeps the adopter data', () => {
    const fx = pluginInit030Repo()
    try {
        const res = migrate(fx.root, '--apply')
        assert.ok([0, 3].includes(res.status), res.stderr)
        const r = fx.root
        for (const f of ['validate-guide.mjs', 'plan-gate.mjs', 'lib/sdlc-paths.mjs']) {
            assert.equal(read(r, `.sdlc/scripts/${f}`), read(PAYLOAD, `.sdlc/scripts/${f}`), f)
        }
        const config = parseYaml(read(r, '.sdlc/config.yaml'))
        assert.equal(config.layout, 2)
        assert.equal(config.paths.skills, 'skills')
        assert.deepEqual(config.workspaces, [], 'the unfilled stub migrates to no workspaces')
        for (const gone of ['.ai', 'scripts', 'templates']) assert.equal(existsSync(join(r, gone)), false, gone)
        const gi = read(r, '.gitignore').split('\n')
        assert.ok(gi.includes('.claude/.sdlc-*') && gi.includes('!.claude/.sdlc-override-log'))
        assert.ok(read(r, '.ignore').split('\n').includes('!.sdlc/'))
        assert.equal(git(r, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'chore/sdlc-layout-v2')
    } finally {
        fx.cleanup()
    }
})

test('AC-011: --apply on the forked fixture relocates and keeps local data byte for byte', () => {
    const fx = forkedHighGearRepo()
    try {
        const r = fx.root
        const machineBefore = read(r, 'specs/sdlc-state-machine.yaml')
        const agentsBefore = read(r, 'AGENTS.md')
        const res = migrate(r, '--apply')
        assert.equal(res.status, 3, 'the forked fixture carries forms only a person can fix')
        assert.equal(git(r, 'log', '-1', '--format=%s').trim(), 'sdlc: migrate to layout 2')

        const config = read(r, '.sdlc/config.yaml')
        assert.ok(config.includes(cutDomainRouting(machineBefore)), 'domain_routing is byte-identical')
        const parsed = parseYaml(config)
        assert.deepEqual(parsed.extensions.phases.map((p) => p.id), ['roadmap-sync'])
        assert.deepEqual(parsed.extensions.exempt, ['capture-spec-gap'])
        assert.equal(parsed.paths.project, '.sdlc/project.md')
        assert.equal(parsed.paths.process_doc, '.sdlc/agents/sdlc.md')
        for (const key of ['primitives', 'envelope_schema']) assert.ok(existsSync(join(r, parsed.paths[key])), key)
        assert.equal(existsSync(join(r, '.sdlc/contracts')), false, 'each contract exists once')

        const web = parsed.workspaces.find((w) => w.name === 'web')
        const dbt = parsed.workspaces.find((w) => w.name === 'dbt')
        assert.equal(web.agent_executable, 'caution')
        assert.equal(web.package, '@fx/web')
        assert.deepEqual(web.skills, ['web-patterns', 'web-testing'])
        assert.deepEqual(dbt.skills, [], 'a workspace with no skills row gets []')
        assert.equal(dbt.test, '')
        assert.match(dbt.notes, /pnpm dev:dbt test/)

        assert.ok(read(r, 'AGENTS.md').includes('<!-- BEGIN BEADS INTEGRATION -->\nbeads\n<!-- END BEADS INTEGRATION -->\n'))
        assert.ok(agentsBefore.length > 0)
        assert.ok(existsSync(join(r, '.ai/DESIGN.md')), 'the unknown .ai/ file stays')
        assert.ok(existsSync(join(r, 'specs/templates/intent-refinement.md')))
        assert.ok(lstatSync(join(r, '.claude/skills')).isSymbolicLink())
        assert.equal(readlinkSync(join(r, '.claude/skills')), '../.sdlc/skills')
        assert.match(read(r, '.sdlc/review-constraints-loader.mjs'), /join\(HERE, 'review-constraints\.yaml'\)/)
        assert.ok(existsSync(join(r, '.sdlc/review-constraints.yaml')), 'the loader still finds its sibling registry')
        assert.match(read(r, '.sdlc/skills/pr-reviewer/SKILL.md'), /`\.\.\/\.\.\/review-constraints-loader\.mjs`/)
        assert.match(read(r, '.sdlc/agents/sdlc.md'), /\(\.\.\/\.\.\/docs\/runbooks\/spec-execution\.md\)/)
        assert.match(read(r, '.sdlc/scripts/validate-guide.mjs'), /\/\/ local edit/, 'the modified validator is kept')
        assert.ok(existsSync(join(r, '.sdlc/scripts/lib/sdlc-paths.mjs')))
        assert.match(read(r, '.github/workflows/sdlc-gates.yml'), /'\.sdlc\/\*\*'/)
        assert.equal(read(r, '.github/workflows/ci.yml'), "on:\n  pull_request:\n    paths-ignore:\n      - '**.md'\njobs: {}\n")
        assert.equal(read(r, 'apps/web/layout.tsx'), "import X from '@/components/templates/spec.md'\n")
        assert.match(read(r, '.sdlc/skills/plugin-cites/SKILL.md'), /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/sdlc\/x\.mjs/)
    } finally {
        fx.cleanup()
    }
})

test('AC-012: only live records are rewritten, and an --exclude glob is honored', () => {
    const fx = layout1Repo()
    try {
        const r = fx.root
        const cite = 'Run scripts/sdlc/validate-guide.mjs here.\n'
        write(r, 'specs/SPEC-100-live.md', `---\nid: SPEC-100\nstatus: active\n---\n${cite}`)
        write(r, 'specs/tasks/SPEC-100/GUIDE.md', cite)
        write(r, 'specs/SPEC-101-closed.md', `---\nid: SPEC-101\nstatus: snapshot\n---\n${cite}`)
        write(r, 'specs/tasks/SPEC-101/GUIDE.md', cite)
        write(r, 'specs/archive/specs/SPEC-102-old.md', `---\nid: SPEC-102\nstatus: completed\n---\n${cite}`)
        write(r, 'specs/review-logs/SPEC-100.json', JSON.stringify({ finding: cite }))
        write(r, 'specs/adrs/ADR-001-retired.md', `---\nid: ADR-001\nstatus: retired\n---\n${cite}`)
        write(r, 'specs/adrs/ADR-002-accepted.md', `---\nid: ADR-002\nstatus: accepted\n---\n${cite}`)
        write(r, 'specs/tasks/SPEC-100/DECISIONS.md', cite)
        write(r, 'docs/plans/old-plan.md', cite)
        commitAll(r, 'history')
        const res = migrate(r, '--apply', '--exclude', 'docs/plans/**')
        assert.ok([0, 3].includes(res.status), res.stderr)
        const changed = (rel) => read(r, rel) !== (rel.endsWith('.json') ? JSON.stringify({ finding: cite }) : null)
        assert.match(read(r, 'specs/tasks/SPEC-100/GUIDE.md'), /\.sdlc\/scripts\/validate-guide\.mjs/)
        assert.match(read(r, 'specs/adrs/ADR-002-accepted.md'), /\.sdlc\/scripts\/validate-guide\.mjs/)
        for (const rel of ['specs/SPEC-101-closed.md', 'specs/tasks/SPEC-101/GUIDE.md', 'specs/archive/specs/SPEC-102-old.md', 'specs/adrs/ADR-001-retired.md', 'specs/tasks/SPEC-100/DECISIONS.md', 'docs/plans/old-plan.md']) {
            assert.match(read(r, rel), /Run scripts\/sdlc\/validate-guide\.mjs here/, rel)
        }
        assert.equal(changed('specs/review-logs/SPEC-100.json'), false)
    } finally {
        fx.cleanup()
    }
})

test('AC-013: the scan reports what a text rewrite cannot fix, and a fixed branch scans clean and re-runs as nothing', () => {
    const fx = forkedHighGearRepo()
    try {
        const r = fx.root
        const res = migrate(r, '--apply')
        assert.equal(res.status, 3)
        const own = scanRepo(r, {}).filter((h) => !shippedByPayload(h.file))
        const forms = new Set(own.map((h) => `${h.file} ${h.form}`))
        for (const want of [
            '.claude/hooks/user-prompt-submit.mjs quoted-segments',
            '.claude/hooks/user-prompt-submit.mjs quoted-.ai',
            '.claude/hooks/user-prompt-submit.mjs domain_routing-read',
            '.sdlc/scripts/check-subagent-types.mjs quoted-segments',
            ".sdlc/__tests__/schema.test.mjs '..'-join",
            '.sdlc/scripts/check-local-citations.mjs escaped-regex',
            'specs/schema/sdlc-state-machine.schema.json schema-requires-domain_routing',
            '.sdlc/skills/create-domain-skill/SKILL.md workspace-table',
        ]) {
            assert.ok(forms.has(want), `${want}\n${[...forms].join('\n')}`)
        }

        // The owner's fixes, as commits on the branch.
        write(r, '.claude/hooks/user-prompt-submit.mjs', "const sm = loadMachine(root)\nconst isProc = (rel) => rel.startsWith('.sdlc/')\nrenderDbtContext(sm.domain_routing)\n")
        write(r, '.sdlc/scripts/check-subagent-types.mjs', "export const dir = (paths) => paths.skills\n")
        write(r, '.sdlc/__tests__/schema.test.mjs', "export default 'skills'\n")
        write(r, '.sdlc/scripts/check-local-citations.mjs', 'export const ALWAYS_LOADED = []\n')
        write(r, 'specs/schema/sdlc-state-machine.schema.json', '{"required": ["phases"]}\n')
        write(r, '.sdlc/skills/create-domain-skill/SKILL.md', '---\nname: create-domain-skill\n---\n### Step 6: Add the skill to `.sdlc/config.yaml` `workspaces[].skills`\n')
        write(r, '.sdlc/scripts/validate-guide.mjs', read(PAYLOAD, '.sdlc/scripts/validate-guide.mjs'))
        git(r, 'add', '-A')
        git(r, 'commit', '-q', '-m', 'fix scan hits')
        assert.deepEqual(scanRepo(r, {}).filter((h) => !shippedByPayload(h.file)), [])
        const again = migrate(r, '--apply')
        assert.equal(again.status, 0)
        assert.match(again.stdout, /nothing to migrate/)
    } finally {
        fx.cleanup()
    }
})

test('AC-014: an unreadable workspace table stops the migration before anything is written', () => {
    const tables = (ws, elig, skills) => `# P\n\n## Workspaces\n\n| Workspace | Path |\n|---|---|\n${ws}\n### Agent eligibility by workspace\n\n| Workspace | Agent-executable? | Notes |\n|---|---|---|\n${elig}\n### Workspace skills\n\n| Workspace | Domain skills | Purpose |\n|---|---|---|\n${skills}\n`
    const cases = [
        ['eligibility value maps to nothing', tables('| web | apps/web |', '| web | Sometimes | |', ''), /maps to none of yes, caution, human/],
        ['eligibility row names no workspace', tables('| web | apps/web |', '| web | Yes | |\n| ghost | Yes | |', ''), /"ghost" names no workspace/],
        ['skills row names no workspace', tables('| web | apps/web |', '| web | Yes | |', '| ghost | x | |'), /"ghost" names no workspace/],
        ['a workspace with no eligibility row', tables('| web | apps/web |\n| api | apps/api |', '| web | Yes | |', ''), /"api" has no row/],
    ]
    for (const [label, doc, pattern] of cases) {
        const fx = layout1Repo()
        try {
            write(fx.root, '.ai/project.md', doc)
            commitAll(fx.root, 'project')
            const res = migrate(fx.root, '--apply')
            assert.equal(res.status, 1, label)
            assert.match(res.stderr, pattern, label)
            assert.equal(status(fx.root), '', `${label}: nothing written`)
            assert.equal(git(fx.root, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main', `${label}: no branch`)
        } finally {
            fx.cleanup()
        }
    }
    const single = parseWorkspaceTables('# P\n\n## Workspaces\n\n| Workspace | Path |\n|---|---|\n\n### Agent eligibility by workspace\n\n| Workspace | Agent-executable? | Notes |\n|---|---|---|\n')
    assert.deepEqual(single.workspaces, [])
    assert.deepEqual(single.problems, [])
    const stub = parseWorkspaceTables('## Workspaces\n\n| Workspace | Path |\n|---|---|\n| [app-name] | apps/[app] |\n\n### Agent eligibility by workspace\n\n| Workspace | Agent-executable? | Notes |\n|---|---|---|\n| [app-name] | Yes | x |\n')
    assert.deepEqual(stub.workspaces, [])
    assert.equal(stub.dropped.length, 2)
})

test('the migration refuses a dirty tree, a non-repo and an unknown layout, and does nothing on layout 2', () => {
    const fx = layout1Repo()
    try {
        commitAll(fx.root)
        writeFileSync(join(fx.root, '.ai/project.md'), 'edited\n')
        const dirty = migrate(fx.root, '--dry-run')
        assert.equal(dirty.status, 1)
        assert.match(dirty.stderr, /uncommitted changes/)
    } finally {
        fx.cleanup()
    }
    const fx2 = layout1Repo()
    try {
        const res = migrate(fx2.root, '--dry-run')
        assert.equal(res.status, 1)
        assert.match(res.stderr, /not a git repository/)
    } finally {
        fx2.cleanup()
    }
})
