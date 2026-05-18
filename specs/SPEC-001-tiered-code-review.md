---
id: SPEC-001
title: Graded review for specs and PRs
status: active
version: 1
supersedes:
initiative: INI-001
owner: franklin
created: 2026-05-18
updated: 2026-05-18
tags: [review, throughput, pr-reviewer, spec-reviewer, orchestration]
linear_project:
---

## Problem

Review under the SDLC framework currently runs at uniform depth for two different artifacts — the spec and the PR — and emits a binary verdict in both cases. This has two consequences that have started to dominate the developer loop on larger specs (SPEC-042 in high-gear: 23 tasks across 11 waves):

1. **PR review: wall-clock and decision cost.** A 4-reviewer parallel model reads the full diff regardless of size, scope, or risk, and `pr-reviewer` emits `approved | needs_fix`. Style nits and architectural blockers receive identical routing. There is no severity gradient, so the orchestrator cannot batch low-priority findings into follow-up grooming or auto-merge despite minor notes.
2. **Spec review: no codified loop, gaps leak downstream.** Owners apply a rigorous code-review-style pass to specs manually, and it has been *critical* — it catches contradictions, untestable acceptance criteria, and workspace-coverage gaps before tasks decompose. But that pass lives in the owner's head; it is not a skill, not a contract, and its findings are not graded. The visible symptom downstream is hot-fix amendment commits (`SPEC-042: hot-fix GAP-008`, `hot-fix GAP-011`) — gaps that *could* have been caught at spec-review time but weren't, surfacing as PRs that have to be undone or amended mid-wave.

The two problems share a primitive: a graded review with grounded findings. Solving them together is cheaper than solving them sequentially because the severity spine, the grounding rules, the JSON output contract, and the carry-forward semantics are shared. The artifact-specific parts (what counts as a blocker for a spec vs. a PR; what gets cited as the source of a finding) are small deltas on top of that shared core.

## Success criteria

- [ ] A shared severity spine (`blocker | major | nit | suggestion`) plus two artifact-specific catalogs (PR-side, spec-side) are defined such that two reviewers configured differently (different prompts or different models) grading the same artifact agree on severity for ≥80% of findings on a measured trial (see AC-010 for the precise protocol).
- [ ] Two skills exist — `pr-reviewer` and `spec-reviewer` — both producing the shared JSON output schema and both consuming the same `previous_output` carry-forward contract.
- [ ] An orchestrator policy maps `(severity, count)` tuples to one of: `fix_loop | batch_followup_and_accept | accept | escalate`. The policy is invocable from `spec-execution` (PR side) and from `spec-authoring` (spec side) without ambiguity.
- [ ] PR review: the always-on 4-reviewer fan-out is replaced by a tiered router (Tier 0 mechanical, Tier 1 always, Tier 2 file-glob-dispatched specialists). At least one specialist (cross-spec / boundary) is dispatched by rule.
- [ ] Spec review: `spec-reviewer` runs automatically at the end of `spec-authoring` Phase 2 (and after every `spec-amendment`), emits graded findings, and presents them to the owner before the sign-off gate.
- [ ] On the next active spec in high-gear, **two** metrics improve vs. a baseline captured from SPEC-042 (see AC-011): (a) mean fix-loop iterations per PR; (b) count of hot-fix amendment commits per spec. The amendment-count metric is the spec-review payoff signal.
- [ ] No regression in real defect catch rate: post-merge defect rate per merged PR over the next two completed specs stays ≤ current baseline.

## Scope

### In scope

