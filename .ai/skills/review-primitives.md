# review-primitives

Shared primitives consumed by `pr-reviewer` and `spec-reviewer`. Single source of truth for severity, grounding rules, output schema, and carry-forward semantics. Both reviewer skills (and any Tier 2 PR specialists) MUST reference this file rather than redefining these contracts; drift between the two reviewers is a SPEC-001 contract violation.

This file is content-equivalent to SPEC-001 > Design > Shared primitives + Orchestrator severity→action policy. SPEC-001 remains the spec of record; this file is the operational contract the skills load.

---

## Severity spine

A finding's severity is determined by **what blocks if it stays unaddressed**, not by perceived importance. The spine is artifact-agnostic; consequence catalogs below are artifact-specific.

| Severity | Spine definition |
|---|---|
| `blocker` | The artifact cannot be used in its current state. |
| `major` | Substantial correctness or maintainability concern with a workaround. |
| `nit` | Local style, wording, naming, or readability with no behavioral implication. |
| `suggestion` | Forward-looking observation that does not apply to this artifact's stated scope. |

Severity is **assigned by the reviewer**, not by the orchestrator. The orchestrator only routes based on it.

---

## PR-side consequence catalog

Authoritative for PR reviews. The `pr-reviewer` skill (Tier 1) and all Tier 2 PR specialists grade against this catalog. A finding without a matching consequence row is not raised. New consequence rows are added via `spec-amendment` on SPEC-001.

| Severity | PR-side consequences |
|---|---|
| `blocker` | Acceptance criterion fails / is untestable / contradicts another; tests fail; security or data-loss risk; monorepo boundary violation; deviation from a cited ADR; PR introduces work the task scope did not include and cannot be reduced. |
| `major` | New duplication of an existing utility; error handling beyond a system boundary; missing test for an edge case the spec named; substantial deviation from `sdlc-code-standards` with a workaround. |

`nit` and `suggestion` PR-side findings are graded against the spine clauses directly (no catalog row needed): local style/wording/naming/readability with no behavioral implication is a `nit`; a forward-looking observation outside the PR's stated scope is a `suggestion`.

---

## Spec-side consequence catalog

Authoritative for spec reviews. This is the **single source of truth** for spec-side severity. The `spec-reviewer` skill's gap catalog (Appendix C of SPEC-001) lists the categories to actively check but explicitly does NOT re-specify severity — it references this catalog by inclusion.

| Severity | Spec-side consequences |
|---|---|
| `blocker` | AC is untestable; two ACs contradict each other; required spec section is missing or empty; required frontmatter field is missing or schema-invalid; design references a non-existent ADR; design is known-broken; cross-spec contradiction (this spec contradicts a contract from an upstream spec listed in its `depends_on`, OR a downstream spec that declares `depends_on` on this spec contradicts a contract defined here). |
| `major` | AC is ambiguous (multiple reasonable interpretations); success criterion is not measurable or has no defined measurement protocol; required migration plan is missing when changing schemas, shared types, or external contracts; a known risk surface is absent from Risks & constraints; workspace is declared in frontmatter but no AC scopes to it; unstated cross-workspace impact when the design touches `shared/`; In-scope and Out-of-scope are both empty or generic (unscoped scope); workspace-coverage gap (design touches `shared/` or `packages/` but the workspace is not listed in `workspaces:`). |

Reviewers must find the consequence in this catalog before raising a `blocker` or `major` finding; the spine clauses are not used in isolation for these severities. `nit` and `suggestion` spec-side findings are graded against the spine clauses directly (e.g., a wording-only refinement with no semantic impact is a `nit`).

---

## Grounding rules

Every finding MUST cite its source in the `criterion` field of the output schema. Allowed citation prefixes per reviewer role:

