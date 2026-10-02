/**
 * Build throwaway adopter repos on either layout, for the resolver, validator, hook and
 * migration tests (SPEC-009). Each builder returns the temp root and a cleanup function.
 * Nothing here ever touches the working tree it runs from.
 *
 * Layout-1 fixtures spell layout-1 paths on purpose. The legacy-path scan exempts
 * `__fixtures__/` for that reason.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

export function write(root, rel, content = '') {
    const file = join(root, rel)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content, 'utf8')
    return file
}

function tempRoot(prefix) {
    const root = mkdtempSync(join(tmpdir(), prefix))
    return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

export function git(root, ...args) {
    const res = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`)
    return res.stdout
}

/** Turn a fixture directory into a git repo with one commit. */
export function commitAll(root, message = 'fixture') {
    git(root, 'init', '-q', '-b', 'main')
    git(root, 'config', 'user.email', 'fixture@example.com')
    git(root, 'config', 'user.name', 'fixture')
    git(root, 'config', 'commit.gpgsign', 'false')
    git(root, 'add', '-A')
    git(root, 'commit', '-q', '-m', message)
}

export const MACHINE = `version: 1

phases:
    - id: spec-authoring
      entry_triggers:
          - 'spec out'
      preconditions:
          - 'an intent exists'
      owner_skill: spec-authoring
      exit_condition: 'the spec is active'
      next_phase: none
      next_trigger: none

domain_routing:
    web: [web-patterns]

exempt:
    - review-primitives
`

/** A plugin-init repo on layout 1: what /sdlc-init 0.3.0 wrote. */
export function layout1Repo({ withSkillsDir = false } = {}) {
    const fx = tempRoot('sdlc-l1-')
    const r = fx.root
    write(r, 'specs/sdlc-state-machine.yaml', MACHINE)
    write(r, '.ai/project.md', '# Project\n')
    write(r, '.ai/sdlc/review-constraints.yaml', 'constraints: []\n')
    write(r, '.ai/skills/review-primitives.md', '# primitives\n')
    write(r, '.ai/skills/review-envelope.schema.json', '{}\n')
    write(r, 'scripts/sdlc/validate-guide.mjs', 'process.exit(0)\n')
    write(r, 'templates/spec.md', '# spec template\n')
    if (withSkillsDir) write(r, 'skills/web-patterns/SKILL.md', '# web\n')
    return fx
}

/** A repo on layout 2, with an optional config body. */
export function layout2Repo({ config = 'layout: 2\n' } = {}) {
    const fx = tempRoot('sdlc-l2-')
    const r = fx.root
    write(r, '.sdlc/config.yaml', config)
    write(r, '.sdlc/state-machine.yaml', MACHINE.replace(/domain_routing:\n {4}web: \[web-patterns\]\n\n/, ''))
    write(r, '.sdlc/review-constraints.yaml', 'constraints: []\n')
    write(r, '.sdlc/scripts/validate-guide.mjs', 'process.exit(0)\n')
    write(r, '.sdlc/templates/spec.md', '# spec template\n')
    mkdirSync(join(r, 'specs'), { recursive: true })
    return fx
}

/** A forked layout-1 repo whose `.claude/skills` points at `.ai/skills`. */
export function forkedRepo() {
    const fx = layout1Repo()
    const r = fx.root
    write(r, '.ai/skills/local-skill/SKILL.md', '# local\n')
    write(r, '.ai/sdlc.md', '# process\n')
    mkdirSync(join(r, '.claude'), { recursive: true })
    symlinkSync('../.ai/skills', join(r, '.claude', 'skills'), 'dir')
    return fx
}

const FRAMEWORK = new URL('../../../../', import.meta.url).pathname

/** The bytes of one file in the framework repo at `rev`. */
export function frameworkFileAt(rev, rel) {
    const res = spawnSync('git', ['show', `${rev}:${rel}`], { cwd: FRAMEWORK, encoding: 'utf8', maxBuffer: 1 << 26 })
    if (res.status !== 0) throw new Error(`git show ${rev}:${rel} failed: ${res.stderr}`)
    return res.stdout
}

function listAt(rev, dir) {
    const res = spawnSync('git', ['ls-tree', '-r', '--name-only', rev, '--', dir], { cwd: FRAMEWORK, encoding: 'utf8' })
    return res.stdout.split('\n').filter(Boolean)
}

/**
 * A plugin-init repo exactly as /sdlc-init 0.3.0 left it (the payload at 89cba06), plus a
 * root skills/ with one domain skill, as the 0.3.0 project stub tells adopters to keep.
 */
