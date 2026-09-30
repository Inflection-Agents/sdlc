---
name: sdlc-code-standards
description: Use when writing or reviewing any code during implementation, before committing, or when evaluating code quality
---

# SDLC Code Standards

## Overview

Non-negotiable coding principles for all implementation work. These apply whether you're the implementer or the reviewer, and whether the code is agent-authored or human-authored.

**This is a rigid skill.** Follow exactly. Don't adapt away discipline.

**Guides and spec designs must not instruct violations of these standards.** If a guide step's `Notes:`, a spec's Design section, or a dispatching prompt tells you to "leave X deprecated for now," "skip the test because Y," "comment out Z to preserve the old path," or otherwise contradicts a standard in this skill — **flag it back to the author before complying**. The standards in this file are the floor, not the ceiling: they cannot be overridden by upstream SDLC artifacts without an explicit documented reason (and usually that reason is itself a signal to re-evaluate the task / spec). Seen live on 2026-04-24 when a TASK-023 brief instructed the implementer to keep a deprecated dbt var with a "DEPRECATED" comment rather than remove it; a grep confirmed zero references and the var was removed cleanly in a follow-up. The brief overrode the `### No Dead Code` standard by accident — the fix is to catch the conflict upstream.

**Companion skills (auto-invoked if installed):**
- `test-driven-development` — full TDD discipline with anti-rationalization defenses
- `verification-before-completion` — no completion claims without fresh evidence
- `finishing-a-development-branch` — structured branch completion with test gates

**Domain skills:** Check `.ai/project.md` → Workspace skills table. If your work targets a workspace with domain skills listed, apply those domain-specific conventions ALONGSIDE this skill. Domain skills define technology-specific patterns (e.g., dbt CTE ordering, Next.js component patterns). This skill defines universal principles (TDD, DRY, YAGNI). Both apply. Domain conventions take precedence when they conflict with generic examples in this skill.

## The Standards

### TDD — Test-Driven Development

**Iron law: No production code without a failing test first.**

- Write the failing test FIRST
- Run it. Watch it fail. Confirm it fails for the RIGHT reason (missing feature, not typo).
- Write the MINIMAL code to make it pass. Nothing more.
- Red → Green → Refactor. Every cycle.
- Each acceptance criterion in the step's `Covers:` → one or more tests
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
- No "while I'm here" improvements outside the step's scope
- No feature flags for hypothetical future requirements
- No configurability beyond what's specified
- No backwards-compatibility shims — change the code directly

### Behavior Preservation — no silent scope/behavior expansion

The most dangerous change is the one with **no code error.** A change can pass syntax, type, and logic tests — the mechanism works — and still be wrong, because it *expands what the system does*: new data flows, a new site/tenant/scope is covered, a previously-inert config path activates, a guard relaxes, a default flips. Tests confirm the mechanism; they do **not** confirm the resulting behavior matches intent. A green suite on a scope-expanding change is false confidence.

Before changing any component with a **declared or known behavioral contract** — routing, delivery, ingestion, gating, access, scope, feature enablement, anything that decides *what flows where* — do this, and record it in the PR/commit description:

1. **State the contract.** What does this component currently do, and explicitly NOT do? (e.g., "prod-mirror delivers AIWW only.")
2. **Diff the behavior, not the code.** What will it do differently after the change? Name any *expansion*: new inputs consumed, new outputs produced, new scope/sites/tenants covered, an inert config path now live, a guard loosened.
3. **Existing config is NOT intent.** A value you find in the code/config (`for PRACTICE in AIWW CNY`) is not authorization to activate it. Verify it against the *stated* intent; if they differ, STOP — that mismatch is a finding, not a green light. "The code already said X" is never sufficient.
4. **Flag any behavioral delta for human approval before applying** — especially expansions. This is the one class of change tests cannot gate for you.
5. **Validate off-prod.** Exercise the change with a dry-run or in a non-prod environment. Never validate a behavioral/infra change with a live production mutation — the validation itself becomes the incident.

Seen live on 2026-08-13: a correct, fully-tested fix to make the prod SFTP mirror read raw root drops *also activated* a stale `CNY` entry in the mirror's practice list (merged weeks earlier, previously inert). Validating it with a live prod mirror-run delivered 261 CNY reports into an AIWW-only production — zero code errors, all tests green. The intent ("prod = AIWW only") was known; the committed config contradicted it; the change should have surfaced that delta for approval and been validated off-prod, not against prod.

### Single Responsibility

- Each function does one thing. If you can't name it in 3 words, split it.
- Each module has one reason to change
- Each PR addresses one guide step

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
- Commit message: `SPEC-NNN: [what you did]` or `SPEC-NNN S<n>: [what you did]`
- Don't batch unrelated changes
- Commit after each red-green-refactor cycle

### No Dead Code

- Don't comment out code — delete it. Git has history.
- Don't leave unused imports, variables, or functions
- Don't add TODO comments for the current step — do it or don't
- Don't add "removed X" comments — the diff shows what was removed
- **No DEPRECATED zombies.** If nothing references a thing, remove it cleanly. "DEPRECATED" is a signal that a removal is owed, not a permanent label. Adding a multi-line "DEPRECATED — left in place for now" comment to dead code is the worst of both worlds: future readers see the item, assume it matters, hesitate to touch it, and the code stays forever. Before adding a deprecation label, grep for active usage; if zero, just remove. If active usages exist, update them in the same PR (or a sequenced one with a concrete tracking issue) — then remove. Applies to: dbt vars, TypeScript types / functions, React component props, API schema fields, frontmatter fields, config keys.