| Reviewer role | Allowed citation prefixes |
|---|---|
| `pr-reviewer` (Tier 1) | `AC-NNN`; `ADR-NNN`; `sdlc-code-standards:<section-anchor>`; `monorepo:boundary`; `task:blocks:<id>`; `task:scope`; `spec:ambiguous-ac` / `spec:contradictory-ac` / `spec:wrong-design` / `spec:missing-section` (cross-skill signals — see SPEC-002) |
| Tier 2 PR specialists (`cross_spec`, `adversarial`, `domain:dbt`, etc.) | Inherits the `pr-reviewer` prefixes verbatim. Specialists may not invent new prefixes. |
| `spec-reviewer` | `spec-schema:<field\|section>`; `spec-authoring:<section-anchor>` (anchor refers to a heading slug in `spec-authoring/SKILL.md`); `ADR-NNN`; `intent:<id>` (from `specs/intents.md`); `monorepo:workspaces`; `SPEC-NNN:<section>` — usable for cross-spec contradictions in either direction: (a) when this spec's `depends_on` references another spec, or (b) when another spec declares `depends_on` on this spec (the reviewer is supplied with both upstream and downstream spec paths in inputs) |

If a reviewer cannot ground a finding in one of the allowed prefixes for its role, the finding is not raised. Style preferences without a standards citation are at most a `nit`. A finding whose `criterion` field does not match an allowed prefix is a SPEC-001 contract violation and triggers an `escalate` action from the orchestrator policy (see below).

---

## Output schema

Both reviewers emit the same JSON envelope. Illustrative pseudo-JSON (unions are TypeScript-style for readability; actual emitted JSON has one concrete value per field):

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

Per-artifact field constraints:

- **`artifact: "pr"`** — `pr_number` is non-null; `verification` is a populated object (not null); `tier_2_dispatch_recommended` MAY contain specialist names per Appendix B of SPEC-001.
- **`artifact: "spec"`** — `pr_number` is `null`; `verification` is `null`; `tier_2_dispatch_recommended` is `[]`.
- **`tier: 2`** — only valid when `artifact: "pr"`. Tier 2 outputs MUST NOT re-raise findings already present in the Tier 1 output they were given.
- **`location`** — for PR findings, format is `file:line` (or `file` if the finding is whole-file). For spec findings, format is the spec section heading text (e.g., `"Success criteria > third bullet"`).

---

## Carry-forward across iterations

When an artifact is revised and review re-runs, the reviewer accepts a `previous_output` parameter. Findings with severity `nit` or `suggestion` are carried forward unchanged when their `location` is unaffected by the revision. `blocker` and `major` findings are always re-evaluated (never carried forward).

"Unaffected by the revision" is defined precisely per artifact:

- **PR-side:** the file named in `location` does not appear in the new diff at all (no lines added, removed, or context).
- **Spec-side:** the named spec section's text bytes are identical to the previous revision (whitespace-significant; line breaks count).

A carried-forward finding has `carried_forward_from_previous: true`; new and re-evaluated findings have `false`. Carrying forward is a property of the reviewer's output, not the orchestrator's — the orchestrator routes on severity regardless of carry-forward status.

### Examples

#### Correct carry-forward (PR-side)

Iteration 1 raised a nit on `apps/dealer-app/utils/format.ts:42` ("inconsistent quote style"). Iteration 2's diff touches only `apps/dealer-app/components/Card.tsx`. The reviewer carries the nit forward with `carried_forward_from_previous: true` because `apps/dealer-app/utils/format.ts` does not appear in the iteration-2 diff at all.

#### Incorrect carry-forward (PR-side)

Same iteration-1 nit on `apps/dealer-app/utils/format.ts:42`. Iteration 2's diff includes a one-line change in `apps/dealer-app/utils/format.ts` (even on a different line, e.g., line 17). Carrying the nit forward is **incorrect**: the file appears in the new diff, so the reviewer MUST re-evaluate the finding from scratch. The original line may have shifted, been deleted, or had the quote style fixed; only a fresh read of the new file content can tell.

#### Correct carry-forward (spec-side)

Iteration 1 raised a nit at `Success criteria > third bullet` ("wording slightly ambiguous on which baseline to use"). The amendment in iteration 2 only edits `Migration > Migration strategy`. The byte-for-byte content of `Success criteria > third bullet` is identical between revisions (no whitespace, no line-break changes). The reviewer carries the nit forward with `carried_forward_from_previous: true`.

#### Incorrect carry-forward (spec-side)

Same iteration-1 nit at `Success criteria > third bullet`. The amendment in iteration 2 edits the third bullet to add a clarifying phrase. The bytes are no longer identical. Carrying the nit forward is **incorrect**: the section's text bytes changed, so the reviewer MUST re-evaluate (possibly the amendment resolved the ambiguity; possibly it introduced a new one; possibly the bullet is now a `major` because it contradicts another AC). Even if the change is trivially small, byte-inequality forces re-evaluation.

