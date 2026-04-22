# Agent orchestration: Claude Code + Jules

Claude Code and Jules have complementary execution models. This document defines how they work together seamlessly across the SDLC, what artifacts each needs, and how Claude Code orchestrates Jules tasks.

## Codification: how agents learn the process

The SDLC is codified in the repo so any agent can understand it. Three-tier architecture:

```
.ai/
├── sdlc.md       ← agent-agnostic process definition (shared by all agents)
├── CLAUDE.md     ← Claude Code / local agent config (MCP, Linear, Jules orchestration)
└── AGENTS.md     ← Jules / cloud agent config (VM constraints, MCP/Linear access, how to read specs + tasks)
```

**`.ai/sdlc.md`** is the portable core. It defines:
- The spec system (how to find and read specs, frontmatter fields, acceptance criteria)
- The work tracker conventions (Linear labels, issue naming, run logging)
- The task lifecycle (read spec → implement → test → PR → log)
- Boundaries (what agents must NOT do, when to escalate)

**`.ai/CLAUDE.md`** adds local-agent capabilities:
- MCP integrations (Linear, Slack, etc.)
- Jules orchestration (API calls, task prompt assembly, monitoring)
- Phase-by-phase responsibilities (spec drafting, planning, triage, review)
- The labeling workflow for task routing

**`.ai/AGENTS.md`** adds cloud-agent constraints:
- VM environment (what's installed, what's not available)
- How to find specs and ADRs from the repo
- PR conventions (branch naming, commit messages, description template)
- What to do when the spec seems wrong

### Agent portability

If you switch from Claude Code to Gemini CLI:
1. `.ai/sdlc.md` stays unchanged — it's the process
2. Rename or duplicate `.ai/CLAUDE.md` to match the new agent's config file convention
3. `.ai/AGENTS.md` stays unchanged — Jules doesn't care what dispatches it

The process knowledge is in `sdlc.md`. The agent-specific wiring is in the config files. Swap the wiring, keep the process.

### When you start a new repo

Copy `.ai/` from the SDLC templates into your repo. Update:
- `AGENTS.md`: project structure, setup commands, test commands
- `CLAUDE.md`: source IDs for Jules API, MCP server details
- `sdlc.md`: generally stays as-is unless you customize the process

## Linear labeling convention

Linear labels are the routing signal for task assignment:

| Label | Meaning | Assigned to |
|-------|---------|-------------|
| `jules` | Self-contained, clear acceptance criteria, no local env needed | Jules (cloud) |
| `claude-code` | Needs MCP, local env, architecture judgment, or interactive work | Claude Code (local) |
| `human` | Architecture decisions, stakeholder comms, priority calls, final approval | Human |

Claude Code applies these labels during the planning phase when creating Linear issues. The labels drive the dispatch workflow:

```
Claude Code queries Linear for issues labeled `jules` in the current cycle
  → For each: assembles task prompt from spec + acceptance criteria
  → Fires to Jules API with automationMode: AUTO_CREATE_PR
  → Logs session ID on the Linear issue
  → When PR arrives: reviews against spec, flags issues
```

## Execution model comparison

| Dimension | Claude Code | Jules |
|-----------|-------------|-------|
| **Runs where** | Local terminal, your machine | Cloud VM (Ubuntu), clones your repo |
| **Mode** | Synchronous, interactive — you steer in real-time | Asynchronous, fire-and-forget — review when done |
| **Context** | Full local env: running services, env vars, MCP (Linear, Slack, etc.), local files outside repo | Repo clone + MCP (Linear and other configured servers). No local env, no running services |
| **Output** | Edits your working tree directly | Creates a branch + commits, can auto-create PR |
| **Concurrency** | One session at a time | Up to 15 concurrent tasks (Pro), 60 (Ultra) |
| **Strengths** | Judgment, architecture, exploration, debugging, spec authoring, orchestration | Volume: parallel execution of well-scoped, self-contained tasks |
| **Limitations** | Single-threaded, local only | No local env, no MCP, no long-running processes, no interactive debugging |

