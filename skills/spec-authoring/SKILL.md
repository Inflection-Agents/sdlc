---
name: spec-authoring
description: Use when intent arrives — "I want to build X," "we need to refactor Y," "spec out Z," starting any new feature, refactor, or initiative. This is the entry point to the SDLC.
---

# Spec Authoring

## Overview

The entry point to the entire SDLC. Everything starts with intent — a vague idea, a problem statement, a direction. This skill takes that intent through two phases: **brainstorming** (refine intent into clear requirements through conversation) and **formalization** (produce a structured, reviewable spec).

The spec is the root artifact. Everything downstream — the delivery guide, PRs, reviews, bugs — traces back to it.

**This is a rigid skill.** No implementation until the spec is approved. No spec until the design is approved. No design until the intent is understood.

**Upstream:** The `intent-triage` skill captures and prioritizes raw intents. When an intent is marked `ready` and the user picks it, intent-triage hands off to this skill. You can also invoke spec-authoring directly if there's only one intent.

**Announce at start:** "Using spec-authoring to turn this intent into a structured spec."

**Companion skills (auto-invoked if installed):**
- `brainstorming` — behavioral discipline: hard gate on implementation, one question at a time, propose approaches
- `writing-plans` — plan authoring discipline (no placeholders, bite-sized steps)

**Domain skills:** Check each workspace's `skills` in `.sdlc/config.yaml`. When writing a spec that targets specific workspaces, read the domain skills for those workspaces to understand technology-specific constraints, patterns, and conventions that should inform the design.

## Hard gates

These are non-negotiable. The entire SDLC depends on them.

1. **No implementation until the spec is approved.** Do NOT write code, scaffold, or invoke implementation skills until Phase 2 is complete and the user has explicitly approved. No exceptions. Not even "let me prototype something quick." The spec IS the prototype.
2. **No spec until the design is agreed.** Do NOT start writing the formal spec document until Phase 1 produces a design the user has signed off on. Premature formalization wastes effort when the direction changes.
3. **One question at a time.** Ask clarifying questions individually. Prefer multiple choice when possible. Never present a wall of questions — have a conversation.

---

## Phase 1: Brainstorming

**Goal:** Refine vague intent into a clear, agreed-upon design direction.

This phase is conversational. You and the user are thinking partners. The output is NOT the spec — it's alignment on what the spec will say.

