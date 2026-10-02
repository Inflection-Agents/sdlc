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
│  skills/  (.claude/skills → it)                 │
│                                                     │
│  intent-triage, spec-authoring, spec-reviewer,      │
│  spec-execution, pr-reviewer,                       │
│  sdlc-code-review, sdlc-code-standards,             │
│  spec-amendment, spec-completion,                   │
│  create-domain-skill                                │
│                                                     │
│  Active during SDLC phases. Travel with repo.       │
├─────────────────────────────────────────────────────┤
│  Layer 1: Domain                                    │
│  skills/  (.claude/skills → it, workspace-pref.) │
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
| SDLC Process | What lifecycle phase am I in and what's the process? | Spec + delivery guide → implement → review. Check acceptance criteria. |
| Domain | What are the rules for THIS technology/workspace? | dbt: CTE ordering, naming, macros. Next.js: App Router, Server Components. |

## The delivery engine and the spine

The three skill layers describe *knowledge* agents apply. Underneath the SDLC-process layer sits the **delivery engine** — which is itself a skill — and the **spine** that carries it: the machinery that turns a signed-off spec and its delivery guide into merged code without further human attention.

```
┌─────────────────────────────────────────────────────────────────────┐
│  JUDGMENT (human + LLM)          │  DELIVERY (autonomous)             │
│  intent-triage → spec-authoring  │  spec-execution                    │
│   (spec + delivery guide)        │   = the skill IS the engine        │
│  (Layer-2 skills, gated)         │   (policy: SKILL.md · how: SOP.md) │
└─────────────────────────────────────────────────────────────────────┘
                          rides on the SPINE:
  .sdlc/state-machine.yaml   ← single source of truth: phases, triggers, transitions
  _index.yaml `phase:` block      ← per-spec phase memory (read on entry, written on exit)
  _index.yaml `plan_review:` block← the fail-closed gate a delivery run checks before it starts
  specs/tasks/SPEC-NNN/GUIDE.md   ← the delivery guide, checked by validate-guide.mjs (ADR-007)
  .claude/.sdlc-goal-<session_id> ← the run's goal leash, enforced by the Stop hook
  .claude/hooks/*.mjs             ← classify prompt, handoff at phase exit + goal leash, guard edits/review
  skills/review-primitives.md │ review-envelope.schema.json
                                   ← review contracts: severity spine, output schema
  .sdlc/review-constraints.yaml← the lens registry; repo-specific, so outside skills/
  .sdlc/scripts/*.mjs              ← validators + gates: state machine, phase memory, gen-handoffs,
                                     plan-gate, validate-guide, reviewer-routing, envelope validation,
                                     registry globs
```

- **Delivery is single-executor and agent-agnostic.** The agent running `spec-execution` implements every guide step itself; specialization is *data* on the step (`Changes:`, `Workspace:`, `Risk:`, `Run by:`, `Notes:` contracts), not a separate executor backend. Worktree-isolated subagents are an exception for large specs.
- **Code review's reviewer of record is the LLM multi-lens panel** (`pr-reviewer` grades → `sdlc-code-review` renders), dispatched at the integration gate and routed by `review-primitives.md`. Per step, the gate is the step's `Verify:` commands plus the executor's self-review. Humans gate the judgment-phase inputs and merge the integration PR; they are not the per-PR reviewers.
- **The state machine is authoritative.** The `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` phase narrative and each skill's `## Handoff` footer are generated/validated from `.sdlc/state-machine.yaml` — don't restate phase info in the skills.

## The three review moments

Review happens at three distinct moments in the lifecycle, each with its own trigger, owner, and artifact under review. They are *not* the same gate at different times — they grade different things:

```
plan review          self-review            integration review
(spec + guide)        (per-step diff)        (whole spec, adversarial panel)
before any code  →    during delivery     →  at the gate
spec-reviewer +       the executor itself     integration-reviewer + pr-reviewer
validate-guide.mjs    (no reviewer dispatch)  lenses → sdlc-code-review renders
```

| Moment | When (trigger) | Artifact reviewed | Owner |
|--------|----------------|-------------------|-------|
| **Plan review** | At the one spec-and-guide sign-off gate, *before any code exists* | The spec + its delivery guide (steps, `Covers:`, `Changes:`, owner decisions) | `spec-reviewer` grades the spec; `validate-guide.mjs` checks the guide; the owner approves both |
| **Self-review** | Per guide step, *during* delivery, before its PR opens | One step's diff vs its `Covers:` ACs, its `Changes:` and the spec | The executor itself — the deliberate exception to author≠reviewer independence |
| **Integration review** | At the *end*, on the integration PR (`feat/spec-NNN → main`) | The assembled diff: the whole spec vs its success criteria, plus every registry constraint that fires across it | An independently dispatched panel — `integration-reviewer` + adversarial `task-reviewer` + routed lenses; `pr-reviewer` grades, `sdlc-code-review` renders |

