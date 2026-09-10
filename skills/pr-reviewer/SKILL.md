---
name: pr-reviewer
description: Use when reviewing a PR against its task file, spec, and ADRs — emits graded JSON findings (blocker/major/nit/suggestion) per SPEC-001 contract. Machine-parseable output for spec-execution orchestrator.
---

# pr-reviewer

> **Stop if you authored this.** `review SPEC-NNN` is a supported entry point, so this skill will
> sometimes be invoked directly — including by the context that just wrote the artifact. If you
> drafted or amended what you are being asked to grade, **do not grade it.** Dispatch
> `subagent_type: pr-reviewer` via the `Agent` tool and let the returned envelope stand.
> A self-review in the reviewer's output format is byte-identical to an independent one in the
> artifact, which is exactly why this has to fail loudly here rather than quietly produce a verdict.

This skill is the PR-side machine-parseable reviewer defined by SPEC-001. It grades a single PR against its task file, its parent spec, and the applicable ADRs, and emits the shared JSON envelope from `review-primitives.md`. The human-readable rendering of these findings — the actual review comment posted to the PR — lives in `sdlc-code-review` (updated by TASK-005). This skill emits structured findings; `sdlc-code-review` renders them.

## Prompt

> **This block is the role prompt seeded into the DISPATCHED `pr-reviewer` agent** (see Grading
> dispatch below). It is not an instruction to the context reading this file. If you are reading it
> as one, you are about to grade inline — stop and dispatch.


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

GROUNDING (per review-primitives.md > PR-side canonical prefix table — the authoritative set):
  - Allowed citation prefixes (lowercase colon form, mirroring review-primitives.md;
    these MUST match PR_SIDE_PREFIXES in scripts/sdlc/validate-review-envelope.mjs,
    which rejects an ungrounded blocking finding): ac:AC-NNN; adr:ADR-NNN;
    std:<section-anchor>; monorepo:boundary; monorepo:workspace-scope;
    monorepo:verify-coverage; task:blocks:<id>; task:scope; task:evidence-missing;
    spec:ambiguous-ac; spec:contradictory-ac; spec:wrong-design; spec:missing-section;
    spec:gap; inv:<INV-ID>; design:<token-or-component>; lens:<lens-name>.
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

BEHAVIORAL-EXPANSION CHECK (mandatory — the class tests cannot catch): a change
can be code-correct and fully green yet WRONG because it expands what the system
does at runtime. On every PR that touches a routing / delivery / ingestion /
gating / access / feature-enablement / scope path, ask: does this make the path
do MORE than before — new data / scope / site / tenant / traffic now flowing, a
previously-inert config path now active, a guard relaxed, a default flipped? If
so, and the PR does not both (a) state the prior behavioral contract and (b)
show the expansion is intended, raise a finding cited `std:behavior-preservation`
— `major` normally, `blocker` if the expansion reaches production data/traffic.
Do NOT accept "the config already listed it" as justification: a value present
in config is not evidence of intent. This is orthogonal to task:scope (that is
file/PR scope; this is runtime BEHAVIOR scope) and to spec ACs (a change can
satisfy every AC and still silently expand behavior the ACs never named).

OUTPUT: the shared JSON envelope with `artifact: "pr"`, `tier: 1`, populated
`verification`, and `tier_2_dispatch_recommended` per Appendix B rules.

DECISION: you do not emit a decision. You grade. The orchestrator routes.
```

## Grading dispatch — call the `Agent` tool, do NOT inline-grade

**This skill never grades a PR inline, as prose in its own context.** It spawns a distinct reviewer
by calling the `Agent` tool with `subagent_type: pr-reviewer`, then validates and renders the
returned envelope. The verdict is produced by an agent that did not author the code, carries the
independent-reviewer role prompt, and has no `Edit`/`Write` — so the author cannot self-accept.

An inline verdict and a dispatched one are byte-identical in the artifact. That is why this is a
rule about the ACT, not about the output format.

### Step 1 — compute the lens set

1. Derive the changed files from the real diff: `gh pr diff <pr> --name-only`.
2. Load the registry: `loadConstraints()` from `scripts/sdlc/reviewer-routing.mjs`.
3. Compute the applicable constraints across ALL changed paths with
   `applicableConstraintsFor(rows, changedFiles)`. Use that helper rather than looping
   `applicableConstraints` yourself — one lens set, one matcher, or a lens fires at write time and
   not at review time.

### Step 2 — fold by resolved agent, then dispatch

Resolve every firing lens to its reviewer with `node scripts/sdlc/reviewer-routing.mjs <lens>`
(ADR-001: routing is registry data).

**Fold by resolved agent, per [`../review-primitives.md`](../review-primitives.md) > Panel fold
rule.** That section is the single statement of the rule; this one does not restate it. Two
hand-maintained copies of a rule is the drift ADR-001 deleted the lens map to prevent, and the copy
you are not reading is the one that governs.

Dispatch concurrently, in one message.

### Step 3 — seed a clean context

Each dispatch carries ONLY: the PR diff and changed files, the task's acceptance criteria, the spec
and its linked ADRs, the applicable constraints with their `check` and `cite`, and the envelope
schema. **The author's execution transcript is never passed in.** Independence comes from a clean
context, not from a credential.

### Step 4 — validate every returned envelope, then route

```
node scripts/sdlc/validate-review-envelope.mjs <envelope.json>
```

Exit `0` folds the findings. `2` is an abstention and escalates — never accept it, even with an
empty findings list. `3` is malformed or ungrounded: re-dispatch or escalate. **A malformed envelope
is never a clean review.** Then route the merged findings through the severity→action policy in
`review-primitives.md`; do not freehand it.

## Tier 2 PR dispatch rules

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

## Dispatch ownership

The reviewer evaluates the Tier 2 dispatch rules against the task file's `blocks:` field and the PR diff, populating `tier_2_dispatch_recommended` in its output. The orchestrator trusts this list and does NOT re-evaluate file globs.

## Shared primitives

See [`../review-primitives.md`](../review-primitives.md) for the authoritative definitions of:

- **Severity ladder** — the `blocker | major | nit | suggestion` spine and the PR-side consequence catalog this reviewer grades against.
- **Output schema** — the JSON envelope this skill emits, including per-field constraints for `artifact: "pr"` outputs.
- **Carry-forward contract** — the precise PR-side definition of "unaffected by the revision" (file does not appear in the new diff) and the `carried_forward_from_previous` semantics.

This skill does not redefine those contracts; drift between this file and `review-primitives.md` is a SPEC-001 contract violation.