### Tests Are Documentation

- Test names describe behavior: `should_return_401_when_token_expired`
- Tests follow the acceptance criteria in the step's `Covers:`
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
2. **Invoke the `spec-amendment` skill.** It classifies the change, bumps the spec version, assesses impact on the delivery guide, and gets user approval before work resumes.
3. **Do not patch the guide to absorb a spec change yourself.** The amendment process keeps the spec, the guide and its kickoff prompt in sync.

Signs the spec is the problem:
- The framework or API doesn't support what the design describes
- Two acceptance criteria contradict each other
- The design creates a circular dependency or impossible ordering
- A constraint in the spec conflicts with an ADR or existing architecture

## When the guide is the problem

Sometimes the spec is fine but the guide step you're working on is wrong — too big, missing a
prerequisite, or scoped incorrectly. If the spec's requirements are correct:

1. **Flag it.** Note specifically what's wrong: "this step spans two workspaces," "there's a missing
   prerequisite step," "this needs a human `Run by:`, not an unattended run."
2. **Re-plan the guide in place.** Reorder, split, merge, add or cancel steps under `spec-execution`
   §4 > Changing the guide during a run, re-run `validate-guide.mjs`, and log it as a guide change. It
   is listed in the integration PR's `## Guide changes`.
3. **Don't silently expand scope.** If the work doesn't fit the step's `Changes:`, re-plan — don't
   quietly grow the change beyond its bounded file set.

Signs the guide is the problem (but the spec is fine) — note these are about *coherence and scope*,
not diff size:
- The work doesn't fit within the step's `Changes:`, or would need to cross into another workspace
- The step turns out to bundle two independent concerns that should be separate steps
- You need to build something first that no step covers
- Two steps running in parallel keep conflicting (their `Changes:` overlap)
- The step is a trivial fragment that should be merged into the coherent whole it belongs to

A change that alters an AC, the scope or the design is not a guide problem. It goes to
`spec-amendment`.

## Verify upstream contracts before implementing

**When an earlier step's `Notes:` promises a contract your step consumes, verify it before writing
code.** Don't assume the earlier step produced exactly what its `Notes:` promise — check.

For each such contract:
1. Read the contract in the earlier step's `Notes:` and in `DECISIONS.md` > Cross-step values
2. **Verify the contract exists in the codebase.** Check the actual file, schema, export, or column that was promised:
   - dbt: check `schema.yml` for the column name and type
   - shared types: check the export exists with the right signature
   - API: check the endpoint exists with the right shape
3. If the contract matches → proceed with implementation
4. If the contract is missing or different → **stop and flag it**:
   - If the deviation is minor (e.g., slightly different column name): record it in `DECISIONS.md` and update your consuming code to match reality
   - If the deviation is significant (wrong type, missing entirely): invoke `spec-amendment` — the contracts across steps are out of sync

This takes 2 minutes and prevents hours of rework from building on a contract that doesn't exist.

**Whoever implements the step** — the delivery agent or a dispatched subagent — verifies the
upstream contract before implementing. You are working against the step's `Changes:` and the
contracts in earlier steps' `Notes:`; if the promised contract isn't actually in the codebase, stop
and flag it rather than building on a contract that doesn't exist.

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
| Treating a config value you found as the intent | Verify against the stated intent. A mismatch is a finding, not a go. |
| A fix that makes a path do *more* than before (new data/scope/tenant flows) | State the behavior delta, flag it for approval — tests won't catch it. |
| Validating a behavioral/infra change by mutating prod | Dry-run or use non-prod. The validation must not be the incident. |

## Monorepo discipline

If `.ai/project.md` defines workspaces:

- **Respect import boundaries.** Apps never import from each other. Shared never imports from apps. Check `.ai/project.md` for the exact rules.
- **Use workspace-scoped commands.** `pnpm --filter @org/app test`, not `pnpm test`. Run only what's needed, but run ALL consumers of changed shared code.
- **Follow per-workspace conventions.** TypeScript conventions apply to app workspaces. SQL/dbt conventions apply to data workspaces. Don't apply React patterns to dbt or SQL patterns to Next.js.
- **Shared code changes are high-blast-radius.** Before changing shared code, check what consumes it. Your PR must pass tests in all consuming workspaces, not just the one you're focused on.

## Checklist (apply before every commit)

- [ ] (First commit only) Upstream contracts verified — earlier steps produce what this step expects
- [ ] Tests exist for each acceptance criterion addressed
- [ ] Tests were written BEFORE implementation (TDD)
- [ ] Tests were run and output was read — all pass
- [ ] No code duplication beyond 2 instances
- [ ] Nothing built that the spec didn't ask for
- [ ] Behavior preserved — if this touches a routing/delivery/gating/scope path, the behavior delta is stated and any *expansion* (new data/scope/tenant flowing, an inert config path activated) is flagged for approval, not assumed from existing config
- [ ] Behavioral/infra changes were validated off-prod (dry-run or non-prod), not by mutating production
- [ ] No dead code, unused imports, or TODO comments for current work
- [ ] Commit message references the SPEC id and step
- [ ] Error handling only at system boundaries
- [ ] All names are descriptive and specific