Spending review effort up front (plan review) is the cheapest place to assure quality — the central wager of "judgment up front, autonomous delivery behind." The pre-code gate is **plan review**, never "spec review" alone (the spec is only half of it — the guide is approved with it). Independence is traded away per step and bought back in full at the integration gate, where every verdict comes from a separately dispatched reviewer.

## How they compose

All three layers are active simultaneously. They don't conflict because they answer different questions. When an agent works on a dbt step:

1. **Behavioral** (superpowers): Write a failing test first. Verify before saying done.
2. **SDLC Process** (sdlc-code-standards): Check the acceptance criteria in the step's `Covers:`. Reference SPEC-NNN in commits. Open a PR with the right format.
3. **Domain** (dbt-craftsman): Use CTE ordering. No raw CAST. snake_case naming. `is_*` boolean prefix.

### The wiring

```
Guide step                   .sdlc/config.yaml       .claude/skills/
┌──────────────┐            ┌──────────────────┐          ┌──────────────────┐
│ Workspace:   │───────────▶│ Workspace skills │─���───────▶│ dbt-craftsman/   │
│   dbt        │            │                  │          │   SKILL.md       │
│              │            │ dbt:             │          │                  │
│ Covers:      │            │   dbt-cartographer│         │ dbt-cartographer/│
│   AC-003     │            │   dbt-craftsman  │          │   SKILL.md       │
└──────────────┘            └──────────────────┘          └──────────────────┘
                                                          ┌──────────────────┐
SDLC skills read the step's                               │ sdlc-code-       │
Workspace: field, look up                                  │   standards/     │
domain skills in project.md,                              │   SKILL.md       │
and apply them alongside                                  └──────────────────┘
the SDLC process.
```

**A guide step's `Workspace:` field is the link.** It connects the SDLC process layer to the domain layer via each workspace's `skills` in `.sdlc/config.yaml`.

## Where skills physically live

**Skills live in `skills/`; `.claude/skills` is a symlink to it.**

```
skills/               ← single source of truth for all SDLC skills
  # SDLC process (Layer 2)
  intent-triage/SKILL.md
  spec-authoring/SKILL.md
  spec-reviewer/SKILL.md
  spec-execution/SKILL.md
  spec-amendment/SKILL.md
  spec-completion/SKILL.md
  pr-reviewer/SKILL.md
  sdlc-code-review/SKILL.md
  sdlc-code-standards/SKILL.md
  create-domain-skill/SKILL.md
  review-primitives.md      ← review contract: severity spine, policy (not a skill)
  review-envelope.schema.json ← the one reviewer-output schema (not a skill)
  # the lens/constraint registry keyed on `touches` is repo-specific and lives
  # outside this tree, at .sdlc/review-constraints.yaml

  # Domain: dbt (Layer 1) — prefixed with workspace/technology
  dbt-cartographer/SKILL.md
  dbt-craftsman/SKILL.md

  # Domain: Next.js apps (Layer 1)
  nextjs-app-patterns/SKILL.md

.claude/skills → ../skills    ← symlink; Claude Code loads from here
```

**Why `skills/` is authoritative, not `.claude/skills/`.** Claude Code loads skills from `.claude/skills/` relative to the working directory. The framework authors its skills at `skills/` and ships them in the plugin. A repo without the plugin keeps its copies in `.sdlc/skills/`. Either way the `.claude/skills` symlink is how Claude Code finds them without duplicating the files.

**Why root, not nested in workspaces?** In a monorepo, you typically work from the root. Skills in `dbt/.claude/skills/` are invisible from the root. All skills at root means:
- All skills are always visible regardless of cwd
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
Spec + delivery guide → implementation → review
```

**Integrated:**
```
SDLC spec (includes dbt changes)
  → the delivery guide has a step with Workspace: dbt
    → the step's Notes: say: "Use dbt-cartographer to plan and dbt-craftsman to implement"
      → cartographer reads the acceptance criteria in the step's Covers:
      → craftsman follows dbt conventions AND SDLC commit/PR discipline
    → SDLC code review applies dbt-craftsman rules + acceptance criteria check