## The key insight

Claude Code is the **brain** — it plans, orchestrates, reviews, and handles anything requiring judgment or local context. Jules is the **workforce** — it executes well-scoped tasks in parallel, producing PRs that Claude Code reviews against the spec.

Both agents have access to Linear via MCP and to the repo. The structured task files in `specs/tasks/` plus Linear issues give both agents the same view of: what needs to be done, what the dependencies are, and what's already complete. The spec and task files are the contract; Linear is the live status board.

## AGENTS.md: configuring Jules for your repo

Jules reads `AGENTS.md` from your repo root for context about the codebase. This file is critical — it's how Jules understands your project without interactive exploration.

```markdown
# AGENTS.md

## Project overview
[Brief description of the project, its purpose, and architecture]

## Tech stack
- Language: [e.g., TypeScript, Python]
- Framework: [e.g., Next.js, FastAPI]
- Database: [e.g., PostgreSQL, Supabase]
- Testing: [e.g., pytest, vitest]
- Package manager: [e.g., pnpm, uv]

## Setup
[Commands to install dependencies and run tests]
```bash
npm install
npm test
```

## Project structure
```
src/
  api/          — API routes
  components/   — React components
  lib/          — shared utilities
  ...
```

## Conventions
- [Coding conventions, naming, patterns]
- [How tests are organized]
- [How migrations work]

## Specs
Feature specs with acceptance criteria are in `specs/`. Each spec has YAML
frontmatter with id, status, and version. Read the relevant spec before
implementing any task. Acceptance criteria are testable conditions — verify
each one.

## ADRs
Architecture decisions are in `specs/adrs/`. Check relevant ADRs before
making design choices — they document constraints and rationale.
```

## Task artifacts: what each agent needs

### Claude Code needs

Claude Code has full local context, so its artifacts are lightweight:
- The spec file path (it reads it directly)
- Linear issue ID (it queries via MCP)
- Access to git history, running services, env vars

### Jules needs everything in the prompt

Jules has no MCP, no Linear, no local env. Everything it needs must be in the task prompt or in the repo. The **task prompt template** is the critical artifact:

```
## Task: [title]

**Spec:** SPEC-NNN (see specs/SPEC-NNN-name.md)
**Linear issue:** [ID for reference, Jules can't query it]
**Branch from:** main

## Context
[Brief context: why this task exists, what it's part of]

## Requirements
[Paste the relevant section from the spec — don't just reference it,
because Jules may not navigate to it reliably]

## Acceptance criteria
[Paste directly from the spec]
- [ ] Given X, when Y, then Z
- [ ] Given A, when B, then C

## Constraints
- [Any ADR constraints: "Must use PostgreSQL, not SQLite (ADR-001)"]
- [Any patterns to follow: "Use the existing ApiClient class in src/lib/api.ts"]
- [Any files NOT to touch]

## Verification
- Run: `npm test` (all tests must pass)
- Run: `npm run lint` (no new warnings)
- New tests required: [yes/no, and where]
```

## How Claude Code orchestrates Jules

### Via the CLI (preferred)

The Jules CLI is the primary way Claude Code dispatches and monitors tasks.

**Setup (one-time):**
```bash
npm install -g @google/jules
jules login
```

**Core operations:**

```bash
# Create a task — Jules auto-creates a PR when done
jules remote new --repo owner/repo --session "task prompt here"

# Create multiple parallel tasks
jules remote new --repo owner/repo --session "task 1" --parallel 3

# List sessions
jules remote list --session

# Check status of a specific session
jules remote status --session SESSION_ID

# Pull results
jules remote pull --session SESSION_ID

# Send a follow-up message to a running task
jules remote message --session SESSION_ID "Also add error handling for..."
```

### Via the REST API (alternative)

For automation scripts or when the CLI isn't available, Jules also exposes a REST API.

