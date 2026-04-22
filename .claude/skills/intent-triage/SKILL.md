---
name: intent-triage
description: Use when the user has ideas, wants, or directions to capture — "I want to," "we need to," "we should," brain dump, session start with multiple goals, or when asked to review/prioritize the intent backlog
---

# Intent Triage

## Overview

The first stage of the SDLC. Before specs, before brainstorming — capture raw intent. Intents are the seeds of specs. They arrive fast, often in batches, and most aren't ready for spec-authoring yet. This skill captures them, helps organize and prioritize, and feeds them into spec-authoring one at a time.

**Announce at start:** "Capturing intents — I'll help organize and prioritize before we spec anything."

**This is an adaptive skill.** Capture should be frictionless. Don't over-structure. The user is thinking out loud — your job is to catch everything and help them decide what to work on first.

## The intents file

Intents live in `specs/intents.md` at the repo root. This is the backlog of raw ideas — the intake buffer before specs exist.

**Do NOT use Linear for raw intents.** Linear is for work that's been scoped. Intents are pre-scope. Putting unstructured ideas into a project tracker creates noise for stakeholders and pressure to prematurely define things.

## Modes

This skill operates in three modes depending on what's happening:

### Mode 1: Capture

**Trigger:** The user says things like "I want to," "we need to," "we should," "another thing," or is brain-dumping multiple ideas.

**What to do:**
1. Listen. Don't interrupt the flow.
2. After the user pauses, reflect back what you heard as a numbered list of distinct intents.
3. Ask: "Did I miss anything? Anything to add or merge?"
4. Write each intent to `specs/intents.md` (see format below).
5. Confirm: "Captured N intents. Want to prioritize now, or keep capturing?"

**Keep it fast.** A one-sentence description is enough. Don't ask for problem statements, success criteria, or scope — that's spec-authoring's job. The user should be able to dump 5 ideas in 2 minutes.

### Mode 2: Organize

**Trigger:** "Let's organize these," "what's on the backlog," "show me the intents," or when the intents file has grown and needs structure.

**What to do:**
1. Read `specs/intents.md`
2. Present the intents grouped by theme or workspace
3. Identify:
   - **Related intents** that might become one spec ("ETL refactor" and "pipeline performance" might be the same effort)
   - **Dependencies** ("dashboard report needs the new data model from the ETL refactor")
   - **Conflicts** ("these two touch the same workspace and could collide")
   - **Quick wins** (small, well-understood, no dependencies)
4. Propose merges, splits, or groupings
5. Update the file with the user's decisions

### Mode 3: Prioritize & hand off

**Trigger:** "What should we work on first," "let's pick one," "prioritize," or when the user is ready to start spec work.

**What to do:**
1. Read `specs/intents.md`
2. Present the top candidates with reasoning:
   - Dependencies (what unblocks the most?)
   - Impact (what delivers the most value?)
   - Risk (what gets harder if we wait?)
   - Readiness (which intents are clearest / need the least brainstorming?)
3. The user picks one
4. Update the intent's status to `in-progress`
5. Hand off: "Starting spec-authoring for: [intent title]"
6. Invoke the `spec-authoring` skill with the intent as input

## Intents file format

`specs/intents.md`:

```markdown
# Intents

Raw ideas and directions. Each becomes a spec when ready.

## Active

| # | Intent | Workspaces | Status | Spec |
|---|--------|-----------|--------|------|
| 1 | Refactor ETL pipeline to use dbt incremental models | dbt | ready | |
| 2 | Add dealer performance comparison report | dealer-app, dbt | captured | |
| 3 | Fix loan aging query performance (>5s on large portfolios) | dbt, dealer-app | captured | |

## In Progress

| # | Intent | Spec |
|---|--------|------|
| 4 | Migrate auth from custom JWT to Supabase Auth | SPEC-003 |

## Done

| # | Intent | Spec |
|---|--------|------|
| 5 | Add admin user management | SPEC-001 |
| 6 | Set up CI pipeline | SPEC-002 |
```

### Fields

| Field | Required | Notes |
|-------|----------|-------|
| `#` | yes | Simple incrementing number. Not a formal ID — just for reference in conversation. |
| `Intent` | yes | One sentence. What the user said, in their words. Don't rewrite or formalize. |
| `Workspaces` | no | Which workspaces this likely touches. Rough guess is fine — spec-authoring will refine. |
| `Status` | yes | `captured` → `ready` → `in-progress` → `done` |
| `Spec` | no | Set when spec-authoring produces a spec from this intent. |

### Status flow

```
captured      ← just written down, no analysis yet
    │
ready         ← understood enough to start spec-authoring
    │
in-progress   ← currently being spec'd (one at a time)
    │
done          ← spec exists, intent is fulfilled
```

## Rules

1. **Capture is frictionless.** Never ask the user to structure an intent. One sentence is enough. You add workspaces and status.
2. **One intent in-progress at a time.** Don't start spec-authoring on intent #2 while intent #1 is still being spec'd. Focus.
3. **Intents are NOT specs.** Don't write problem statements, acceptance criteria, or design sections in the intents file. That's spec-authoring's job.
4. **Intents can merge or split.** Two intents might become one spec. One intent might split into three specs. This is discovered during organize mode, not forced at capture time.
5. **Dead intents are deleted, not accumulated.** If the user says "never mind about #3," remove it. Don't let the backlog become a graveyard.
6. **The user prioritizes.** You can propose an order with reasoning, but the user decides. Don't assume urgency from the intent's content.

## Session start pattern

At the start of a working session, if `specs/intents.md` exists:

1. Read it
2. Briefly report: "You have N intents: M ready, K captured. Intent #4 is in-progress (SPEC-003). Want to continue with that, or review the backlog?"

This keeps the backlog visible without being intrusive.

## Relationship to spec-authoring

```
intent-triage                    spec-authoring
┌──────────────┐                ┌──────────────┐
│ Capture      │                │ Phase 1:     │
│ Organize     │──── pick ────▶│ Brainstorming│
│ Prioritize   │   one intent  │              │
│              │                │ Phase 2:     │
│              │◀── done ──────│ Formalization│
│ Mark done,   │   spec exists │              │
│ link spec    │                └──────────────┘
└──────────────┘
```

Intent-triage owns the backlog. Spec-authoring owns the deep dive. The handoff is explicit: "Starting spec-authoring for intent #N."

When spec-authoring produces a spec, intent-triage updates the intent: status → `done`, spec → `SPEC-NNN`.