```

The SDLC provides the lifecycle wrapper (spec, guide, review). The domain skills provide the implementation expertise. Guide steps are the integration point — they name acceptance criteria from the spec and the workspace whose domain skills say how to implement.

## Cross-workspace changes

**Hard rule: one workspace per guide step.** When `.sdlc/config.yaml` `workspaces` defines workspaces, every step names exactly one `Workspace:` (validator rule 8). A cross-workspace change becomes separate steps, ordered upstream first.

This enables:
- Independent testing per workspace
- Clear handling of work only a human can run (a `Run by:` step)
- Parallel execution of independent consumer steps (`After:` makes the independence explicit)
- Clean PRs that reviewers can evaluate against one domain's conventions

### What makes cross-workspace guides work

Three things give the agent writing the guide the knowledge it needs:

1. **Workspace interfaces** — how workspaces interact at runtime (contracts, schemas, exports). The agent reads these to understand what crosses boundaries.

2. **Change propagation patterns** — recurring cross-workspace sequences (e.g., "new field: dbt → shared types → apps"). The agent follows these for step ordering.

3. **Contracts in a step's `Notes:`** — when a step produces output a later step consumes, its `Notes:` state the exact contract (column names, types, exports), and `task:blocks:<id>` grounds on it. Without these, later steps guess at the interface.

### Cross-cutting skills

Some cross-workspace patterns are complex enough to warrant a full skill — not a domain skill (which targets one workspace) but a **cross-cutting skill** that guides guide-writing and review across boundaries.

Use a cross-cutting skill when:
- The propagation pattern has non-obvious ordering or rollback requirements
- The boundary verification is complex (more than "check types match")
- The pattern recurs frequently and agents keep getting the step order wrong

Use project.md propagation patterns when:
- The ordering is straightforward (upstream → shared → consumers)
- The boundary contract is simple (column name + type, or export signature)

See `.sdlc/templates/cross-cutting-skill.md` for the template.

## Adding a new domain skill

Use the `create-domain-skill` skill. It walks through the full process and ensures all references are updated.

The short version — creating a domain skill touches:

1. `skills/[workspace]-[name]/SKILL.md` — the skill itself (`.claude/skills` is a symlink to `skills/`)
2. `.sdlc/config.yaml` → the workspace's `skills` — the wiring that SDLC skills use to find it
3. `AGENTS.md` SDLC block → Workspace interfaces — add/update if the skill reveals boundary contracts
4. `AGENTS.md` SDLC block → Change propagation patterns — add/update if cross-workspace patterns exist
5. `.sdlc/config.yaml` → the workspace's `agent_executable` — update if the skill changes what's agent-executable
6. `AGENTS.md` SDLC block → Per-workspace conventions — add if conventions differ from default

Missing any of these means the skill exists but is disconnected from the SDLC process.

The new skill should define:
- Technology-specific conventions (naming, patterns, structure)
- Workspace-specific verification commands
- Common mistakes and red flags for that technology
- Any domain-specific orchestration model (like cartographer → craftsman)

It does NOT need to:
- Know about the SDLC lifecycle (specs, guides, Linear)
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
| `spec-authoring` | SDLC Process | Brainstorming + spec creation + delivery guide and kickoff prompt |
| `spec-reviewer` | SDLC Process | Spec quality gate (graded JSON findings) |
| `spec-execution` | SDLC Process | End-to-end delivery: goal leash, task list, serial burn-down, integration gate |
| `spec-amendment` | SDLC Process | Spec changes mid-flight |
| `spec-completion` | SDLC Process | Verify success criteria and close specs |
| `pr-reviewer` | SDLC Process | PR quality gate (graded JSON findings, machine-parseable) |
| `sdlc-code-standards` | SDLC Process | Implementation |
| `sdlc-code-review` | SDLC Process | PR review: renders pr-reviewer findings as human-readable comment |
| `create-domain-skill` | SDLC Process | Onboarding new workspaces |
| `dbt-cartographer` | Domain | dbt planning |
| `dbt-craftsman` | Domain | dbt implementation |
| `nextjs-app-patterns` | Domain | Next.js app workspaces |
| `shared-package-patterns` | Domain | Shared library |

Not skills (but part of the system): `.sdlc/state-machine.yaml` (the spine's source of truth), `.claude/hooks/*.mjs` (the phase hooks and the delivery goal leash), `.sdlc/scripts/*.mjs` (validators + delivery gates), and the review contracts (`review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`).
