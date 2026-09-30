# SDLC Skills

Skills are how agents learn to follow the SDLC process at the right moment. They plug into Claude Code's skill system and add SDLC-specific workflows.

## The three-phase grouping

The SDLC splits into **judgment up front, autonomous delivery behind** (see `.ai/sdlc.md` → "The phase model"). The skills group along that split:

```
intent-triage → spec-authoring (spec + delivery guide) │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)                          │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──     │  ── DELIVERY ──
```

| Group | Skills | Reviewer of record |
|---|---|---|
| **Judgment** (human + LLM, gated) | `intent-triage`, `spec-authoring` (+`spec-reviewer`; writes the delivery guide and kickoff prompt) | humans, at hard sign-off gates |
| **Delivery** (autonomous) | `spec-execution` (the engine) | — runs without human attention, but tracks a visible task list |
| **Review (in-run) + completion** (LLM panel; human merges) | `pr-reviewer`, `sdlc-code-review`, `spec-completion`, `spec-amendment` | LLM multi-lens panel; humans merge the integration PR |

`sdlc-code-standards` and `create-domain-skill` are cross-cutting (standards apply during all implementation; create-domain-skill onboards new workspaces).

## Skill map

Each phase has a skill that tells the agent exactly what to do.

```
Intent arrives ("I want to build X", "we need to fix Y", brain dump)
  │
  ── JUDGMENT (human + LLM, collaborative, gated) ────────────────────────────
  ├─ /intent-triage          ← capture, organize, prioritize raw intents (ENTRY POINT)
  │
  ├─ /spec-authoring         ← brainstorm + formalize one intent into a structured spec,
  │    │                        then write its delivery guide and kickoff prompt (Step 10b)
  │    └─ /spec-reviewer     ← review draft spec for quality (auto-invoked by spec-authoring)
  │
  ── DELIVERY (autonomous, single-executor) ──────────────────────────────────
  ├─ /spec-execution         ← THE engine: goal leash, task list, serial burn-down,
  │    │                        e2e validation once, adversarial integration gate
  │    │                        policy: SKILL.md · procedures: SOP.md
  │    ├─ /pr-reviewer       ← LLM lens: emit graded JSON findings (machine-parseable)
  │    └─ /sdlc-code-review  ← render pr-reviewer findings as a human-readable review comment
  │
  ── COMPLETION (human merges the integration PR) ────────────────────────────
  ├─ /spec-amendment         ← amend a spec when reality pushes back mid-flight (a run escalates here)
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
| `writing-plans` | `spec-authoring` (Phase 2) | Existing skill writes generic plans. The SDLC skill produces a structured spec plus a short delivery guide that `validate-guide.mjs` checks and the owner approves with the spec. |
| `executing-plans` | `spec-execution` | Existing skill executes locally in batches. SDLC skill drives the full spec lifecycle: goal leash, visible task list, serial burn-down onto one integration branch, one adversarial gate. |
| `requesting-code-review` | `sdlc-code-review` | Existing skill does generic review. SDLC skill reviews against spec acceptance criteria, ADR constraints, and coding standards. |
| `writing-skills` + `skill-creator` | `create-domain-skill` | Existing skills handle how to write good skills. SDLC skill adds the wiring: project.md updates, workspace mapping, interface documentation. |

## Three-layer skill model

Skills form three layers. See [skill-architecture.md](skill-architecture.md) for the full design.

```
Layer 3: Behavioral (Superpowers)     ~/.claude/skills/                personal
Layer 2: SDLC Process                 skills/ (.claude/skills → it) project (repo root)
Layer 1: Domain                       skills/ (.claude/skills → it) project (repo root)
```

(`.claude/skills` is a symlink to `skills/` — the single source of truth. Claude Code loads from the symlink; both paths point to the same content.)

All three are active simultaneously. They compose, not conflict:
- **Behavioral** answers: how should I approach any task? (TDD, verification, no sycophancy)
- **SDLC Process** answers: what phase am I in, what's the process? (spec + guide → implement → review)
- **Domain** answers: what are the rules for THIS technology? (dbt CTE ordering, Next.js App Router)

### Where skills physically live

```
your-repo/
├── skills/             ← ALL SDLC skills live here (single source of truth)
│   ├── intent-triage/SKILL.md
│   ├── spec-authoring/SKILL.md
│   ├── spec-reviewer/SKILL.md
│   ├── spec-execution/SKILL.md
│   ├── spec-amendment/SKILL.md
│   ├── spec-completion/SKILL.md
│   ├── pr-reviewer/SKILL.md
│   ├── sdlc-code-review/SKILL.md
│   ├── sdlc-code-standards/SKILL.md
│   ├── create-domain-skill/SKILL.md
│   ├── guide-schema.md               ← delivery guide, _index.yaml and KICKOFF.md schema (not a skill)
│   ├── review-primitives.md          ← review contract: severity spine, policy (not a skill)
│   └── review-envelope.schema.json   ← the one reviewer-output schema (not a skill)
│
├── .ai/sdlc/review-constraints.yaml  ← lens/constraint registry keyed on `touches`;
│                                       repo-specific, so it lives outside skills/
│
├── .claude/skills → ../skills    ← symlink; Claude Code loads from here
│
├── .claude/hooks/                    ← advisory SDLC hooks (.mjs)
├── specs/sdlc-state-machine.yaml     ← single source of truth for phases + transitions
├── scripts/sdlc/                     ← validators (state machine, phase memory) + gen-handoffs
│
│   # Domain skills (Layer 1) — add to skills/ prefixed by workspace/technology
│   ├── dbt-cartographer/SKILL.md
│   └── nextjs-app-patterns/SKILL.md
│
├── .ai/                        ← agent config (process definition)
│   └── project.md              ← maps workspaces → domain skills
├── specs/                      ← specs, delivery guides, ADRs, bugs, gaps
└── src/                        ← code
```

**Why `skills/` is authoritative.** All skill files live in `skills/`. `.claude/skills` is a symlink to it. Claude Code loads from `.claude/skills/`; by making it a symlink both paths point to the same content and there is no duplication.

**Personal superpowers** stay at `~/.claude/skills/`. They're behavioral discipline that applies to all projects, not project-specific process. Install once per machine.

### How SDLC skills find domain skills

A guide step's `Workspace:` field is the link:

1. The step says `Workspace: dbt`
2. `.ai/project.md` maps `dbt` → domain skills: `dbt-cartographer`, `dbt-craftsman`
3. SDLC skills (code-standards, code-review, spec-authoring's guide step) read this mapping and apply domain conventions alongside SDLC process

This is declarative — adding a new domain skill requires only creating the SKILL.md and adding it to the workspace-skills table in `project.md`.

### Portability

- **New team member clones repo** → gets all skills automatically. Claude Code picks them up via the `.claude/skills` symlink.
- **Any dispatched executor** reads `.ai/AGENTS.md` (the generic executor brief), the spec and its delivery guide, which encode the same principles.
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
9. Dispatch `spec-reviewer` (the AGENT, via the `Agent` tool) — an independent quality gate before the user sees a draft
10. Self-review for gaps, contradictions, untestable criteria
11. **GATE: User approves the spec**
12. Open a PR, after approval: set status to `active`, create Linear project

**Interacts with:** `brainstorming` (behavioral discipline for the conversation), `spec-reviewer` (auto-invoked at the sign-off gate), domain skills (technology-specific constraints)

### 1a. spec-reviewer

**Trigger:** Auto-DISPATCHED by `spec-authoring` at the spec sign-off gate and by `spec-amendment` after every amendment. Also invocable on demand: "review this spec," "check SPEC-NNN for gaps."

**What it does:** Grades a draft spec against the schema, authoring conventions, originating intent, ADRs, and cross-spec contracts. Emits the shared JSON envelope from `review-primitives.md` with severity-graded findings (blocker / major / nit / suggestion). The orchestrator routes based on findings — blockers and majors trigger a fix loop; nits/suggestions produce `batch_followup_and_accept`.

**Output is machine-parseable JSON** consumed by the routing policy, not freehand prose. Human-readable rendering happens in the surrounding skill (spec-authoring or spec-amendment).

**Interacts with:** `spec-authoring` (invoked at Phase 2 gate), `spec-amendment` (invoked after every amendment), `review-primitives.md` (severity spine, grounding rules, output schema — do not redefine there)

### 2. The delivery guide (spec-authoring Step 10b)

There is no separate decomposition skill ([ADR-007](specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md)). After the spec review converges, `spec-authoring` writes the plan itself:

1. `specs/tasks/SPEC-NNN/GUIDE.md` — ordered steps, each naming the spec ACs it covers (`Covers:`), the paths it may change (`Changes:`) and the commands that verify it (`Verify:`); the owner decisions the run cannot close alone; the end-to-end validation
2. `_index.yaml` — `plan_review:` (stamped `approved: false`), step and decision statuses, and the `phase:` block
3. `KICKOFF.md` — the prompt the owner pastes to start delivery, **at most 3,800 characters**
4. `scripts/sdlc/validate-guide.mjs` checks all of it mechanically; `spec-reviewer` does not grade the guide
5. The owner approves spec and guide in one sign-off: `status: active` plus `plan_review.approved: true`

"Write the guide for SPEC-NNN" runs the same step alone for an active spec that has no guide. A guide over 10 steps means the spec should be split. Schema: [`skills/guide-schema.md`](skills/guide-schema.md).

### 2a. spec-amendment

**Trigger:** implementation reveals the spec is wrong, user changes requirements mid-flight, code review finds a design flaw, external dependency shifts

**Gap or amendment first.** Before running this skill, check whether the change is small enough to be a gap (`specs/gaps/GAP-NNN-*.md`) rather than a full amendment. See the decision table in `spec-amendment/SKILL.md`.

**What it does:**
1. Classifies the change: cosmetic (no version bump), additive (new scope), or breaking (changed design/criteria)
2. For additive/breaking: bumps spec version, writes changelog entry
3. Runs guide impact analysis across every step
4. Rewrites affected steps, adds rework steps for merged work that's now invalid, re-maps `Covers:`, bumps `spec_version`, resets `plan_review.approved`, and rewrites `KICKOFF.md`
5. Scans open `clarification` gaps for the parent spec — incorporates them and sets `back_ported_to`
6. Gets user approval, commits everything together, updates Linear

**Interacts with:** `spec-authoring` (amendment is the backward path; a spec with no guide goes to "write the guide for SPEC-NNN"), `spec-execution` (a `spec:*` finding routes a run here)

### 2b. spec-completion

**Trigger:** every guide step for a spec is done, cancelled, or deferred with a decided owner decision, "is this spec finished?", "close out SPEC-NNN," "what shipped?"

**What it does:**
1. Checks the `steps:` and `decisions:` statuses in `_index.yaml` (cancelled and deferred steps need reasons)
2. Maps each success criterion to a verification type: step-covered, integration, measurement, or manual
3. Verifies step-covered criteria by tracing to the AC evidence in the step PRs and the integration PR
4. Runs integration verification (e2e tests, cross-step validation)
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

**Trigger:** an active spec has an approved delivery guide, "execute SPEC-NNN," "run the spec", or the owner pastes its `KICKOFF.md`

**This is THE delivery engine — the autonomous half of the SDLC.** The agent running the skill *is* the executor: policy in `SKILL.md`, procedures in `SOP.md`. A deterministic Workflow engine held this role until [ADR-003](specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md) retired it on measured cost; delivery is now goal-oriented judgment above a machine-readable floor.

**What it does:** Drives the whole spec to one integration PR:
1. Refuses to start unless the spec is `active`, its guide passes `scripts/sdlc/validate-guide.mjs`, and the fail-closed plan-review gate passes (`scripts/sdlc/plan-gate.mjs`)
2. Arms the goal leash (`.claude/.sdlc-goal-<session_id>`) so the run cannot stop half-done — `met` and `escalated` are the only release words
3. Opens a **visible task list** (one entry per guide step, plus e2e validation and the gate) and keeps it current
4. Cuts `feat/spec-NNN` off `main`; nothing for the spec reaches `main` any other way
5. Burns the guide's steps down **serially, inline**: implement → the step's `Verify:` commands → **self-review the diff** → PR into the integration branch → merge → delete the branch → next. It may re-plan the guide in place (logged, listed under `## Guide changes`). Worktree-isolated subagents are the exception for a large spec
6. Runs **end-to-end validation once** before the gate, with attached evidence
7. Opens ONE integration PR and dispatches a **multi-lens adversarial panel** — independently, clean contexts, every envelope validated (`scripts/sdlc/validate-review-envelope.mjs`), the registry evaluated across the whole diff — looping until no blocker or major survives (at most three rounds, ADR-004)
8. Leaves the PR open — **a human merges; the agent never does** — and hands off to `spec-completion`
9. Escalates rather than grinding: `task:scope` → in-place guide re-plan; `spec:*` → spec-amendment (amendment cap); a `spec:gap` is recorded against the spec and never licenses widening the current step; security/data-loss/owner calls → hard stop

