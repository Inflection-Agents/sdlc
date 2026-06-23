# SDLC Skills

Skills are how agents learn to follow the SDLC process at the right moment. They plug into Claude Code's skill system and add SDLC-specific workflows.

## The three-phase grouping

The SDLC splits into **judgment up front, deterministic execution behind** (see `.ai/sdlc.md` → "The phase model"). The skills group along that split:

```
intent-triage → spec-authoring → task-decomposition │ spec-execution → review → spec-completion
  (human+LLM)     (human+LLM)       (human+LLM)      │  (DETERMINISTIC)   (LLM)    (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──  │  ── AUTONOMOUS ENGINE ──
```

| Group | Skills | Reviewer of record |
|---|---|---|
| **Judgment** (human + LLM, gated) | `intent-triage`, `spec-authoring` (+`spec-reviewer`), `task-decomposition` | humans, at hard sign-off gates |
| **Deterministic execution** (autonomous) | `spec-execution` (the engine) | — runs without human attention |
| **Review + completion** (LLM panel; human merges) | `pr-reviewer`, `sdlc-code-review`, `spec-completion`, `spec-amendment` | LLM multi-lens panel; humans merge the integration PR |

`sdlc-code-standards` and `create-domain-skill` are cross-cutting (standards apply during all implementation; create-domain-skill onboards new workspaces).

## Skill map

Each phase has a skill that tells the agent exactly what to do.

```
Intent arrives ("I want to build X", "we need to fix Y", brain dump)
  │
  ── JUDGMENT (human + LLM, collaborative, gated) ────────────────────────────
  ├─ /intent-triage          ← capture, organize, prioritize raw intents (ENTRY POINT)
  │
  ├─ /spec-authoring         ← brainstorm + formalize one intent into a structured spec
  │    └─ /spec-reviewer     ← review draft spec for quality (auto-invoked by spec-authoring)
  │
  ├─ /task-decomposition     ← break a spec into an AI-coherent dependency graph of tasks
  │
  ── DETERMINISTIC EXECUTION (autonomous engine) ─────────────────────────────
  ├─ /spec-execution         ← THE engine: waves, Tier-0 gate, routed review, fix-loop, merge
  │    │                        reference impl: .claude/workflows/execute-spec.js
  │    ├─ /pr-reviewer       ← LLM lens: emit graded JSON findings (machine-parseable)
  │    └─ /sdlc-code-review  ← render pr-reviewer findings as a human-readable review comment
  │
  ── REVIEW + COMPLETION (LLM panel; human merges) ───────────────────────────
  ├─ /spec-amendment         ← amend a spec when reality pushes back mid-flight (engine escalates here)
  │
  ├─ /spec-completion        ← verify success criteria and close out a finished spec
  │
  ── CROSS-CUTTING ───────────────────────────────────────────────────────────
  ├─ /sdlc-code-standards    ← coding principles (DRY, YAGNI, etc.) applied during implementation
  │
  └─ /create-domain-skill    ← onboard a new workspace: create skill + wire all references
```

## How they relate to existing skills

| Existing skill | SDLC skill | Relationship |
|----------------|------------|-------------|
| `brainstorming` | `spec-authoring` (Phase 1) | Existing skill does generic design exploration. SDLC skill absorbs the discipline (hard gates, one question at a time, propose approaches) and adds SDLC-specific outputs: workspace scoping, ADR identification, acceptance criteria. |
| `writing-plans` | `spec-authoring` (Phase 2) + `task-decomposition` | Existing skill writes generic plans. SDLC skills produce structured specs + task files with frontmatter, dependency graphs, and Linear integration. |
| `executing-plans` | `spec-execution` | Existing skill executes locally in batches. SDLC skill drives the full spec lifecycle: wave-based dispatch, tiered review, fix-loop, integration PR. |
| `requesting-code-review` | `sdlc-code-review` | Existing skill does generic review. SDLC skill reviews against spec acceptance criteria, ADR constraints, and coding standards. |
| `writing-skills` + `skill-creator` | `create-domain-skill` | Existing skills handle how to write good skills. SDLC skill adds the wiring: project.md updates, workspace mapping, interface documentation. |

