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

Four artifact-shape improvements exist in high-gear that strengthen the upstream framework's audit trail, gap tracking, completion rigor, and monorepo safety. Each is individually small (port-level work), but they cluster around a single theme: **making spec/task artifacts auditable end-to-end so that "AC passed" is non-repudiable and "spec complete" is verifiable**. The current upstream framework has weaker analogues for each.

The four ports:

1. **`evidence:` field on task acceptance criteria.** High-gear's task files include an `evidence:` field per AC populated by the executor with the actual proof (test output, dbt run output, diff analysis). Upstream task schema has no such field. The result is "AC passed" claims that can't be audited later.
2. **Spec gap capture pattern.** High-gear has `SPEC-029-SUPERVISION.md` and `hot-fix GAP-008`-style commits, indicating a convention for tracking gaps discovered mid-execution that are distinct from full `spec-amendment` work. Upstream has no formalized "gap" artifact — every mid-flight discovery becomes either an amendment or is silently absorbed.
3. **Strengthen `spec-completion` skill.** Skill exists upstream and was used to close SPEC-001 and SPEC-002, but high-gear's version is more rigorous in its verification-type taxonomy (task-covered, integration, measurement, manual) and its deferred-verification tracking (owner, deadline, dashboard). The upstream version is closer to the high-gear version after the recent updates but the verification types and deferred-tracking discipline are not fully ported.
4. **Workspace enforcement in `sdlc-code-review` and `spec-execution`.** The `workspaces` / `verify_workspaces` task fields exist in upstream task schema, but the upstream `sdlc-code-review` skill treats them as advisory ("if set, check"). In high-gear, they are enforced — a PR that breaks a workspace not in `verify_workspaces` is a finding. The new `spec-execution` skill (TASK-009) inherits whatever rigor `sdlc-code-review` enforces; tightening the source flows downstream.

