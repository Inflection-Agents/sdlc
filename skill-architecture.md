# Skill Architecture

How behavioral discipline, SDLC process, and domain expertise compose into a coherent system.

## Three layers

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Behavioral (Superpowers)                  │
│  ~/.claude/skills/                                  │
│                                                     │
│  TDD, verification, brainstorming, debugging,       │
│  writing-plans, dispatching-parallel-agents...      │
│                                                     │
│  Always active. Global discipline. Personal.        │
├─────────────────────────────────────────────────────┤
│  Layer 2: SDLC Process                              │
│  .claude/skills/ (repo root)                        │
│                                                     │
│  spec-authoring, task-decomposition,                │
│  sdlc-code-standards, sdlc-code-review,             │
│  jules-dispatch, bug-triage, sdlc-status            │
│                                                     │
│  Active during SDLC phases. Travel with repo.       │
├─────────────────────────────────────────────────────┤
│  Layer 1: Domain                                    │
│  .claude/skills/ (repo root, workspace-prefixed)    │
│                                                     │
│  dbt-cartographer, dbt-craftsman,                   │
│  nextjs-app-patterns, shared-package-patterns...    │
│                                                     │
│  Active when working in that workspace's context.   │
└─────────────────────────────────────────────────────┘
```

Each layer has a different job:

| Layer | Question it answers | Examples |
|-------|-------------------|---------|
| Behavioral | How should I approach any task? | Write failing test first. Verify before claiming done. No sycophancy. |
| SDLC Process | What lifecycle phase am I in and what's the process? | Spec → decompose → route → implement → review. Check acceptance criteria. |
| Domain | What are the rules for THIS technology/workspace? | dbt: CTE ordering, naming, macros. Next.js: App Router, Server Components. |

## How they compose

All three layers are active simultaneously. They don't conflict because they answer different questions. When an agent works on a dbt task:

1. **Behavioral** (superpowers): Write a failing test first. Verify before saying done.
2. **SDLC Process** (sdlc-code-standards): Check acceptance criteria from the task file. Reference SPEC-NNN in commits. Open a PR with the right format.
3. **Domain** (dbt-craftsman): Use CTE ordering. No raw CAST. snake_case naming. `is_*` boolean prefix.

### The wiring

```
Task file                    .ai/project.md               .claude/skills/
┌──────────────┐            ┌──────────────────┐          ┌──────────────────┐
│ workspace:   │───────────▶│ Workspace skills │─���───────▶│ dbt-craftsman/   │
│   dbt        │            │                  │          │   SKILL.md       │
│              │            │ dbt:             │          │                  │
│ agent:       │            │   dbt-cartographer│         │ dbt-cartographer/│
│   claude-code│            │   dbt-craftsman  │          │   SKILL.md       │
└──────────────┘            └──────────────────┘          └──────────────────┘
                                                          ┌──────────────────┐
SDLC skills read the task's                               │ sdlc-code-       │
workspace field, look up                                  │   standards/     │
domain skills in project.md,                              │   SKILL.md       │
and apply them alongside                                  └──────────────────┘
the SDLC process.
```

**The task file's `workspace` field is the link.** It connects the SDLC process layer to the domain layer via the workspace-skills mapping in `.ai/project.md`.

## Where skills physically live

**All skills at the repo root: `.claude/skills/`**

```
.claude/skills/
  # SDLC process (Layer 2) — prefixed sdlc- or named for the phase
  sdlc-code-standards/SKILL.md
  sdlc-code-review/SKILL.md
  spec-authoring/SKILL.md
  task-decomposition/SKILL.md

  # Domain: dbt (Layer 1) — prefixed with workspace/technology
  dbt-cartographer/SKILL.md
  dbt-craftsman/SKILL.md

  # Domain: Next.js apps (Layer 1)
  nextjs-app-patterns/SKILL.md

  # Domain: shared package (Layer 1)
  shared-package-patterns/SKILL.md
```

**Why root, not nested in workspaces?**

Claude Code loads skills from `.claude/skills/` relative to the working directory. In a monorepo, you typically work from the root. Skills in `dbt/.claude/skills/` are invisible from the root. Putting everything at root means:
- All skills are always visible
- No symlink gymnastics
- `git clone` gives you everything
- Naming convention (`dbt-*`, `nextjs-*`) makes the workspace association clear

**Superpowers stay personal** at `~/.claude/skills/`. They're behavioral discipline that applies to all projects, not project-specific process. Install once per machine.

## Precedence

When layers conflict:

1. **Domain-specific conventions override generic examples.** If sdlc-code-standards says "name things like `getUserByEmail`" and dbt-craftsman says "use snake_case and `is_*` prefix for booleans," the dbt convention wins for dbt code.

2. **SDLC process constraints are universal.** TDD, acceptance criteria verification, commit discipline, PR format — these apply regardless of domain. Domain skills don't override these.

3. **Behavioral iron laws are non-negotiable.** "No code without a failing test" and "no completion claims without verification" apply everywhere, in every domain, at every phase.

In practice: domain skills tell you WHAT to build and HOW to write it. SDLC skills tell you WHEN things happen and WHAT to verify. Behavioral skills ensure DISCIPLINE throughout.

## Domain skills that have their own orchestration

Some domain skills (like dbt-cartographer) have their own plan → execute model that predates the SDLC. These integrate rather than compete:

**dbt-cartographer's model:**
```
Excel spec → gap analysis → plan → human approval → spawn craftsman agents
```

**SDLC model:**
```
Spec → task decomposition → routing → implementation → review
```

**Integrated:**
```
SDLC spec (includes dbt changes)
  → task decomposition creates dbt-workspace tasks
    → dbt task says: "Use dbt-cartographer to plan and dbt-craftsman to implement"
      → cartographer reads the SDLC task's acceptance criteria
      → craftsman follows dbt conventions AND SDLC commit/PR discipline
    → SDLC code review applies dbt-craftsman rules + acceptance criteria check