## Three-layer skill model

Skills form three layers. See [skill-architecture.md](skill-architecture.md) for the full design.

```
Layer 3: Behavioral (Superpowers)     ~/.claude/skills/                personal
Layer 2: SDLC Process                 .ai/skills/ (.claude/skills → it) project (repo root)
Layer 1: Domain                       .ai/skills/ (.claude/skills → it) project (repo root)
```

(`.claude/skills` is a symlink to `.ai/skills/` — the single source of truth. Claude Code loads from the symlink; both paths point to the same content.)

All three are active simultaneously. They compose, not conflict:
- **Behavioral** answers: how should I approach any task? (TDD, verification, no sycophancy)
- **SDLC Process** answers: what phase am I in, what's the process? (spec → task → implement → review)
- **Domain** answers: what are the rules for THIS technology? (dbt CTE ordering, Next.js App Router)

### Where skills physically live

```
your-repo/
├── .ai/skills/             ← ALL SDLC skills live here (single source of truth)
│   ├── intent-triage/SKILL.md
│   ├── spec-authoring/SKILL.md
│   ├── spec-reviewer/SKILL.md
│   ├── task-decomposition/SKILL.md
│   ├── spec-execution/SKILL.md
│   ├── spec-amendment/SKILL.md
│   ├── spec-completion/SKILL.md
│   ├── pr-reviewer/SKILL.md
│   ├── sdlc-code-review/SKILL.md
│   ├── sdlc-code-standards/SKILL.md
│   ├── create-domain-skill/SKILL.md
│   ├── review-primitives.md          ← review contract: severity spine, policy (not a skill)
│   ├── review-constraints.yaml       ← lens/constraint registry keyed on `touches` (not a skill)
│   └── review-envelope.schema.json   ← the one reviewer-output schema (not a skill)
│
├── .claude/skills → ../.ai/skills    ← symlink; Claude Code loads from here
│
├── .claude/workflows/execute-spec.js ← reference deterministic execution engine
├── .claude/hooks/                    ← advisory SDLC hooks (.mjs)
├── specs/sdlc-state-machine.yaml     ← single source of truth for phases + transitions
├── scripts/sdlc/                     ← validators (state machine, phase memory) + gen-handoffs
│
│   # Domain skills (Layer 1) — add to .ai/skills/ prefixed by workspace/technology
│   ├── dbt-cartographer/SKILL.md
│   └── nextjs-app-patterns/SKILL.md
│
├── .ai/                        ← agent config (process definition)
│   └── project.md              ← maps workspaces → domain skills
├── specs/                      ← specs, tasks, ADRs, bugs, gaps
└── src/                        ← code
```

**Why `.ai/skills/` is authoritative.** All skill files live in `.ai/skills/`. `.claude/skills` is a symlink to it. Claude Code loads from `.claude/skills/`; by making it a symlink both paths point to the same content and there is no duplication.

**Personal superpowers** stay at `~/.claude/skills/`. They're behavioral discipline that applies to all projects, not project-specific process. Install once per machine.

### How SDLC skills find domain skills

The task file's `workspace` field is the link:

1. Task file says `workspace: dbt`
2. `.ai/project.md` maps `dbt` → domain skills: `dbt-cartographer`, `dbt-craftsman`
3. SDLC skills (code-standards, code-review, task-decomposition) read this mapping and apply domain conventions alongside SDLC process

This is declarative — adding a new domain skill requires only creating the SKILL.md and adding it to the workspace-skills table in `project.md`.

### Portability