Bundling these four into one spec avoids spec sprawl (the framework's own process notes flag this risk: "several backlog items are individually small. Consider bundling related ones into a single spec rather than one-per-item"). Each port becomes its own task in the decomposition; the spec is the coordination layer.

## Success criteria

- [ ] Every new task created under the upstream framework includes an `evidence:` field per AC; the field is populated by the implementing agent before the task PR is reviewed.
- [ ] A spec gap discovered mid-execution has a documented lightweight capture path that does not require the full `spec-amendment` ceremony when the gap is small enough.
- [ ] `spec-completion` distinguishes the four verification types (task-covered, integration, measurement, manual) and produces a deferred-verifications table with owner, trigger condition, and method for each measurement-class criterion (matching the rigor demonstrated when closing SPEC-001).
- [ ] `sdlc-code-review` and `spec-execution` enforce (not advise) the `workspaces` / `verify_workspaces` task fields: a PR that touches files outside the declared `workspace` is a finding; a PR that fails tests in any `verify_workspaces` is a finding.
- [ ] The first task created under the updated framework after this spec ships has a populated `evidence:` field on every AC, verifiable by inspection.

## Scope

### In scope

- **Evidence field.** Amend `task-schema.md` to declare `evidence:` per AC (optional at task creation, required-to-populate before review). Update `templates/task.md` to show the field. Update `sdlc-code-review/SKILL.md` to check the field is populated. Update `task-decomposition/SKILL.md` to mention the field in task creation guidance.
- **Spec gap capture.** Decide convention (recommendation in Design: `specs/gaps/GAP-NNN-*.md` as a new artifact type, lighter than amendment). Update `spec-schema.md` to declare the directory. Document when to use gap-capture vs `spec-amendment` (heuristic: gap-capture for "small mid-flight clarification or workaround"; amendment for "scope/AC/design change"). Update `spec-execution/SKILL.md` cross-skill signal handling to optionally dispatch gap-capture instead of full amendment for sub-class signals.
- **Strengthen spec-completion.** Port high-gear's verification-type taxonomy into the upstream skill (the recent upstream version is close but not identical). Formalize the deferred-verifications-table shape. Add a check that every deferred criterion has owner + trigger + method.
- **Workspace enforcement.** Update `sdlc-code-review/SKILL.md` to convert "if set, check" language to "if set, enforce — violation is a finding." Update `spec-execution/SKILL.md` Tier 0 description by reference (since Tier 0 lives in SPEC-001) to ensure workspace verification is checked.

### Out of scope

- `DESIGN.md` and `figma_frame:` task fields — captured in intents.md as a deferred port; only relevant for consumers with a design surface.
- Tooling to auto-populate `evidence:` (e.g., a hook that grabs test output) — manual population only for now.
- Migration of existing tasks (SPEC-001/002 tasks) to add `evidence:` retroactively — forward-only.
- Migration of existing gaps to `specs/gaps/` — the convention applies forward.
- High-gear consumes the new conventions on its next spec; this spec does not migrate high-gear's in-flight work.

## Design

### 1. `evidence:` field on AC

The task frontmatter's `acceptance_criteria:` list gains a per-entry `evidence:` field:

```yaml
acceptance_criteria:
  - id: AC-001
    description: "Given X, when Y, then Z"
    status: pass | fail | pending
    evidence: |
      (Optional at creation; required to populate before PR review.)
      The implementing agent populates this with concrete proof. Example
      for a dbt task: paste the relevant `dbt run` output. For a code task:
      paste the test command output with the relevant rows. For a manual
      verification: describe what was checked and how.
```

Rules:
- `evidence:` is **optional at task creation** (the decomposing agent doesn't know the proof yet).
- `evidence:` is **required to be populated before the PR is marked ready for review** (the implementing agent must include it).
- `sdlc-code-review` checks that every AC has a non-empty `evidence:` field. Missing evidence is a major finding (not a blocker — it can be added in the same review cycle).

### 2. Spec gap capture pattern

A new artifact type: **`specs/gaps/GAP-NNN-*.md`**. Lighter than `spec-amendment`. Used for mid-flight discoveries that clarify or work around a small spec ambiguity without changing scope, AC, or design.

```yaml
---
id: GAP-NNN
spec: SPEC-NNN
title: "<one-line gap description>"
created: YYYY-MM-DD
discovered_in: TASK-NNN (or PR #NNN, or "spec review")
resolution: clarification | workaround | deferred
---

## Gap

(What was unclear, missing, or wrong.)

## Resolution

(How the gap was handled. If `clarification`: a paragraph that should be back-ported to the spec or a future amendment. If `workaround`: what was done and why it's acceptable. If `deferred`: capture as an intent for later.)

## Impact

(What downstream tasks or specs are affected, if any.)
```

**When to use gap-capture vs spec-amendment:**
- Gap-capture: small, doesn't change scope/AC/design, can be resolved in-flight without re-decomposing.
- Spec-amendment: changes scope, AC, design, or invalidates planned tasks.

Cross-skill signal extension: `pr-reviewer` and `spec-reviewer` can raise `criterion: "spec:gap"` (in addition to the existing `spec:*` prefixes) to indicate a gap-class finding. The orchestrator's cross-skill handler routes `spec:gap` to gap-capture (lightweight) and other `spec:*` to spec-amendment (full). SPEC-001 grounding rules add `spec:gap` to the allowed citation prefixes.

### 3. Strengthen `spec-completion`

Port the four verification types explicitly (matching the closeout reports done for SPEC-001 and SPEC-002):

| Type | Description | Example |
|---|---|---|
| `task-covered` | Criterion satisfied by one or more passing task AC | "Skill X exists" → TASK-N AC-M passes |
| `integration` | Criterion requires multiple tasks working together | "End-to-end PR review works" → multiple skills wired |
| `measurement` | Criterion requires measuring the running system | "≥80% inter-reviewer agreement" → run-twice protocol |
| `manual` | Criterion requires human judgment | "Migration plan is sensible" → owner reviews |

Add to skill: every measurement-class criterion that is deferred must have:
- Owner (who checks)
- Trigger (when to check — calendar date OR observable condition)
- Method (the procedure to follow)

Add to skill: completion report template (the one used informally when closing SPEC-001 and SPEC-002 — formalize it).

### 4. Workspace enforcement

Two text changes:

**`sdlc-code-review/SKILL.md`:** the existing monorepo scope check section converts "if set" advisory language to "if set, enforce — violation is a finding (blocker if breaks downstream, major otherwise)." Add explicit grounded citations: `criterion: "monorepo:workspaces"` for declared-but-unscoped, `criterion: "monorepo:verify_workspaces"` for missing-consumer-coverage.

**`spec-execution/SKILL.md`:** AC-003 says Tier 0 contents are inherited from SPEC-001. The enforcement update lives in SPEC-001's Tier 0 description (PR-side mechanical gates) — add "PR touches only files in declared `workspace`" as an explicit Tier 0 check. Since SPEC-001 owns Tier 0, this is technically a SPEC-001 amendment delivered through this spec's decomposition.

## Acceptance criteria

- [ ] AC-001 — `task-schema.md` declares `evidence:` as a per-AC field with the semantics in Design > 1: optional at creation, required-to-populate before review. The frontmatter table shows `evidence: <multiline string>` with rules.
- [ ] AC-002 — `templates/task.md` shows an `evidence:` field on at least one AC example.
- [ ] AC-003 — `sdlc-code-review/SKILL.md` adds a step that checks every AC has a non-empty `evidence:` field. Missing evidence raises a `criterion: "task:evidence-missing"` major finding. The criterion prefix is added to the pr-reviewer allowed citation prefixes in `review-primitives.md`.
- [ ] AC-004 — `task-decomposition/SKILL.md` includes a sentence in the task-file creation step that the `evidence:` field is created empty (or omitted) and is the implementing agent's responsibility to populate before review.
- [ ] AC-005 — `specs/gaps/` is declared as a new top-level subdirectory under `specs/` in `spec-schema.md` Directory layout. `GAP-NNN-*.md` files have the frontmatter shape shown in Design > 2.
- [ ] AC-006 — `spec-amendment/SKILL.md` includes a decision section: "is this a gap or an amendment?" with the heuristic from Design > 2. Gap-class flows are pointed at gap-capture; amendment-class flows continue through `spec-amendment`.
- [ ] AC-007 — `review-primitives.md` adds `spec:gap` to the pr-reviewer and spec-reviewer allowed citation prefixes.
- [ ] AC-008 — `spec-execution/SKILL.md` cross-skill signal handler routes `criterion == "spec:gap"` blocker findings to gap-capture (lightweight, no per-spec amendment counter increment) and other `spec:*` blockers to `spec-amendment` (as today).
- [ ] AC-009 — `spec-completion/SKILL.md` documents the four verification types explicitly. The completion-report template shows a Deferred Verifications table with columns: criterion, owner, trigger, method. The skill checks that every measurement-type deferred criterion has all three.
- [ ] AC-010 — `sdlc-code-review/SKILL.md` workspace-scope check uses "enforce" not "if set". A PR that touches files outside the declared `workspace` raises a `criterion: "monorepo:workspaces"` blocker. A PR that fails tests in any `verify_workspaces` raises a `criterion: "monorepo:verify_workspaces"` blocker.
- [ ] AC-011 — SPEC-001's Tier 0 description (PR-side mechanical gates) gains a "PR touches only files in declared workspace" check. This is a SPEC-001 amendment delivered as one task in this spec.
- [ ] AC-012 — The first task created under the updated framework after this spec ships has a populated `evidence:` field on every AC at PR review time. Verified by inspection of the first such PR after spec is `completed`.

## Risks & constraints

- **Evidence-field discipline depends on agent compliance.** If implementing agents skip populating `evidence:`, the field is dead weight. Mitigation: AC-003 makes missing evidence a `major` finding caught by `pr-reviewer`; the routing policy blocks merge.
- **Spec gap pattern adds a new artifact type.** More artifact types = more cognitive load for new adopters. Mitigation: documented as the *lighter* path with a clear heuristic; gap-capture is shorter than spec-amendment and intentionally so.
- **Workspace enforcement may break PRs that worked under advisory rules.** Mitigation: enforcement applies to *new* PRs after this spec ships; existing PRs in flight grandfather under advisory rules until merged.
- **SPEC-001 amendment for Tier 0** (AC-011) crosses spec boundaries — this spec touches SPEC-001's contract. Mitigation: explicit task in decomposition; SPEC-001 amendment goes through `spec-amendment` skill with its own version bump.
- **`spec:gap` citation prefix** adds a new value to the SPEC-001 grounding rules. SPEC-001's grounding-rules table is the source of truth; this spec amends it. Same cross-spec issue as AC-011.
- **Bundle size.** Four ports + cross-spec amendments = ~10-12 tasks in decomposition. Acceptable but at the upper end of the framework's per-spec tolerance.

## Migration

### Current state

- Task schema has no `evidence:` field; `templates/task.md` doesn't show it.
- No `specs/gaps/` artifact type; mid-flight gaps go through full `spec-amendment` or are silently absorbed.
- `spec-completion` exists but doesn't formalize the four verification types or deferred-verification structure (used informally when closing SPEC-001/002).
- `sdlc-code-review` treats `workspaces` / `verify_workspaces` as advisory.

### Target state

- All four ports landed.
- The framework is incrementally stronger for the next real spec.

### Migration strategy

1. Land the schema/template changes first (AC-001, AC-002, AC-005, AC-006) — no runtime impact, enables downstream.
2. Land the skill updates (AC-003, AC-004, AC-007, AC-008, AC-009, AC-010) — affects review behavior on new PRs.
3. Land the SPEC-001 amendment (AC-011) via `spec-amendment` skill — version-bumps SPEC-001 to v2.
4. Verify on the first new task after the spec ships (AC-012).

### Rollback plan

- Each port is independently revertable — they're separate files mostly.
- The `evidence:` field is additive (existing tasks without it still validate).
- `specs/gaps/` directory is additive.
- Workspace enforcement is the only behavior change that could break new PRs; mitigation is the grandfathering note above.
- SPEC-001 amendment is revertable via `spec-amendment` v3 (rolling back the v2 change). Not zero-cost, but possible.
