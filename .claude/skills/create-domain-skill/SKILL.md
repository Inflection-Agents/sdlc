---
name: create-domain-skill
description: Use when creating a new domain skill for a workspace — "add a skill for dbt," "codify our Next.js patterns," "create a skill for the shared package," or when onboarding a new workspace/technology into the SDLC
---

# Create Domain Skill

## Overview

Create a new domain skill and wire it into all the places the SDLC references it. Domain skills encode technology-specific conventions for a workspace. Without proper wiring, SDLC process skills won't find or apply them.

**Announce at start:** "Using create-domain-skill to add a new domain skill and update all references."

**Companion skills (auto-invoked if installed):**
- `writing-skills` — TDD for documentation: write pressure scenarios first, observe baseline failures, then write the skill to fix them. RED-GREEN-REFACTOR applied to skills. **Use this for skill quality.**
- `skill-creator` — interactive skill creation with eval workflows: draft → test prompts → benchmark → iterate. Includes description optimization for triggering accuracy. **Use this for skill authoring mechanics.**

These two skills handle HOW to write a good skill. This skill handles WHERE to wire it into the SDLC so it's discoverable and applied.

## What must be updated

Creating a domain skill touches these files:

| File | What to add |
|------|------------|
| `.claude/skills/[name]/SKILL.md` | The skill itself |
| `.ai/project.md` → Workspace skills | Map the skill to its workspace |
| `.ai/project.md` → Workspace interfaces | Add/update if the skill reveals boundary contracts |
| `.ai/project.md` → Change propagation patterns | Add/update if the skill introduces cross-workspace patterns |
| `.ai/project.md` → Agent eligibility | Update if the skill changes what's jules-eligible for this workspace |
| `.ai/project.md` → Per-workspace conventions | Add/update if conventions differ from the default |

Missing any of these means the skill exists but SDLC process skills won't find it, apply it, or decompose tasks correctly for its workspace.

## Process

### Step 1: Understand the workspace

Interview the user or read the codebase:

- **Which workspace?** What directory, package name, technology stack?
- **What patterns need codifying?** Naming, file structure, testing approach, common operations?
- **What are the red flags?** Anti-patterns, common mistakes, forbidden practices?
- **Does this workspace have its own orchestration?** (Like cartographer → craftsman for dbt)
- **What are the boundary contracts?** How does this workspace interact with others?

### Step 2: Check existing skills

Read the current state:
- `.ai/project.md` — is this workspace already mapped? Are there existing skills?
- `.claude/skills/` — scan for any existing skills for this workspace
- Other workspace skills — read 1-2 existing domain skills to understand the format and depth

### Step 3: Choose the skill name

Convention: `[workspace]-[purpose]`

Examples:
- `dbt-craftsman` — dbt implementation patterns
- `dbt-cartographer` — dbt planning and gap analysis
- `nextjs-app-patterns` — Next.js App Router conventions
- `shared-package-patterns` — shared library conventions
- `supabase-query-patterns` — database query conventions

If the workspace needs multiple skills (like dbt has cartographer + craftsman), name each for its specific role.

### Step 4: Write the skill

Create `.claude/skills/[name]/SKILL.md`.

**Frontmatter:**
```yaml
---
name: [workspace]-[purpose]
description: [WHEN to use — triggering conditions and symptoms only.]
---
```

**Critical: description field rules** (from `writing-skills` CSO principle):
- Start with "Use when..." — focus on triggering conditions
- Include specific situations, symptoms, file types, commands
- **NEVER summarize the skill's workflow or process in the description.** Tested finding: workflow summaries in descriptions cause agents to follow the summary and skip the full skill content. The description is for matching, not instruction.
- Keep under 500 characters

**Body structure:**

```markdown
# [Skill Name]

## Overview
[One paragraph: what this skill codifies and when to apply it.]

## Conventions
[The rules. Be specific. Agents follow this literally.]
- Naming: [exact patterns]
- Structure: [file organization, module patterns]
- Testing: [what framework, what to test, how to verify]
- [Technology-specific patterns]

## Forbidden
[Things agents must NOT do in this workspace.]
- [Anti-pattern 1]
- [Anti-pattern 2]

## Red flags
| Doing this | Do this instead |
|-----------|----------------|
| ... | ... |

## Verification
[How to verify work in this workspace.]
- Run: `[test command]`
- Run: `[lint command]`
- Check: [what to visually verify]
```

**Key principles:**
- **Be prescriptive, not descriptive.** "Use `is_*` prefix for booleans" not "consider using a prefix."
- **Include the actual commands.** Not "run the tests" but "run `pnpm --filter @org/app test`."
- **Document the WHY for non-obvious rules.** "No raw CAST — use project macros because they handle nulls consistently."
- **Don't duplicate SDLC process.** TDD, commit messages, PR format, acceptance criteria — those belong in SDLC skills. Domain skills cover technology-specific patterns only.

