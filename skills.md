# SDLC Skills

Skills are how agents learn to follow the SDLC process at the right moment. They plug into the existing superpowers skill system (using-superpowers, writing-plans, executing-plans, etc.) and add SDLC-specific workflows.

## Skill map

The SDLC has distinct phases. Each phase needs a skill that tells the agent exactly what to do.

```
Intent arrives ("I want to build X", "we need to fix Y", brain dump)
  │
  ├─ /intent-triage          ← capture, organize, prioritize raw intents (ENTRY POINT)
  │
  ├─ /spec-authoring         ← brainstorm + formalize one intent into a structured spec
  │
  ├─ /task-decomposition     ← break a spec into a dependency graph of tasks
  │
  ├─ /spec-amendment         ← amend a spec when reality pushes back mid-flight
  │
  ├─ /spec-completion        ← verify success criteria and close out a finished spec
  │
  ├─ /jules-dispatch         ← route and fire jules-eligible tasks
  │
  ├─ /sdlc-code-standards    ← coding principles (DRY, YAGNI, etc.) applied during implementation
  │
  ├─ /sdlc-code-review       ← review PRs against spec + acceptance criteria + standards
  │
  ├─ /bug-triage              ← NOC agent workflow: intake → normalize → reproduce → classify
  │
  ├─ /sdlc-status             ← report on spec/task/cycle progress across repo + Linear
  │
  └─ /create-domain-skill     ← onboard a new workspace: create skill + wire all references
```

## How they relate to existing skills

| Existing skill | SDLC skill | Relationship |
|----------------|------------|-------------|
| `brainstorming` | `spec-authoring` (Phase 1) | Existing skill does generic design exploration. SDLC skill absorbs the discipline (hard gates, one question at a time, propose approaches) and adds SDLC-specific outputs: workspace scoping, ADR identification, acceptance criteria. |
| `writing-plans` | `spec-authoring` (Phase 2) + `task-decomposition` | Existing skill writes generic plans. SDLC skills produce structured specs + task files with frontmatter, dependency graphs, and Linear integration. |
| `executing-plans` | `jules-dispatch` | Existing skill executes locally in batches. SDLC skill dispatches to Jules for parallel cloud execution. |
| `requesting-code-review` | `sdlc-code-review` | Existing skill does generic review. SDLC skill reviews against spec acceptance criteria, ADR constraints, and coding standards. |
| `systematic-debugging` | `bug-triage` | Existing skill debugs locally. SDLC skill runs the full triage pipeline: Linear intake → bug spec → reproduction → classification. |
| `test-driven-development` | `sdlc-code-standards` | TDD is one standard among many. SDLC skill bundles TDD with DRY, YAGNI, and project-specific conventions. |
| `writing-skills` + `skill-creator` | `create-domain-skill` | Existing skills handle how to write good skills (TDD for docs, eval workflows). SDLC skill adds the wiring: project.md updates, workspace mapping, interface documentation. |

## Three-layer skill model

Skills form three layers. See [skill-architecture.md](skill-architecture.md) for the full design.

```
Layer 3: Behavioral (Superpowers)     ~/.claude/skills/        personal
Layer 2: SDLC Process                 .claude/skills/          project (repo root)
Layer 1: Domain                       .claude/skills/          project (repo root)
```

All three are active simultaneously. They compose, not conflict:
- **Behavioral** answers: how should I approach any task? (TDD, verification, no sycophancy)
- **SDLC Process** answers: what phase am I in, what's the process? (spec → task → implement → review)
- **Domain** answers: what are the rules for THIS technology? (dbt CTE ordering, Next.js App Router)

### Where skills physically live

```
your-repo/
├── .claude/skills/             ← ALL project skills at root (travel with the repo)
│   │
│   │  # SDLC process skills (Layer 2)
│   ├── spec-authoring/SKILL.md
│   ├── task-decomposition/SKILL.md
│   ├── sdlc-code-standards/SKILL.md
│   ├── sdlc-code-review/SKILL.md
│   ├── jules-dispatch/SKILL.md     (to be created)
│   ├── bug-triage/SKILL.md         (to be created)
│   ├── sdlc-status/SKILL.md        (to be created)
│   │
│   │  # Domain skills (Layer 1) — prefixed by workspace/technology
│   ├── dbt-cartographer/SKILL.md
│   ├── dbt-craftsman/SKILL.md
│   ├── nextjs-app-patterns/SKILL.md
│   └── shared-package-patterns/SKILL.md
│
├── .ai/                        ← agent config (process definition)
│   └── project.md              ← maps workspaces → domain skills
├── specs/                      ← specs, tasks, ADRs, bugs
└── src/                        ← code

~/.claude/skills/               ← personal skills (Layer 3, stay on your machine)
├── brainstorming/              ← superpowers
├── test-driven-development/
├── verification-before-completion/
├── morning-brief/              ← personal
├── trading-dashboard/
└── ...
```

