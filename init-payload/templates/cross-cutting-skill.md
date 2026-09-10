---
name: [pattern-name]
description: Use when [trigger — e.g., "a spec requires changes that flow from dbt through shared types to app UIs"]. Guides task decomposition and boundary constraint definition for cross-workspace changes.
---

# [Pattern Name]

## Overview

[What cross-workspace change pattern this skill codifies. When to use it.]

**This is not an implementation skill.** It guides task decomposition and review for changes that cross workspace boundaries. It tells you how to split the work and what contracts to enforce — not how to write code.

## When to apply

Apply this skill during task decomposition when:
- [Condition 1 — e.g., "a spec's `workspaces` field includes both `dbt` and an app workspace"]
- [Condition 2 — e.g., "acceptance criteria reference data that flows from one workspace to another"]

## Task ordering

```
[workspace-1]: [step description]
  │
  └─ [workspace-2]: [step description]
       │
       ├─ [workspace-3]: [step description] (parallel)
       └─ [workspace-4]: [step description] (parallel)
```

### [Step 1 — upstream workspace]

**Workspace:** [e.g., dbt]
**Produces:** [what this step outputs — e.g., "new columns in mart model with schema.yml documentation"]
**Contract location:** [where the output contract is defined — e.g., "dbt/models/marts/schema.yml"]

Boundary constraints to put in this task:
- [Exact output specification — column names, types, nullability, etc.]
- [Documentation requirements — schema.yml, comments, etc.]
- [Verification: what test proves the output is correct]

### [Step 2 — boundary/shared workspace]

**Workspace:** [e.g., shared]
**Consumes:** [output from step 1]
**Produces:** [what this step outputs — e.g., "TypeScript type with new field"]
**Contract location:** [e.g., "packages/shared/src/types/loan.ts"]

Boundary constraints to put in this task:
- [Must match upstream contract exactly — reference step 1's output]
- [Exact type/export specification]
- [Verification: type checking, all consumers still compile]

### [Step 3+ — downstream/consumer workspaces]

**Workspace:** [e.g., dealer-app, admin-app — parallel]
**Consumes:** [output from step 2]

Boundary constraints to put in these tasks:
- [Must use the interface as defined in step 2]
- [Verification: workspace-scoped tests + verify_workspaces includes this workspace]

## Boundary verification

After ALL tasks in this pattern complete, verify the full chain:
- [ ] [End-to-end check — e.g., "data flows from dbt source through mart to app UI"]
- [ ] [Contract consistency — e.g., "types match at every boundary"]
- [ ] [No orphaned state — e.g., "no task left with pending status"]

## Rollback

If a mid-chain task fails:
- [What can be rolled back independently]
- [What requires coordinated rollback]
- [Whether upstream tasks' merged PRs need reverting]

## Common mistakes

| Mistake | Fix |
|---------|-----|
| [e.g., Starting downstream before upstream merges] | [Dependency graph enforces this — but verify status before starting] |
| [e.g., Boundary task outputs different name than specified] | [Code review catches this — check boundary constraints in review] |
