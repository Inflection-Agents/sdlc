# [Project Name] — Project Context

Shared project context for all agents. Referenced by both `CLAUDE.md` and `AGENTS.md`.

## What is [Project Name]?

[One paragraph: what the product does, who uses it.]

## Repository

[Monorepo / single app / etc. Package manager, framework.]

### Workspace layout

```
[directory tree — show the major directories and what they contain]
```

### Path aliases

[e.g., `@/*` → `src/*`, workspace package references]

## Workspaces

<!-- Remove this section for single-app repos. -->

Agents use this table to scope tasks, route work, and determine verification commands.

| Workspace | Path | Package | Stack | Test command | Build command |
|-----------|------|---------|-------|-------------|---------------|
| [app-name] | apps/[app] | @[org]/[app] | [framework] | [test cmd] | [build cmd] |
| [shared] | packages/[shared] | @[org]/[shared] | [lang] | [test cmd] | [build cmd] |

### Workspace dependency graph

```
[shared] → [app-1], [app-2]
[other relationships]
```

Changes to a workspace require testing all its downstream consumers.

### Agent eligibility by workspace

| Workspace | Jules eligible? | Notes |
|-----------|----------------|-------|
| [app-name] | Yes | Self-contained, testable |
| [shared] | Yes (with caution) | Changes require verifying all consumers |
| [dbt/data] | No | Requires database credentials, env vars |

### Workspace skills

Domain skills encode technology-specific conventions, patterns, and workflows for each workspace. SDLC process skills (code-standards, code-review, task-decomposition) reference this table to apply the right domain conventions.

| Workspace | Domain skills | Purpose |
|-----------|--------------|---------|
| [app-name] | [skill-name] | [what it covers — e.g., App Router patterns, module structure] |
| [data] | [skill-name], [skill-name] | [e.g., model navigation, implementation patterns] |
| [shared] | | [may not need domain skills if conventions are simple] |

Domain skills live in `.ai/skills/` at the repo root alongside SDLC skills. Name them with a workspace prefix for clarity (e.g., `dbt-cartographer`, `nextjs-app-patterns`).

### Import boundaries

[Rules agents must follow for cross-workspace imports. e.g.:]
- Apps import from shared, never from each other
- Shared never imports from apps
- [data workspace] is not a build dependency — consumed at runtime

### Workspace interfaces

How workspaces interact at runtime. Agents use this during task decomposition to understand what crosses boundaries and to write correct constraints on boundary tasks.

<!-- For each interface between workspaces, document: what produces, what consumes, -->
<!-- the contract (schema, types, format), and where the contract is defined. -->

**[data workspace] → [app workspaces]**
- Produces: [e.g., database tables/views in `hg.*` schema]
- Consumed via: [e.g., Supabase client queries in apps]
- Contract: [e.g., column names, types, and nullability defined in dbt schema.yml]
- Source of truth: [e.g., `dbt/models/marts/schema.yml`]
- When data changes: [e.g., apps must update Supabase queries and shared TypeScript types]

**[shared workspace] → [app workspaces]**
- Produces: [e.g., TypeScript types, React hooks, UI components]
- Consumed via: [e.g., `import { ... } from '@org/shared'`]
- Contract: [e.g., exported types and function signatures in `packages/shared/src/index.ts`]
- Source of truth: [e.g., the shared package's public exports]
- When shared changes: [e.g., all importing apps must be tested; breaking changes require updating all consumers in the same PR or coordinated tasks]

**[other interfaces as needed]**

### Change propagation patterns

When a change in one workspace requires coordinated changes in others, follow these patterns during task decomposition. Each pattern defines the task ordering and boundary constraints.

<!-- Document recurring cross-workspace change patterns. Remove patterns that -->
<!-- don't apply. Add project-specific ones as they emerge. -->

**New field (data → apps):**
```
1. [data]: Add column to source/staging model
2. [data]: Propagate to mart model, add schema.yml documentation
3. [shared]: Add field to TypeScript type definition
4. [app-1], [app-2]: (parallel) Use field in UI/logic
```
Boundary constraint: Task 3 must reference the exact column name and type from Task 2's schema.yml.

**Shared interface change:**
```
1. [shared]: Update exported type/hook/component (backwards-compatible if possible)
2. [app-1], [app-2]: (parallel) Update usages to match new interface
```
If NOT backwards-compatible: all consumer updates must be in the same PR or merged atomically.

**Schema migration:**
```
1. [data]: Migration + model update
2. [shared]: Update types to match new schema
3. [app-1], [app-2]: (parallel) Update queries and components
```
Boundary constraint: Include rollback plan in the spec. Migration task must pass `dbt test` before downstream tasks start.

## Commands

Package manager: **[pnpm / npm / yarn]**

```bash
# Install dependencies
[install command]

# Build all
[build command]

# Lint
[lint command]

# Format
[format command]

# Run all tests
[test command]
```

### Workspace-scoped commands

```bash
# Run a single workspace
[filter command for dev]

# Test a single workspace
[filter command for test]

# Test a single file
[filter command for single test]
```

## Code conventions

[Language, strictness level, formatting rules, import conventions, component patterns, testing framework, error handling approach. Be specific — agents follow this literally.]

### Per-workspace conventions (if they differ)

<!-- Remove if conventions are uniform. -->

| Convention | [App workspaces] | [Data workspace] |
|-----------|-------------------|-------------------|
| Language | [TypeScript] | [SQL + Python] |
| Testing | [Vitest + Testing Library] | [dbt test] |
| Patterns | [App Router, Server Components] | [ref(), source()] |

## Git hooks

[What hooks exist, what they check, how to avoid failures.]

## CI

[Pipeline description: triggers, Node/Python version, any filtering logic.]
[Note any workspace-aware filtering, e.g., Turborepo --filter for PRs.]

## Data architecture (if applicable)

[Schemas, layers, key architectural rules agents must follow.]

## Specs and ADRs

- Spec index: `specs/spec-index.json`
- Templates: `specs/templates/`
- ADRs: `specs/adrs/`
- Bug specs: `specs/bugs/`