**Why all at root?** Claude Code loads skills from `.claude/skills/` relative to the working directory. In a monorepo, you work from root. Skills in `dbt/.claude/skills/` are invisible from root. Root placement means everything is always visible — naming convention (`dbt-*`, `nextjs-*`) signals the scope.

Claude Code loads both personal and project skills. Project skills override personal skills if names collide.

### How SDLC skills find domain skills

The task file's `workspace` field is the link:

1. Task file says `workspace: dbt`
2. `.ai/project.md` maps `dbt` → domain skills: `dbt-cartographer`, `dbt-craftsman`
3. SDLC skills (code-standards, code-review, task-decomposition) read this mapping and apply domain conventions alongside SDLC process

This is declarative — adding a new domain skill just requires creating the SKILL.md and adding it to the workspace-skills table in project.md.

### Portability

- **New team member clones repo** → gets all skills automatically. Claude Code picks them up.
- **Jules** doesn't use Claude Code skills directly, but it reads `.ai/AGENTS.md` and the task files, which encode the same principles.
- **Switching to Gemini CLI** → the skills are markdown. Adapt the SKILL.md format to Gemini's skill convention. The content (process, checklists, standards) stays the same.

### What's personal vs. project

| Personal (`~/.claude/skills/`) | Project (`.claude/skills/` in repo) |
|-------------------------------|-------------------------------------|
| Superpowers (behavioral discipline) | SDLC process skills |
| Your personal workflow skills | Domain skills for this project's workspaces |
| Anything not project-specific | Anything a new team member needs |

## Skill details

### 0. intent-triage (ENTRY POINT)

**Trigger:** "I want to," "we need to," "we should," brain dump, session start, or "show me the backlog"

**This is where intent enters the SDLC.** Captures raw ideas fast, organizes related intents, and helps prioritize what to spec first.

Three modes:
- **Capture:** Listen to the user, reflect back distinct intents, write to `specs/intents.md`. One sentence per intent. No structure required.
- **Organize:** Group related intents, identify dependencies/conflicts, propose merges or splits.
- **Prioritize & hand off:** Present top candidates with reasoning, user picks one, hand off to spec-authoring.

**Rules:** One intent in-progress at a time. Intents are NOT specs. Dead intents get deleted. The user prioritizes, not the agent.

**Interacts with:** `spec-authoring` (downstream — receives one prioritized intent)

### 1. spec-authoring

**Trigger:** Intent is ready and picked from the backlog, or user arrives with a single clear intent

**Two phases, two human gates:**

**Phase 1 — Brainstorming** (conversational, exploratory):
1. Capture the user's intent — listen for the real problem, not just the stated one
2. Explore the problem space — one question at a time, monorepo scoping
3. Research the codebase — existing code, ADRs, in-flight work, domain skills
4. Propose 2-3 approaches with trade-offs and a recommendation
5. Converge on a design — iterate until aligned
6. **GATE: User approves the design direction**

**Phase 2 — Formalization** (structured, reviewable):
7. Write the structured spec with correct frontmatter and all required sections
8. Create ADRs for non-obvious design decisions
9. Self-review for gaps, contradictions, untestable criteria
10. **GATE: User approves the spec**
11. Open a PR, after approval: set status to `active`, create Linear project

**Interacts with:** `brainstorming` (behavioral discipline for the conversation), `writing-plans` (no-placeholder discipline for the spec), domain skills (technology-specific constraints)

### 2. task-decomposition

**Trigger:** spec has status `active` and no task files exist yet, "decompose this spec," "break this down." Also triggers in **re-planning mode** when existing tasks need restructuring: "this task is too big," "split this," "we need a prerequisite task," "merge these tasks."

**What it does (initial decomposition):**
1. Reads the spec (design, acceptance criteria, constraints, risks)
2. Breaks into independently-implementable tasks
3. Builds the dependency graph
4. Applies routing labels (jules / claude-code / human) using eligibility rules
5. Produces task files with frontmatter + body + `_index.yaml`
6. Opens a PR for the task decomposition
7. After approval: creates Linear issues from task files

**What it does (re-planning mode):**
1. Reads the current task graph and identifies what needs to change
2. Splits, merges, adds, cancels, or re-routes tasks
3. Rewires dependency graph — no circular deps, no dangling references
4. Updates `_index.yaml` and Linear issues
5. Distinct from spec-amendment: re-planning changes the task graph structure, not the spec

**Key rules:**
- Each task maps to one or a few acceptance criteria
- Dependencies are explicit and minimal (maximize parallelism)
- Jules-eligible tasks have everything in the task file (no assumed context)
- Tasks are small enough for a single PR
- Re-planning: if acceptance criteria or design changed, use spec-amendment instead

