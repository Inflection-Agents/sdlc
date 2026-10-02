# SDLC config schema

`.sdlc/config.yaml` marks a repo as layout 2 (ADR-008) and holds the adopter's own SDLC data.
Everything the framework reads from it goes through `scripts/sdlc/lib/sdlc-paths.mjs`, and
`validate-sdlc-config.mjs` grades its shape. `/sdlc-sync` writes only `framework_version`; every
other field is the adopter's and is never overwritten.

```yaml
layout: 2
framework_version: 0.4.0
paths:
  specs: specs
  scripts: .sdlc/scripts
  templates: .sdlc/templates
  primitives: .sdlc/contracts/review-primitives.md
  envelope_schema: .sdlc/contracts/review-envelope.schema.json
  skills: .sdlc/skills
  project: AGENTS.md
  process_doc: ""
workspaces:
  - name: dealer-app
    path: apps/dealer-app
    package: "@org/dealer-app"
    stack: Next.js
    test: pnpm --filter dealer-app test
    build: pnpm --filter dealer-app build
    agent_executable: yes
    skills: [nextjs-app-patterns]
    notes: ""
domain_routing:
  dealer-app: [nextjs-app-patterns]
extensions:
  phases: []
  exempt: []
scan:
  allow: []
```

## Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `layout` | yes | Always `2`. The file's presence is what makes a repo layout 2. |
| `framework_version` | no | The plugin version of the last `/sdlc-init` or `/sdlc-sync`. |
| `paths.*` | no | Overrides for where the resolver looks. Each value is a path relative to the repo root. An unset key takes the default shown above. `process_doc` empty means the plugin's `docs/sdlc.md`. |
| `workspaces` | no | One entry per workspace, `[]` for a single-app repo. Rule 8 of `validate-guide.mjs` applies when the list is non-empty. |
| `workspaces[].name` | yes | Unique. A guide step's `Workspace:` names it. |
| `workspaces[].path` | yes | Must exist. |
| `workspaces[].test`, `build` | no | One command each, or empty. |
| `workspaces[].agent_executable` | yes | `yes`, `caution` or `human`. A `human` workspace's steps carry `Run by:`. |
| `workspaces[].skills` | no | The workspace's domain skills, in the order they apply. |
| `workspaces[].notes` | no | Eligibility notes, skill purpose, and any table cell that was not a single command. |
| `domain_routing` | no | Workspace name to skill chain. The prompt hook routes a prompt that names the workspace's path through the chain. |
| `extensions.phases` | no | Phases the adopter adds to the framework state machine, in the machine's own phase shape. An id must not repeat a framework phase id. |
| `extensions.exempt` | no | Skill names the adopter adds to the machine's `exempt:` list. |
| `scan.allow` | no | Globs where `scan-legacy-paths.mjs` accepts a layout-1 path named on purpose, such as release notes. |

The framework's state machine (`.sdlc/state-machine.yaml`) carries neither `domain_routing` nor
the extensions. `loadMachine()` merges them in at read time, which is why every sync can replace
the machine file without losing adopter data.
