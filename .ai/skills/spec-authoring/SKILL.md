---
name: spec-authoring
description: Use when intent arrives — "I want to build X," "we need to refactor Y," "spec out Z," starting any new feature, refactor, or initiative. This is the entry point to the SDLC.
---

# Spec Authoring

## Overview

The entry point to the entire SDLC. Everything starts with intent — a vague idea, a problem statement, a direction. This skill takes that intent through two phases: **brainstorming** (refine intent into clear requirements through conversation) and **formalization** (produce a structured, reviewable spec).

The spec is the root artifact. Everything downstream — tasks, PRs, reviews, bugs — traces back to it.

**This is a rigid skill.** No implementation until the spec is approved. No spec until the design is approved. No design until the intent is understood.

**Upstream:** The `intent-triage` skill captures and prioritizes raw intents. When an intent is marked `ready` and the user picks it, intent-triage hands off to this skill. You can also invoke spec-authoring directly if there's only one intent.

**Announce at start:** "Using spec-authoring to turn this intent into a structured spec."

**Companion skills (auto-invoked if installed):**
- `brainstorming` — behavioral discipline: hard gate on implementation, one question at a time, propose approaches
- `writing-plans` — plan authoring discipline (no placeholders, bite-sized steps)

**Domain skills:** Check `.ai/project.md` → Workspace skills table. When writing a spec that targets specific workspaces, read the domain skills for those workspaces to understand technology-specific constraints, patterns, and conventions that should inform the design.

## Hard gates

These are non-negotiable. The entire SDLC depends on them.

1. **No implementation until the spec is approved.** Do NOT write code, scaffold, create task files, or invoke implementation skills until Phase 2 is complete and the user has explicitly approved. No exceptions. Not even "let me prototype something quick." The spec IS the prototype.
2. **No spec until the design is agreed.** Do NOT start writing the formal spec document until Phase 1 produces a design the user has signed off on. Premature formalization wastes effort when the direction changes.
3. **One question at a time.** Ask clarifying questions individually. Prefer multiple choice when possible. Never present a wall of questions — have a conversation.

---

## Phase 1: Brainstorming

**Goal:** Refine vague intent into a clear, agreed-upon design direction.

This phase is conversational. You and the user are thinking partners. The output is NOT the spec — it's alignment on what the spec will say.

### Step 1: Capture the intent

The user arrives with something — could be a sentence, a paragraph, a rant, a screenshot, a link. Your job is to understand what they actually want, which may not be what they literally said.

Listen for:
- **The real problem** — what's broken or missing? Often the stated problem is a symptom.
- **Who's affected** — users, developers, stakeholders, systems?
- **Why now** — what changed that makes this urgent?
- **Prior art** — has this been attempted before? What happened?

Don't start asking structured questions yet. Reflect back what you heard: "So the core issue is X, and it's urgent because Y. Is that right?"

### Step 2: Explore the problem space

Now dig deeper. One question at a time. Target the gaps:

- What does success look like? (Not the solution — the outcome.)
- What's the impact of doing nothing?
- Are there constraints the user hasn't mentioned? (Timeline, budget, compliance, dependencies)
- Is there existing work that overlaps? (Check `specs/spec-index.json` for active specs)

**Collision check:** Read `specs/spec-index.json` for active specs. If any active spec targets the same workspaces this intent will touch, flag it to the user:
- What the other spec is doing in that workspace
- Whether the work could conflict (touching the same models, APIs, or components)
- Whether to sequence the specs or proceed in parallel with awareness

This is cheaper to catch here than during task decomposition, and much cheaper than discovering it when two PRs conflict at merge time.

**Monorepo scoping:** If `.ai/project.md` defines workspaces:
- Which workspaces does this affect?
- Does it cross workspace boundaries?
- Are there workspace-specific constraints (e.g., dbt requires database access)?
- Read workspace interfaces in project.md — are there boundary contracts relevant to this intent?

### Step 3: Research the codebase

Before proposing solutions, understand what exists:
- Read the affected codebase areas — what's there today?
- Check `specs/adrs/` — any relevant architecture decisions that constrain the design?
- Check recent git history in affected areas — any in-flight work that could collide?
- If domain skills exist for the affected workspaces, read them for technology-specific context