**Optional telemetry:** `specs/tasks/SPEC-NNN/_execution.log.jsonl` — one JSONL event per action, append-only, restart-safe (SOP §9). Recommended, not a gate.

**Interacts with:** `pr-reviewer` (LLM lens grading), `sdlc-code-review` (human-readable rendering), `spec-amendment` (on `spec:*` signals), `spec-completion` (final gate). **Contracts:** `review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`, `specs/sdlc-state-machine.yaml`.

### 4. pr-reviewer

**Trigger:** Dispatched by `spec-execution` at the integration gate. Also invocable on demand: "review PR #NNN," "grade this PR."

**What it does:** Reviews a single PR against its guide step, parent spec, and applicable ADRs. Emits the shared JSON envelope from `review-primitives.md` with severity-graded findings.

**Output is machine-parseable JSON** — not freehand prose. `sdlc-code-review` renders these findings into a human-readable review comment. This skill grades; `sdlc-code-review` renders.

**Citation prefixes** (what the reviewer can cite as the source of a finding):
- `AC-NNN` — acceptance criterion not met
- `ADR-NNN` — ADR constraint violated
- `sdlc-code-standards:<section>` — coding standards violation
- `monorepo:boundary` — import-graph violation
- `monorepo:workspace-scope` — files outside the step's `Workspace:`
- `monorepo:verify-coverage` — a command in the step's `Verify:` fails
- `task:blocks:<id>` — a `Notes:` contract with later step `<id>` broken
- `task:scope` — the diff leaves the step's `Changes:`
- `task:evidence-missing` — AC evidence in the step PR body absent or insufficient
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
- **Commit discipline:** Small, frequent commits. Each commit should be a coherent unit. Message references the spec id and step.
- **No dead code:** Don't comment out code. Don't leave unused imports. Delete it.
- **Tests are documentation:** Tests should read like spec acceptance criteria. Given/When/Then.