---

## Orchestrator severity→action policy

Same routing applies to both reviewers (PR side and spec side). The policy is invoked from `spec-execution` (PR side, per SPEC-002) and from `spec-authoring` / `spec-amendment` (spec side, per SPEC-001).

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

Action semantics:

- **`accept`** — merge the PR (PR side) or move the spec to `status: active` (spec side).
- **`batch_followup_and_accept`** — on the PR side: opens a grooming task containing both nits and suggestions and accepts the PR. On the spec side: appends both severities to the `spec_followups:` section (declared via the spec-schema amendment in SPEC-001 AC-013) and accepts the spec. Suggestions are **not** silently dropped — they ride alongside nits in the follow-up channel.
- **`fix_loop`** — the artifact author addresses the findings and re-submits; the reviewer re-runs with `previous_output` set.
- **`escalate`** — an explicit return from this policy that the orchestrator must handle as a branch (see SPEC-002 Appendix B). Triggered when any finding cites a prefix not in the allowed list for the reviewer role, which indicates either a SPEC-001 contract violation or an unrecognized cross-skill signal.

---

## Measurement protocol (SPEC-001 AC-010)

SPEC-001 success criteria require that two reviewers configured differently grading the same artifact agree on severity for ≥80% of findings. This section codifies the measurement procedure so the success criterion is reproducible.

### Procedure

1. **Pick the artifact.** Run on each of the first 3 specs reviewed under this system (spec-side measurement). For PR-side measurement, run on the first 3 PRs that complete a full fix-loop under the new policy. Each measured artifact contributes one trial.
2. **Configure two reviewer runs.** The two runs MUST differ in a substantive way — at minimum, the default prompt and the adversarial prompt variant defined below. Preferably, two different model providers (e.g., one Anthropic model and one OpenAI model) running the default prompt. **Temperature-only variation does NOT satisfy this AC** — the two configurations must produce systematically different framings, not just sampling noise.
3. **Dispatch both reviewers in parallel** against the same artifact + the same `previous_output` (or both with `null` if first iteration). Record both raw JSON outputs.
4. **Compute the intersection.** A finding is in the intersection if both outputs have a finding at the **same `location`** (string-equal after trim). For PR side: same `file:line` (or same `file` if both are whole-file findings). For spec side: same spec section heading string.
5. **Threshold check.** If `|intersection| < 10`, the trial is below the sample-size threshold; do not compute agreement for this artifact. Roll the next artifact into the trial; aggregate intersections across artifacts until `|intersection| >= 10`.
6. **Compute agreement.** For each intersection finding, count it as **matching** if both reviewers assigned the same `severity` value. Then `agreement = matching / |intersection|`.
7. **Verdict.** The success criterion is met when `agreement >= 0.80` on a trial that meets the sample-size threshold. Record `agreement`, `|intersection|`, and the per-artifact contributions in the spec's review log (per SPEC-002 telemetry).

### Notes

- `criterion`-string differences do not count as disagreement as long as the severity matches; only `severity` is compared. (Two reviewers may ground the same defect via different but both-allowed prefixes — e.g., one cites `AC-003`, the other cites `sdlc-code-standards:duplication`. Same defect, same severity, agreement = 1.)
- Findings present in only one reviewer's output do not affect the agreement ratio; they are not in the intersection. Total finding count is reported separately for context but is not part of the AC.
- Carried-forward findings (`carried_forward_from_previous: true`) are included in the intersection check on the same terms as fresh findings.

---

## Prompt variants (SPEC-001 AC-014)

Two reviewer prompt variants are concretely defined so the AC-010 measurement protocol is reproducible without further design work. The variants apply to `spec-reviewer`; the same pattern (default + adversarial) can be lifted to `pr-reviewer` if measurement on the PR side requires it.

The full `spec-reviewer` prompt body (with INPUTS / GROUNDING / GAP CATALOG / SEVERITY / CARRY-FORWARD / OUTPUT / DECISION sections) lives in `.ai/skills/spec-reviewer/SKILL.md` (TASK-004). The two variants below specify **only the framing/severity-bias instructions** that wrap the shared prompt body. The reviewer concatenates the appropriate variant block at the top of the shared body when invoked.