export function pluginInit030Repo() {
    const fx = tempRoot('sdlc-p030-')
    const r = fx.root
    const REV = '89cba06'
    for (const path of listAt(REV, 'init-payload')) {
        const rel = path.slice('init-payload/'.length)
        let dest = rel
        if (rel === 'README.md') continue
        if (rel === 'sdlc-state-machine.yaml') dest = 'specs/sdlc-state-machine.yaml'
        else if (rel === '.ai/project.stub.md') dest = '.ai/project.md'
        else if (rel === '.ai/sdlc/review-constraints.stub.yaml') dest = '.ai/sdlc/review-constraints.yaml'
        write(r, dest, frameworkFileAt(REV, path))
    }
    write(r, 'skills/web-patterns/SKILL.md', '---\nname: web-patterns\n---\n# web\n')
    mkdirSync(join(r, 'specs', 'adrs'), { recursive: true })
    write(r, 'specs/adrs/.gitkeep', '')
    commitAll(r, '0.3.0 init')
    return fx
}

/** A project.md over the 16 KiB budget, holding the three workspace tables the way high-gear-apps writes them. */
function bigProjectDoc() {
    const filler = Array.from({ length: 320 }, (_, i) => `Line ${i} of project prose that pads the document past the AGENTS.md budget.`).join('\n')
    return `# Fixture — Project Context

See [the runbook](../docs/runbooks/spec-execution.md).

## Workspaces

| Workspace | Path | Package | Stack | Test command | Build command |
|-----------|------|---------|-------|-------------|---------------|
| web | \`apps/web\` | \`@fx/web\` | Next.js | \`pnpm --filter web test\` | \`pnpm --filter web build\` |
| dbt | \`dbt\` | n/a | dbt | \`pnpm dev:dbt test\` (Postgres) / \`pnpm dev:dbt:local test\` (Trino) | N/A |

### Agent eligibility by workspace

| Workspace | Agent-executable? | Notes |
|-----------|-------------------|-------|
| web | Yes (with caution) | Changes require verifying consumers |
| dbt | No (\`human\`) | Needs database credentials |

### Workspace skills

| Workspace | Domain skills | Purpose |
|-----------|--------------|---------|
| web | \`web-patterns\`, \`web-testing\` | App Router conventions |

## Prose

${filler}
`
}

export const FORKED_HOOK = `import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const p = JSON.parse(readFileSync(0, 'utf8'))
const root = process.env.CLAUDE_PROJECT_DIR || p.cwd
const isProc = (rel) => rel.startsWith('.ai/')
const file = join(root, 'specs', 'sdlc-state-machine.yaml')
if (existsSync(file)) {
    const machine = { domain_routing: Object.fromEntries([...readFileSync(file, 'utf8').matchAll(/^ {4}([\\w-]+):\\n {8}- ([\\w-]+)/gm)].map((m) => [m[1], [m[2]]])) }
    for (const [ws, chain] of Object.entries(machine.domain_routing)) if (p.prompt.includes(ws + '/')) console.log('route ' + ws + ': ' + chain.join(' -> '))
}
`

/** The fixed form of FORKED_HOOK, as an owner would write it on the migration branch. */
export const FIXED_HOOK = `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const p = JSON.parse(readFileSync(0, 'utf8'))
const root = process.env.CLAUDE_PROJECT_DIR || p.cwd
const { loadMachine } = await import(join(root, '.sdlc/scripts/lib/sdlc-paths.mjs'))
const sm = loadMachine(root)
for (const [ws, chain] of Object.entries(sm.domain_routing)) if (p.prompt.includes(ws + '/')) console.log('route ' + ws + ': ' + chain.join(' -> '))
`

