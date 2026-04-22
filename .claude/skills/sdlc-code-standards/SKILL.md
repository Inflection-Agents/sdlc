---
name: sdlc-code-standards
description: Use when writing or reviewing any code during implementation tasks, before committing, or when evaluating code quality
---

# SDLC Code Standards

## Overview

Non-negotiable coding principles for all implementation work. These apply whether you're the implementer or the reviewer, and whether the code is agent-authored or human-authored.

**This is a rigid skill.** Follow exactly. Don't adapt away discipline.

**Companion skills (auto-invoked if installed):**
- `test-driven-development` — full TDD discipline with anti-rationalization defenses
- `verification-before-completion` — no completion claims without fresh evidence
- `finishing-a-development-branch` — structured branch completion with test gates

**Domain skills:** Check `.ai/project.md` → Workspace skills table. If your task targets a workspace with domain skills listed, apply those domain-specific conventions ALONGSIDE this skill. Domain skills define technology-specific patterns (e.g., dbt CTE ordering, Next.js component patterns). This skill defines universal principles (TDD, DRY, YAGNI). Both apply. Domain conventions take precedence when they conflict with generic examples in this skill.

## The Standards

### TDD — Test-Driven Development

**Iron law: No production code without a failing test first.**

- Write the failing test FIRST
- Run it. Watch it fail. Confirm it fails for the RIGHT reason (missing feature, not typo).
- Write the MINIMAL code to make it pass. Nothing more.
- Red → Green → Refactor. Every cycle.
- Each acceptance criterion from the task file → one or more tests
- Tests read like spec requirements: Given/When/Then

**If you wrote production code before the test: delete the code.** Not "adapt it." Not "keep it as reference." Delete it and start with the test. Tests-after is NOT TDD — tests written after code are biased by implementation.

**Anti-rationalizations:**
- "It's too simple to need a test" → Simple things break. Test it.
- "I'll write the test after" → That's not TDD. That's testing. Different thing.
- "TDD is slowing me down" → TDD is preventing you from shipping bugs. The speed is an illusion.
- "I need to explore the design first" → Explore with tests. The test IS the design exploration.

### DRY — Don't Repeat Yourself

- Extract shared logic into named functions or modules
- **Three-strike rule:** duplicate code twice is fine. Third time → extract.
- Don't abstract prematurely — duplication is cheaper than the wrong abstraction
- When extracting: name the abstraction after what it DOES, not where it's used

### YAGNI — You Aren't Gonna Need It

- If the spec doesn't ask for it, don't build it
- No "while I'm here" improvements outside task scope
- No feature flags for hypothetical future requirements
- No configurability beyond what's specified
- No backwards-compatibility shims — change the code directly

### Single Responsibility

- Each function does one thing. If you can't name it in 3 words, split it.
- Each module has one reason to change
- Each PR addresses one task

### Explicit Over Implicit

- Name things clearly — `getUserByEmail` not `get` or `fetch`
- No magic numbers — use named constants with context
- Make dependencies visible — inject, don't hide
- Prefer clear code over clever code

### Error Handling at Boundaries

- Validate at system edges: user input, API responses, external data
- Trust internal code — don't defensively check what your own functions return
- Fail fast with clear messages at boundaries
- Don't catch errors you can't handle — let them propagate

### Commit Discipline

- Small, frequent commits — each is a coherent unit of work
- Commit message: `SPEC-NNN: [what you did]` or `TASK-NNN: [what you did]`
- Don't batch unrelated changes
- Commit after each red-green-refactor cycle

### No Dead Code

- Don't comment out code — delete it. Git has history.
- Don't leave unused imports, variables, or functions
- Don't add TODO comments for the current task — do it or don't
- Don't add "removed X" comments — the diff shows what was removed

### Tests Are Documentation

- Test names describe behavior: `should_return_401_when_token_expired`
- Tests follow acceptance criteria from the task file
- A reader should understand the spec by reading the tests
- No test without an assertion. No assertion without a reason.

## Verification Before Completion

**Iron law: No completion claims without running verification and reading the output.**

- "Should work now" is lying. Run the command, read the output, THEN make the claim.
- Ban probabilistic language: "should," "probably," "seems to" mean you haven't verified.
- After agent delegation: never trust the agent's success report. Check the diff. Run the tests yourself.
- This applies to ALL positive statements — not just "done" but any expression of satisfaction about work state.

## When the spec is the problem

Sometimes the code doesn't work because the spec is wrong — the design assumes something that isn't true, or acceptance criteria contradict each other. If you hit a wall during implementation and the root cause is in the spec, not the code:

