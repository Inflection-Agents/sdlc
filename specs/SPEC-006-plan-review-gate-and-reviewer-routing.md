---
id: SPEC-006
title: "Enforced plan-review gate and registry-driven reviewer routing"
status: active
version: 1
initiative: INI-001
owner: franklin
created: 2026-06-23
updated: 2026-06-23
depends_on: [SPEC-001, SPEC-002]
tags: [sdlc, plan-review, reviewer-routing, review-primitives, port-back]
---

## Problem

The reference implementation (sqillpad-platform) has been running the SDLC for real and codified three
improvements to the review machinery that this generic engine still lacks. Each is a place where the
engine relies on a human remembering to do the right thing, or carries policy in code that should be data:

1. **The plan-review gate is not enforced.** The engine's plan review lives entirely in skill prose —
   `spec-authoring` Step 10a runs `spec-reviewer` over the *spec*, and `task-decomposition` ends with a
   "USER APPROVES PLAN" gate. Nothing structural stops `execute-spec` from running a spec whose plan was
   never reviewed or approved. `execute-spec.js` has no `plan_review` reference at all; its only Plan-phase
   precondition is `status: active`. A skipped review is invisible until a bad plan has already been built.

2. **Reviewer assignment is policy-in-code.** `execute-spec.js` resolves a lens to its specialized reviewer
   through a hardcoded `SPECIAL_REVIEWER` / `lensToAgent` map (lines ~63–70). Adding or re-routing a
   specialist means editing the engine, and the lens registry (`review-constraints.yaml`) — which already
   owns *which lens fires* — cannot say *which agent grades it*. The reference implementation hit exactly
   this, drifted two copies of the map, and fixed it (their SPEC-004) by moving the binding into the
   registry as data.

3. **"Review" is three different things wearing one name.** The SDLC has three distinct review moments —
   **plan review** (the spec + its decomposition, *before* any code), **code review** (each task's PR,
   *during* execution), and **integration review** (the integration PR, at the *end*). But the vocabulary
   blurs them: the state machine's `review` phase is actually *code* review, `spec-reviewer` grades plans,
   and the reference implementation's `review-spec` workflow grades plans too — so every "review" term reads
   as "reviews specs." Newcomers cannot tell from a name whether a review happens before or after code
   exists. A latent symptom of the same blur: the **PR-side** grounding-prefix vocabulary has drifted — the
   `pr-reviewer` skill prose cites `AC-NNN` / `ADR-NNN` / `sdlc-code-standards:` / `monorepo:*` / `task:*`,
   while `execute-spec.js` `ALLOWED_PREFIX` and `review-envelope.schema.json` accept only
   `ac:` / `inv:` / `design:` / `lens:` / `task:scope` / `spec:`. An engine-driven code reviewer that cited
   `ADR-003` or `monorepo:boundary` — exactly as its own skill instructs — would be rejected as ungrounded.
   (The *spec-side* set used by `spec-reviewer` is a deliberately separate vocabulary, not in question here —
   the engine never grades specs.)

These compound: a memory-dependent gate, a code-coupled routing policy, and a naming model that makes the
whole review story hard to teach. This spec ports the reference implementation's structure back upstream.

## Success criteria

- [ ] `execute-spec` cannot build a spec whose plan was not reviewed and owner-approved — the gate is
      structural, not a reminder, and fails closed.
- [ ] Adding or re-routing a specialized reviewer is a one-line edit to `review-constraints.yaml` with no
      change to `execute-spec.js`.
- [ ] A reader of `skill-architecture.md` can name the three review moments, when each fires, and which
      skill/workflow owns each, from one diagram.
- [ ] The **PR-side** grounding-prefix vocabulary matches across `review-primitives.md`, `pr-reviewer`,
      `execute-spec.js` `ALLOWED_PREFIX`, and `review-envelope.schema.json` — no prefix the `pr-reviewer` skill
      instructs a code reviewer to cite is rejected by the engine. (The spec-side set is unchanged.)
