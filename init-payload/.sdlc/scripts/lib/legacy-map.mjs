/**
 * The one table of layout-1 paths (ADR-008).
 *
 * The resolver's fallback, the migration and the legacy-path scan all read it, so a
 * layout-1 path is spelled in exactly one file. Any consumer that must still recognize
 * a layout-1 path takes it from an export here and never from its own literal; the scan
 * exempts this file and flags a literal anywhere else.
 */

/** Layout-1 locations of the files the resolver serves, relative to the repo root. */
export const LAYOUT1 = Object.freeze({
    constraints: '.ai/sdlc/review-constraints.yaml',
    machine: 'specs/sdlc-state-machine.yaml',
    scripts: 'scripts/sdlc',
    project: '.ai/project.md',
    processDoc: '.ai/sdlc.md',
    skillsCandidates: ['.ai/skills', 'skills'],
    templatesCandidates: ['templates', 'specs/templates'],
    contractDirs: ['.ai/skills', '.ai/sdlc'],
})

/** Directory prefixes whose presence (next to `specs/`) marks a layout-1 repo. */
export const LAYOUT1_MARKERS = Object.freeze(['.ai', 'scripts/sdlc'])

/** Top-level directory prefix of the layout-1 agent config. */
export const LAYOUT1_AI_PREFIX = '.ai/'

/** Escaped regular expression that matches a repo-relative path under the layout-1 agent config. */
export const LAYOUT1_AI_PATTERN = /^\.ai\//

/** Every template file name the framework ships or has shipped. Other files in a templates directory are the adopter's own. */
export const FRAMEWORK_TEMPLATES = Object.freeze([
    'adr.md',
    'bug.md',
    'completion-report.md',
    'cross-cutting-skill.md',
    'decisions.md',
    'gap.md',
    'guide.md',
    'initiatives.md',
    'kickoff.md',
    'project.md',
    'spec.md',
    'task.md',
])

export const CONTRACT_FILES = Object.freeze({
    primitives: 'review-primitives.md',
    envelopeSchema: 'review-envelope.schema.json',
})

/** Agent entry files that a forked repo keeps in `.ai/` and the migration moves to `.sdlc/agents/`. */
export const AGENT_FILES = Object.freeze(['sdlc.md', 'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'setup.md'])