### Step 5: Test the skill

**If `writing-skills` is installed** — follow its RED-GREEN-REFACTOR cycle:

1. **RED:** Run a pressure scenario — give a subagent a task in this workspace WITHOUT the skill. Document the exact failures: what conventions it violated, what rationalizations it used.
2. **GREEN:** Run the same scenario WITH the skill. Verify it addresses the specific baseline failures.
3. **REFACTOR:** Look for new loopholes — cases where the agent technically follows the skill but produces bad output. Tighten the skill and re-test.

**If `skill-creator` is installed** — use it for iterative improvement:

1. Draft the skill (Step 4 above)
2. Create test prompts representing common tasks in this workspace
3. Run evals, review results with the user
4. Iterate until the skill consistently produces correct output
5. Optimize the description field for triggering accuracy

**If neither is installed:** at minimum, review the skill with someone who works in this workspace daily. Better: manually test by asking Claude to do a task in the workspace and checking whether it follows the skill's conventions.

### Step 6: Update project.md — Workspace skills table

Add the skill to the workspace skills mapping:

```markdown
| Workspace | Domain skills | Purpose |
|-----------|--------------|---------|
| dbt | dbt-cartographer, dbt-craftsman | Model navigation, dbt change patterns |
| dealer-app | nextjs-app-patterns | App Router, server components ← NEW |
```

**This is the critical wiring.** Without this row, SDLC skills (code-standards, code-review, task-decomposition) will never find or apply the domain skill.

### Step 7: Update project.md — Workspace interfaces

If the skill reveals or clarifies how this workspace interacts with others, add or update the Workspace interfaces section:

```markdown
**[this workspace] → [consuming workspace]**
- Produces: [what]
- Consumed via: [how]
- Contract: [schema, types, format]
- Source of truth: [file path]
- When this changes: [what downstream must update]
```

Skip this step if the workspace interfaces are already documented and the new skill doesn't change them.

### Step 8: Update project.md — Change propagation patterns

If the skill introduces or clarifies cross-workspace change patterns, add them:

```markdown
**[Pattern name]:**
1. [this workspace]: [step]
2. [downstream workspace]: [step]
```

Skip this step if existing patterns already cover the relevant flows.

### Step 9: Update project.md — Agent eligibility

If the new skill changes what's jules-eligible for this workspace (e.g., the skill reveals that tasks need database access), update the agent eligibility table:

```markdown
| Workspace | Jules eligible? | Notes |
|-----------|----------------|-------|
| [workspace] | No | Requires database credentials (per [skill-name]) |
```

### Step 10: Update project.md — Per-workspace conventions

If the workspace has conventions that differ from the project default (different language, testing framework, formatting), add or update the per-workspace conventions table.

### Step 11: Verify the wiring

After all updates, verify:

- [ ] Skill file exists at `.claude/skills/[name]/SKILL.md`
- [ ] `description` field says WHEN to use (triggering conditions), not WHAT it does
- [ ] Skill is listed in `.ai/project.md` → Workspace skills table
- [ ] Workspace interfaces are documented (or confirmed unchanged)
- [ ] Change propagation patterns are documented (or confirmed unchanged)
- [ ] Agent eligibility is correct for this workspace
- [ ] Per-workspace conventions are documented (or confirmed as same as default)
- [ ] No SDLC process duplication in the skill (TDD, commit format, PR structure)
- [ ] Skill doesn't reference `superpowers:` prefix (use companion skills note instead)

### Step 12: Commit and announce

- Commit all changes together — the skill and all project.md updates in one commit
- Message: `Add [skill-name] domain skill for [workspace] workspace`
- Announce: "Domain skill [name] is active. SDLC skills will apply it for [workspace] tasks."

## Checklist (copy-paste for PR description)

```markdown
## Domain skill: [name]

### Skill
- [ ] `.claude/skills/[name]/SKILL.md` created
- [ ] Description field is trigger-only (no workflow summary)
- [ ] Conventions are prescriptive with actual commands
- [ ] No SDLC process duplication

### project.md wiring
- [ ] Workspace skills table updated
- [ ] Workspace interfaces: updated / confirmed unchanged
- [ ] Change propagation patterns: updated / confirmed unchanged
- [ ] Agent eligibility: updated / confirmed unchanged
- [ ] Per-workspace conventions: updated / confirmed unchanged

### Verification
- [ ] Tested with a sample task (or reviewed with workspace expert)
```
