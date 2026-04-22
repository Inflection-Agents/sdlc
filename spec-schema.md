# Spec schema

The spec is the root artifact of the AI-native SDLC. Every spec is a markdown file with enforced YAML frontmatter. Agents and humans both consume specs — the schema ensures consistent, parseable structure.

## Why a schema

- Agents are the primary consumers. They shouldn't guess where acceptance criteria are or whether a spec is active.
- Specs link into the work graph. The frontmatter provides the structured fields that Linear, run logs, and bug specs reference.
- CI validates on every PR. A malformed spec is caught before merge, not during agent execution.

## Frontmatter schema

```yaml
---
id: SPEC-001                    # unique, immutable, referenced everywhere
title: "User authentication flow"
status: draft | active | completed | superseded | deprecated
version: 1                      # increments on material changes
supersedes: SPEC-000            # optional, previous version's id
initiative: INI-003             # links to Linear initiative
owner: franklin                 # human who owns intent
workspaces: [dealer-app, shared] # which workspace members this spec affects (monorepo)
created: 2026-04-22
updated: 2026-04-22
tags: [auth, security]          # free-form, used for search/grouping
linear_project: PRJ-XYZ         # Linear project id, for bidirectional linking
---
```

### Field rules

| Field | Required | Mutable | Notes |
|-------|----------|---------|-------|
| `id` | yes | no | Format: `SPEC-NNN`. Assigned on creation, never changes. |
| `title` | yes | yes | Short, descriptive. |
| `status` | yes | yes | Only valid transitions: draft→active, active→superseded, active→deprecated, active→completed. |
| `version` | yes | yes | Integer. Bump on additive or breaking changes (new/changed acceptance criteria, scope, design). NOT for cosmetic fixes (typos, clarifications). See the `spec-amendment` skill for the full process. |
| `supersedes` | no | no | Set once when a new spec replaces an old one. |
| `initiative` | yes | yes | Must match an existing initiative id. |
| `owner` | yes | yes | GitHub username. The human accountable for this spec's intent. |
| `created` | yes | no | ISO date. |
| `updated` | yes | yes | ISO date. Updated on every material change. |
| `workspaces` | no | yes | Array of workspace names from `.ai/project.md`. Omit for single-app repos. Informs task decomposition scope. |
| `tags` | no | yes | Array of strings. |
| `linear_project` | no | yes | Set when the Linear project is created. |

## Body structure

After frontmatter, every spec follows this section order. Sections can be brief but must be present — an empty section signals "not yet defined" and blocks the spec from moving to `active`.

```markdown
## Problem

What's wrong or missing. Why this matters. Who's affected.

## Success criteria

Measurable outcomes. How we know this spec is done.
- [ ] Criterion 1
- [ ] Criterion 2

## Scope

### In scope
- What this spec covers

### Out of scope
- What this spec explicitly does NOT cover (and why)

## Design

How we solve it. Architecture, data model, key decisions.
Link ADRs here: `ADR-NNN: [title](../adrs/ADR-NNN.md)`

## Acceptance criteria

Testable conditions that must be true for the spec to be considered implemented.
Each criterion should be verifiable by an agent or a test.

- [ ] Given X, when Y, then Z
- [ ] Given A, when B, then C

## Risks & constraints

Known risks, dependencies, constraints. What could go wrong.

## Migration (optional, for refactors)

### Current state
What exists today.

### Target state
What we're moving to.

### Migration strategy
How we get there without breaking things.

### Rollback plan
How we undo if it goes wrong.

## Changelog (added on first amendment)

### v2 (YYYY-MM-DD)
- **Breaking/Additive:** What changed and why

### v1 (YYYY-MM-DD)
- Initial spec
```

## ADR schema

ADRs are lighter. Same directory, same frontmatter pattern.

```yaml
---
id: ADR-001
title: "Use PostgreSQL for event store"
status: proposed | accepted | superseded | rejected
spec: SPEC-001                  # the spec this decision supports
date: 2026-04-22
author: franklin
superseded_by: ADR-005          # optional
---
```

Body follows the standard ADR format:

```markdown
## Context
What forces are at play.

## Decision
What we decided.

## Consequences
What follows from this decision — good and bad.
```

## Directory layout

```
specs/
├── SPEC-001-user-auth.md
├── SPEC-002-data-pipeline-refactor.md
├── SPEC-003-noc-agent.md
├── adrs/
│   ├── ADR-001-postgres-event-store.md
│   └── ADR-002-linear-over-jira.md
├── bugs/
│   ├── BUG-001-login-timeout.md
│   └── BUG-002-null-ref-dashboard.md
├── templates/
│   ├── spec.md
│   ├── adr.md
│   └── bug.md
└── spec-index.json              # auto-generated, agent-readable
```

## Bug spec schema

Bug specs reuse the same structure with extra fields for triage.

```yaml
---
id: BUG-001
title: "Login times out on mobile Safari"
status: reported | confirmed | in-progress | resolved | rejected
severity: sev1 | sev2 | sev3
violates: SPEC-001              # the spec this contradicts
regression_of: RUN-0042         # optional, the run that introduced it
source: user-report | monitoring | eval-regression | internal
reporter: support@example.com
assignee: agent | franklin
created: 2026-04-22
updated: 2026-04-22
confidence: high | medium | low
---
```

Bug body sections: Observed, Expected, Repro steps, Environment, Evidence, Linked artifacts.

## spec-index.json

Auto-generated on every PR that touches `specs/`. Agents read this instead of scanning the directory.

```json
{
  "specs": [
    {
      "id": "SPEC-001",
      "title": "User authentication flow",
      "status": "active",
      "version": 1,
      "path": "specs/SPEC-001-user-auth.md",
      "initiative": "INI-003",
      "tags": ["auth", "security"],
      "acceptance_criteria_count": 5,
      "acceptance_criteria_done": 3
    }
  ],
  "adrs": [
    {
      "id": "ADR-001",
      "title": "Use PostgreSQL for event store",
      "status": "accepted",
      "spec": "SPEC-001",
      "path": "specs/adrs/ADR-001-postgres-event-store.md"
    }
  ],
  "bugs": [
    {
      "id": "BUG-001",
      "title": "Login times out on mobile Safari",
      "status": "confirmed",
      "severity": "sev2",
      "violates": "SPEC-001",
      "path": "specs/bugs/BUG-001-login-timeout.md"
    }
  ]
}
```

## Validation

A CI check runs on every PR that touches `specs/`:

1. **Frontmatter present and valid** — all required fields, correct types
2. **Status transitions valid** — can't go from `draft` directly to `superseded`
3. **References resolve** — `initiative`, `supersedes`, `violates` point to real ids
4. **Body sections present** — all required sections exist (can be empty only in `draft`)
5. **Index regenerated** — `spec-index.json` is up to date

This can be a simple script (Node, Python, or shell + yq) run in CI. No external service needed.

## How agents use specs

1. **Before planning:** agent reads `spec-index.json` to find the active spec for their assigned initiative, then reads the full spec.
2. **During implementation:** agent references acceptance criteria as a checklist. Each PR comment cites which criteria it addresses.
3. **During triage:** NOC agent searches the index by tag/component to find the spec a bug violates.
4. **During review:** agent checks that PR changes align with the spec's design section and don't violate ADRs.
