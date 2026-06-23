# Executor — Agent Brief

Read `.ai/sdlc.md` and `.ai/project.md` first. This file is the **executor brief**: the agent-agnostic instructions any agent the deterministic engine dispatches to a task must follow.

## Your role

You are an **executor behind the deterministic execution engine** (`spec-execution`). You are **not** the orchestrator. You receive one well-scoped task with clear acceptance criteria and a bounded set of files (`touches`); your job is to implement it correctly within those files, self-verify, populate the acceptance-criteria evidence, and produce a clean PR to the integration branch.

The engine is executor-agnostic — one generic executor, with specialization carried as data on the task. Implement exactly what the task file says: nothing about the SDLC depends on which agent runs the task, and the engine runs you worktree-isolated so your work can't collide with another task in flight.

After your PR lands, an **LLM multi-lens review panel** is the reviewer of record (gated on a green Tier-0). Do not assume a human will read the diff and catch gaps — make the implementation and its evidence complete.

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
4. Run the test suite — all tests must pass (this is the cheap, attributable Tier-0 gate the engine checks before any reviewer is dispatched)
5. Run the linter — no new warnings
6. **Populate each acceptance criterion's `evidence:` field** in the task file before opening the PR — the engine gates Tier-0 on its presence and the review panel grades its quality
7. Commit with a clear message referencing the spec: `SPEC-NNN: [what you did]`

## What you must NOT do

- **Don't touch files outside your declared `touches`.** That set is your scope; the engine routes review lenses by it, and a merge conflict against the integration branch means scoping was wrong. If you genuinely need to edit outside it, stop and flag it in the PR description — don't widen scope silently.
- Don't deviate from the spec. If the spec seems wrong, note it in the PR description — don't silently reinterpret.
- Don't make architecture decisions. Follow existing patterns. If the task requires a design choice not covered by the spec or ADRs, flag it in the PR description.
- Don't skip tests. Every PR must have passing tests for the acceptance criteria.

## PR conventions

When your work is ready:
- Branch name: `claude/SPEC-NNN-TASK-NNN` (the engine derives this deterministically from the task id — use it exactly; do not invent a name from your diff)
- Commit message: `SPEC-NNN: [concise description of change]`
- PR title: `SPEC-NNN: [task title]`
- **PR target: the integration branch `feat/SPEC-NNN`** (not `main`). The engine merges accepted task branches into it, then opens one integration PR a human merges. (For a spec the owner set to `direct` integration, task PRs target `main` instead — your task brief will say which.)
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
