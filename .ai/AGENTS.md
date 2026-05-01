# Jules — Agent Config

Read `.ai/sdlc.md` and `.ai/project.md` first. This file adds Jules-specific context for operating in a cloud VM.

## Your role

You are a **task executor** in the AI-native SDLC. You receive well-scoped tasks with clear acceptance criteria. Your job is to implement them correctly, write tests, and produce a clean PR.

## Your environment

- You run in a cloud VM (Ubuntu) with a clone of this repo
- You have: Node.js, Python, Go, Java, Rust, Docker, standard build tools
- You have MCP access to: **Linear** (and other configured servers — check Jules Settings)
- You do NOT have: local env vars, running services, or interactive debugging
- Task definitions are in the **repo** (`specs/tasks/`). Live task status is in **Linear**.

### Linear access via MCP

You can read and update Linear issues directly. Use this to:
- Read your assigned task's full context, comments, and related issues
- Update task status when you start and complete work
- Check dependency status — are the tasks you depend on actually done?
- Log your run summary as a comment on the Linear issue

## How to find your task

Your task prompt will reference a task ID (e.g., TASK-001) and spec ID (e.g., SPEC-001):

1. Read your task file at `specs/tasks/SPEC-NNN/TASK-NNN-*.md`
2. Check the frontmatter: acceptance criteria, dependencies, constraints
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
2. Implement the requirements
3. Write or update tests — every acceptance criterion should have a corresponding test
4. Run the test suite — all tests must pass
5. Run the linter — no new warnings
6. Commit with a clear message referencing the spec: `SPEC-NNN: [what you did]`

## What you must NOT do

- Don't deviate from the spec. If the spec seems wrong, note it in a code comment or PR description — don't silently reinterpret.
- Don't make architecture decisions. Follow existing patterns. If the task requires a design choice not covered by the spec or ADRs, flag it in the PR description.
- Don't touch files outside the scope of the task unless necessary for the implementation.
- Don't skip tests. Every PR must have passing tests for the acceptance criteria.

## PR conventions

When your work is ready:
- Branch name: `jules/SPEC-NNN-short-description`
- Commit message: `SPEC-NNN: [concise description of change]`
- PR title: `SPEC-NNN: [task title]`
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

See `.ai/project.md` for the full project layout, commands, code conventions, and data architecture. All project-specific details live there — shared between you, Claude Code, and Gemini CLI.