Report findings to the user: "I looked at the current code and found X. There's also ADR-003 which constrains Y."

### Step 4: Propose approaches

**Always propose 2-3 approaches.** Never jump to one solution. For each approach:

- **What:** one paragraph describing the approach
- **Trade-offs:** what you gain, what you give up
- **Workspaces affected:** which parts of the monorepo this touches
- **Risk:** what could go wrong
- **Effort signal:** relative complexity (not time estimates)

End with a recommendation and why.

```
## Approach A: [name]
[Description]
- Trade-offs: [gains vs. costs]
- Workspaces: [which ones]
- Risk: [what could go wrong]

## Approach B: [name]
[Description]
- Trade-offs: [gains vs. costs]
- Workspaces: [which ones]
- Risk: [what could go wrong]

## Recommendation: Approach [A/B] because [reason]
```

### Step 5: Converge on a design

The user picks an approach (or a hybrid, or rejects all and gives new direction). Iterate until there's a clear answer to:

- **What** are we building?
- **Why** this approach over alternatives?
- **What's in scope** and what's explicitly out?
- **What are the measurable success criteria?**
- **What are the key design decisions** (potential ADRs)?

**Checkpoint:** Summarize the agreed design in 5-10 bullet points. Ask: "Does this capture what we're building? If yes, I'll formalize this into a spec."

**Do not proceed to Phase 2 until the user confirms.**

---

## Phase 2: Formalization

**Goal:** Produce a structured, reviewable spec document from the agreed design.

### Step 6: Assign an ID

Check `specs/spec-index.json` for the highest existing SPEC ID. Increment by 1.

Format: `SPEC-NNN` (zero-padded to 3 digits).

### Step 7: Write the spec

Create `specs/SPEC-NNN-short-description.md` using the schema.

**Frontmatter:**

```yaml
---
id: SPEC-NNN
title: "Clear, concise title"
status: draft
version: 1
supersedes:                    # only if replacing an existing spec
initiative: INI-NNN            # ask user if not obvious
owner: franklin                # human accountable for intent
workspaces: [dealer-app, shared] # workspace members affected (see .ai/project.md)
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [relevant, tags]
linear_project:                # set after Linear project is created
---
```

**Body sections (all required):**

```markdown
## Problem

[What's wrong. Why it matters. Who's affected. Be specific.
This comes directly from Phase 1 Steps 1-2.]

## Success criteria

[Measurable outcomes from Phase 1 Step 5.]
- [ ] Criterion 1
- [ ] Criterion 2

## Scope

### In scope
- [What this spec covers]

### Out of scope
- [What this spec explicitly does NOT cover, and why.
 At least 2-3 items. These were identified during brainstorming.]

## Design

[The approach agreed in Phase 1 Step 5.
 Architecture, data model, key decisions.
 Link ADRs: "Per ADR-NNN, we use X because Y"
 Reference the alternatives considered: "We chose A over B because..."]

## Acceptance criteria

[Testable conditions. Given/When/Then format.
 Each criterion must be independently verifiable by an agent or test.
 These come from success criteria + design decisions.]
- [ ] Given X, when Y, then Z
- [ ] Given A, when B, then C

## Risks & constraints

[From Phase 1: what could go wrong, dependencies, constraints.
 Include risks from the rejected approaches if relevant.]

## Migration (include for refactors)

### Current state
[What exists today — from Phase 1 Step 3 codebase research]

### Target state
[What we're moving to]

### Migration strategy
[How we get there without breaking things]

### Rollback plan
[How we undo if it goes wrong]
```

### Step 8: Create ADRs if needed

If the spec makes architecture decisions (identified during Phase 1 Step 5), create ADR files in `specs/adrs/`:

```yaml
---
id: ADR-NNN
title: "Decision title"
status: proposed
spec: SPEC-NNN
date: YYYY-MM-DD
author: franklin
---

## Context
[Forces at play — the alternatives from Phase 1 Step 4]

## Decision
[What we decided — the approach chosen in Phase 1 Step 5]

## Consequences
[Good and bad]
```

### Step 9: Self-review (mandatory)