- **New team member clones repo** → gets all skills automatically. Claude Code picks them up via the `.claude/skills` symlink.
- **The engine's executor** reads `.ai/AGENTS.md` (the generic executor brief) and task files, which encode the same principles.
- **Switching to another agent** → the skills are markdown. Adapt the SKILL.md format to the new agent's convention. The content (process, checklists, standards) stays the same.

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
9. Invoke `spec-reviewer` — automated quality gate before the user sees a draft
10. Self-review for gaps, contradictions, untestable criteria
11. **GATE: User approves the spec**
12. Open a PR, after approval: set status to `active`, create Linear project

**Interacts with:** `brainstorming` (behavioral discipline for the conversation), `spec-reviewer` (auto-invoked at the sign-off gate), domain skills (technology-specific constraints)

### 1a. spec-reviewer

**Trigger:** Auto-invoked by `spec-authoring` at the spec sign-off gate and by `spec-amendment` after every amendment. Also invocable on demand: "review this spec," "check SPEC-NNN for gaps."

**What it does:** Grades a draft spec against the schema, authoring conventions, originating intent, ADRs, and cross-spec contracts. Emits the shared JSON envelope from `review-primitives.md` with severity-graded findings (blocker / major / nit / suggestion). The orchestrator routes based on findings — blockers and majors trigger a fix loop; nits/suggestions produce `batch_followup_and_accept`.

**Output is machine-parseable JSON** consumed by the routing policy, not freehand prose. Human-readable rendering happens in the surrounding skill (spec-authoring or spec-amendment).

**Interacts with:** `spec-authoring` (invoked at Phase 2 gate), `spec-amendment` (invoked after every amendment), `review-primitives.md` (severity spine, grounding rules, output schema — do not redefine there)

### 2. task-decomposition

**Trigger:** spec has status `active` and no task files exist yet, "decompose this spec," "break this down." Also triggers in **re-planning mode**: "this task is too big," "split this," "we need a prerequisite task," "merge these tasks."

**What it does (initial decomposition):**
1. Reads the spec (design, acceptance criteria, constraints, risks)
2. Breaks into AI-coherent, independently-implementable tasks with `touches`/`risk`/`tier` + `evidence:` fields on every AC
3. Builds the dependency graph
4. Applies routing labels (claude-code / human) using eligibility rules
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
- **A task is one coherent unit of AI execution — sized by coherence and bounded `touches`, NOT by line count or "small enough for a human-reviewable PR."** The reviewer of record is an LLM multi-lens panel. A coherent 800-line token layer is one task.
- Every executable task declares a non-empty `touches` set (file globs it may modify), bounded to one workspace; parallel tasks must have non-overlapping `touches`
- `risk` and `tier` are set on every executable task (tier is a hint; the engine resolves the real tier)
- `evidence:` field is created empty on every AC — the implementing agent fills it before PR review
- Dependencies are explicit and minimal (maximize parallelism)
- Every executable task has everything in the task file (no assumed context)

**Interacts with:** `spec-authoring` (runs after spec is approved), `spec-execution` (runs before execution), `spec-amendment` (when re-planning is needed)

### 2a. spec-amendment

**Trigger:** implementation reveals the spec is wrong, user changes requirements mid-flight, code review finds a design flaw, external dependency shifts

**Gap or amendment first.** Before running this skill, check whether the change is small enough to be a gap (`specs/gaps/GAP-NNN-*.md`) rather than a full amendment. See the decision table in `spec-amendment/SKILL.md`.

**What it does:**
1. Classifies the change: cosmetic (no version bump), additive (new scope), or breaking (changed design/criteria)
2. For additive/breaking: bumps spec version, writes changelog entry
3. Runs task impact analysis across all tasks in the graph
4. Updates pending tasks, signals in-progress agents, creates rework tasks for completed work that's now invalid
5. Scans open `clarification` gaps for the parent spec — incorporates them and sets `back_ported_to`
6. Gets user approval, commits everything together, updates Linear

