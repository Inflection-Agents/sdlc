---
id: SPEC-004
title: Artifact completeness ports from high-gear
status: draft
version: 1
supersedes:
initiative: INI-003
owner: franklin
created: 2026-05-18
updated: 2026-05-18
tags: [evidence, gap-capture, spec-completion, workspace-enforcement, port-back]
linear_project:
---

## Problem

Four artifact-shape improvements exist in high-gear that strengthen the upstream framework's audit trail, gap tracking, completion rigor, and monorepo safety. Each is individually small (port-level work), but they cluster around a single theme: **making spec/task artifacts auditable end-to-end so that "AC passed" is non-repudiable and "spec complete" is verifiable**.

The four ports:

1. **`evidence:` field on task acceptance criteria** — high-gear task files include per-AC proof (test output, dbt run output, diff analysis). Upstream task schema has no such field.
2. **Spec gap capture pattern** — high-gear has a lightweight `GAP-NNN`-style convention for mid-flight discoveries that don't warrant full `spec-amendment`. Upstream has no formalized "gap" artifact.
3. **Strengthen `spec-completion` skill** — high-gear's version formalizes the verification-type taxonomy (task-covered, integration, measurement, manual) and the deferred-verifications table (owner, trigger, method). The upstream version is close but informal.
4. **Workspace enforcement in `sdlc-code-review`** — `workspaces` / `verify_workspaces` task fields exist in upstream schema but `sdlc-code-review` treats them as advisory; high-gear enforces them.

Bundling these four into one spec avoids spec sprawl. Each port becomes its own task; the spec is the coordination layer.

### Reframing in iter-2: extending completed specs without amending them

Iter-1 review surfaced that this spec's original framing — "amend SPEC-001 to v2" — violates `spec-schema.md`, which declares the transitions `draft → active → completed/superseded/deprecated` with no `completed → active` step. SPEC-001 is `status: completed`. Per the framework, **completed specs are immutable historical records**. Subsequent specs (like this one) **extend** the live artifacts (`review-primitives.md`, `sdlc-code-review/SKILL.md`, `spec-execution/SKILL.md`) and add Changelog annotations to the affected completed specs — a small annotation pointer, not a version bump or status change.

This spec adopts that pattern explicitly. SPEC-001 and SPEC-002 stay `status: completed v1`; each gets a Changelog entry pointing at SPEC-004 for the extensions made here.

## Success criteria

- [ ] Every task created under the upstream framework after this spec ships includes an `evidence:` field per AC; the field is populated by the implementing agent before the task PR enters review.
- [ ] A spec gap discovered mid-execution has a documented lightweight capture path (`GAP-NNN-*.md` artifact + `criterion: "spec:gap"` finding routing) distinct from full `spec-amendment`.
- [ ] `spec-completion` formally distinguishes the four verification types and produces a deferred-verifications table with owner, trigger condition, and method for each measurement-class criterion.
- [ ] `sdlc-code-review` enforces (not advises) the `workspaces` / `verify_workspaces` task fields: PR touches outside declared `workspace` → blocker; PR fails tests in any `verify_workspaces` → blocker.
- [ ] The first task created under the updated framework after this spec ships has a populated `evidence:` field on every AC at PR review time, verifiable by inspection.

## Scope

### In scope