**Interacts with:** `spec-authoring` (runs after spec is approved), `jules-dispatch` (runs before dispatch), `spec-amendment` (when re-planning is needed)

### 2b. spec-amendment

**Trigger:** implementation reveals the spec is wrong, user changes requirements mid-flight, code review finds a design flaw, external dependency shifts

**What it does:**
1. Classifies the change: cosmetic (no version bump), additive (new scope), or breaking (changed design/criteria)
2. For additive/breaking: bumps spec version, writes changelog entry
3. Runs task impact analysis across all tasks in the graph
4. Updates pending tasks, signals in-progress agents, creates rework tasks for completed work that's now invalid
5. Cancels obsolete tasks, creates new tasks for added scope
6. Updates `_index.yaml` dependency graph
7. Gets user approval, commits everything together, updates Linear

**Key rules:**
- No implementation against a known-wrong spec — stop and amend
- No breaking changes without user approval
- No silent task invalidation — every affected task is explicitly handled
- When >50% of tasks need rework, supersede the spec instead of amending

**Interacts with:** `spec-authoring` (amendment is the backward path; authoring is the forward path), `task-decomposition` (may trigger partial re-decomposition), `jules-dispatch` (signals in-progress Jules tasks)

### 2c. spec-completion

**Trigger:** all tasks for a spec are done or cancelled, "is this spec finished?", "close out SPEC-NNN," "what shipped?"

**What it does:**
1. Checks that all tasks in the graph are `done` or `cancelled` (with documented reasons)
2. Maps each success criterion to a verification type: task-covered, integration, measurement, or manual
3. Verifies task-covered criteria by tracing to passing acceptance criteria
4. Runs integration verification (e2e tests, cross-task validation)
5. Handles measurement criteria: verify now or defer to production with owner + deadline
6. Builds a completion report with evidence for each criterion
7. Gets user sign-off, then sets spec to `completed`, updates Linear

**Key rules:**
- Merged PRs are not the finish line — verified success criteria are
- Deferred-to-production criteria must have an owner, deadline, and dashboard
- Cancelled tasks need documented reasons (amendment, scope reduction)
- User makes the final call

**Interacts with:** `spec-authoring` (bookend — authoring opens, completion closes), `spec-amendment` (if completion reveals the spec needs changes, amend first), `sdlc-status` (completion data feeds status reporting)

### 3. jules-dispatch

**Trigger:** task files exist with `agent: jules` and `status: pending`, "dispatch jules tasks," "fire off the jules work"

**What it does:**
1. Reads `_index.yaml` to find ready tasks (all dependencies done)
2. **Verifies upstream contracts** for each ready task: checks that boundary constraints from completed dependencies actually exist in the codebase (schema, exports, columns). If a contract is missing or different, flags it instead of dispatching.
3. For each ready jules-eligible task:
   a. Reads the task file
   b. Assembles the Jules prompt (context + requirements + acceptance criteria + constraints + verification)
   c. Calls Jules API with `automationMode: AUTO_CREATE_PR`
   d. Logs session ID on the Linear issue and task file
4. Reports what was dispatched and estimated completion
5. Monitors for completion (or tells user to check back)

**Interacts with:** `task-decomposition` (depends on task files), `sdlc-code-review` (review Jules PRs when they arrive), `spec-amendment` (when upstream contract verification fails)

### 4. sdlc-code-standards

**Trigger:** during any implementation work — writing code, reviewing code, opening PRs

**What it encodes:**
- **DRY:** Don't repeat yourself. Extract shared logic. But don't abstract prematurely — three instances before extracting.
- **YAGNI:** Don't build what you don't need. No speculative features, no "might need this later." If the spec doesn't ask for it, don't build it.
- **TDD:** Write the failing test first. Red → Green → Refactor. References existing `test-driven-development` skill.
- **Single responsibility:** Each function/module does one thing. If you can't name it clearly, it's doing too much.
- **Explicit over implicit:** Name things clearly. Avoid magic numbers. Make dependencies visible.
- **Error handling at boundaries:** Validate at system edges (user input, API calls). Trust internal code.
- **Commit discipline:** Small, frequent commits. Each commit should be a coherent unit. Message references the spec/task ID.
- **No dead code:** Don't comment out code. Don't leave unused imports. Delete it.
- **Tests are documentation:** Tests should read like spec acceptance criteria. Given/When/Then.

**This is a rigid skill** — follow exactly, don't adapt away discipline.

### 5. sdlc-code-review

**Trigger:** PR is ready for review (yours, Jules's, or a teammate's), "review this PR," PR arrives from Jules

**What it does:**
1. Reads the PR diff
2. Finds the linked spec and task (from PR title `SPEC-NNN` / `TASK-NNN`)
3. Reads the task file for acceptance criteria
4. Reads linked ADRs for constraints
5. Checks each acceptance criterion:
   - Is it addressed in the diff?
   - Is there a test for it?
   - Does it pass?