Before presenting the spec to the user, verify:
- [ ] No placeholders, TBDs, or "to be determined" — fill them or flag explicitly as needing input
- [ ] No internal contradictions (scope says X is out, but acceptance criteria test for X)
- [ ] Acceptance criteria are testable (an agent can verify each one programmatically)
- [ ] "Out of scope" has at least 2-3 items
- [ ] Success criteria are measurable (not "improve performance" — "p99 latency < 200ms")
- [ ] Design section references the alternatives considered and why this approach was chosen
- [ ] For refactors: migration section has a rollback plan
- [ ] All Phase 1 agreements are captured — nothing lost in translation from brainstorming to spec
- [ ] The Design / Migration sections do not instruct violations of `sdlc-code-standards` — no "leave X deprecated for N cycles," "skip the test because Y," or similar that would override the universal floor. If a genuine exception is needed, the spec documents the exact reason. Spec-level decisions cannot un-enforce universal standards.

### Step 10: Review the spec with the user

Present the full spec. Walk through each section. This should feel like a confirmation, not a surprise — the user already agreed to the design in Phase 1.

Ask:
- Does the problem statement capture the real issue?
- Are the success criteria measurable and sufficient?
- Is the scope right — anything missing or too broad?
- Does the design accurately reflect what we agreed?
- Are the acceptance criteria testable?

Iterate until the user is satisfied.

### Step 11: Open a PR

- Branch: `spec/SPEC-NNN-short-description`
- Commit: `SPEC-NNN: draft spec for [title]`
- PR title: `SPEC-NNN: [title]`
- PR body: summary of the spec + link to the approaches considered

### Step 12: After approval

1. Update `status: draft` → `status: active`
2. Create the Linear project linked to the initiative
3. Set `linear_project` field in the spec frontmatter
4. If this spec came from `specs/intents.md`: update the intent's status to `done` and set its `Spec` field to `SPEC-NNN`
5. Commit and push the status change
6. Announce: "Spec is active. Ready for task decomposition."

**Next:** Use the `task-decomposition` skill to break the spec into tasks.

**Later:** If implementation reveals the spec needs to change, use the `spec-amendment` skill. That's the backward path — this skill is the forward path. When all tasks are done, use the `spec-completion` skill to verify success criteria and close the loop.

---

## How intent flows through the SDLC

```
"I want to build X"              ← intent arrives
       │
   Phase 1: Brainstorming        ← this skill, Steps 1-5
       │  capture intent
       │  explore problem space
       │  research codebase
       │  propose 2-3 approaches
       │  converge on design
       │  ✓ USER APPROVES DESIGN
       │
   Phase 2: Formalization        ← this skill, Steps 6-12
       │  assign ID
       │  write structured spec
       │  create ADRs
       │  self-review
       │  ✓ USER APPROVES SPEC
       │
   task-decomposition             ← next skill
       │  break into tasks
       │  route to agents
       │  ✓ USER APPROVES PLAN
       │
   implementation                 ← sdlc-code-standards + domain skills
       │
   review                        ← sdlc-code-review
```

Two human gates in this skill: design approval (end of Phase 1) and spec approval (end of Phase 2). Nothing moves forward without explicit user sign-off.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Jumping straight to the spec format | Phase 1 first. Understand and agree on the design before formalizing. |
| Proposing only one approach | Always 2-3. Even if one is obviously better — the comparison sharpens the reasoning. |
| Spec too broad — covers an entire system rewrite | Split into multiple specs. Each should be deliverable in 1-2 cycles. |
| Acceptance criteria that aren't testable | Rewrite as Given/When/Then. If you can't test it, you can't verify it. |
| Skipping "out of scope" | Always list at least 2-3 things that are OUT. This prevents scope creep. |
| Design section with no rationale | Always reference the alternatives considered and why this approach won. |
| Design section is just "we'll figure it out" | If you don't know how, you're not ready to spec. Stay in Phase 1. |
| No ADRs for non-obvious decisions | If someone could reasonably choose differently, it's an ADR. |
| Jumping to implementation before approval | Two hard gates: design approval AND spec approval. Both must pass. |
| Batching 10 questions at once | One at a time. Prefer multiple choice. Have a conversation, not an interrogation. |
| Losing Phase 1 agreements in Phase 2 | Self-review checks for this. Every brainstorming agreement should appear in the spec. |