- **Evidence field.** Amend `task-schema.md` to declare `evidence:` per AC. Update `templates/task.md`. Add `task:evidence-missing` to the live `review-primitives.md` allowed citation prefixes for `pr-reviewer` (additive extension). Update `sdlc-code-review/SKILL.md` to grade missing evidence as a Tier 1 major. Update SPEC-001's Tier 0 description in `review-primitives.md` to add "every AC has `evidence:` populated" as a mechanical CI check — this is a presence check, distinct from Tier 1's quality check. Update `task-decomposition/SKILL.md` task-creation guidance.
- **Spec gap capture.** Create `templates/gap.md`. Declare `specs/gaps/` directory in `spec-schema.md`. Document gap-vs-amendment heuristic with bright-line rule. Update `spec-amendment/SKILL.md` with a "gap or amendment?" decision section. Add `spec:gap` to live `review-primitives.md` allowed citation prefixes for both `pr-reviewer` and `spec-reviewer` (additive extension). Update `spec-execution/SKILL.md` cross-skill signal handler to route `spec:gap` to a new gap-capture flow without incrementing the per-spec amendment counter, with its own per-spec rate-limit.
- **Strengthen spec-completion.** Update `spec-completion/SKILL.md`: formalize verification-type column rename (`Deadline` → `Trigger`, `How to check` → `Method`); add the rigor requirement that every measurement-class deferred criterion must have all three; render a `templates/completion-report.md` template the skill produces.
- **Workspace enforcement.** Update `sdlc-code-review/SKILL.md`: convert advisory language to enforcement with concrete grounded findings (new citation prefixes `monorepo:workspace-scope` and `monorepo:verify-coverage` — distinct names because the existing `monorepo:workspaces` prefix is already scoped to `spec-reviewer` per the live grounding rules; these new prefixes are pr-reviewer-scoped and additive to the live `review-primitives.md`).
- **Changelog annotations on completed specs.** Add a Changelog section to SPEC-001 and SPEC-002 (the only modification permitted to completed specs) noting the extensions made by SPEC-004 and pointing at this spec. These are 5-line additions, not version bumps.
- **`templates/gap.md`** for the GAP artifact frontmatter shape.

### Out of scope

- `DESIGN.md` and `figma_frame:` task fields — captured in intents.md; only relevant for consumers with a design surface.
- Tooling to auto-populate `evidence:` (manual only).
- Retroactive `evidence:` on existing tasks — forward only.
- Retroactive migration of existing gaps to `specs/gaps/` — convention applies forward.
- Formal spec-schema transition `completed → amendable` — the "extend without amending" pattern this spec adopts is the alternative; a future spec may formalize a schema transition if needed.

## Design

### 1. `evidence:` field on AC

Task frontmatter's `acceptance_criteria:` list gains a per-entry `evidence:` field:

```yaml
acceptance_criteria:
  - id: AC-001
    description: "Given X, when Y, then Z"
    status: pass | fail | pending
    evidence: |
      The implementing agent populates this with concrete proof. Examples:
      dbt task → paste relevant `dbt run` output; code task → paste test
      command output with relevant rows; manual verification → describe what
      was checked and how.
```

**Two-layer enforcement:**

- **Tier 0 (CI, mechanical):** every AC has a non-empty `evidence:` field. This is a presence check — purely structural. Missing field exits CI red; no LLM reviewer dispatched until populated. Updated in `review-primitives.md` Tier 0 description (additive to the existing Tier 0 list of mechanical gates).
- **Tier 1 (`pr-reviewer`, content quality):** the populated evidence is reviewed for whether it actually demonstrates the AC. Insufficient evidence (e.g., "tests passed" with no output) raises a `criterion: "task:evidence-missing"` major finding. This is a quality check, not presence.

The two-layer split resolves the iter-1 ambiguity (one place gates structural; the other grades semantic).

### 2. Spec gap capture pattern

A new artifact type: **`specs/gaps/GAP-NNN-*.md`**.

**GAP frontmatter (tighter than iter-1):**

```yaml
---
id: GAP-NNN
spec: SPEC-NNN
title: "<one-line gap description>"
status: open | resolved | wontfix
owner: <github-handle>
created: YYYY-MM-DD
discovered_in: TASK-NNN | PR-NNN | review:<spec-reviewer-run-id>   # typed union
resolution: clarification | workaround | deferred                  # the chosen handling
resolved_date: YYYY-MM-DD | null
resolved_by: <commit-SHA | TASK-NNN> | null
back_ported_to: SPEC-NNN-vN | null   # for resolution: clarification, the spec amendment that absorbed it
---
```

**Body sections:** `## Gap`, `## Resolution`, `## Impact`.

**Gap-vs-amendment bright-line rule (enumerated, not heuristic):**

| Change type | Path |
|---|---|
| Word-level AC clarification preserving semantics (e.g., wording tighten without changing what passes/fails) | gap-capture |
| Design-section workaround that does not affect any AC's pass/fail | gap-capture |
| Cross-link to an ADR that should have been cited but wasn't (no design change) | gap-capture |
| Any change that would bump the spec version (per `spec-schema.md` version rules) | **spec-amendment** |
| Any change to In/Out scope, AC pass/fail conditions, or design semantics | **spec-amendment** |