6. Checks coding standards (DRY, YAGNI, TDD, naming, error handling)
7. Checks for regressions (does the diff break anything outside the task scope?)
8. Produces a review with: criteria checklist, standards compliance, concerns, verdict

**Verdicts:**
- **Approve:** All criteria met, standards followed, no concerns
- **Request changes:** Specific issues with specific fixes
- **Escalate:** Architectural concern, spec ambiguity, or scope creep that needs human judgment

**Interacts with:** `requesting-code-review` (extends it with spec-awareness), `sdlc-code-standards` (applies standards during review)

### 6. bug-triage

**Trigger:** new `bug`-labeled issue in Linear, "triage this bug," "check for new bugs"

**What it does:**
1. Reads new `bug`-labeled Linear issues
2. For each:
   a. Reads the issue description
   b. Asks clarifying questions (as Linear comments) if needed
   c. Searches repo for related specs, recent deploys, similar bugs
   d. Attempts reproduction locally
   e. Creates bug spec file in `specs/bugs/`
   f. Updates Linear issue with structured data + `needs-confirmation` label
3. Summarizes what was triaged and what needs human confirmation

**Escalation rules are hard-coded:** security, data loss, payments → immediate human handoff.

**Interacts with:** `systematic-debugging` (for reproduction), `task-decomposition` (after confirmation, creates fix tasks)

### 7. sdlc-status

**Trigger:** "what's the status," "where are we," "give me a summary," start of session

**What it does:**
1. Reads `spec-index.json` for active specs
2. For each active spec, reads `_index.yaml` for task status
3. Queries Linear for live status updates
4. Produces a summary: specs in progress, tasks done/in-progress/blocked, Jules tasks dispatched, bugs in triage
5. Flags: stale tasks, blocked work, specs with no tasks yet
6. **Flags specs ready for completion:** if all tasks are `done`/`cancelled` but spec is still `active`, flag it: "SPEC-NNN has all tasks done — run spec-completion to verify success criteria and close it out."
7. **Flags workspace collisions:** if two or more active specs have tasks (pending or in-progress) in the same workspace, flag it: "SPEC-NNN and SPEC-MMM both have active tasks in [workspace] — risk of merge conflicts or behavioral conflicts."

## Implementation order

Build these in order of immediate value for the refactoring effort:

1. **sdlc-code-standards** — needed for every implementation task. Quick to write, high daily impact.
2. **spec-authoring** — needed first in the lifecycle. You're about to write a spec for the refactor.
3. **task-decomposition** — needed right after the spec. Produces the task files.
4. **spec-amendment** — needed once implementation starts and reality pushes back.
5. **spec-completion** — needed once the first spec's tasks are all done.
6. **sdlc-code-review** — needed once PRs start flowing.
7. **jules-dispatch** — needed once jules-eligible tasks exist.
8. **bug-triage** — needed when bugs surface during the refactor.
9. **sdlc-status** — quality-of-life, build when you want dashboards.

## Relationship to .ai/ config

Skills are the "how" — they encode specific workflows Claude Code follows.
`.ai/sdlc.md` is the "what" — it defines the process any agent follows.
`.ai/project.md` is the "where" — it maps workspaces to domain skills and conventions.

```
.ai/sdlc.md      → "Tasks have frontmatter with acceptance criteria"
SDLC skill        → "Here's exactly how to decompose a spec into task files step by step"

.ai/CLAUDE.md     → "Review all PRs against the spec"
SDLC skill        → "Here's the exact checklist: read diff, find spec, check each criterion..."

.ai/project.md    → "dbt workspace uses dbt-cartographer and dbt-craftsman"
Domain skill      → "Here's how to write dbt models: CTE ordering, naming, macros..."
```

## Relationship to domain skills

SDLC skills and domain skills are complementary, not competing:

| SDLC skill (Layer 2) | Domain skill (Layer 1) | How they compose |
|---|---|---|
| sdlc-code-standards | dbt-craftsman | SDLC enforces TDD/DRY/YAGNI universally. Craftsman adds CTE ordering, naming, macros for dbt code. |
| sdlc-code-review | dbt-craftsman | Review checks acceptance criteria (SDLC) AND dbt style rules (domain). |
| task-decomposition | dbt-cartographer | SDLC creates the task files. Cartographer's plan model becomes the implementation detail within a dbt task. |
| sdlc-code-standards | nextjs-app-patterns | SDLC enforces universals. Domain adds App Router, Server Component, module conventions. |

Domain skills with their own orchestration (like cartographer → craftsman) integrate with the SDLC rather than being replaced by it. The SDLC provides the lifecycle wrapper; the domain skill provides the implementation expertise. See [skill-architecture.md](skill-architecture.md) for details.