```

The SDLC provides the lifecycle wrapper (spec, task, review). The domain skills provide the implementation expertise. Task files are the integration point — they carry acceptance criteria from the SDLC and reference domain skills for how to implement.

## Cross-workspace changes

**Hard rule: one workspace per task.** A task must target exactly one workspace. Cross-workspace changes are decomposed into separate tasks with explicit dependency edges.

This enables:
- Independent testing per workspace
- Clear agent routing (dbt → claude-code, app → possibly jules)
- Parallel execution of non-dependent consumer tasks
- Clean PRs that reviewers can evaluate against one domain's conventions

### What makes cross-workspace decomposition work

Three things in `.ai/project.md` give the decomposing agent the knowledge it needs:

1. **Workspace interfaces** — how workspaces interact at runtime (contracts, schemas, exports). The agent reads these to understand what crosses boundaries.

2. **Change propagation patterns** — recurring cross-workspace sequences (e.g., "new field: dbt → shared types → apps"). The agent follows these for task ordering.

3. **Boundary constraints on task files** — when a task produces output a downstream task consumes, its Constraints section specifies the exact contract (column names, types, exports). Without these, downstream tasks guess at the interface.

### Cross-cutting skills

Some cross-workspace patterns are complex enough to warrant a full skill — not a domain skill (which targets one workspace) but a **cross-cutting skill** that guides task decomposition and review across boundaries.

Use a cross-cutting skill when:
- The propagation pattern has non-obvious ordering or rollback requirements
- The boundary verification is complex (more than "check types match")
- The pattern recurs frequently and agents keep getting the decomposition wrong

Use project.md propagation patterns when:
- The ordering is straightforward (upstream → shared → consumers)
- The boundary contract is simple (column name + type, or export signature)

See `templates/cross-cutting-skill.md` for the template.

## Adding a new domain skill

Use the `create-domain-skill` skill. It walks through the full process and ensures all references are updated.

The short version — creating a domain skill touches:

1. `.claude/skills/[workspace]-[name]/SKILL.md` — the skill itself
2. `.ai/project.md` → Workspace skills table — the wiring that SDLC skills use to find it
3. `.ai/project.md` → Workspace interfaces — add/update if the skill reveals boundary contracts
4. `.ai/project.md` → Change propagation patterns — add/update if cross-workspace patterns exist
5. `.ai/project.md` → Agent eligibility — update if the skill changes what's jules-eligible
6. `.ai/project.md` → Per-workspace conventions — add if conventions differ from default

Missing any of these means the skill exists but is disconnected from the SDLC process.

The new skill should define:
- Technology-specific conventions (naming, patterns, structure)
- Workspace-specific verification commands
- Common mistakes and red flags for that technology
- Any domain-specific orchestration model (like cartographer → craftsman)

It does NOT need to:
- Know about the SDLC lifecycle (specs, tasks, Linear)
- Duplicate behavioral discipline (TDD, verification)
- Define PR format or commit conventions (SDLC handles that)

## Skill inventory for a typical monorepo

| Skill | Layer | Scope |
|-------|-------|-------|
| `test-driven-development` | Behavioral | All code |
| `verification-before-completion` | Behavioral | All work |
| `brainstorming` | Behavioral | Design phases |
| `systematic-debugging` | Behavioral | Bug investigation |
| `intent-triage` | SDLC Process | Intent capture and prioritization |
| `spec-authoring` | SDLC Process | Brainstorming + spec creation |
| `task-decomposition` | SDLC Process | Planning |
| `spec-amendment` | SDLC Process | Spec changes mid-flight |
| `spec-completion` | SDLC Process | Verify success criteria and close specs |
| `sdlc-code-standards` | SDLC Process | Implementation |
| `sdlc-code-review` | SDLC Process | Review |
| `jules-dispatch` | SDLC Process | Task routing |
| `bug-triage` | SDLC Process | Defect handling |
| `create-domain-skill` | SDLC Process | Onboarding new workspaces |
| `dbt-cartographer` | Domain | dbt planning |
| `dbt-craftsman` | Domain | dbt implementation |
| `nextjs-app-patterns` | Domain | Next.js app workspaces |
| `shared-package-patterns` | Domain | Shared library |