**Collaborate with the right people.** Spec-authoring is a judgment phase, and often a multi-team one. This is where scarce human attention belongs — getting the problem, the approach, and the acceptance criteria right is cheap here and ruinous to get wrong downstream, because the delivery run will faithfully build whatever the spec says. If the intent touches more than one team or workspace (check the intent's `Raised by` and `Workspaces`), pull the relevant owner, eng lead, or domain expert into the brainstorming and the Step 10 walkthrough. The spec is a shared contract, not a private draft. The whole point of front-loading human effort is that **humans give great instructions; they do not give great code reviews** — so invest the collaboration here.

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

This is cheaper to catch here than when the guide is written (Step 10b), and much cheaper than discovering it when two PRs conflict at merge time.

**Open-PR id check:** `specs/spec-index.json` and a `specs/` directory listing are both generated from `main` and will not show an id already claimed on an unmerged branch or open PR. Before finalizing a new SPEC id, also run `gh pr list --state open --limit 200 --json number,title,headRefName --jq '.[] | select(.title + .headRefName | test("SPEC-<N>"))'` (substituting the candidate id) to check for an open PR already claiming it; if found, increment past it and re-check.

**Live-correction capture:** If the owner corrects a factual assumption you stated (not merely answers a clarifying question), append a dated note to the intent this spec formalizes in `specs/intents.md`, or mint a new captured intent if the correction reveals an unrelated gap. Open (not merge) this as its own small PR before continuing Phase 1, on whatever bookkeeping branch/lane this repo uses for out-of-band doc updates — opening it is what's within your control; the merge can happen on its own timeline. Do not commit this directly to `main`, and do not rely on remembering to write it down later.

**Monorepo scoping:** If `.sdlc/config.yaml` lists workspaces:
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

**Research protocol.** Answer this fixed list in one fan-out (parallel tool calls in one message, or
one `Explore` agent), not by iterative grep across the session:

1. Which files, scripts, skills and agents implement the affected area today?
2. Which specs and ADRs govern it, and what is each one's status (`node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs resolve <id>`)?
3. Which `active` specs in `specs/spec-index.json` declare the same workspaces (the collision check, Step 2)?
4. Does every file, symbol, script, command and field the design will name exist, and where?
5. What changed in the affected paths recently (`git log -n 20 -- <paths>`), and which open PRs touch them?

Write every answer to the `## Research` section of the decision ledger, `specs/decisions/SPEC-NNN.md`,
as one row per question asked: the question, the command or path that answered it, the git ref it was
checked against, and the result. **Record a search that found nothing as a row too**, for example
"grepped `depends_on` across `skills/` and `agents/`, 0 hits, at `db3675b`". A negative result costs
the most to re-derive, and the reviewer reads this section before it reopens one. A claim in the spec
body then cites the row's command and ref, as the citation rule below requires.

Every non-trivial factual claim reported to the owner, and every such claim that makes it into the spec body, must carry an inline citation — the exact command, file path, or file:line that grounds it — written into the artifact itself. A claim is **non-trivial** (and requires a citation) if it contains: (1) a numeral or count; (2) a file, symbol, script, or command name asserted to exist or not exist; (3) an assertion of current system state ("X is unused," "Y is dead," "Z is enabled," "none/all/every..."); (4) a claim about what another spec, ADR, or invariant says or requires; (5) a claim that something exists, is merged, or has landed — which must name the git ref it was checked against, since "not on `main`" and "does not exist anywhere" are different claims and must not be conflated; or (6) a status field (e.g. `status: deferred`, `status: superseded`) cited as if it also states the reason or cause behind that status — the evidence/rationale field beside it is a separate claim and must be checked independently, not inferred from the status value alone. Connective prose, section transitions, restatements of the user's own stated intent, and narration about this spec-authoring process itself (a review round's findings, a peer session's report, a revision's own history) are exempt — these assert no repo or system state, so there is nothing for an external command to check them against. A claim meeting this test with no citation is not made — investigate first.

Before citing any spec or ADR as current: (1) check its `status` field — `active`/`draft` may be current as-is; `superseded`/`cancelled`/`deprecated`/`archived` is **stale**, continue to step 2; every other value (`done`/`completed`/`snapshot`, or any non-canonical status) is **closed but current** — immutable to further editing, but its contract is in force, so cite it freely rather than treating closed as stale. (2) For a stale record, check its own `superseded_by` field, if it carries one, and follow it to the target, then **re-run step 1 on the target** — a superseded record's successor can itself be superseded, so repeat until reaching a non-stale terminal or a dead end. (3) At any point where the record carries no `superseded_by`, reverse-search: `grep -l '^supersedes: <this-id>' specs/SPEC-*.md specs/adrs/ADR-*.md` to find what replaced it; if nothing is found, treat the topic as having no current successor and say so explicitly rather than silently citing a stale record as current.

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