**Interacts with:** `spec-authoring` (amendment is the backward path), `task-decomposition` (may trigger partial re-decomposition), `spec-execution` (signals in-progress tasks)

### 2b. spec-completion

**Trigger:** all tasks for a spec are done or cancelled, "is this spec finished?", "close out SPEC-NNN," "what shipped?"

**What it does:**
1. Checks that all tasks in the graph are `done` or `cancelled` (with documented reasons)
2. Maps each success criterion to a verification type: task-covered, integration, measurement, or manual
3. Verifies task-covered criteria by tracing to passing acceptance criteria (checks `evidence:` fields)
4. Runs integration verification (e2e tests, cross-task validation)
5. Handles measurement criteria: verify now or defer with owner + trigger condition + method
6. Produces a `templates/completion-report.md`-shaped report with evidence for each criterion
7. Gets user sign-off, then sets spec to `completed`, updates Linear

**Key rules:**
- Merged PRs are not the finish line — verified success criteria are
- Deferred-to-production criteria must have an owner, trigger condition (date OR observable event), and method
- No deferral without all three fields populated
- User makes the final call

**Interacts with:** `spec-authoring` (bookend — authoring opens, completion closes), `spec-amendment` (if completion reveals the spec needs changes, amend first)

### 3. spec-execution

**Trigger:** an active spec has tasks decomposed and is ready to execute, "execute SPEC-NNN," "run the spec"

**This is THE deterministic execution engine — the autonomous half of the SDLC.** It is operationally implemented by a reference **Workflow script** at `.claude/workflows/execute-spec.js` (`Workflow({ name: 'execute-spec', args: { spec: 'SPEC-NNN' } })`); on other runtimes the same algorithm runs by hand. **Pure-core / effects-at-the-edges:** routing, tier resolution, lens selection, verdict folding, branch naming, and wave planning are total functions; only thin `agent()` wrappers touch the model. Branches are id-derived (`claude/SPEC-NNN-TASK-NNN`), so re-runs are idempotent and resume wave-level. The orchestrator **invokes** the engine rather than hand-dispatching tasks.

**What it does:** Drives the full execution loop:
1. Resolves integration strategy: `branch` (integration PR to main) or `direct` (task PRs straight to main), from explicit frontmatter or a heuristic
2. Builds the wave graph from `_index.yaml` task dependencies; validates each task's typed contract (non-empty `touches`, valid routing/risk/tier)
3. Dispatches each wave of tasks in parallel (one worktree-isolated executor per task)
4. Gates on a cheap, attributable **Tier-0** (lint/typecheck/unit tests for the workspace) before any reviewer runs — a red PR goes to a fix agent, not a reviewer
5. Dispatches a **routed multi-lens review**: lenses = `baseLenses(workspace) ∪` constraints whose `when` matches the task's `touches` (from `review-constraints.yaml`); validates each envelope against `review-envelope.schema.json`
6. Routes by severity per `review-primitives.md`: `accept`, `batch_followup_and_accept`, `fix_loop` (cap 3/task), `escalate`
7. Escalates cross-skill signals back into a judgment phase: `task:scope` blocker → task-decomposition re-plan; `spec:gap` → gap-capture; `spec:*` blocker → spec-amendment (cap 2)
8. In `branch` mode: merges accepted task branches into `feat/SPEC-NNN`, runs the expensive integration verification (captured as EVIDENCE), then opens the integration PR to `main` — **a human merges; the engine never does**
9. Hands off to `spec-completion` after all tasks are merged

**Writes telemetry** (where the runtime has a filesystem) to `specs/tasks/SPEC-NNN/_execution.log.jsonl` — one JSONL event per action, append-only, restart-safe.

**Interacts with:** `pr-reviewer` (LLM lens grading), `sdlc-code-review` (human-readable rendering), `task-decomposition` (re-plan on `task:scope`), `spec-amendment` (on `spec:*` signals), `spec-completion` (final gate). **Contracts:** `review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`, `specs/sdlc-state-machine.yaml`.

