---
name: spec-reviewer
description: Use when reviewing a draft spec or spec amendment — emits graded JSON findings (blocker/major/nit/suggestion) per SPEC-001 contract. Invoked automatically by spec-authoring at the sign-off gate and by spec-amendment after every amendment; also invocable on demand.
---

# spec-reviewer

Spec-side machine-parseable reviewer. Grades a draft spec against the schema, authoring conventions, originating intent, ADRs, and cross-spec contracts. Output is JSON consumed by the spec-authoring / spec-amendment routing policy.

This skill is the agent version of what a spec owner currently does manually during `spec-authoring` Phase 2. The owner remains the sign-off authority; this reviewer makes the gap-detection systematic and grounded. Owners can override severity via the `spec_review_overrides:` section appended to the spec body — overrides are visible in the spec, never silenced.

## Shared contracts

This skill does NOT redefine severity, output schema, grounding rules, or carry-forward semantics. Those primitives live in [`../review-primitives.md`](../review-primitives.md) and are the single source of truth. In particular:

- **Severity ladder and spec-side consequence catalog** — see `review-primitives.md` > Severity spine and Spec-side consequence catalog. The gap catalog in this skill lists categories to actively check; severity per category is determined by the consequence catalog there.
- **Allowed citation prefixes** — see `review-primitives.md` > Grounding rules. The prefixes listed in the prompt body below MUST match that file exactly; if they drift, the reviewer is in violation of SPEC-001.
- **Output schema (shared JSON envelope)** — see `review-primitives.md` > Output schema. Emitted JSON sets `artifact: "spec"`, `pr_number: null`, `verification: null`, `tier_2_dispatch_recommended: []`, `tier: 1`.
- **Carry-forward contract** — see `review-primitives.md` > Carry-forward across iterations. Spec-side rule: a `nit` or `suggestion` is carried forward only when the named spec section's text bytes are byte-identical to the previous revision (whitespace-significant; line breaks count).
- **Orchestrator severity→action policy** — see `review-primitives.md` > Orchestrator severity→action policy. This reviewer does NOT emit a decision; it grades. The orchestrator routes.

## Variant dispatch parameter

This skill accepts a `variant: "default" | "adversarial"` parameter at dispatch time. If no variant is specified, the reviewer uses `default`.

The full text of each variant's framing/severity-bias instructions is defined in [`../review-primitives.md`](../review-primitives.md) > Prompt variants. The reviewer concatenates the appropriate variant block at the top of the shared prompt body when invoked.

### When to use each variant

- **`default`** — the standard reviewer pass invoked automatically by `spec-authoring` Phase 2 and by `spec-amendment` after every amendment. Use this for all production sign-off gates and on-demand reviews unless the AC-010 measurement protocol is being executed.
- **`adversarial`** — the second-opinion pass required by the SPEC-001 AC-010 measurement protocol (run alongside `default` on the same spec to compute the ≥80%-agreement metric). The adversarial variant biases severity upward on ambiguity-class findings, probes for cross-spec contradictions even without `depends_on` edges, raises grounding-citation strictness, biases missing-migration findings to `blocker`, and additionally emits a `coverage_summary` field in its JSON output naming each gap category from the catalog below and stating (a) whether it was checked and (b) the worst severity found in that category (or `"clean"`). Concrete behavioral differences are enumerated in `review-primitives.md` > Prompt variants > Adversarial variant.

### Output-shape difference

- `variant == "default"` — emitted JSON matches the shared envelope from `review-primitives.md` verbatim. No `coverage_summary` field.
- `variant == "adversarial"` — emitted JSON matches the shared envelope PLUS an additional `coverage_summary` field at the top level. Schema:

  ```jsonc
  "coverage_summary": [
    {
      "category": "<one of the 9 gap-catalog categories below>",
      "checked": true,
      "worst_severity_found": "blocker | major | nit | suggestion | clean"
    }
  ]
  ```

  Every gap-catalog category MUST be enumerated in `coverage_summary` exactly once when `variant == "adversarial"`.

All other contract rules (grounding-prefix allowlist, severity catalog, carry-forward semantics, decision-disclaimer) are identical across variants.

## Prompt body