- New skill `pr-reviewer` in upstream sdlc, ported from high-gear and extended with severity grading.
- New skill `spec-reviewer` in upstream sdlc — graded review of spec drafts and amendments.
- Update to `sdlc-code-review` skill: consume severity from `pr-reviewer` output and render graded review comments. Old binary-verdict language removed.
- Update to `spec-authoring` and `spec-amendment` skills: invoke `spec-reviewer` before the user sign-off gate; surface graded findings to the owner.
- Shared severity spine, grounding rules, JSON output schema, and `previous_output` carry-forward contract documented once in a new file `.claude/skills/review-primitives.md` and referenced from both reviewer skills.
- Orchestrator severity→action policy.
- Tiered PR review router design: Tier 0 / Tier 1 / Tier 2 dispatch rules, including file-glob-to-specialist mapping. (The router itself ships with SPEC-002 / `spec-execution` port-back; this spec defines the contract and **owns** all future edits to the dispatch rules table.)
- The owner-override mechanism for spec-side findings (`spec_review_overrides:` section appended to the spec body).
- Amendment to `spec-schema.md` declaring the two new optional in-spec sections introduced here (`spec_review_overrides`, `spec_followups`) and the new top-level subdirectory `specs/baselines/`.

### Out of scope

- **Spec rehearsal** — an agent that dry-runs the implementation against a draft spec. Tracked separately in `intents.md`.
- Agent Teams adoption for review fan-out. Tracked separately.
- Domain-specialist skill content (`dbt-craftsman`, etc.). This spec only governs *when* they are dispatched.
- Post-merge defect telemetry tooling. Success criteria can be measured manually for the first two specs.

## Design

### Shared primitives (apply to both reviewers)

These primitives live in `.claude/skills/review-primitives.md` on implementation; both `pr-reviewer` and `spec-reviewer` reference that file. The content below is the authoritative contract — Appendix C does not redefine severities, only lists the gap categories the spec-reviewer must actively check.

#### Severity spine

A finding's severity is determined by **what blocks if it stays unaddressed**, not by perceived importance. The spine is artifact-agnostic; consequence catalogs below are artifact-specific.

| Severity | Spine definition |
|---|---|
| `blocker` | The artifact cannot be used in its current state. |
| `major` | Substantial correctness or maintainability concern with a workaround. |
| `nit` | Local style, wording, naming, or readability with no behavioral implication. |
| `suggestion` | Forward-looking observation that does not apply to this artifact's stated scope. |

Severity is **assigned by the reviewer**, not by the orchestrator. The orchestrator only routes based on it.

**PR-side consequence catalog** (authoritative for PR reviews):

| Severity | PR-side consequences |
|---|---|
| `blocker` | Acceptance criterion fails / is untestable / contradicts another; tests fail; security or data-loss risk; monorepo boundary violation; deviation from a cited ADR; PR introduces work the task scope did not include and cannot be reduced. |
| `major` | New duplication of an existing utility; error handling beyond a system boundary; missing test for an edge case the spec named; substantial deviation from `sdlc-code-standards` with a workaround. |