**Back-port mechanism for `resolution: clarification`:** when a clarification gap closes, the resolver either (a) raises a follow-up cosmetic amendment on the parent spec (sets `back_ported_to`) or (b) leaves `back_ported_to: null` with a `wontfix` resolution and a note on why. `spec-amendment/SKILL.md` gains a step: "on any amendment, scan open `clarification` gaps for the parent spec and incorporate them; set their `back_ported_to: SPEC-NNN-v<new-version>` and `status: resolved`."

**Cross-skill signal routing:** `criterion: "spec:gap"` is added to `pr-reviewer` and `spec-reviewer` allowed citation prefixes in the live `review-primitives.md`. `spec-execution/SKILL.md` Phase 2 cross-skill handler routes `criterion == "spec:gap"` blockers to gap-capture (creates a `GAP-NNN-*.md` from `templates/gap.md`, does NOT increment the per-spec amendment counter, does NOT escalate). Per-spec gap rate-limit: **max 5 open gaps per spec at any time**; exceeding this escalates as `spec:unstable` blocker that DOES go through the amendment counter (so an unbounded gap series can't loop indefinitely).

**GAP indexing and validation:** GAPs participate in `spec-index.json` under a new `gaps:` array per spec entry (or a sibling `gap-index.json` — choice deferred to implementation; either works as long as one is chosen). CI validates GAP frontmatter against `templates/gap.md` shape.

### 3. Strengthen `spec-completion`

The current `spec-completion/SKILL.md` already documents the four verification types (Step 2) and a deferred-verifications table (columns: Criterion, Owner, Deadline, How to check). This spec's delta is precision, not addition:

**Column rename for consistency with this framework's vocabulary:** `Deadline` → `Trigger` (a trigger can be a date OR an observable condition like "after next high-gear spec executes"), `How to check` → `Method`.

**Rigor requirement (new):** every measurement-class deferred criterion must have all three fields populated. The skill emits a completion-blocking failure if any measurement-class criterion is missing owner, trigger, or method. This was implicitly enforced when closing SPEC-001/SPEC-002 but is now codified.

**`templates/completion-report.md` (new):**

```markdown
## Completion report: SPEC-NNN v<version>

### Task summary
- Total: N | Done: N | Cancelled: N (reasons)

### Success criteria

| # | Criterion | Type | Evidence | Status |
|---|---|---|---|---|

### Deferred verifications

| Criterion | Owner | Trigger | Method |
|---|---|---|---|

### Verdict: [Ready to complete / Blocked / Needs discussion]
```

### 4. Workspace enforcement in `sdlc-code-review`

Two new citation prefixes (pr-reviewer-scoped, added to live `review-primitives.md`):

- `monorepo:workspace-scope` — PR touches files outside the declared `workspace`. **Severity:** blocker. Replaces advisory language in `sdlc-code-review/SKILL.md`.
- `monorepo:verify-coverage` — PR fails tests in any workspace listed in `verify_workspaces`. **Severity:** blocker.

These are distinct names because `monorepo:workspaces` (singular existing prefix) is already scoped to `spec-reviewer` in the live grounding rules — reusing it would create role-mismatch (per iter-1 F-002 on the original draft).

Severity for each consequence is specified **here in the AC**, not duplicated in the Design or skill prose, so there is a single source of truth (lesson from SPEC-001/002 review loop).

### 5. Changelog annotations on completed specs

SPEC-001 and SPEC-002 each gain a `## Changelog` section appended to their body (per `spec-schema.md`'s declared `## Changelog (added on first amendment)` section). The entry is not a version bump — it's a forward-pointer:

```markdown
## Changelog

### v1 (2026-05-18) — initial
- Initial spec, completed 2026-05-18.

### v1.1 (2026-05-XX) — extensions via SPEC-004
- SPEC-004 added the following without modifying this spec's contracts:
  - `task:evidence-missing`, `spec:gap`, `monorepo:workspace-scope`, `monorepo:verify-coverage` to allowed citation prefixes in `review-primitives.md`
  - `evidence:` presence check to Tier 0 mechanical gates
- See SPEC-004 for the rationale and full design.
```

This is a Changelog *annotation*, not a version bump (the spec's behavior under v1 is unchanged; v1.1 just records that the contract was extended elsewhere). Allowed under `spec-schema.md`'s Changelog section even for completed specs.

## Acceptance criteria

- [ ] AC-001 — `task-schema.md` declares `evidence:` as a per-AC field. Semantics in Design > 1: optional at creation; presence required at Tier 0 (CI fails closed if any AC has empty/missing `evidence:`); content quality graded at Tier 1.
- [ ] AC-002 — `templates/task.md` shows the `evidence:` field on at least one AC example with realistic content.
- [ ] AC-003 — `.ai/skills/review-primitives.md` Tier 0 list (in the PR-side section) gains "every AC has a non-empty `evidence:` field" as a mechanical gate. The check is presence-only (a populated string of any content); content quality is the Tier 1 reviewer's job. Verified by inspection.
- [ ] AC-004 — `.ai/skills/review-primitives.md` allowed citation prefixes for `pr-reviewer` (Tier 1) gain: `task:evidence-missing`, `spec:gap`, `monorepo:workspace-scope`, `monorepo:verify-coverage`. The grounding-rules table is the authoritative location for these prefixes; they are added as **extensions** to a completed SPEC-001 (no SPEC-001 version bump, only a Changelog annotation per AC-013).
- [ ] AC-005 — `.ai/skills/review-primitives.md` allowed citation prefixes for `spec-reviewer` gain `spec:gap` (same prefix, available to both reviewer roles per the extension).
- [ ] AC-006 — `.ai/skills/sdlc-code-review/SKILL.md` is updated: workspace-scope and verify-coverage checks use the new prefixes; severity is **blocker** for both (assigned here in this AC, not duplicated in the skill body); `task:evidence-missing` is graded as **major** for insufficient content. A grep for "if set, check" advisory language in the skill returns 0 matches in the workspace-scope sections.
- [ ] AC-007 — `.ai/skills/task-decomposition/SKILL.md` task-creation step notes that `evidence:` is created empty/omitted by the decomposer and is the implementing agent's responsibility to populate before PR review.
- [ ] AC-008 — `spec-schema.md` Directory layout adds `specs/gaps/`. The schema describes the GAP frontmatter shape per Design > 2 (all 9 fields with types). CI validation for GAP frontmatter is added (a Bash check or pre-existing spec-validator extension; details deferred to the implementing task).
- [ ] AC-009 — `templates/gap.md` exists with the frontmatter and body sections per Design > 2.
- [ ] AC-010 — `.ai/skills/spec-amendment/SKILL.md` gains a "gap or amendment?" decision section using the enumerated rule table from Design > 2 (not a heuristic). The skill also gains a step: "on any amendment, scan open clarification gaps for the parent spec; incorporate them; set their `back_ported_to: SPEC-NNN-v<new-version>` and `status: resolved`."
- [ ] AC-011 — `.ai/skills/spec-execution/SKILL.md` Phase 2 cross-skill signal handler is extended: `criterion == "spec:gap"` blocker routes to gap-capture (creates GAP-NNN file, does NOT increment per-spec amendment counter). Per-spec rate-limit: max 5 open gaps per spec; exceeding escalates as `spec:unstable` blocker that DOES go through the amendment counter. Extension is documented in `spec-execution/SKILL.md` and a Changelog annotation is added to SPEC-002 per AC-013.
- [ ] AC-012 — `.ai/skills/spec-completion/SKILL.md` is updated: column rename (`Deadline` → `Trigger`, `How to check` → `Method`); rigor requirement that every measurement-class deferred criterion has all three fields populated (skill emits a blocking failure otherwise); `templates/completion-report.md` exists with the structure shown in Design > 3 and the skill produces it.
- [ ] AC-013 — SPEC-001 and SPEC-002 each gain a `## Changelog` section per Design > 5: a v1.1 entry pointing at SPEC-004 enumerates the extensions made (no version bump; `status: completed` unchanged; contracts under v1 unmodified). Verified by inspection.
- [ ] AC-014 — The first task created under the updated framework after this spec ships has a populated `evidence:` field on every AC at PR review time (presence verified by Tier 0; content graded by Tier 1). Verified by inspection of the first such PR after spec is `completed`.

## Risks & constraints

- **Evidence-field discipline relies on Tier 0 enforcement.** If Tier 0 CI is bypassed or misconfigured, the field becomes optional in practice. Mitigation: AC-003 makes the check mechanical (no LLM judgment); skipping it requires explicit CI workflow modification.
- **Gap-capture without amendment counter could loop.** A reviewer raising `spec:gap` repeatedly on the same spec would create unbounded gaps with no escalation under amendment-counter rules. Mitigation: per-spec rate-limit of 5 open gaps (AC-011); exceeding escalates as `spec:unstable` blocker through the amendment counter.
- **GAP frontmatter lifecycle (status, resolved_date, etc.) requires consistent updates.** A GAP marked `status: open` but actually resolved is misleading. Mitigation: `spec-amendment` Skill's new step (AC-010) automatically resolves clarification gaps it incorporates; non-clarification gaps need owner discipline.
- **Workspace enforcement may break PRs that worked under advisory rules.** Mitigation: enforcement applies to *new* PRs after this spec ships; existing in-flight PRs grandfather under advisory rules until merged.
- **Tier 0 evidence-presence vs Tier 1 evidence-quality two-layer design** adds complexity. Mitigation: clearly separated in AC-003 and AC-001; presence check is structural (single string non-empty test), quality is reviewer judgment. The split matches what mature CI systems already do (lint passes structurally; review judges semantically).
- **"Extending completed specs" pattern is new.** This spec introduces the convention without formalizing it in spec-schema. Mitigation: the Changelog-annotation pattern (AC-013) is the documented convention; formalization is captured in intents.md for a future spec.
- **Bundle size (14 ACs, ~10-12 tasks).** Acceptable but at the upper end of per-spec tolerance. The bundle is cohesive — all four ports cluster around the "auditable end-to-end" theme — but if decomposition reveals the bundle is unwieldy, splitting via `task-decomposition` re-plan mode is acceptable.
- **No per-spec audit-log artifact unifying evidence, gaps, deferred verifications, and workspace-coverage decisions.** Captured as a deferred intent (per iter-1 F-017 suggestion) for a future spec.

## Migration

### Current state

- Task schema: no `evidence:` field. `templates/task.md` doesn't show it.
- No `specs/gaps/` directory; no GAP artifact type. Mid-flight gaps go through full `spec-amendment` or are silently absorbed.
- `spec-completion/SKILL.md` documents 4 verification types and deferred table with columns (Criterion, Owner, Deadline, How to check). No `templates/completion-report.md`.
- `sdlc-code-review/SKILL.md` treats workspace fields as advisory ("if set, check").
- Live `review-primitives.md` has 10 pr-reviewer allowed citation prefixes and 6 spec-reviewer prefixes (per the file content from TASK-002 merge).
- SPEC-001 and SPEC-002 are `status: completed`, no Changelog section.

### Target state

- All four ports landed.
- SPEC-001 and SPEC-002 each have a `## Changelog` section with a v1.1 annotation pointing at SPEC-004. No version bump, no status change.
- Live `review-primitives.md` has the 4 new pr-reviewer prefixes and 1 new spec-reviewer prefix.

### Migration strategy

1. **Schema/template additions first** (zero-runtime-impact, additive): `task-schema.md` (`evidence:` field), `templates/task.md` (example), `spec-schema.md` (`specs/gaps/`), `templates/gap.md`, `templates/completion-report.md`. Land as one bundled commit/PR.
2. **Live `review-primitives.md` extension** (additive): add the 5 new citation prefixes and the Tier 0 evidence-presence check. This is the most important runtime change because reviewers consume it.
3. **Skill updates** (consume the new prefixes): `sdlc-code-review` (workspace enforcement + evidence content quality), `spec-amendment` (gap-or-amendment decision + back-port step), `spec-execution` (cross-skill signal handler extension + rate-limit), `spec-completion` (rename + rigor + template), `task-decomposition` (evidence field guidance).
4. **Changelog annotations** on SPEC-001 and SPEC-002 (last, since they reference the live changes that just landed).
5. **Verify on first new task** (AC-014).

### Rollback plan

- Each port is independently revertable.
- The `evidence:` field is additive (existing tasks without it still validate; only newly-created tasks under the updated decomposer get it).
- `specs/gaps/` directory is additive; reverting removes the directory and the validation step.
- Workspace enforcement is the only behavior change that could break new PRs; mitigation is the grandfathering note above.
- Changelog annotations on SPEC-001/SPEC-002 are revertable text deletions — no contract impact.
- New citation prefixes are additive to `review-primitives.md`; reverting removes them and any reviewer that emitted them will fail schema validation (orchestrator escalates per existing rules).
