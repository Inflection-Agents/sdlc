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
      owner_skill: spec-authoring
      next_phase: none

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