**Spec-side consequence catalog** (authoritative for spec reviews — this list is exhaustive; Appendix C's gap catalog references back to entries here):

| Severity | Spec-side consequences |
|---|---|
| `blocker` | AC is untestable; two ACs contradict each other; required spec section is missing or empty; required frontmatter field is missing or schema-invalid; design references a non-existent ADR; design is known-broken; cross-spec contradiction (this spec contradicts a contract from an upstream spec listed in its `depends_on`, OR a downstream spec that declares `depends_on` on this spec contradicts a contract defined here). |
| `major` | AC is ambiguous (multiple reasonable interpretations); success criterion is not measurable or has no defined measurement protocol; required migration plan is missing when changing schemas, shared types, or external contracts; a known risk surface is absent from Risks & constraints; workspace is declared in frontmatter but no AC scopes to it; unstated cross-workspace impact when the design touches `shared/`; In-scope and Out-of-scope are both empty or generic (unscoped scope); workspace-coverage gap (design touches `shared/` or `packages/` but the workspace is not listed in `workspaces:`). |

Reviewers must find the consequence in the relevant catalog. The spine clauses are not used in isolation. New consequence patterns are added via `spec-amendment` on this spec.

#### Grounding rules

Every finding MUST cite its source. Allowed citation prefixes per reviewer role:

| Reviewer role | Allowed citation prefixes |
|---|---|
| `pr-reviewer` (Tier 1) | `AC-NNN`; `ADR-NNN`; `sdlc-code-standards:<section-anchor>`; `monorepo:boundary`; `task:blocks:<id>`; `task:scope`; `spec:ambiguous-ac` / `spec:contradictory-ac` / `spec:wrong-design` / `spec:missing-section` (cross-skill signals — see SPEC-002) |
| Tier 2 PR specialists (`cross_spec`, `adversarial`, `domain:dbt`, etc.) | Inherits the `pr-reviewer` prefixes verbatim. Specialists may not invent new prefixes. |
| `spec-reviewer` | `spec-schema:<field|section>`; `spec-authoring:<section-anchor>` (anchor refers to a heading slug in `spec-authoring/SKILL.md`); `ADR-NNN`; `intent:<id>` (from `specs/intents.md`); `monorepo:workspaces`; `SPEC-NNN:<section>` — usable for cross-spec contradictions in either direction: (a) when this spec's `depends_on` references another spec, or (b) when another spec declares `depends_on` on this spec (the reviewer is supplied with both upstream and downstream spec paths in inputs) |

If a reviewer cannot ground a finding in one of these sources, the finding is not raised. Style preferences without a standards citation are at most a `nit`. A finding whose `criterion` field does not match an allowed prefix is a SPEC-001 contract violation and triggers an escalation (per SPEC-002).

#### Output schema (shared JSON envelope)

Illustrative pseudo-JSON (unions are TypeScript-style for readability; actual emitted JSON has one concrete value per field):

```jsonc
{
  "artifact": "pr | spec",
  "artifact_id": "TASK-NNN | SPEC-NNN",
  "spec_id": "SPEC-NNN",
  "pr_number": "null | <int>",
  "tier": "1 | 2",
  "findings": [
    {
      "id": "F-001",
      "severity": "blocker | major | nit | suggestion",
      "criterion": "<grounded citation per grounding rules>",
      "location": "<file:line | spec section name>",
      "finding": "<one sentence: what is wrong>",
      "suggested_fix": "<one sentence: what to do; null if unknown>",
      "carried_forward_from_previous": false
    }
  ],
  "verification": {                       // null for spec-reviewer
    "commands_run": ["pnpm -F dealer-app test"],
    "all_passed": true,
    "details": "<one line per command>"
  },
  "tier_2_dispatch_recommended": []       // [] for spec-reviewer
}
```

For `spec-reviewer`, `verification` is `null` and `tier_2_dispatch_recommended` is `[]`.

#### Carry-forward across iterations

When an artifact is revised and review re-runs, the reviewer accepts a `previous_output` parameter. Findings with severity `nit` or `suggestion` are carried forward unchanged when their `location` is unaffected by the revision. `blocker` and `major` findings are always re-evaluated.

"Unaffected by the revision" is defined precisely per artifact:

- **PR-side:** the file named in `location` does not appear in the new diff at all (no lines added, removed, or context).
- **Spec-side:** the named spec section's text bytes are identical to the previous revision (whitespace-significant; line breaks count).

A carried-forward finding has `carried_forward_from_previous: true`; new and re-evaluated findings have `false`.

### Orchestrator severity→action policy

Same routing applies to both reviewers:

```
findings = reviewer_output["findings"]

# Guard: any finding whose criterion prefix is not allowed by the grounding
# rules for this reviewer role short-circuits the policy.
if any(not is_allowed_prefix(f["criterion"], reviewer_output["artifact"],
                              reviewer_output["tier"])
       for f in findings):
    action = "escalate"
else:
    blockers    = [f for f in findings if f["severity"] == "blocker"]
    majors      = [f for f in findings if f["severity"] == "major"]
    nits        = [f for f in findings if f["severity"] == "nit"]
    suggestions = [f for f in findings if f["severity"] == "suggestion"]

    if blockers:                 action = "fix_loop"
    elif majors:                 action = "fix_loop"
    elif nits or suggestions:    action = "batch_followup_and_accept"
    else:                        action = "accept"
```

`accept` means: merge the PR (PR side) or move the spec to `status: active` (spec side). `batch_followup_and_accept` on the PR side opens a grooming task containing both nits and suggestions; on the spec side it appends both severities to the `spec_followups:` section (per Spec followups format above; declared via the spec-schema amendment in AC-013) and proceeds. Suggestions are not silently dropped — they ride alongside nits in the follow-up channel. `escalate` is an explicit return from this policy that the orchestrator must handle as a branch (see SPEC-002 Appendix B).

### PR side — tiered router

#### Tier 0 — mechanical gates (CI, not a reviewer)

Run before any reviewer is dispatched. Fail closed:

- Lint, typecheck, unit tests for the declared workspace.
- AC table present in the task file; every AC has an `evidence:` field populated.
- PR touches exactly one workspace (`workspace` declared in task file).
- PR diff size logged (no auto-fail; emitted for Tier 2 dispatch rules).

This is the authoritative Tier 0 description. SPEC-002 references it by inclusion; do not duplicate.

#### Tier 1 — always-on reviewer (one agent)

Single dispatch of `pr-reviewer` with the base prompt (Appendix A). Most PRs end here.

#### Tier 2 — specialists (conditionally dispatched)

Dispatched in parallel after Tier 1 completes, only if rules match. Tier 2 reviewers receive Tier 1's output and are told to **not duplicate** findings already raised. Tier 2 specialists inherit the `pr-reviewer` citation prefixes (per the Grounding rules table above) and may raise cross-skill-signal findings (`task:scope`, `spec:*`); the orchestrator detects these on the aggregated Tier 1 + Tier 2 finding set (per SPEC-002).

**Dispatch ownership:** the reviewer (Tier 1) evaluates the Appendix B rules against the task file and the diff, and populates `tier_2_dispatch_recommended` in its output. The orchestrator trusts that list — it does not re-evaluate file globs.

### Spec side — when `spec-reviewer` runs

`spec-reviewer` is invoked at three points, all by the existing spec skills:

1. **End of `spec-authoring` Phase 2**, before the user sign-off gate.
2. **After every `spec-amendment`**, regardless of amendment classification.
3. **On demand**: "review SPEC-NNN" invokes `spec-reviewer` against the current state of the spec.

Critically, **`spec-reviewer` is the agent version of what the owner currently does manually**. The owner remains the sign-off authority; the reviewer just makes the gap-detection systematic and grounded. The owner can also override severity by adding a `spec_review_overrides:` section to the spec body — overrides are visible in the spec, never silenced.

#### Owner override format

Overrides live in an in-spec section appended after `Migration` and before any other appendix. The section name (`spec_review_overrides`) is declared as optional in `spec-schema.md` per AC-013.

```yaml
## spec_review_overrides

- finding_id: F-003
  reviewer_severity: major
  owner_severity: nit
  reason: "Spec is intentionally ambiguous in this domain; will sharpen after first task."
  override_date: 2026-05-18
```

Overrides downgrade severity only — they do not silence the finding. The original reviewer output is preserved in the spec's review log (per SPEC-002 telemetry). The routing policy reads the *override* severity but the review log shows both.

#### Spec followups format

When `batch_followup_and_accept` fires on a spec review, the routing policy appends both nit and suggestion findings to a `spec_followups:` section. The section is declared optional in `spec-schema.md` per AC-013 and lives after `spec_review_overrides`.

```yaml
## spec_followups

- finding_id: F-007
  source_review: "spec-reviewer iter-2, 2026-05-18T14:22:00Z"
  severity: nit
  criterion: "spec-authoring:wording"
  location: "Success criteria > third bullet"
  finding: "Wording slightly ambiguous on which baseline to use."
  deferred_date: 2026-05-18
  resolved: false
  resolved_date: null
  resolved_by: null

- finding_id: F-012
  source_review: "spec-reviewer iter-2, 2026-05-18T14:22:00Z"
  severity: suggestion
  criterion: "spec-authoring:forward-looking"
  location: "Design > Owner override format"
  finding: "Consider an override-expiration mechanism in a future iteration."
  deferred_date: 2026-05-18
  resolved: false
  resolved_date: null
  resolved_by: null
```

Entries are append-only at first. The `resolved` boolean and its companion fields flip to `true` / a timestamp / a commit SHA when a follow-up grooming task closes the item. Closed entries are kept for audit; do not delete them.

### Where each skill lives

- New file: `.claude/skills/review-primitives.md` (shared severity spine + catalogs + grounding rules + output schema + carry-forward contract). Referenced by both reviewer skills.
- New skill: `.claude/skills/pr-reviewer/SKILL.md` (machine-parseable; PR-side reviewer).
- New skill: `.claude/skills/spec-reviewer/SKILL.md` (machine-parseable; spec-side reviewer).
- Updated skill: `.claude/skills/sdlc-code-review/SKILL.md` (human-readable; reads `pr-reviewer` output and renders the graded review comment).
- Updated skill: `.claude/skills/spec-authoring/SKILL.md` and `.claude/skills/spec-amendment/SKILL.md` (invoke `spec-reviewer` at the sign-off gate; present graded findings to the owner).
- Tiered router lives inside `spec-execution` (tracked in SPEC-002).
- Updated doc: `spec-schema.md` (new optional sections `spec_review_overrides` and `spec_followups`; new top-level subdirectory `specs/baselines/`).

## Acceptance criteria

- [ ] AC-001 — `.claude/skills/review-primitives.md` exists. It contains the shared severity spine, both artifact-specific consequence catalogs (PR-side and spec-side), the grounding rules table (all three reviewer roles' allowed citation prefixes), the output schema, and the carry-forward contract. Both reviewer skills reference this file rather than redefining the primitives.
- [ ] AC-002 — Both reviewers' prompts explicitly forbid inventing requirements. Findings without a grounded citation must not be raised. Each reviewer's allowed citation prefixes are listed in its prompt and match `review-primitives.md` exactly. Tier 2 specialists' prompts state they inherit `pr-reviewer` prefixes verbatim.
- [ ] AC-003 — `pr-reviewer/SKILL.md` exists, references the shared output schema from `review-primitives.md`, and includes the Tier 2 dispatch rules table (Appendix B). The reviewer evaluates the rules and populates `tier_2_dispatch_recommended`.
- [ ] AC-004 — `spec-reviewer/SKILL.md` exists, uses the same JSON output schema with `artifact: "spec"`, and applies the spec-side consequence catalog from `review-primitives.md`. The catalog is the single source of truth for spec-side severity; Appendix C lists gap categories without re-specifying severity.
- [ ] AC-005 — `sdlc-code-review/SKILL.md` is updated so the human-readable review comment renders per-finding severity and derives the merge/fix recommendation from the policy, not freehand. Old binary-verdict language is removed, not deprecated in place.
- [ ] AC-006 — `spec-authoring/SKILL.md` Phase 2 explicitly invokes `spec-reviewer` before the sign-off gate. `spec-amendment/SKILL.md` invokes `spec-reviewer` after producing the amended spec. Both reference the override format defined in Design > Owner override format.
- [ ] AC-007 — A worked example exists for each reviewer: a PR producing 1 blocker, 1 major, 2 nits; and a spec producing 1 blocker (untestable AC), 1 major (workspace coverage gap), 2 nits. Both show the expected JSON output and the expected orchestrator action.
- [ ] AC-008 — The carry-forward contract is specified in `review-primitives.md` with the two precise definitions (PR-side file-in-diff; spec-side section-text-identical) and at least one example of correct and one of incorrect behavior.
- [ ] AC-009 — `spec-reviewer` includes a gap catalog (Appendix C) listing the categories the reviewer must actively check (workspace-coverage, untestable AC, contradictory AC, missing section, cross-spec contradiction, missing migration plan, unstated cross-workspace impact, unscoped scope, risk surface omission). The catalog does not re-specify severity — it references the spec-side consequence catalog in `review-primitives.md`.
- [ ] AC-010 — The 80%-agreement success criterion is measured by the following protocol, codified in the skill: on the first 3 specs reviewed under this system, dispatch `spec-reviewer` twice with two genuinely different reviewer configurations — at minimum, the default prompt and an adversarial-bias prompt variant defined alongside it in `review-primitives.md`; preferably, two different model providers if available. For each finding present in both outputs at the same `location`, count as agreement when severities match; agreement = matching / total intersection findings; sample size threshold = ≥10 intersection findings before computing. Temperature-only variation does not satisfy this AC.
- [ ] AC-011 — Before the next active spec in high-gear is dispatched, SPEC-042's baseline values for `mean fix-loop iterations per PR` and `count of hot-fix amendment commits per spec` are captured into `specs/baselines/SPEC-042.md` (a new subdirectory declared via AC-013). The success comparison reads from that file.
- [ ] AC-012 — Citation prefix `task:scope` and the four `spec:*` prefixes used by SPEC-002's cross-skill signals are listed in the `pr-reviewer` allowed citation prefixes (Design > Grounding rules) and in the `pr-reviewer` skill prompt. Tier 2 specialists inherit these prefixes per the grounding rules table.
- [ ] AC-013 — `spec-schema.md` is amended to declare two new optional in-spec sections (`spec_review_overrides` placed after `Migration`; `spec_followups` placed after `spec_review_overrides`) and one new top-level subdirectory under `specs/` (`specs/baselines/` for per-spec baseline files). The schema entries specify field names, ordering constraint, and value types for each section. Migration plan covers the schema change explicitly.
- [ ] AC-014 — The default and adversarial prompt variants required by AC-010 are both concretely defined in `review-primitives.md` (or in a `prompts/` sibling folder referenced from it), so AC-010's measurement protocol is reproducible without further design work.

## Risks & constraints

- **Subjective severity grading.** Two reviewer configurations may grade the same finding differently — more acute on the spec side. Mitigation: the consequence catalogs are concrete (specific defects listed per severity), and AC-010 codifies a measurement protocol using genuinely different configurations. Re-evaluate after two specs ship under the new policy.
- **Spec review may slow the spec phase.** The intent is to *move* time from PR-side to spec-side, not add net time. If spec phase doubles and PR fix-loop only drops 10%, the trade is not paying off and the spec-review thresholds need loosening.
- **Owner override is a back-door.** A spec owner who overrides every blocker to nit defeats the system. Mitigation: overrides are visible in-spec, audit-able, and the original reviewer severity is preserved in the spec's review log.
- **Specialist scoping misses cross-cutting PR issues.** A PR that touches only `apps/dealer-app/components/` will not trigger the cross-spec reviewer even if it changes a contract via type-system inference. Mitigation: any task that lists `blocks:` in its frontmatter always triggers the boundary reviewer regardless of file globs.
- **Caching could mask regressions.** A nit carried forward might become a major in the context of new code. Mitigation: blocker and major findings are always re-evaluated; nits/suggestions only carry forward if their locations are unaffected per the precise definitions.
- **Breaking output-contract change.** AC-005 removes the old binary-verdict format outright. Any existing consumer (high-gear orchestrator, CI scripts, agent prompts referencing the old shape) will break. Mitigation: SPEC-002's migration keeps the old orchestrator's reviewer behind a flag for one spec; before removing, audit consumers by grep for `"approved"` / `"needs_fix"` literals in `.ai/`, `.claude/`, and `.github/workflows/`.
- **Schema amendment couples this spec to spec-schema.md.** AC-013 changes a foundational doc; any CI validation against the old schema will fail until the amendment lands. Mitigation: land the schema amendment first in the migration sequence; the new sections are optional so existing specs do not break.
- **Port-back ordering dependency.** This spec assumes `spec-execution` (SPEC-002) is also ported back. If SPEC-002 lags, the PR side of SPEC-001 is incomplete in practice. Spec-reviewer can land independently; it only depends on existing `spec-authoring` and `spec-amendment` skills.
- **No infrastructure for measuring success.** Three success criteria require manual counting for the first two specs. Acceptable for v1; revisit if the pattern proves out.

## Migration

### Current state

- Single `sdlc-code-review` skill in upstream sdlc, binary PR verdict.
- Spec review happens manually by the owner during `spec-authoring` Phase 2; no skill, no JSON contract, no graded findings.
- High-gear has both `sdlc-code-review` and `pr-reviewer` (binary), with a 4-reviewer always-on fan-out implemented in `spec-execution`.
- `spec-schema.md` does not declare `spec_review_overrides`, `spec_followups`, or `specs/baselines/`.

### Target state

- Upstream sdlc has `pr-reviewer` (graded), `spec-reviewer` (graded), `review-primitives.md` (shared contracts), and an updated `sdlc-code-review` that consumes the PR-side output.
- `spec-authoring` and `spec-amendment` invoke `spec-reviewer` at the sign-off gates.
- `spec-schema.md` declares the new optional sections and subdirectory.
- High-gear adopts both, replacing the always-on 4-reviewer fan-out on the PR side and replacing manual spec review on the spec side.

### Migration strategy

1. **First:** land the `spec-schema.md` amendment (AC-013). The new sections are optional, so existing specs validate unchanged. This unblocks every subsequent step that introduces the new sections.
2. Land `review-primitives.md` and the two reviewer skills in upstream sdlc. `spec-reviewer` can land independently of `spec-execution` (SPEC-002).
3. Land the orchestrator policy (in SPEC-002, the `spec-execution` port-back) for PR side. For spec side, the policy lives in `spec-authoring`/`spec-amendment` and ships with this spec.
4. In high-gear, adopt `spec-reviewer` first — no orchestration dependency. Run it on the next spec drafted.
5. Capture the SPEC-042 baseline (AC-011) into `specs/baselines/SPEC-042.md` before any swap on the PR side.
6. Swap PR-side: replace existing `pr-reviewer` with the upstream version on the next active spec (not mid-flight on SPEC-042). Keep the legacy reviewer + 4-reviewer fan-out behind a feature flag for one spec to allow side-by-side comparison.
7. After two specs ship under the new policy, measure success criteria from telemetry and revisit thresholds.

### Rollback plan

- The new and old reviewer skills can coexist for one spec — separate skills, separate paths. Reverting either side is a one-line change in the invoking skill to point back at the old behavior. No data migration is required because the artifacts are append-only.
- The `spec-schema.md` amendment is additive (optional sections only); rollback is removing the new entries from the schema. Specs that adopted the new sections remain valid markdown; they just stop being declared in the schema.

---

## Appendix A — `pr-reviewer` prompt (draft)

Lives in `.claude/skills/pr-reviewer/SKILL.md` on implementation.

```
You are reviewing a single PR against its task file, its parent spec, and the
applicable ADRs. Your output is machine-parseable JSON per the shared envelope
in review-primitives.md. You will not emit freehand prose outside the JSON
envelope.

INPUTS:
  - task_file: path to specs/tasks/SPEC-NNN/TASK-NNN-*.md
  - spec_file: path to specs/SPEC-NNN-*.md
  - pr_diff:   unified diff of the PR
  - previous_output: (optional, may be null on first iteration)

GROUNDING (per review-primitives.md):
  - Allowed citation prefixes: AC-NNN; ADR-NNN; sdlc-code-standards:<anchor>;
    monorepo:boundary; task:blocks:<id>; task:scope; spec:ambiguous-ac;
    spec:contradictory-ac; spec:wrong-design; spec:missing-section.
  - If you cannot ground a finding, do not raise it.

SEVERITY: apply the PR-side consequence catalog from review-primitives.md.

CARRY-FORWARD: if previous_output is non-null, carry forward any finding with
severity nit or suggestion whose `location` file does NOT appear in pr_diff.

CROSS-SKILL SIGNALS (raise these as blocker findings to trigger orchestration
hand-offs, per SPEC-002 Phase 2 cross-skill signals):
  - criterion = "task:scope" — PR scope reveals task decomposed wrong.
  - criterion = "spec:ambiguous-ac" / "spec:contradictory-ac" /
    "spec:wrong-design" / "spec:missing-section" — implementation reveals
    spec is wrong.

OUTPUT: the shared JSON envelope with `artifact: "pr"`, `tier: 1`, populated
`verification`, and `tier_2_dispatch_recommended` per Appendix B rules.

DECISION: you do not emit a decision. You grade. The orchestrator routes.
```

## Appendix B — Tier 2 PR dispatch rules (owned by this spec)

This table is the source of truth for Tier 2 dispatch. SPEC-002 consumes verbatim; consumers do not modify it. Future changes go through `spec-amendment` on SPEC-001.

```
| Specialist          | Triggers dispatch when …                                                     |
|---------------------|------------------------------------------------------------------------------|
| cross_spec          | Diff touches `packages/**` or `shared/**`                                    |
| cross_spec          | Task file declares any `blocks:` entry (regardless of file globs)            |
| adversarial         | Tier 1 returned 0 blockers AND pr_diff size > 150 lines added                |
| domain:dbt          | Diff touches `dbt/models/**` or `dbt/macros/**`                              |
| domain:nextjs       | Diff touches `apps/*/components/**` or `apps/*/app/**`                       |
| domain:playwright   | Task file declares `figma_frame:` OR diff touches `apps/*/app/**` page files |
```

Domain reviewers consume the domain skill listed in `.ai/project.md` for the workspace. If no domain skill exists, the specialist is not dispatched.

## Appendix C — `spec-reviewer` prompt and gap catalog

Lives in `.claude/skills/spec-reviewer/SKILL.md` on implementation. **Severity for each gap category is determined by the spec-side consequence catalog in `review-primitives.md` (Design > Spec-side consequence catalog); this appendix does not re-specify severity.**

```
You are reviewing a single spec draft (or amendment) against the spec schema,
the spec-authoring conventions, the originating intent, and any ADRs the spec
references or should reference. Your output is machine-parseable JSON per the
shared envelope in review-primitives.md. You will not emit freehand prose
outside the JSON envelope.

INPUTS:
  - spec_file:       path to specs/SPEC-NNN-*.md
  - spec_schema:     path to spec-schema.md
  - authoring:       path to .claude/skills/spec-authoring/SKILL.md
  - intent:          (optional) excerpt from specs/intents.md
  - project:         path to .ai/project.md (for workspace coverage checks)
  - adrs:            paths to referenced ADRs and to existing ADRs the spec
                     may contradict
  - upstream_specs:  (optional) paths to specs in this spec's depends_on
  - downstream_specs:(optional) paths to specs that declare this spec in their
                     depends_on (for downstream-contradiction detection)
  - previous_output: (optional, may be null on first iteration)

GROUNDING (per review-primitives.md):
  - Allowed citation prefixes: spec-schema:<field|section>;
    spec-authoring:<section-anchor>; ADR-NNN; intent:<id>; monorepo:workspaces;
    SPEC-NNN:<section> (use for upstream OR downstream cross-spec
    contradictions).
  - If you cannot ground a finding, do not raise it.

GAP CATALOG (categories to actively check — severity is determined by the
spec-side consequence catalog in review-primitives.md, not here):
  - Workspace-coverage gap
  - Untestable AC
  - Contradictory AC
  - Missing required section
  - Cross-spec contradiction (upstream or downstream)
  - Missing migration plan
  - Unstated cross-workspace impact
  - Unscoped scope
  - Risk surface omission

SEVERITY: apply the spec-side consequence catalog from review-primitives.md.

CARRY-FORWARD: if previous_output is non-null, carry forward any finding with
severity nit or suggestion whose `location` (spec section) has unchanged text
bytes in this revision.

OUTPUT: the shared JSON envelope with `artifact: "spec"`, `tier: 1`,
`verification: null`, `tier_2_dispatch_recommended: []`.

DECISION: you do not emit a decision. You grade.
```