### 4. pr-reviewer

**Trigger:** Auto-invoked by `spec-execution` at the Tier 1 review step. Also invocable on demand: "review PR #NNN," "grade this PR."

**What it does:** Reviews a single PR against its task file, parent spec, and applicable ADRs. Emits the shared JSON envelope from `review-primitives.md` with severity-graded findings.

**Output is machine-parseable JSON** — not freehand prose. `sdlc-code-review` renders these findings into a human-readable review comment. This skill grades; `sdlc-code-review` renders.

**Citation prefixes** (what the reviewer can cite as the source of a finding):
- `AC-NNN` — acceptance criterion not met
- `ADR-NNN` — ADR constraint violated
- `sdlc-code-standards:<section>` — coding standards violation
- `monorepo:boundary` — import-graph violation
- `monorepo:workspace-scope` — files outside declared workspace
- `monorepo:verify-coverage` — tests fail in a `verify_workspaces` member
- `task:blocks:<id>` — boundary contract with a downstream task broken
- `task:scope` — PR is too large or touches wrong files
- `task:evidence-missing` — AC evidence present but insufficient
- `spec:gap` — spec ambiguity that warrants a GAP file (not a full amendment)
- `spec:ambiguous-ac` / `spec:contradictory-ac` / `spec:wrong-design` / `spec:missing-section` — cross-skill signals

**Interacts with:** `review-primitives.md` (severity spine, output schema, grounding rules), `sdlc-code-review` (renders its output), `spec-execution` (orchestrator that dispatches it)

### 5. sdlc-code-standards

**Trigger:** during any implementation work — writing code, reviewing code, opening PRs

**What it encodes:**
- **DRY:** Don't repeat yourself. Extract shared logic. But don't abstract prematurely — three instances before extracting.
- **YAGNI:** Don't build what you don't need. No speculative features, no "might need this later." If the spec doesn't ask for it, don't build it.
- **TDD:** Write the failing test first. Red → Green → Refactor.
- **Single responsibility:** Each function/module does one thing. If you can't name it clearly, it's doing too much.
- **Explicit over implicit:** Name things clearly. Avoid magic numbers. Make dependencies visible.
- **Error handling at boundaries:** Validate at system edges (user input, API calls). Trust internal code.
- **Commit discipline:** Small, frequent commits. Each commit should be a coherent unit. Message references the spec/task ID.
- **No dead code:** Don't comment out code. Don't leave unused imports. Delete it.
- **Tests are documentation:** Tests should read like spec acceptance criteria. Given/When/Then.

**This is a rigid skill** — follow exactly, don't adapt away discipline.

### 6. sdlc-code-review

**Trigger:** PR is ready for review (yours, an agent's, or a teammate's), "review this PR," PR arrives from an executor agent

**What it does:**
1. Reads the PR diff
2. Finds the linked spec and task (from PR title `SPEC-NNN` / `TASK-NNN`)
3. Reads the task file for acceptance criteria
4. Reads linked ADRs for constraints
5. Checks each acceptance criterion and its `evidence:` field (Tier 0: presence; Tier 1: quality)
6. Enforces monorepo workspace scope and verify_workspaces coverage
7. Consumes graded findings from `pr-reviewer` (JSON) and renders them as a human-readable review comment
8. Derives the policy action from `review-primitives.md` (not freehand): `accept`, `batch_followup_and_accept`, `fix_loop`, or `escalate`
9. Checks for spec completion if this was the last task

**This skill renders; `pr-reviewer` grades.** Don't emit severity verdicts freehand — consume the JSON and apply the policy.

**Interacts with:** `pr-reviewer` (consumes its graded output), `review-primitives.md` (policy and severity definitions), `sdlc-code-standards` (applied during review)

### 7. create-domain-skill

**Trigger:** new workspace onboarded, "create a domain skill for X," "add dbt skills to this repo"