The prompt below matches SPEC-001 Appendix C verbatim. At dispatch time, the reviewer prepends the appropriate variant framing block (from `review-primitives.md` > Prompt variants) to this body based on the `variant` parameter; the body itself is variant-agnostic.

```
You are reviewing a single spec draft (or amendment) against the spec schema,
the spec-authoring conventions, the originating intent, and any ADRs the spec
references or should reference. Your output is machine-parseable JSON per the
shared envelope in review-primitives.md. You will not emit freehand prose
outside the JSON envelope.

INPUTS:
  - spec_file:       path to specs/SPEC-NNN-*.md
  - spec_schema:     path to spec-schema.md
  - authoring:       path to .ai/skills/spec-authoring/SKILL.md
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

VARIANT-CONDITIONAL BEHAVIOR: when invoked with `variant: "adversarial"`,
apply the bias rules and append the `coverage_summary` field as specified in
review-primitives.md > Prompt variants > Adversarial variant. When invoked
with `variant: "default"` (or with no variant), behave per this prompt body
without the `coverage_summary` field.

DECISION: you do not emit a decision. You grade.
```

## Gap catalog

The reviewer must actively check for the following 9 categories on every spec it grades. **Severity for each category is determined by the spec-side consequence catalog in [`../review-primitives.md`](../review-primitives.md); this catalog only lists categories to actively check.** Re-specifying severity here would create a drift surface against `review-primitives.md` and violate the SPEC-001 contract.

1. **Workspace-coverage gap** — design touches `shared/` or `packages/` but the workspace is not listed in `workspaces:`, or a workspace is declared in frontmatter but no AC scopes to it.
2. **Untestable AC** — an acceptance criterion cannot be verified by any observable test, command, or inspection procedure.
3. **Contradictory AC** — two acceptance criteria require mutually exclusive behavior.
4. **Missing required section** — a section required by `spec-schema.md` is missing or empty.
5. **Cross-spec contradiction (upstream or downstream)** — this spec contradicts a contract from an upstream spec listed in its `depends_on`, OR a downstream spec that declares `depends_on` on this spec contradicts a contract defined here. Both directions are checked using the `upstream_specs` and `downstream_specs` inputs.
6. **Missing migration plan** — the spec changes schemas, shared types, or external contracts, but no migration plan is provided.
7. **Unstated cross-workspace impact** — the design touches `shared/` (or otherwise reaches across workspace boundaries) without naming the downstream consumers it affects.
8. **Unscoped scope** — In-scope and Out-of-scope are both empty or generic.
9. **Risk surface omission** — a known risk surface is absent from Risks & constraints.

## Inputs

The reviewer is supplied the following inputs at dispatch time (see prompt body for canonical paths):

- `spec_file` — the spec under review.
- `spec_schema` — `spec-schema.md` for required-section / frontmatter checks.
- `authoring` — `.ai/skills/spec-authoring/SKILL.md` for `spec-authoring:<section-anchor>` citations.
- `intent` (optional) — excerpt from `specs/intents.md` for `intent:<id>` citations.
- `project` — `.ai/project.md` for workspace-coverage checks.
- `adrs` — paths to referenced ADRs and to existing ADRs the spec may contradict.
- `upstream_specs` (optional) — paths to specs listed in this spec's `depends_on` (for `SPEC-NNN:<section>` citations in the upstream direction).
- `downstream_specs` (optional) — paths to specs that declare this spec in their `depends_on` (for `SPEC-NNN:<section>` citations in the downstream direction).
- `previous_output` (optional, may be null on first iteration) — the JSON output from the prior review iteration, used for the carry-forward contract.
- `variant` (optional, defaults to `"default"`) — one of `"default"` or `"adversarial"`. Selects the framing block prepended to the prompt body. See the Variant dispatch parameter section above.

## When this skill is invoked

`spec-reviewer` is invoked at three points, all by the existing spec skills:

1. **End of `spec-authoring` Phase 2**, before the user sign-off gate.
2. **After every `spec-amendment`**, regardless of amendment classification.
3. **On demand** — e.g., "review SPEC-NNN" invokes `spec-reviewer` against the current state of the spec.

The owner remains the sign-off authority; this skill produces grounded findings, not approval.

## Decision disclaimer

You do not emit a decision. You grade. The orchestrator routes based on severity per the policy in `review-primitives.md` > Orchestrator severity→action policy.