- [ ] The engine's own existing specs continue to be runnable (the fail-closed gate does not retroactively
      block specs already decomposed).

## Scope

### In scope

- **(A) Registry-driven reviewer routing.** An optional `agent:` field on each `review-constraints.yaml`
  constraint; a pure `agentForLens(constraints, lens)` resolver in `execute-spec.js` replacing the hardcoded
  map; a routing unit test under `scripts/sdlc/`.
- **(B) Enforced, two-stage plan-review gate.** A `plan_review:` block in `_index.yaml` (schema + back-fill);
  `task-decomposition` stamps it at its approval gate; `execute-spec` HALTs at the Plan phase, before any
  executor, unless `plan_review.approved === true && status !== 'needs-rework'`; fail-closed on a missing
  block.
- **(B-clarity) Review-moments naming.** Standardize "plan review" / "code review" / "integration review"
  in the SDLC docs; add a review-moments diagram to `skill-architecture.md`; rename the state-machine
  `review` phase → `code-review` and regenerate handoffs.
- **PR-side grounding-prefix reconciliation.** First **amend SPEC-001** (via `spec-amendment`) so its
  canonical PR-side prefix table in `review-primitives.md` is the agreed source of truth; then bring
  `execute-spec.js` `ALLOWED_PREFIX` and the `review-envelope.schema.json` `criterion` into agreement with
  the amended `pr-reviewer` set. The reconciliation is PR-side only.
- **ADRs** recording the two non-obvious decisions (routing-as-data; gate-in-`_index.yaml`).

### Out of scope

- **The deterministic `review-spec.js` convergence loop** (the reference implementation's mechanized
  plan-review with auto-fix). Deferred as a separate intent ("increment C"). This spec makes plan review
  *enforced*, not *mechanized* — it stays the conversational `spec-reviewer` skill loop. A future port must
  *drive* this engine's richer `spec-reviewer` knowledge (adversarial variant, ≥80%-agreement protocol,
  9-category gap catalog, cross-spec contradiction) from such a loop, not replace it.
- **Committed reviewer-agent definition files.** Reviewer `agentType`s (`task-reviewer`,
  `design-fidelity-reviewer`, etc.) remain runtime-provided strings; this spec does not add
  `.claude/agents/*.md`. The constraints in `review-constraints.yaml` stay illustrative.
- **Renaming the reviewer skills.** `spec-reviewer` (grades plans) and `pr-reviewer` (grades code) are
  already accurate; only the state-machine *phase* `review` is renamed.
- **The spec-side grounding vocabulary.** The `spec-reviewer` prefix set (`spec-schema:`, `spec-authoring:`,
  `intent:`, `monorepo:workspaces`, `SPEC-NNN:`) is a separate axis the engine never consumes; it is left
  unchanged. Only the PR-side set is reconciled.
- **Re-scoping what plan review checks beyond what `spec-reviewer` + the decomposition gate already cover.**

## Design

### A. Reviewer routing is registry data

Each constraint in `.ai/skills/review-constraints.yaml` gains an optional `agent:` field — the specialized
reviewer `agentType` that grades its lens. Omitted ⇒ the generic `task-reviewer` (integration-scope
constraints are graded by `integration-reviewer` at the integration gate and carry no `agent:`). The
registry header comment is corrected to name the `agent:` field as the source of truth, replacing the
pointer at the engine's map.

In `execute-spec.js`, delete `SPECIAL_REVIEWER` and `lensToAgent` (lines ~63–70) and resolve from the
constraints already in scope in `reviewPass`:

```js
// lens -> reviewer agent, resolved from the registry (the constraint that owns the lens);
// unmapped lenses fall to the generic task-reviewer.
const agentForLens = (constraints, lens) =>
    ((constraints || []).find((c) => c.lens === lens && c.agent) || {}).agent || 'task-reviewer'
```