**Write each decision into the ledger as it is made.** Create `specs/decisions/SPEC-NNN.md` from `.sdlc/templates/authoring-decisions.md` once the id is known (Step 6's open-PR check applies), and add one entry for every question in Steps 2-5 that was open: what was decided, what was rejected and why, what was left ambiguous on purpose, and who raised it. `spec-reviewer` sees only the artifacts Step 10a seeds it with, so a decision that lives only in this conversation is one the reviewer will reopen. A question with an obvious answer is not an entry.

**Checkpoint:** Summarize the agreed design in 5-10 bullet points. Ask: "Does this capture what we're building? If yes, I'll formalize this into a spec."

**Do not proceed to Phase 2 until the user confirms.**

---

## Phase 2: Formalization

**Goal:** Produce a structured, reviewable spec document from the agreed design.

### Step 6: Assign an ID

Check `specs/spec-index.json` for the highest existing SPEC ID. Increment by 1.

Format: `SPEC-NNN` (zero-padded to 3 digits).

**Open-PR id check:** `specs/spec-index.json` and a `specs/` directory listing are both generated from `main` and will not show an id already claimed on an unmerged branch or open PR. Before finalizing a new SPEC id, also run `gh pr list --state open --limit 200 --json number,title,headRefName --jq '.[] | select(.title + .headRefName | test("SPEC-<N>"))'` (substituting the candidate id) to check for an open PR already claiming it; if found, increment past it and re-check.

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
workspaces: [dealer-app, shared] # workspace members affected (see .sdlc/config.yaml workspaces)
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [relevant, tags]
---
```

**Body sections (all required):**

```markdown
## Problem

[What's wrong. Why it matters. Who's affected. Be specific.
This comes directly from Phase 1 Steps 1-2.]

## Success criteria

[Measurable outcomes from Phase 1 Step 5.]
- [ ] SC-1: Criterion one
- [ ] SC-2: Criterion two

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
- [ ] AC-001: Given X, when Y, then Z
- [ ] AC-002: Given A, when B, then C

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
- [ ] If the spec changes a **production behavioral metric** (prompts/instructions, matching/scoring/ranking, gating or auto-approve rules, retrieval/RAG inputs, thresholds), it declares a **guardrail**: the metric, its current baseline, a regression threshold, the first-exposure measurement window, and an **armed rollback** (the exact revert artifact + an automatic trigger condition). Behavioral changes ship behind a canary/flag where feasible. `spec-completion` Step 5a blocks completion without this — declare it here, not at the end.
- [ ] Design section references the alternatives considered and why this approach was chosen
- [ ] For refactors: migration section has a rollback plan
- [ ] All Phase 1 agreements are captured — nothing lost in translation from brainstorming to spec
- [ ] The Design / Migration sections do not instruct violations of `sdlc-code-standards` — no "leave X deprecated for N cycles," "skip the test because Y," or similar that would override the universal floor. If a genuine exception is needed, the spec documents the exact reason. Spec-level decisions cannot un-enforce universal standards.
- [ ] Every non-trivial factual claim in this spec (per the Step 3 non-trivial test) carries an inline citation in the spec body — not asserted from memory, and not left in the drafting conversation where no future reader or reviewer can check it (`spec-reviewer` is seeded only by the artifacts listed in its Inputs, never the author's reasoning).

### Step 10: Review the spec with the user

Present the full spec. Walk through each section. This should feel like a confirmation, not a surprise — the user already agreed to the design in Phase 1.

Ask:
- Does the problem statement capture the real issue?
- Are the success criteria measurable and sufficient?
- Is the scope right — anything missing or too broad?
- Does the design accurately reflect what we agreed?
- Are the acceptance criteria testable?

Iterate until the user is satisfied.

This human walkthrough is **not replaced** by Step 10a — both run. The reviewer in Step 10a makes gap detection systematic and grounded; the walkthrough here keeps the owner in the loop on intent, framing, and judgment calls the reviewer is not positioned to make.

### Step 10a: Dispatch `spec-reviewer` before the sign-off gate

After Step 10 produces a draft the owner is broadly comfortable with, and BEFORE the "USER APPROVES SPEC" gate at the end of Phase 2, DISPATCH the `spec-reviewer` agent on the draft. This is a mandatory step — the owner remains the sign-off authority, but the reviewer produces grounded, machine-parseable findings that the owner can act on or override explicitly.

**Why this step exists (and why it does not replace Step 10):** The owner's walkthrough confirms intent and framing. The `spec-reviewer` checks the spec against the schema, the authoring conventions, the originating intent, ADRs, and upstream/downstream specs for the 9 gap categories enumerated in `spec-reviewer/SKILL.md`. The two are complementary: the owner catches "this is not what I meant"; the reviewer catches "this AC is untestable" or "this contradicts SPEC-042". Skipping either loses coverage.

**Run the mechanical checks first.** Before every dispatch, round 1 and each later round, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-spec specs/SPEC-NNN-<short-description>.md
```

Do not dispatch `spec-reviewer` until it exits `0`. It decides the defects a script can decide (a
missing or empty required section, bad frontmatter, an unresolved ADR or `depends_on`, thin scope, a
placeholder, sections out of order), so no reviewer round is spent on them. Fix what it reports and run
it again; its findings use the review envelope and are never sent to the reviewer.

**Dispatch, do not invoke.** Call the `Agent` tool with `subagent_type: spec-reviewer`.

**Reviewers per round.** Round 1 dispatches two reviewers, `variant: "default"` and
`variant: "adversarial"`, in ONE message so they run concurrently against the same draft. Every later
round dispatches one, `variant: "default"`. The one exception is the SPEC-001 AC-010 measurement
protocol (`review-primitives.md` > Measurement protocol), which dispatches both variants in whichever
round it runs against. This paragraph is the only statement of the rule; `spec-amendment` cites it.

**The authoring context must never grade its own spec.** You wrote this; findings you produce in
this turn are a self-review wearing a reviewer's output format, and the two are byte-identical in
the artifact. The agent has no `Edit`/`Write` and a clean context, which is the whole of what makes
its verdict worth having. If you are about to write findings inline, stop and dispatch.

Seed each dispatch with these inputs (all paths concrete; do not invent them). An input marked
**optional** may not exist in this repo or for this spec. When one is absent, say so in the dispatch
prompt ("no `AGENTS.md` in this repo") so the reviewer knows it was not given the file, rather than
leaving it out silently or naming a path that does not resolve. Every other input must resolve.

- `spec_file`: `specs/SPEC-NNN-<short-description>.md` — the draft just written.
- `spec_schema`: `skills/spec-schema.md` at the plugin root (`${CLAUDE_PLUGIN_ROOT}/skills/spec-schema.md`; in the framework repo, the repo root) — for required-section and frontmatter checks.
- `authoring`: `skills/spec-authoring/SKILL.md` at the plugin root, as above — this skill, for `spec-authoring:<anchor>` citations.
- `decisions`: `specs/decisions/SPEC-NNN.md` — the authoring decision ledger from Phase 1 (Step 5), including its `## Research` section (Step 3).
- `intent` (**optional**): the relevant excerpt from `specs/intents.md` (the intent this spec formalizes). Absent when the spec was invoked outside the intent-triage handoff and the owner confirms there is no intent.
- `project`: `.sdlc/config.yaml` `workspaces`, for workspace coverage checks, plus (**optional**) the `AGENTS.md` SDLC block. `/sdlc-init` writes `AGENTS.md` in every adopting repo; the framework repo has none.
- `adrs` (**optional**: none when the Design cites no ADR and contradicts none): every ADR file referenced in the spec's Design section, plus any existing ADR the design may contradict (use judgment; when uncertain, include the candidate).
- `upstream_specs` (**optional**: none on a spec with no `depends_on`): every spec listed in this spec's `depends_on`.
- `downstream_specs` (**optional**: none when no spec depends on this one): every spec that declares this spec in its `depends_on` (the `depends_on` field of `specs/spec-index.json`).
- `previous_output` (**optional**: absent in round 1): from `review-log project`, as **Record every round in the review log** below describes.
- `variant`: as **Reviewers per round** above sets it for this round.

**Present findings to the owner.** The reviewer emits JSON per the shared envelope in [`review-primitives.md`](../review-primitives.md) > Output schema. Render the findings to the owner as a graded list: blocker → major → nit → suggestion, each with its `criterion` (the grounded citation), `location` (the spec section), `finding` (one sentence), and `suggested_fix` if present.

**Validate every returned envelope before folding it:**

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs stamp-envelope <envelope.json>
```

Exit `0` folds the findings. `2` is an abstention and escalates — never accept it, even with
an empty findings list. `3` is a contract violation: re-dispatch or escalate, never treat it as a
clean review. This is also where a self-review is caught: an envelope with `reviewed_by: inline`
carrying blockers, or carrying none at all, is rejected — an empty envelope is a verdict of
"nothing wrong", so an inline one is a self-accept.

**Record every round in the review log.** `specs/review-logs/SPEC-NNN.json` is the one record of
every finding raised against this spec, keyed by its content-addressed `id` (SPEC-007 > Lever 5). It
is the only file the routing policy reads an owner's ruling from.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs review-log append specs/SPEC-NNN-<x>.md <envelope.json> --round <n>   # after the validator exits 0
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs review-log apply  specs/SPEC-NNN-<x>.md <envelope.json> > routed.json  # route on this, not on the raw envelope
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs review-log project specs/SPEC-NNN-<x>.md > previous_output.json         # the next round's previous_output
```

Append each returned envelope, both of round 1's and the single reviewer's in every later round.
`--round` is the policy's round, counted from 1 within this review. An amendment is a new review of
the same spec: it passes `--review v<N>-amendment` and restarts `--round` at 1, and the log keeps
one numbered history across all of them.
`apply` drops a finding the owner marked `wontfix` and routes an `overridden` one at the owner's
severity, never above the reviewer's, so run the policy on its output. Seed each round after the
first with `previous_output` from `project`, never from a hand-carried envelope; the carry-forward
rule in `review-primitives.md` is unchanged.

**Apply the routing policy.** Severity → action is defined in [`review-primitives.md`](../review-primitives.md) > Orchestrator severity→action policy — do not duplicate it here. In summary: blockers/majors route to `fix_loop`; nits/suggestions route to `batch_followup_and_accept` (appended to `spec_followups:` per SPEC-001 Design > Spec followups format); empty findings list routes to `accept`; and at the spec-side round cap (`SPEC_REVIEW_ROUND_CAP` in that policy, ADR-005), a remaining blocker or major routes to `disclose_and_accept`. Count rounds from 1 at the first dispatch and pass the count as the policy's `round`. Run the policy on the reviewer's output and proceed accordingly:

- **`fix_loop`** (any blocker or major exists): loop with the author to fix each finding, OR loop with the owner to override severity via `spec_review_overrides:` (see below). Re-DISPATCH `spec-reviewer` after edits — a fix round is graded by a fresh agent, never inline — passing `previous_output` from `review-log project` so nit/suggestion findings on unchanged sections carry forward per the contract in `review-primitives.md`. Continue looping until there are no remaining un-overridden blockers or majors, or until the policy returns `disclose_and_accept`.
- **`batch_followup_and_accept`** (only nits/suggestions remain): append the findings to a `spec_followups:` section in the spec body (after `Migration` and `spec_review_overrides`, per SPEC-001 Design > Spec followups format), then proceed to the sign-off gate.
- **`accept`** (empty findings list): proceed directly to the sign-off gate.
- **`disclose_and_accept`** (the round cap is reached with a blocker or major left): dispatch no further round. Write each surviving blocker and major into a `## Disclosed, not reviewed-clean` section of the spec body, as the policy's action semantics in `review-primitives.md` specify, handle the nits and suggestions as under `batch_followup_and_accept`, and proceed to the sign-off gate, where the owner signs off with the survivors in front of them.

**Owner override format.** When the owner judges a finding's severity is too high — e.g., the reviewer raised a `major` for an ambiguity the owner believes is intentional and will be sharpened in the first step — the owner downgrades severity by appending a `spec_review_overrides:` entry to the spec body. The section lives after `Migration` and before any other appendix, per SPEC-001 Design > Owner override format. Example entry:

```yaml
## spec_review_overrides

- finding_id: F-3f9a1c2e
  reviewer_severity: major
  owner_severity: nit
  reason: "Spec is intentionally ambiguous in this domain; will sharpen after the first step."
  override_date: 2026-05-18
```

**Overrides downgrade severity only — they never silence the finding.** The original reviewer output stays in the spec's review log, `specs/review-logs/SPEC-NNN.json`. The routing policy reads the *override* severity from that log, which shows both the reviewer's call and the owner's. An override that attempts to remove a finding from the output, or to mark a finding as resolved without addressing it, is a SPEC-001 contract violation.

**Record the owner's ruling in the log, after the spec body.** Once the `spec_review_overrides` entry is in the spec, record it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs review-log resolve specs/SPEC-NNN-<x>.md <finding_id> --resolution overridden --owner-severity <sev> \
    --recorded-by <owner> --reason "<the entry's reason>"
```

Only the owner may drop a finding outright. That is `--resolution wontfix`, paired with a spec-body entry carrying `resolution: wontfix` and a reason, and for a blocker or major also an entry in `## Disclosed, not reviewed-clean`. The command refuses, and writes nothing, when `--recorded-by` is not the spec's `owner` or the spec body does not already show the same ruling, so the log never runs ahead of the spec. Neither the author nor a reviewer records a ruling.

When the routing policy returns `accept` or `batch_followup_and_accept` (after any overrides), proceed to the sign-off gate. The owner's sign-off remains the authority — the reviewer's output is informational and grounded; the owner approves.

### Step 10b: Write the delivery guide

Once the spec review has converged (Step 10a returns `accept` or `batch_followup_and_accept`), write
the plan the delivery run will execute. The guide is short: the executor already holds the spec.
Schema: [`skills/guide-schema.md`](../guide-schema.md). Template: `.sdlc/templates/guide.md`.

1. **Write `specs/tasks/SPEC-NNN/GUIDE.md` and `_index.yaml`.** Ordered steps, each with the spec AC
   ids it covers, the paths it may change and the commands that verify it; the owner decisions the run
   cannot close alone; the end-to-end validation. `_index.yaml` lists every step and decision as
   `pending` and carries `plan_review:` with `approved: false`. A guide over 10 steps means the spec
   is too big: split it.
2. **Run the validator** and fix what it reports:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/run.mjs validate-guide specs/tasks/SPEC-NNN/GUIDE.md
   ```

3. **Check for collisions with other open specs.** Compare this guide's `Changes:` globs with the
   guide of every other `active` or `draft` spec. For a spec that has no guide yet, compare against
   the `touches` in its `TASK-*.md` frontmatter, falling back to its `_index.yaml` `tasks:` list, and
   ask the owner when neither declares any. Put any overlap to the owner with three options: proceed
   with awareness, sequence the specs, or coordinate on the specific files at risk. The owner decides.
4. **Write the `phase:` block** in `_index.yaml` on exit: `current: spec-authoring`,
   `next_action: spec-execution`, `next_trigger: 'execute SPEC-NNN'`, `exit_condition_met: true` and
   `updated: <date>`. Set `handoff_surfaced: true` only after you surface the handoff, because
   `stop-handoff.mjs` reads it and never writes it.
5. **At sign-off, write the kickoff prompt** `specs/tasks/SPEC-NNN/KICKOFF.md` from
   `.sdlc/templates/kickoff.md` and show it to the owner in full. **It holds at most 3,800 characters**,
   counted as Unicode characters, not bytes. That is the owner's limit for the prompt that arms a
   delivery goal, and validator rule 9 fails an approved guide whose prompt is missing or longer.

**`spec-reviewer` is not dispatched on the guide.** The validator covers the mechanical part (every
AC covered, every step verifiable, index and guide in step, the kickoff limit), and the owner judges
the rest at sign-off.

**The owner approves spec and guide together.** In one sign-off the owner sets the spec to
`status: active` and `plan_review.approved: true`, and one spec PR carries the spec, the guide, the
index and the kickoff prompt.

#### Writing the guide for an active spec on its own

"Write the guide for SPEC-NNN" runs this step alone, for a spec that is already `active` but has no
guide (one specced before guides existed, or one whose amendment landed before its guide).

1. **Make any id-only edits first.** A guide's `Covers:` names AC ids, so every acceptance criterion
   line needs one. Adding an id to the front of an existing criterion line, and changing nothing else
   on it, is a Cosmetic change under `spec-amendment`: no version bump and no re-review. The legacy
   `AC-NNN —` form already counts.
2. **Run items 1 to 5 above.** A spec's existing task briefs can serve as step briefs through
   `Notes:`.
3. **Open a `guide/SPEC-NNN` PR** carrying the guide, the index, the kickoff prompt and the id-only
   edits, and list each id-only edit in its body. The owner approves by setting
   `plan_review.approved: true`.

### Step 11: Open a PR

- Branch: `spec/SPEC-NNN-short-description`
- Commit: `SPEC-NNN: draft spec for [title]`
- PR title: `SPEC-NNN: [title]`
- Carries: the spec, any ADRs, and `specs/tasks/SPEC-NNN/` (`GUIDE.md`, `_index.yaml`, `KICKOFF.md`)
- PR body: summary of the spec + link to the approaches considered

### Step 12: After approval

1. Update `status: draft` → `status: active`, and set `plan_review.approved: true` in the same commit
2. If this spec came from `specs/intents.md`: update the intent's status to `done` and set its `Spec` field to `SPEC-NNN`
3. Commit and push the status change
4. Announce: "Spec is active. Ready for delivery." and show the owner `KICKOFF.md`, the prompt that
   starts the run.

**Next:** The owner pastes `KICKOFF.md` to start `spec-execution`.

**Later:** If implementation reveals the spec needs to change, use the `spec-amendment` skill. That's the backward path — this skill is the forward path. When every guide step is done, use the `spec-completion` skill to verify success criteria and close the loop.

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
       │  human walkthrough (Step 10)
       │  spec-reviewer + owner overrides (Step 10a)
       │  delivery guide + kickoff prompt (Step 10b)
       │  ✓ USER APPROVES SPEC AND GUIDE
       │
   spec-execution                 ← next skill: burns the guide's steps down
       │  one integration PR, adversarial panel
       │
   spec-completion                ← verifies the success criteria
```

Two human gates in this skill: design approval (end of Phase 1) and spec-and-guide approval (end of Phase 2). Nothing moves forward without explicit user sign-off. On exit (spec flips `draft` → `active` with `plan_review.approved: true`), hand off to `spec-execution` with the kickoff prompt; the canonical handoff fields are in the generated `## Handoff` footer below.

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

<!-- sdlc:handoff:start -->
<!-- GENERATED from .sdlc/state-machine.yaml by ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-authoring** in the SDLC state machine (`.sdlc/state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- I want to build
- we need to refactor
- spec out
- new feature
- new initiative
- write the guide for

**Preconditions:**

- intent exists or owner confirms none is needed (or, for "write the guide for", the spec is active and has no guide)

**Exit condition:** spec status flips draft -> active and plan_review.approved flips true in one owner sign-off (ADR-007), after spec-reviewer sign-off on the spec; specs/tasks/SPEC-NNN/GUIDE.md passes .sdlc/scripts/validate-guide.mjs, and KICKOFF.md (at most 3,800 characters) is written and shown to the owner

**Next step:** `spec-execution` — trigger: "execute SPEC-NNN"
<!-- sdlc:handoff:end -->
