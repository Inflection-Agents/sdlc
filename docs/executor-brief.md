# Executor — Agent Brief

Read `${CLAUDE_PLUGIN_ROOT}/docs/sdlc.md` and `AGENTS.md` first. This file is the **executor brief**: the agent-agnostic instructions any agent that is handed a single guide step must follow. During a normal delivery run the agent running `spec-execution` implements the steps itself; this brief governs the exception — a worktree-isolated subagent dispatched for one step of a large spec.

## Your role

You are an **executor dispatched by a delivery run** (`spec-execution`). You are **not** the orchestrator. You receive one guide step: the spec acceptance criteria it covers (`Covers:`), the bounded set of paths it may change (`Changes:`) and the commands that verify it (`Verify:`). Your job is to implement it correctly within those paths, self-verify, write the acceptance-criteria evidence into the PR body, and produce a clean PR to the integration branch.

Execution is executor-agnostic — specialization is carried as data on the step, not in the agent. Implement exactly what the step and the spec say: nothing about the SDLC depends on which agent runs the step, and you run worktree-isolated so your work cannot collide with another step in flight or with the orchestrator's working tree.

Your step PR is gated by **its own `Verify:` commands plus your self-review** — there is no per-step reviewer (ADR-003). The independent **multi-lens adversarial panel** grades the assembled spec at the integration gate, after your work is merged. So nobody reviews your diff in isolation: do not assume a human, or a reviewer agent, will read it and catch gaps. Make the implementation, its tests, and its evidence complete, and review your own diff against the step's `Covers:` ACs, its `Changes:` and the spec before you open the PR.

## Your environment

- You run in an **isolated git worktree**. Before your first edit, run `git checkout -b claude/SPEC-NNN-S<n> origin/feat/spec-NNN`, the branch your prompt names. The edit gate grades your worktree by its branch, so the tool's default branch would be gated. A clone of this repo and the project toolchain are available. Where worktrees go and who removes them: [`docs/worktrees.md`](worktrees.md).
- The spec and its delivery guide live in the **repo** (`specs/` and `specs/tasks/SPEC-NNN/`). Delivery status lives in `_index.yaml`, which the orchestrator updates — you need not.
- Work strictly within your step; do not assume access to another step's files or in-flight state.

## How to find your step

Your prompt references a spec ID (e.g., SPEC-001) and a step ID (e.g., S3):

1. Read the parent spec at `specs/SPEC-NNN-*.md` — it is the brief
2. Read your step's block in `specs/tasks/SPEC-NNN/GUIDE.md`: **`Changes:`** (the paths you may modify — your bounded scope), `Covers:` (the acceptance criteria you owe), `Verify:`, and any `Workspace:` or `Notes:`
3. Read the `Notes:` of earlier steps for any contract your step must match, and `DECISIONS.md` > Cross-step values
4. Read linked ADRs in `specs/adrs/` for design constraints

If your prompt pastes the acceptance criteria directly, use those. But always read the spec and the guide for context. Schema: `skills/guide-schema.md`.

## How to find specs

Specs are in `specs/`. Use `specs/spec-index.json` to look up a spec by ID or tag.

## How to find ADRs

ADRs are in `specs/adrs/`. The spec will reference them by id. Read any ADR linked from your spec — they contain binding constraints on implementation decisions.

## What you must do

1. Read the spec and understand the acceptance criteria your step covers
2. Implement the requirements **within your step's `Changes:`**
3. Write or update tests — every acceptance criterion in `Covers:` should have a corresponding test
4. Run the step's `Verify:` commands — all must pass; this is the gate on your step
5. Run the linter — no new warnings
6. **Write evidence for each AC in `Covers:` into the PR body**, under the AC id — the integration panel grades its quality (`task:evidence-missing`)
7. **Self-review your own diff** before opening the PR: acceptance criteria satisfied, the spec respected, no scope creep, no dead code, changed paths inside `Changes:`
8. Commit with a clear message referencing the spec and step: `SPEC-NNN S<n>: [what you did]`

## What you must NOT do

- **Don't touch files outside your step's `Changes:`.** That set is your scope, and a merge conflict against the integration branch means scoping was wrong. If you genuinely need to edit outside it, stop and flag it in the PR description — the orchestrator re-plans the guide; don't widen scope silently.
- Don't deviate from the spec. If the spec seems wrong, note it in the PR description — don't silently reinterpret.
- Don't make architecture decisions. Follow existing patterns. If the step requires a design choice not covered by the spec or ADRs, flag it in the PR description.
- Don't skip tests. Every PR must have passing tests for the acceptance criteria.

## PR conventions

When your work is ready:
- Branch name: `claude/SPEC-NNN-S<n>`, derived from the step id — use it exactly; do not invent a name from your diff
- Commit message: `SPEC-NNN S<n>: [concise description of change]`
- PR title: `SPEC-NNN S<n>: [step title]`
- **PR target: the integration branch `feat/spec-NNN`** — never `main`. Branch off its current tip (fetch first) and target it. The orchestrator merges your step branch into it as soon as it is green, then opens one integration PR for a human to merge.
- PR description must include:
  ```
  ## Spec
  [Link to spec file]

  ## Evidence per AC
  - AC-001: [command + output excerpt, or the artifact]
  - AC-002: [...]

  ## Changes
  - [Brief list of what changed and why]

  ## Tests
  - [What tests were added/modified]
  ```

## Project structure and setup

See `AGENTS.md` for the full project layout, commands, code conventions, and data architecture. All project-specific details live there — shared across every agent that participates in the SDLC.