**This is a rigid skill** — follow exactly, don't adapt away discipline.

### 6. sdlc-code-review

**Trigger:** PR is ready for review (yours, an agent's, or a teammate's), "review this PR," PR arrives from an executor agent

**What it does:**
1. Reads the PR diff
2. Finds the linked spec and guide step (from PR title `SPEC-NNN S<n>` or branch `claude/SPEC-NNN-S<n>`)
3. Reads the step's `Covers:` for the acceptance criteria it owes
4. Reads linked ADRs for constraints
5. Checks each acceptance criterion and its evidence in the step PR body (presence is the executor's own self-review; this step grades quality)
6. Enforces the step's `Workspace:` scope and `Verify:` coverage
7. Consumes graded findings from `pr-reviewer` (JSON) and renders them as a human-readable review comment
8. Derives the policy action from `review-primitives.md` (not freehand): `accept`, `batch_followup_and_accept`, `fix_loop`, or `escalate`
9. Checks for spec completion if this was the last step

**This skill renders; `pr-reviewer` grades.** Don't emit severity verdicts freehand — consume the JSON and apply the policy.

**Interacts with:** `pr-reviewer` (consumes its graded output), `review-primitives.md` (policy and severity definitions), `sdlc-code-standards` (applied during review)

### 7. create-domain-skill

**Trigger:** new workspace onboarded, "create a domain skill for X," "add dbt skills to this repo"

**What it does:** Walks through creating a domain skill and wiring all references. Touching:
1. `skills/[workspace]-[name]/SKILL.md` — the skill itself
2. `.ai/project.md` → Workspace skills table — the wiring SDLC skills use to find it
3. `.ai/project.md` → Workspace interfaces — boundary contracts
4. `.ai/project.md` → Change propagation patterns — cross-workspace patterns
5. `.ai/project.md` → Agent eligibility — what's now agent-executable
6. `.ai/project.md` → Per-workspace conventions — conventions that differ from defaults

Missing any of these means the skill exists but is disconnected from the SDLC process.

## Implementation order

Skills to build when adopting this framework, in order of immediate value:

1. **sdlc-code-standards** — needed for every implementation step.
2. **spec-authoring** — needed first in the lifecycle; it also writes the delivery guide.
3. **spec-execution** — drives the full execution loop; the operational core.
4. **pr-reviewer** + **sdlc-code-review** — needed once PRs flow.
5. **spec-reviewer** — quality gate on specs.
6. **spec-amendment** — needed once implementation starts and reality pushes back.
7. **spec-completion** — needed once the first spec's steps are all done.
8. **create-domain-skill** — needed when adding new workspaces.

All SDLC process skills are already implemented in `skills/`.

## Relationship to .ai/ config

Skills are the "how" — they encode specific workflows agents follow.
`.ai/sdlc.md` is the "what" — it defines the process any agent follows.
`.ai/project.md` is the "where" — it maps workspaces to domain skills and conventions.

```
.ai/sdlc.md          → "Every spec is delivered from a short guide the owner approves with it"
spec-authoring        → "Here's exactly how to write that guide and its kickoff prompt, step by step"

.ai/CLAUDE.md         → "Review all PRs against the spec"
sdlc-code-review      → "Here's the exact checklist: read diff, find spec, check each criterion..."

.ai/project.md        → "dbt workspace uses dbt-cartographer and dbt-craftsman"
Domain skill          → "Here's how to write dbt models: CTE ordering, naming, macros..."
```

**There is no dispatch skill.** Delivery is not a dispatch problem: the agent running `spec-execution` implements the guide's steps itself, and fans out to worktree-isolated subagents only as an exception for a large spec. The generic executor brief is `.ai/AGENTS.md`; the orchestrator config is `.ai/CLAUDE.md`. The spec and its guide carry everything any executor needs (`Covers:`, `Changes:`, `Verify:`, `Notes:`).

**The delivery spine.** `spec-execution` sits on the spine: the state machine (`specs/sdlc-state-machine.yaml`, the single source of truth for phases/transitions consumed by the advisory `.claude/hooks/`), the `phase:` memory block in each `_index.yaml`, and the review contracts (`review-primitives.md`, `review-constraints.yaml`, `review-envelope.schema.json`). Validators live in `scripts/sdlc/`.

## Relationship to domain skills

SDLC skills and domain skills are complementary, not competing:

| SDLC skill (Layer 2) | Domain skill (Layer 1) | How they compose |
|---|---|---|
| sdlc-code-standards | dbt-craftsman | SDLC enforces TDD/DRY/YAGNI universally. Craftsman adds CTE ordering, naming, macros for dbt code. |
| sdlc-code-review | dbt-craftsman | Review checks acceptance criteria (SDLC) AND dbt style rules (domain). |
| spec-authoring (guide step) | dbt-cartographer | SDLC writes the guide steps. Cartographer's plan model becomes the implementation detail within a dbt step. |
| sdlc-code-standards | nextjs-app-patterns | SDLC enforces universals. Domain adds App Router, Server Component, module conventions. |

Domain skills with their own orchestration (like cartographer → craftsman) integrate with the SDLC rather than being replaced by it. The SDLC provides the lifecycle wrapper; the domain skill provides the implementation expertise. See [skill-architecture.md](skill-architecture.md) for details.