**Setup:** Generate an API key at https://jules.google.com/settings#api, store as `JULES_API_KEY`.

```bash
# Create a task
curl -s -X POST \
  -H "X-Goog-Api-Key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  https://julius.googleapis.com/v1alpha/sessions \
  -d '{
    "prompt": "... task prompt here ...",
    "sourceContext": {
      "source": "sources/SOURCE_ID",
      "githubRepoContext": { "startingBranch": "main" }
    },
    "title": "SPEC-001: Add input validation for auth endpoints",
    "automationMode": "AUTO_CREATE_PR",
    "requirePlanApproval": false
  }'

# List sessions
curl -s -H "X-Goog-Api-Key: $JULES_API_KEY" \
  https://julius.googleapis.com/v1alpha/sessions

# Get session activities
curl -s -H "X-Goog-Api-Key: $JULES_API_KEY" \
  "https://julius.googleapis.com/v1alpha/sessions/SESSION_ID/activities?pageSize=20"

# Send follow-up message
curl -s -X POST \
  -H "X-Goog-Api-Key: $JULES_API_KEY" \
  -H "Content-Type: application/json" \
  "https://julius.googleapis.com/v1alpha/sessions/SESSION_ID:sendMessage" \
  -d '{"prompt": "Also add error handling for the edge case where..."}'
```

### Fallback: Claude Code as executor

**When Jules is not available** (no CLI installed, no API key, or not desired), all `jules`-labeled tasks fall back to Claude Code execution. The SDLC process doesn't change — the same task files, acceptance criteria, and review process apply. The only difference is execution model:

| | With Jules | Fallback (Claude Code) |
|---|---|---|
| Execution | Parallel in cloud | Sequential locally |
| Concurrency | Up to 15 tasks | One at a time |
| Environment | Clean VM, repo clone | Full local env |
| Monitoring | Poll session status | Interactive |
| Output | Auto-created PR | Local branch → PR |

The fallback is automatic: if `jules` CLI is not found and `JULES_API_KEY` is not set, the dispatch skill treats all `jules`-labeled tasks as `claude-code` tasks. Task files don't change — routing is a dispatch-time decision, not a definition-time decision.

### Orchestration workflow

Claude Code runs the full loop:

```
1. Claude Code reads the spec and plan
2. Check: is Jules available? (CLI installed or API key set)
3. For each task marked jules-eligible:
   IF Jules available:
     a. Assemble the task prompt (spec section + acceptance criteria + constraints)
     b. Dispatch via CLI: jules remote new --repo owner/repo --session "prompt"
     c. Log the session ID to the Linear issue as a comment
   IF Jules NOT available (fallback):
     a. Read the task file directly
     b. Implement locally following sdlc-code-standards
     c. Open PR from local branch
4. Monitor/review:
   a. Jules: poll session status or check back later
   b. Fallback: work is already local — review as you go
   c. When PR arrives/is ready: review against spec acceptance criteria
5. You do final review and merge
```

## Jules eligibility criteria

Not every task should go to Jules. Claude Code should assess each task against these criteria:

| Criteria | Jules-eligible | Claude Code instead |
|----------|---------------|-------------------|
| Self-contained (no env/infra deps) | Yes | — |
| Clear acceptance criteria in spec | Yes | — |
| Needs local env, MCP, or running services | — | Yes |
| Requires architecture decisions | — | Yes |
| Requires interactive debugging | — | Yes |
| Needs access to external APIs with local credentials | — | Yes |
| Mechanical: tests, lint fixes, dependency updates, boilerplate | Yes | — |
| Multi-step refactor touching many files with judgment calls | — | Yes |
| Bug with a failing test — "make this pass" | Yes | — |
| Bug requiring reproduction and investigation | — | Yes |

## Phase-by-phase assignment