**What it does:** Walks through creating a domain skill and wiring all references. Touching:
1. `.ai/skills/[workspace]-[name]/SKILL.md` — the skill itself
2. `.ai/project.md` → Workspace skills table — the wiring SDLC skills use to find it
3. `.ai/project.md` → Workspace interfaces — boundary contracts
4. `.ai/project.md` → Change propagation patterns — cross-workspace patterns
5. `.ai/project.md` → Agent eligibility — what's now agent-executable
6. `.ai/project.md` → Per-workspace conventions — conventions that differ from defaults

Missing any of these means the skill exists but is disconnected from the SDLC process.

## Implementation order

Skills to build when adopting this framework, in order of immediate value:

1. **sdlc-code-standards** — needed for every implementation task.
2. **spec-authoring** — needed first in the lifecycle.
3. **task-decomposition** — needed right after the spec.
4. **spec-execution** — drives the full execution loop; the operational core.
5. **pr-reviewer** + **sdlc-code-review** — needed once PRs flow.
6. **spec-reviewer** — quality gate on specs.
7. **spec-amendment** — needed once implementation starts and reality pushes back.
8. **spec-completion** — needed once the first spec's tasks are all done.
9. **create-domain-skill** — needed when adding new workspaces.

All SDLC process skills are already implemented in `.ai/skills/`.

## Relationship to .ai/ config

Skills are the "how" — they encode specific workflows agents follow.
`.ai/sdlc.md` is the "what" — it defines the process any agent follows.
`.ai/project.md` is the "where" — it maps workspaces to domain skills and conventions.

```
.ai/sdlc.md          → "Tasks have frontmatter with acceptance criteria and evidence fields"
task-decomposition    → "Here's exactly how to decompose a spec into task files step by step"

.ai/CLAUDE.md         → "Review all PRs against the spec"
sdlc-code-review      → "Here's the exact checklist: read diff, find spec, check each criterion..."

.ai/project.md        → "dbt workspace uses dbt-cartographer and dbt-craftsman"
Domain skill          → "Here's how to write dbt models: CTE ordering, naming, macros..."
```

**There is no dispatch skill.** Dispatch is not an orchestration model an agent improvises — the `spec-execution` engine dispatches a worktree-isolated local executor per task. The generic executor brief is `.ai/AGENTS.md`; the orchestrator config and engine-invocation are in `.ai/CLAUDE.md`. The task files carry everything any executor needs (`touches`, ACs, constraints).

**The execution engine + spine.** `spec-execution` is implemented by the reference Workflow `.claude/workflows/execute-spec.js`, sitting on the spine: the state machine (`specs/sdlc-state-machine.yaml`, the single source of truth for phases/transitions consumed by the advisory `.claude/hooks/`), the `phase:` memory block in each `_index.yaml`, and the review contracts (`review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`). Validators live in `scripts/sdlc/`.

## Relationship to domain skills

SDLC skills and domain skills are complementary, not competing:

| SDLC skill (Layer 2) | Domain skill (Layer 1) | How they compose |
|---|---|---|
| sdlc-code-standards | dbt-craftsman | SDLC enforces TDD/DRY/YAGNI universally. Craftsman adds CTE ordering, naming, macros for dbt code. |
| sdlc-code-review | dbt-craftsman | Review checks acceptance criteria (SDLC) AND dbt style rules (domain). |
| task-decomposition | dbt-cartographer | SDLC creates the task files. Cartographer's plan model becomes the implementation detail within a dbt task. |
| sdlc-code-standards | nextjs-app-patterns | SDLC enforces universals. Domain adds App Router, Server Component, module conventions. |

Domain skills with their own orchestration (like cartographer → craftsman) integrate with the SDLC rather than being replaced by it. The SDLC provides the lifecycle wrapper; the domain skill provides the implementation expertise. See [skill-architecture.md](skill-architecture.md) for details.