### Default variant

```
VARIANT: default

FRAMING:
- Grade strictly by the spec-side consequence catalog. If a consequence row
  matches, use the catalog severity; if no row matches and the finding is
  purely cosmetic, the severity is `nit`; if the finding is forward-looking
  beyond the spec's stated scope, the severity is `suggestion`.
- When a finding could plausibly map to two severities, choose the LOWER
  of the two and add a one-sentence justification in `finding`.
- Cross-spec contradiction checks are run only when an explicit `depends_on`
  edge exists between the spec under review and another spec the reviewer
  has been supplied as input.
- Grounding-citation strictness: if a finding's defect is real and minor and
  the only available citation is borderline (e.g., a generic
  `spec-authoring:<anchor>` anchor that does not perfectly fit), raise it as
  a `nit` with the best available citation rather than escalating the
  grounding concern.
```

### Adversarial variant

The adversarial variant differs from the default in **specific, substantive ways** designed to produce genuinely different findings (not just sampling variance). When run alongside the default per the AC-010 protocol, it surfaces a different distribution of severities and a different set of cross-spec findings, which is the property the 80%-agreement check is designed to measure.

**Concrete differences from the default (5):**

1. **Severity bias up by one level for ambiguity-class findings.** A finding the default variant would grade `nit` because it is "wording slightly unclear", the adversarial variant grades `major` if the ambiguity could plausibly affect AC interpretation; a finding the default grades `major` ("AC is ambiguous"), the adversarial grades `blocker` if any plausible interpretation contradicts another AC.
2. **Cross-spec contradiction probing without a `depends_on` edge.** The adversarial variant actively searches `downstream_specs` and `upstream_specs` for contradictions even when no explicit `depends_on` edge exists between the spec under review and a candidate, on the assumption that a missing `depends_on` edge is itself a possible defect.
3. **Grounding-citation strictness raised.** A finding whose `criterion` is borderline (the cited section anchor does not exactly correspond to the defect) is raised as a separate `major` finding citing `spec-schema:grounding` — the adversarial variant treats weak grounding as a first-class defect, where the default variant tolerates it as long as the underlying defect is captured.
4. **Gap-catalog completeness emphasized.** The adversarial variant requires the reviewer to explicitly state, in a final `coverage_summary` field appended to the JSON output, which gap categories from Appendix C were checked and found clean. The default variant produces only the findings list. This forces the adversarial variant to scan for absences of findings as a form of negative evidence and tends to surface more `major` workspace-coverage and risk-surface gaps.
5. **Bias toward `blocker` on missing-migration findings.** A missing migration plan when the spec changes schemas, shared types, or external contracts is graded `blocker` by the adversarial variant (vs. `major` in the spec-side consequence catalog and the default variant), on the grounds that downstream specs/PRs cannot proceed without it. The default variant defers to the catalog severity.

```
VARIANT: adversarial

FRAMING:
- Grade strictly per the spec-side consequence catalog as the BASELINE, then
  apply the bias rules below. State both the catalog severity and the
  applied severity in `finding` so the bias is auditable.
- Bias rules:
  1. Ambiguity-class findings: grade one level more severe than the catalog
     would suggest when the ambiguity could plausibly affect AC interpretation
     or cross-AC consistency.
  2. Probe `upstream_specs` AND `downstream_specs` for contradictions even
     when no `depends_on` edge exists. Treat a missing `depends_on` edge as
     a possible `major` finding citing `spec-schema:depends_on`.
  3. Grounding-citation strictness: raise borderline-grounded findings as
     `major` citing `spec-schema:grounding`, in addition to the underlying
     finding.
  4. After listing findings, append a `coverage_summary` field naming each
     gap category from Appendix C and stating (a) whether it was checked
     and (b) the worst severity found in that category (or "clean").
  5. Missing-migration findings: grade `blocker` when the spec changes
     schemas, shared types, or external contracts.
- When in doubt between two severities, choose the HIGHER of the two and
  add a one-sentence justification in `finding`.
- All other contract rules from review-primitives.md (grounding-prefix
  allowlist, output schema, carry-forward semantics) are unchanged from
  the default variant.
```

The variants are invoked by passing a `variant: "default" | "adversarial"` parameter to the reviewer skill at dispatch time. If no variant is specified, the reviewer uses `default`.