| SDLC Phase | Claude Code | Jules (or Claude Code fallback) |
|------------|-------------|-------|
| **Spec** | Draft, refine, link ADRs, update frontmatter | — |
| **Planning** | Decompose spec → tasks, mark jules-eligible, create Linear issues | — |
| **Implementation** | Architecture work, complex refactors, anything needing local context | Well-scoped feature tasks, test writing, endpoint implementation per spec |
| **Triage** | NOC agent: normalize, link specs, investigate | — |
| **Bug fixes** | Investigation, reproduction, complex fixes | Confirmed bugs with failing test attached |
| **Review** | Review Jules PRs against spec, review human PRs | — |
| **Chores** | — | Dependency updates, lint fixes, boilerplate, doc generation |
| **Scheduled maintenance** | — | Nightly: dependency audit, TODO cleanup, security scan (Jules scheduled tasks) |

**Without Jules:** Claude Code handles everything in the "Jules" column sequentially. The SDLC process is identical — you lose parallelism, not capability. This makes the framework usable from day one, with Jules as an acceleration layer you add when ready.

## Scheduled tasks (continuous AI)

Jules supports scheduled tasks that run on a cadence. Use these for maintenance that shouldn't consume human or Claude Code attention:

| Task | Cadence | Prompt |
|------|---------|--------|
| Dependency audit | Weekly | "Check for outdated dependencies. If any have security advisories, update them and ensure tests pass." |
| TODO cleanup | Weekly | "Scan for TODO comments older than 30 days. For each, either implement the TODO if it's straightforward or create a clearly-scoped issue description in a new file at specs/bugs/." |
| Test coverage gaps | Weekly | "Identify functions in src/ with no corresponding test. Write tests for the 3 most critical untested functions." |

## GitHub Issues integration

Jules also picks up tasks from GitHub Issues when you add a `jules` label. This creates a second orchestration path:

```
Claude Code creates a GitHub Issue with:
  - Title: "SPEC-001: [task description]"
  - Body: full task prompt (spec section + acceptance criteria + constraints)
  - Label: "jules"

Jules auto-detects the label, comments on the issue, and begins work.
```

This is useful when you want the task visible in GitHub's issue tracker alongside the PR it produces.

## Artifact flow diagram

```
Spec (in repo)
  │
  ├─── Claude Code reads spec, creates plan
  │         │
  │         ├─── Task A (complex) → Claude Code implements locally
  │         │         └─── PR from local branch
  │         │
  │         ├─── Task B (jules-eligible) → Claude Code calls Jules API
  │         │         │   prompt = spec section + acceptance criteria
  │         │         └─── Jules creates PR from cloud
  │         │                   │
  │         │                   └─── Claude Code reviews PR against spec
  │         │
  │         └─── Task C (jules-eligible) → Claude Code calls Jules API
  │                   │   (runs in parallel with Task B)
  │                   └─── Jules creates PR from cloud
  │                             │
  │                             └─── Claude Code reviews PR against spec
  │
  └─── You do final review + merge
            │
            └─── CI validates spec schema, runs tests, updates spec-index.json
```

## Usage budget planning

With a Pro subscription (100 tasks/day, 15 concurrent):

| Activity | Est. tasks/day | Notes |
|----------|---------------|-------|
| Feature implementation | 3–8 | Depends on plan decomposition |
| Bug fixes (confirmed, with tests) | 2–5 | Quick turnaround tasks |
| Test writing | 2–5 | Parallelizable |
| Chores (deps, lint, docs) | 1–3 | Low priority, fill capacity |
| Scheduled maintenance | 1–3 | Automated, runs overnight |
| **Buffer** | ~75 | Headroom for retries and ad-hoc tasks |

Most days won't hit the limit. The concurrent limit (15) is the real constraint — plan task batches accordingly.

## Error handling

When a Jules task fails:
1. Claude Code detects the failure via API polling or PR absence
2. Claude Code reads the session activities for error details
3. Three options:
   - **Retry with better prompt** — add constraints or context that was missing
   - **Reassign to Claude Code** — the task needs local context or judgment
   - **Escalate to human** — the failure reveals a spec gap or architectural issue