`reviewPass`'s grouping switches from `lensToAgent(l)` to `agentForLens(constraints, l)`. Per ADR-001, this
is the policy-as-data move: routing becomes a one-line registry edit, picked up with no engine change.

### B. The enforced, two-stage plan-review gate

"The plan" is the **spec *and* its decomposition** — the tasks are what `execute-spec` actually runs, so the
gate must attest both. Two stages, one recorded verdict:

1. **Spec stage (unchanged):** `spec-authoring` Step 10a runs `spec-reviewer` over the draft spec before the
   owner's sign-off. This already exists and is not modified.
2. **Decomposition stage (hardened):** `task-decomposition`'s existing "USER APPROVES PLAN" gate is hardened
   to **stamp a `plan_review:` block into `_index.yaml`** once the decomposition has been reviewed (DAG
   acyclicity, no same-wave `touches` collisions, AC groundedness — the dimensions the decomposition
   self-review already enumerates). The skill writes the block with `approved: false`; the **owner** sets
   `approved: true`. This keeps the human as the sign-off authority while making the verdict a durable,
   machine-readable artifact rather than a transient conversation.

`plan_review:` is a new top-level block in `_index.yaml`, beside `phase:` and `tasks:`:

```yaml
plan_review:
  status: approve-ready        # approve-ready | approve-after-fixes | needs-rework
  approved: true               # OWNER sign-off — execute-spec gates on this
  reviewed: 2026-06-23         # ISO date the plan review was recorded
```

**The gate.** `execute-spec.js`, at the Plan phase **before spawning any executor**, reads
`_index.yaml.plan_review` and computes a pure verdict:

```js
const planApproved = (pr) => !!pr && pr.approved === true && pr.status !== 'needs-rework'
```