1. **Stop implementing.** Do not work around a known-wrong spec.
2. **Invoke the `spec-amendment` skill.** It classifies the change, bumps the spec version, assesses impact on all tasks, and gets user approval before work resumes.
3. **Do not patch the task file yourself.** The amendment process ensures the spec, all affected tasks, and Linear stay in sync.

Signs the spec is the problem:
- The framework or API doesn't support what the design describes
- Two acceptance criteria contradict each other
- The design creates a circular dependency or impossible ordering
- A constraint in the spec conflicts with an ADR or existing architecture

## When the task breakdown is the problem

Sometimes the spec is fine but the task you're working on is wrong — too big, missing a prerequisite, or scoped incorrectly. If you're implementing and realize the task itself needs restructuring (but the spec's requirements are correct):

1. **Flag it.** Note specifically what's wrong: "this task needs splitting," "there's a missing prerequisite task," "this should be routed to claude-code, not jules."
2. **Use `task-decomposition` re-planning mode.** It handles splitting, merging, adding, cancelling, and re-routing tasks while keeping `_index.yaml` and Linear in sync.
3. **Don't silently expand scope.** If the task is too big, split it — don't just implement a bigger PR than planned.

Signs the task breakdown is the problem (but the spec is fine):
- The task will clearly exceed ~300 lines / one PR
- You need to build something first that no existing task covers
- Two tasks you're working on in parallel keep conflicting
- The task is trivially small and should be merged with another

## Verify upstream contracts before implementing

**When your task has `depends_on` entries, verify the upstream contracts before writing code.** Don't assume the upstream task produced exactly what the boundary constraints promise — check.

For each dependency listed in your task's `depends_on`:
1. Read the upstream task's boundary constraints (its Constraints section, under "Produces for TASK-NNN")
2. **Verify the contract exists in the codebase.** Check the actual file, schema, export, or column that was promised:
   - dbt: check `schema.yml` for the column name and type
   - shared types: check the export exists with the right signature
   - API: check the endpoint exists with the right shape
3. If the contract matches → proceed with implementation
4. If the contract is missing or different → **stop and flag it**:
   - If the deviation is minor (e.g., slightly different column name): flag in your task and update your consuming code to match reality
   - If the deviation is significant (wrong type, missing entirely): invoke `spec-amendment` — the boundary constraints across tasks are out of sync

This takes 2 minutes and prevents hours of rework from building on a contract that doesn't exist.

**For Jules tasks:** The jules-dispatch skill should verify upstream contracts before dispatching. If the contract isn't there, don't dispatch — the task will fail or produce wrong code.

## Red Flags — STOP

If you catch yourself doing any of these, stop and correct:

| Doing this | Do this instead |
|-----------|----------------|
| Writing code before a test | Delete code. Write test first. |
| Adding a feature the spec didn't ask for | Remove it. Check the spec. |
| Copying a block for the third time | Extract into a named function. |
| Adding a config option "just in case" | Remove it. YAGNI. |
| Catching an error and ignoring it | Remove the catch, or handle it properly. |
| Committing 500 lines in one go | Break into smaller commits. |
| Naming something `helper`, `utils`, `misc` | Name it after what it does. |
| Adding a comment that restates the code | Delete the comment. |
| Saying "should work" without running tests | Run the tests. Read the output. |
| Keeping code you wrote before the test | Delete it. Start with the test. |

## Monorepo discipline

If `.ai/project.md` defines workspaces:

- **Respect import boundaries.** Apps never import from each other. Shared never imports from apps. Check `.ai/project.md` for the exact rules.
- **Use workspace-scoped commands.** `pnpm --filter @org/app test`, not `pnpm test`. Run only what's needed, but run ALL consumers of changed shared code.
- **Follow per-workspace conventions.** TypeScript conventions apply to app workspaces. SQL/dbt conventions apply to data workspaces. Don't apply React patterns to dbt or SQL patterns to Next.js.
- **Shared code changes are high-blast-radius.** Before changing shared code, check what consumes it. Your PR must pass tests in all consuming workspaces, not just the one you're focused on.

## Checklist (apply before every commit)

- [ ] (First commit only) Upstream contracts verified — dependencies produce what this task expects
- [ ] Tests exist for each acceptance criterion addressed
- [ ] Tests were written BEFORE implementation (TDD)
- [ ] Tests were run and output was read — all pass
- [ ] No code duplication beyond 2 instances
- [ ] Nothing built that the spec didn't ask for
- [ ] No dead code, unused imports, or TODO comments for current work
- [ ] Commit message references SPEC or TASK ID
- [ ] Error handling only at system boundaries
- [ ] All names are descriptive and specific