/** A forked layout-1 repo modeled on high-gear-apps, carrying every form SPEC-009 AC-010 lists. */
export function forkedHighGearRepo() {
    const fx = tempRoot('sdlc-fork-')
    const r = fx.root
    write(r, 'specs/sdlc-state-machine.yaml', `version: 1

phases:
    - id: spec-authoring
      entry_triggers:
          - 'spec out'
      preconditions:
          - 'an intent exists'
      owner_skill: spec-authoring
      exit_condition: 'local wording'
      next_phase: none
      next_trigger: none
    - id: roadmap-sync
      entry_triggers:
          - 'sync the roadmap'
      preconditions:
          - 'a roadmap exists'
      owner_skill: roadmap-sync
      exit_condition: 'the roadmap is current'
      next_phase: none
      next_trigger: none

domain_routing:
    web:
        - web-patterns

exempt:
    - review-primitives
    - capture-spec-gap
`)
    write(r, '.ai/project.md', bigProjectDoc())
    write(r, '.ai/sdlc.md', '# Process\n\nSee [runbook](../docs/runbooks/spec-execution.md).\n')
    write(r, '.ai/DESIGN.md', '# design notes the framework never shipped\n')
    write(r, '.ai/sdlc/review-constraints.yaml', 'constraints:\n  - id: FX-1\n    lens: correctness\n    check: "fixture"\n    when: { touches: ["apps/**"] }\n')
    write(r, '.ai/sdlc/review-constraints-loader.mjs', "import { readFileSync } from 'node:fs'\nimport { join, dirname } from 'node:path'\nimport { fileURLToPath } from 'node:url'\nconst HERE = dirname(fileURLToPath(import.meta.url))\nexport const load = () => readFileSync(join(HERE, 'review-constraints.yaml'), 'utf8')\n")
    write(r, '.ai/sdlc/review-envelope.schema.json', '{"title": "local schema"}\n')
    write(r, '.ai/sdlc/__tests__/schema.test.mjs', "import { join } from 'node:path'\nconst skills = join(import.meta.dirname, '..', '..', 'skills')\nexport default skills\n")
    write(r, '.ai/skills/review-primitives.md', '# primitives, edited locally\n')
    write(r, '.ai/skills/pr-reviewer/SKILL.md', '---\nname: pr-reviewer\n---\nLoad the registry via `../../sdlc/review-constraints-loader.mjs`.\n')
    write(r, '.ai/skills/web-patterns/SKILL.md', '---\nname: web-patterns\n---\n# web\n')
    write(r, '.ai/skills/create-domain-skill/SKILL.md', '---\nname: create-domain-skill\n---\n### Step 6: Update project.md — Workspace skills table\n')
    write(r, '.ai/skills/plugin-cites/SKILL.md', '---\nname: plugin-cites\n---\nRun `node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/x.mjs`.\n')
    write(r, 'scripts/sdlc/validate-guide.mjs', frameworkFileAt('89cba06', 'init-payload/scripts/sdlc/validate-guide.mjs') + '// local edit\n')
    write(r, 'scripts/sdlc/check-local-citations.mjs', 'export const ALWAYS_LOADED = [/^\\.ai\\//]\n')
    write(r, 'scripts/sdlc/check-subagent-types.mjs', "import { join } from 'node:path'\nexport const dir = (root) => join(root, '.ai', 'skills')\n")
    write(r, 'specs/templates/intent-refinement.md', '# a template the framework never shipped\n')
    write(r, 'specs/templates/spec.md', '# spec\n')
    write(r, 'specs/schema/sdlc-state-machine.schema.json', '{"required": ["phases", "domain_routing"]}\n')
    write(r, 'AGENTS.md', '# Jules entry point\n\nRead `.ai/project.md`, then `.ai/AGENTS.md`.\n<!-- BEGIN BEADS INTEGRATION -->\nbeads\n<!-- END BEADS INTEGRATION -->\n')
    write(r, '.ai/AGENTS.md', '# You are a step executor.\n')
    write(r, 'CLAUDE.md', '# Claude\n\n1. `.ai/project.md`\n')
    // A working local hook in the layout-1 style: it reads the machine by joined segments,
    // so after the move it finds nothing and goes quiet until someone fixes it.
    write(r, '.claude/hooks/user-prompt-submit.mjs', FORKED_HOOK)
    write(r, '.claude/settings.json', JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/user-prompt-submit.mjs"' }] }] } }, null, 2))
    write(r, '.github/workflows/sdlc-gates.yml', "on:\n  pull_request:\n    paths:\n      - '.ai/**'\n      - 'scripts/sdlc/**'\njobs:\n  gates:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/sdlc/validate-guide.mjs specs/tasks/*/GUIDE.md\n")
    write(r, '.github/workflows/ci.yml', "on:\n  pull_request:\n    paths-ignore:\n      - '**.md'\njobs: {}\n")
    write(r, 'apps/web/layout.tsx', "import X from '@/components/templates/spec.md'\n")
    write(r, 'docs/runbooks/spec-execution.md', '# runbook\n')
    // A flat archive behind one fence, as high-gear-apps keeps its 147 archived specs.
    write(r, 'specs/archive/.ignore', '*\n')
    write(r, 'specs/archive/SPEC-001-old.md', '---\nid: SPEC-001\nstatus: completed\n---\n')
    mkdirSync(join(r, '.claude'), { recursive: true })
    symlinkSync('../.ai/skills', join(r, '.claude', 'skills'), 'dir')
    commitAll(r, 'forked layout 1')
    return fx
}
