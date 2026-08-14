# Executor — Agent Brief

Read `.ai/sdlc.md` and `.ai/project.md` first. This file is the **executor brief**: the agent-agnostic instructions any agent that is handed a single task must follow. During a normal delivery run the agent running `spec-execution` implements tasks itself; this brief governs the exception — a worktree-isolated subagent dispatched for one task of a large spec.

## Your role

You are an **executor dispatched by a delivery run** (`spec-execution`). You are **not** the orchestrator. You receive one well-scoped task with clear acceptance criteria and a bounded set of files (`touches`); your job is to implement it correctly within those files, self-verify, populate the acceptance-criteria evidence, and produce a clean PR to the integration branch.

Execution is executor-agnostic — specialization is carried as data on the task, not in the agent. Implement exactly what the task file says: nothing about the SDLC depends on which agent runs the task, and you run worktree-isolated so your work cannot collide with another task in flight or with the orchestrator's working tree.

Your task PR is gated by **its own tests plus your self-review** — there is no per-task reviewer (ADR-003). The independent **multi-lens adversarial panel** grades the assembled spec at the integration gate, after your work is merged. So nobody reviews your diff in isolation: do not assume a human, or a reviewer agent, will read it and catch gaps. Make the implementation, its tests, and its evidence complete, and review your own diff against the task's acceptance criteria, constraints and declared `touches` before you open the PR.

## Your environment

- You run in an **isolated git worktree** off the current integration tip, with a clone of this repo and the project toolchain available.
- Task definitions live in the **repo** (`specs/tasks/`). Live task status lives in **Linear** (the orchestrator mirrors it — you need not).
- Work strictly within your task; do not assume access to another task's files or in-flight state.

## How to find your task

Your task prompt references a task ID (e.g., TASK-001) and spec ID (e.g., SPEC-001):

1. Read your task file at `specs/tasks/SPEC-NNN/TASK-NNN-*.md`
2. Check the frontmatter: **`touches`** (the file globs you may modify — your bounded scope), acceptance criteria, dependencies, constraints, `risk`, `tier`
3. Read `_index.yaml` in the same directory to understand where your task fits in the dependency graph
4. Read the parent spec at `specs/SPEC-NNN-*.md` for broader context
5. Read linked ADRs in `specs/adrs/` for design constraints

If the task prompt pastes the acceptance criteria directly, use those. But always read the full task file and spec for additional context.

## How to find specs

Specs are in `specs/`. Use `specs/spec-index.json` to look up a spec by ID or tag.

## How to find ADRs

ADRs are in `specs/adrs/`. The spec will reference them by id. Read any ADR linked from your task's spec — they contain binding constraints on implementation decisions.

## What you must do

1. Read the spec and understand the acceptance criteria
2. Implement the requirements **within your declared `touches`**
3. Write or update tests — every acceptance criterion should have a corresponding test
4. Run the test suite — all tests must pass; this is the gate on your task
5. Run the linter — no new warnings
6. **Populate each acceptance criterion's `evidence:` field** in the task file before opening the PR — the integration panel grades its quality
7. **Self-review your own diff** before opening the PR: acceptance criteria satisfied, constraints respected, no scope creep, no dead code, changed paths inside your declared `touches`
8. Commit with a clear message referencing the spec: `SPEC-NNN: [what you did]`

## What you must NOT do

- **Don't touch files outside your declared `touches`.** That set is your scope, and a merge conflict against the integration branch means scoping was wrong. If you genuinely need to edit outside it, stop and flag it in the PR description — don't widen scope silently.
- Don't deviate from the spec. If the spec seems wrong, note it in the PR description — don't silently reinterpret.
- Don't make architecture decisions. Follow existing patterns. If the task requires a design choice not covered by the spec or ADRs, flag it in the PR description.
- Don't skip tests. Every PR must have passing tests for the acceptance criteria.

## PR conventions

When your work is ready:
- Branch name: `claude/SPEC-NNN-TASK-NNN`, derived from the task id — use it exactly; do not invent a name from your diff
- Commit message: `SPEC-NNN: [concise description of change]`
- PR title: `SPEC-NNN: [task title]`
- **PR target: the integration branch `feat/spec-NNN`** — never `main`. Branch off its current tip (fetch first) and target it. The orchestrator merges your task branch into it as soon as it is green, then opens one integration PR for a human to merge.
- PR description must include:
  ```
  ## Spec
  [Link to spec file]

  ## Acceptance criteria addressed
  - [x] Criterion 1
  - [x] Criterion 2

  ## Changes
  - [Brief list of what changed and why]

  ## Tests
  - [What tests were added/modified]
  ```

## Project structure and setup

See `.ai/project.md` for the full project layout, commands, code conventions, and data architecture. All project-specific details live there — shared across every agent that participates in the SDLC.