`planApproved === false` ⇒ **HALT at Plan** with a message naming the remediation ("run plan review and set
`plan_review.approved: true` in `_index.yaml`"). Per ADR-002 this is **fail-closed**: a *missing*
`plan_review` block halts exactly like an unapproved one. The check is a total function, unit-testable with
no agent.

**Back-compat.** Every existing `_index.yaml` under `specs/tasks/` is back-filled with a `plan_review` block
(the engine's own already-decomposed specs are retroactively stamped) so the fail-closed gate does not block
specs that predate it. New decompositions get the block from the hardened `task-decomposition` gate.

The `plan_review:` block is documented in `task-schema.md` (it lives in `_index.yaml`) and referenced from
`spec-schema.md`. It is additive — `_index.yaml` files without it remain schema-valid, but `execute-spec`
treats absent-or-unapproved identically (fail-closed).

### B-clarity. One name per review moment

The SDLC has exactly three review moments. They get three names, used consistently everywhere:

| Moment | Reviews | When | Owner |
|---|---|---|---|
| **plan review** | the spec + its decomposition | before any code (the gate above) | `spec-reviewer` (spec) + `task-decomposition` gate (plan) |
| **code review** | each task's PR/diff | during `execute-spec`, per task | `pr-reviewer` → `sdlc-code-review`; engine `task-reviewer`/specialists |
| **integration review** | the integration PR vs success criteria | end of `execute-spec` | `integration-reviewer` |

Concretely:

- Add a **review-moments diagram + table** (the one above) to `skill-architecture.md`, mapping each moment to
  its trigger and owning skill/workflow.
- **Rename the state-machine `review` phase → `code-review`** in `specs/sdlc-state-machine.yaml` (it is, in
  fact, code review — its `owner_skill` is `pr-reviewer`). Update every reference to the old phase id,
  regenerate the `## Handoff` footers via `scripts/sdlc/gen-handoffs.mjs`, and keep
  `scripts/sdlc/validate-state-machine.mjs` green.
- Sweep the SDLC docs so "plan review" denotes the pre-code gate and "code review" denotes the per-task PR
  review — never "spec review" for the former.

### PR-side grounding-prefix reconciliation

`review-primitives.md` already separates two **distinct** grounded-citation vocabularies — a **PR-side** set
(`pr-reviewer` + Tier-2 specialists: `AC-NNN`, `ADR-NNN`, `sdlc-code-standards:`, `monorepo:*`, `task:*`,
`spec:*`) and a **spec-side** set (`spec-reviewer`: `spec-schema:`, `spec-authoring:`, `intent:`,
`monorepo:workspaces`, `SPEC-NNN:`). Only the **PR-side** set is consumed by the engine (which grades PRs and
tasks, never specs), and only the PR-side set has drifted. The spec-side set is out of scope and untouched.

The PR-side prefix table is a **SPEC-001-owned contract**. `review-primitives.md` itself states that prefixes
and consequence rows change only via `spec-amendment` on SPEC-001, or via the extension pattern (a Changelog
annotation on SPEC-001 — see SPEC-004). So the reconciliation is sequenced as a **prerequisite SPEC-001
amendment**, which SPEC-006 then aligns the engine and schema to:

1. **Amend SPEC-001** (`spec-amendment`) so `review-primitives.md` carries the agreed canonical PR-side prefix
   table (version bump + Changelog entry on SPEC-001). This establishes the source of truth. SPEC-006 declares
   `depends_on: [SPEC-001, SPEC-002]` to record the edge.
2. **Align the engine + schema** to that table — SPEC-006's own work:
   - `execute-spec.js` `ALLOWED_PREFIX` accepts the full PR-side set the amended `pr-reviewer` contract
     instructs (so an engine-driven code reviewer citing an ADR or a `monorepo:boundary` finding is **not**
     rejected as ungrounded).
   - `review-envelope.schema.json`'s `criterion` description/enumeration matches it.

Canonical form is settled in the SPEC-001 amendment, not here; SPEC-006 fixes the *alignment contract*
(engine `ALLOWED_PREFIX` ≡ schema `criterion` ≡ the amended `pr-reviewer` table) and pins it with a concrete
parity check under `scripts/sdlc/` (mirroring the reviewer-routing test).

### ADRs

- **ADR-001 — Reviewer routing is registry data, not engine code.** The `agent:` field on a constraint binds
  a lens to its reviewer; the engine resolves it generically. Alternative (hardcoded map) rejected for the
  drift it caused in the reference implementation.
- **ADR-002 — The plan-review gate is enforced in `_index.yaml`, two-stage, fail-closed.** The verdict lives
  where `execute-spec` already reads (`_index.yaml`, post-decomposition), reviews spec + plan together, and
  blocks on a missing/unapproved block. Alternatives (authoring-time stamp in the spec; a new
  post-decomposition review phase) rejected for, respectively, not gating the decomposition and adding a
  phase rather than reusing the existing approval gate.

## Acceptance criteria

**A — registry-driven routing**

- [ ] Given a constraint in `review-constraints.yaml` with `agent: <X>`, when `execute-spec` reviews a task
      whose touches trip that constraint's lens, then the lens is graded by agent `<X>`; a lens with no
      `agent:` is graded by `task-reviewer`.
- [ ] Given `execute-spec.js`, when inspected, then it contains no `SPECIAL_REVIEWER` or `lensToAgent`, and
      reviewer resolution goes through a pure `agentForLens(constraints, lens)`; `node --check` passes.
- [ ] Given a unit test under `scripts/sdlc/`, when run (`node --test`), then it asserts: a mapped lens
      resolves to its `agent:`, an unmapped lens resolves to `task-reviewer`, and adding an `agent:` line to a
      fixture constraint reroutes the lens with no change to `execute-spec.js`.

**B — enforced plan-review gate**

- [ ] Given `task-schema.md`, when read, then it documents the top-level `_index.yaml` `plan_review:` block
      with `status` (`approve-ready|approve-after-fixes|needs-rework`), `approved` (boolean), and `reviewed`
      (ISO date); `spec-schema.md` references it.
- [ ] Given `task-decomposition`'s plan-approval gate, when the owner approves a decomposition, then the
      skill stamps a `plan_review:` block into `_index.yaml` (`approved: false` until the owner sets it true).
- [ ] Given an `_index.yaml` with `plan_review.approved !== true` OR `status === 'needs-rework'` OR no
      `plan_review` block at all, when `execute-spec` reaches the Plan phase, then it HALTs before spawning any
      executor and emits a message naming the remediation.
- [ ] Given an `_index.yaml` with `plan_review.approved === true` and `status !== 'needs-rework'`, when
      `execute-spec` reaches the Plan phase, then it proceeds to build waves.
- [ ] Given the gate logic, when unit-tested, then a pure `planApproved(plan_review)` returns `false` for
      absent/`approved:false`/`needs-rework` inputs and `true` only for approved-and-not-needs-rework.
- [ ] Given the existing `_index.yaml` files under `specs/tasks/`, when this spec's work merges, then each
      carries a `plan_review` block (back-filled) so the gate does not retroactively block them.

**B-clarity — naming**

- [ ] Given `skill-architecture.md`, when read, then it contains a review-moments diagram/table naming plan
      review, code review, and integration review, each mapped to its trigger and owning skill/workflow.
- [ ] Given `specs/sdlc-state-machine.yaml`, when read, then the former `review` phase id is `code-review`,
      every reference to the old id is updated, the generated `## Handoff` footers reflect it, and
      `scripts/sdlc/validate-state-machine.mjs` and `gen-handoffs.mjs --check` pass.
- [ ] Given the SDLC docs, when grepped, then "plan review" denotes the pre-code gate and "code review"
      denotes the per-task PR review, with no remaining use of "spec review" for the pre-code gate.

**PR-side grounding-prefix reconciliation**

- [ ] Given SPEC-001, when this work lands, then it has been amended via `spec-amendment` (version bumped +
      Changelog entry) so `review-primitives.md` carries the agreed canonical **PR-side** prefix table; SPEC-006
      declares `depends_on: [SPEC-001, SPEC-002]`.
- [ ] Given the amended PR-side table, when compared against `execute-spec.js` `ALLOWED_PREFIX` and the
      `review-envelope.schema.json` `criterion`, then both agree with it — no prefix the `pr-reviewer` contract
      instructs a code reviewer to cite is rejected by the engine.
- [ ] Given a parity check under `scripts/sdlc/`, when run (`node --test`), then it parses the PR-side prefix
      set from `review-primitives.md`, `execute-spec.js` `ALLOWED_PREFIX`, and the schema `criterion`, and
      asserts the three are equal (mirroring the reviewer-routing test; no manual/doc-only verification).
- [ ] Given the `spec-reviewer` (spec-side) prefix set, when this work lands, then it is unchanged.

**ADRs**

- [ ] Given `specs/adrs/`, when read, then ADR-001 (routing-as-data) and ADR-002 (gate-in-`_index.yaml`,
      two-stage, fail-closed) exist, each `status: proposed`, `spec: SPEC-006`, with Context/Decision/
      Consequences and the rejected alternatives named.

## Risks & constraints

- **Renaming the `review` phase is a cross-cutting edit.** The phase id is referenced in the state machine,
  generated handoff footers, validators, and prose. Mitigation: drive the rename from
  `sdlc-state-machine.yaml` (the single source of truth), regenerate footers, and gate on
  `validate-state-machine.mjs` + `gen-handoffs.mjs --check`. Sequence this as its own task so its blast radius
  is isolated.
- **Prefix reconciliation changes a SPEC-001-owned contract.** Reconciling the PR-side prefixes alters a
  vocabulary SPEC-001 owns, and `review-primitives.md` mandates that change go through `spec-amendment` on
  SPEC-001 (or the extension pattern). Mitigation: SPEC-006 sequences the SPEC-001 amendment as a declared
  prerequisite (`depends_on: [SPEC-001, SPEC-002]`) and only *aligns* the engine + schema to the amended
  table — it does not redefine the vocabulary unilaterally. Risk within alignment: the engine accepts a prefix
  a skill still emits in the old form; the `scripts/sdlc/` parity check (an AC) gates against half-alignment.
  Care: keep the change strictly PR-side — the engine must not start accepting spec-side prefixes
  (`spec-schema:`, `intent:`), which it never legitimately sees.
- **Fail-closed gate could surprise an in-flight run.** Mitigation: the back-fill AC stamps every existing
  `_index.yaml`; the HALT message is explicit about the one-line remediation.
- **This spec self-hosts the harness it edits.** `execute-spec.js` is the engine; changing it risks the very
  loop that would run this spec. Mitigation: the routing and gate changes are covered by pure-function unit
  tests (`node --test`, `node --check`); per the Out-of-scope note this spec is hand-executed under review if
  needed, like any harness-touching change.
- **Dependency:** builds on the SPEC-001 review contracts (`review-primitives.md`, the envelope, the
  reviewer skills) and the SPEC-002 execution engine (`execute-spec.js`). No conflict with the active
  onboarding (INI-002) or conditional-integration (SPEC-005) work — different surface.

## Migration

### Current state

`execute-spec.js`: hardcoded `SPECIAL_REVIEWER`/`lensToAgent`; `ALLOWED_PREFIX = ['ac:', 'inv:', 'design:',
'lens:', 'task:scope', 'spec:']`; no `plan_review` reference; Plan-phase precondition is `status: active`
only. `review-constraints.yaml`: constraints carry no `agent:`. Plan review is conversational
(`spec-authoring` Step 10a / `task-decomposition` approval gate) with no durable verdict. State machine has a
`review` phase (owner `pr-reviewer`) that is really code review. The PR-side grounding prefixes diverge
between `pr-reviewer` and the engine/schema.

### Target state

Routing resolves from `review-constraints.yaml` `agent:` via `agentForLens`. `_index.yaml` carries a
`plan_review` block stamped by `task-decomposition` and owner-approved; `execute-spec` fails closed on it.
`skill-architecture.md` documents three named review moments; the state machine's code-review phase is named
`code-review`. The PR-side prefix table (amended on SPEC-001) is the source of truth that the engine
`ALLOWED_PREFIX` and the schema `criterion` align to; the spec-side set is unchanged.

### Migration strategy

Land in the dependency order the decomposition will encode: the **SPEC-001 amendment** establishing the
canonical PR-side prefix table first (it is the prerequisite the engine aligns to); then schema + registry
data (additive); then the engine resolver + gate (with unit tests); then the rename + docs; then the
engine/schema prefix alignment + its parity check; then the back-fill of existing `_index.yaml` files. Each
is independently testable; the gate and routing changes are pure-function covered before the engine starts
depending on them.

### Rollback plan

Each change is additive or localized. Rollback = revert the engine edits (restore `SPECIAL_REVIEWER` and the
old `ALLOWED_PREFIX`, drop the `planApproved` guard); the `plan_review` blocks and `agent:` fields are inert
data that a reverted engine simply ignores. The phase rename reverts by restoring the id in
`sdlc-state-machine.yaml` and regenerating.

## spec_followups

- finding_id: F-004
  source_review: "spec-reviewer iter-2, 2026-06-23"
  severity: suggestion
  criterion: "spec-schema:frontmatter"
  location: "Frontmatter > depends_on"
  finding: "depends_on is an established spec frontmatter field (SPEC-002 uses it; review-primitives.md and the spec-reviewer inputs reference it) but spec-schema.md's frontmatter field table does not document it; SPEC-006 surfaces the gap by using it."
  deferred_date: 2026-06-23
  resolved: false
  resolved_date: null
  resolved_by: null
