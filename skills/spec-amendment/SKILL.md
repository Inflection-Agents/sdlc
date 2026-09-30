---
name: spec-amendment
description: Use when implementation reveals the spec is wrong, incomplete, or needs change — "the spec assumed X but it's actually Y," "we need to add scope," "this acceptance criterion is untestable," "the design doesn't work," or when the user changes requirements mid-flight
---

# Spec Amendment

## Overview

The backward path in the SDLC. Spec-authoring moves forward (intent → spec). This skill handles what happens when reality pushes back — a delivery step reveals a bad assumption, the user changes direction, or an external dependency shifts.

Spec amendment is normal, not failure. Every non-trivial spec will be amended at least once. The goal is to amend cleanly: classify the change, assess impact on in-flight work, update all artifacts, and get approval before continuing.

**This is a rigid skill.** No implementation continues against a known-wrong spec. No guide changes without assessing the full impact.

**Announce at start:** "Using spec-amendment — the spec needs a change. Let me classify the impact before we continue."

## Hard gates

1. **No implementation against a known-wrong spec.** If you discover the spec is wrong, stop implementing and invoke this skill. Continuing wastes effort and creates artifacts that need rework.
2. **No breaking changes without user approval.** Cosmetic fixes can proceed. Additive and breaking changes require the user to review and approve before work resumes.
3. **No silent step invalidation.** If a spec change affects guide steps, every affected step must be explicitly rewritten, reworked or cancelled, and the guide must pass `validate-guide.mjs` again. Don't leave stale steps in the guide.

---

## Gap or amendment?

Before invoking spec-amendment, decide whether the change is small enough to be a gap (lighter weight, no version bump) or substantive enough to require an amendment.

| Change type | Path |
|---|---|
| Word-level AC clarification preserving semantics (e.g., wording tighten without changing what passes/fails) | gap-capture (use `templates/gap.md`; do not run this skill) |
| Design-section workaround that does not affect any AC's pass/fail | gap-capture |
| Cross-link to an ADR that should have been cited but wasn't (no design change) | gap-capture |
| Any change that would bump the spec version (per `skills/spec-schema.md` version rules) | **spec-amendment** (this skill) |
| Any change to In/Out scope, AC pass/fail conditions, or design semantics | **spec-amendment** |

If the change qualifies as a gap, create a GAP-NNN-*.md file under `specs/gaps/` (template at `templates/gap.md`) and stop. Otherwise continue with the amendment process below. See SPEC-004 for the originating design.

---

## Step 1: Identify the trigger

Something prompted this amendment. Name it clearly:

- **Implementation discovery:** "Step S3 revealed that the auth middleware can't intercept at the route level — it needs to be app-level middleware."
- **User direction change:** "The user decided to drop feature X from scope."
- **External shift:** "The API we planned to integrate deprecated endpoint Y."
- **Review finding:** "The integration panel on S2's work found the design creates a circular dependency."
- **Bug during implementation:** "The Verify: commands for S4 exposed a flaw in the acceptance criteria — criterion AC-005 contradicts AC-002."

Document the trigger. This becomes the "why" for the version bump.

## Step 2: Classify the change

Every spec change falls into one of three categories. The classification determines the process:

### Cosmetic

**Definition:** Typo fixes, clarification of ambiguous wording, adding examples, formatting. No change to what gets built or how it's tested.

**Rules:**
- No version bump
- No guide impact analysis needed
- No user approval needed (but commit clearly)
- Update `updated` date in frontmatter

**Examples:**
- Fix a typo in the design section
- Clarify that "user" means "authenticated user" (if every step already assumed this)
- Add an id to the front of an existing acceptance or success criterion line and change nothing else
  on it (an id-only edit, needed before a guide can name the criterion)
- Add a code example to a constraint

### Additive

**Definition:** New acceptance criteria, expanded scope, additional constraints. Everything that was true before is still true — you're adding, not changing.

**Rules:**
- Version bump required
- Guide impact analysis required (new steps may be needed)
- User approval required
- No existing step should break — but new steps may be needed

**Examples:**
- Add a new acceptance criterion: "Given admin user, when deleting account, then soft-delete only"
- Expand scope: "Also support OAuth in addition to JWT"
- Add a new ADR constraint discovered during implementation

### Breaking

**Definition:** Changed or removed acceptance criteria, altered design, reduced scope, changed architecture. Something that was true before is no longer true.

**Rules:**
- Version bump required
- Full guide impact analysis required (existing steps may be invalid)
- User approval required
- In-flight steps must be assessed for rework, cancellation, or re-scoping

**Examples:**
- Change design: "Use app-level middleware instead of route-level" (affects steps already built against the old design)
- Remove acceptance criterion: "Drop the real-time notification requirement"
- Change scope: "This spec now covers only the API, not the UI"
- Change architecture decision: "Switch from PostgreSQL to DynamoDB" (invalidates ADR + steps)

## Step 3: Write the amendment

### For cosmetic changes

Edit the spec directly. Commit with message: `SPEC-NNN: clarify [what] (cosmetic, no version bump)`

Done. No further steps needed.

### For additive and breaking changes

**3a. Create a change summary** — before editing the spec, write a concise summary of what's changing and why. This becomes the basis for user review and guide impact analysis.

```markdown
## Amendment to SPEC-NNN v[current] → v[next]

**Trigger:** [from Step 1]
**Classification:** additive | breaking

### What's changing
- [Specific change 1]
- [Specific change 2]

### Why
[The trigger, expanded with context]

### What's NOT changing
[Explicitly list unchanged sections — this reassures reviewers]
```

**3b. Edit the spec:**
- Bump `version` field (increment by 1)
- Update `updated` date
- Make the changes to the body sections
- If an ADR is affected: update the ADR status (superseded) and create a new one if needed
- Do NOT remove old acceptance criteria without marking them in the change summary

**3c. Add a changelog entry** at the bottom of the spec:

```markdown
## Changelog

### v2 (YYYY-MM-DD)
- **Breaking:** Changed auth middleware from route-level to app-level (step S3 discovery)
- **Additive:** Added admin soft-delete acceptance criterion

### v1 (YYYY-MM-DD)
- Initial spec
```

## Step 4: Guide impact analysis

For every step in `specs/tasks/SPEC-NNN/GUIDE.md`, read its status in `_index.yaml` and classify it
against the change:

| Step status | Impact | Action |
|-------------|--------|--------|
| `pending` | Not affected | None |
| `pending` | Affected by change | Rewrite the step: its `Covers:`, `Changes:`, `Verify:` or `Notes:` |
| `in_progress` | Affected by change | Pause the step (Step 5), then rewrite it |
| `done` (PR merged) | Not affected | None |
| `done` (PR merged) | Invalidated by change | Add a rework step (Step 6) |
| N/A | New work needed | Add a new step (Step 6) |

A spec that is `active` but has no guide yet has nothing to cascade into. Skip Steps 4 to 6, and hand
off to `spec-authoring` with "write the guide for SPEC-NNN" after the owner approves the amendment.

Present the impact:

```markdown
### Guide impact

| Step | Status | Impact | Action |
|------|--------|--------|--------|
| S1 | done | Not affected | None |
| S2 | in_progress | Breaking — design changed | Pause, rewrite S2 |
| S3 | pending | Breaking — acceptance criteria changed | Re-map Covers: |
| NEW | — | Additive — new acceptance criterion | Add S5 |
```

## Step 5: Handle an in-flight run

When a delivery run is working on the spec, the run has already stopped: a `spec:*` finding routes it
here (`spec-execution` §8). Before it resumes:

- An `in_progress` step that the change affects is rewritten in the guide. Its branch is either
  rebased onto the amended step or closed and restarted from the integration tip.
- A step the change does not affect keeps its status.
- The run's goal file stays `escalated` until the owner re-approves the plan (Step 8).

## Step 6: Update the guide

Edit `GUIDE.md` and `_index.yaml` in the same commit as the spec:

- **Re-map `Covers:`** so every AC in the amended spec is covered by a step that is not cancelled, and
  no step names an AC the spec no longer defines.
- **Rewrite affected pending steps** to match the new spec.
- **Add a rework step** for merged work the change invalidates. Scope it to the delta only, title it
  "Rework: <original step title> for v<new version>", and give it `After:` on the step it reworks
  when later steps depend on the reworked output.
- **Add a new step** for additive scope, in the position its dependencies need.
- **Cancel an obsolete step** by setting its status to `cancelled` with a `reason:` naming this
  amendment. It stays in both files as the record.
- **Bump `spec_version`** in `GUIDE.md` to the spec's new `version`.
- **Reset `plan_review.approved` to `false`** in `_index.yaml`. The owner re-approves in Step 7.

Then run the validator. It must exit 0 before Step 6b:

```bash
node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-NNN/GUIDE.md
```

## Step 6b: Self-review (mandatory)

Before presenting to the user, verify:

- [ ] The amendment's "What's changing" / "Why" / Changelog entries don't introduce instructions that violate `sdlc-code-standards` — no "leave X deprecated for N cycles," "skip the test because Y," "comment out Z to preserve the old path," or similar. Amendments cannot un-enforce universal standards any more than original specs can. If a genuine exception is needed, document the exact reason.
- [ ] Rework and new guide steps follow the same rule: no `Notes:` instructs a standards violation.
- [ ] The amendment doesn't reintroduce dead code, deprecated-zombies, or similar patterns that this project has committed to retiring.

## Step 6c: Dispatch `spec-reviewer` on the amended spec (mandatory for additive and breaking)

After self-review (Step 6b) and BEFORE presenting to the user in Step 7, DISPATCH the `spec-reviewer` agent on the amended spec. This step runs on every additive and breaking amendment, regardless of size — cosmetic changes (Step 3 short-circuit) skip the reviewer.

**Why this step exists.** The reviewer checks the amended spec against the schema, the authoring conventions, the originating intent, ADRs, and upstream/downstream specs for the 9 gap categories enumerated in `spec-reviewer/SKILL.md`. Amendments are exactly where gaps creep in: ACs get edited but not re-checked for testability, scope shifts but Risks & constraints lags, a design tweak silently contradicts a downstream spec's contract. The reviewer makes those failures visible and grounded so the owner can act on them before the amendment lands.

This is the mirror of the `spec-authoring` Phase 2 invocation (Step 10a there). The reviewer's output is informational; the owner remains the sign-off authority.

**Dispatch, do not invoke.** Call the `Agent` tool with `subagent_type: spec-reviewer`. Both
variants — `default` and `adversarial` — go in ONE message so they run concurrently against the
amended spec.

**The authoring context must never grade its own amendment.** You made this amendment; findings you produce in
this turn are a self-review wearing a reviewer's output format, and the two are byte-identical in
the artifact. The agent has no `Edit`/`Write` and a clean context, which is the whole of what makes
its verdict worth having. If you are about to write findings inline, stop and dispatch.

Seed each dispatch with these inputs (all paths concrete; do not invent them):

- `spec_file`: the amended `specs/SPEC-NNN-<short-description>.md` (post-edit).
- `spec_schema`: `skills/spec-schema.md`.
- `authoring`: `skills/spec-authoring/SKILL.md`.
- `intent`: the intent excerpt the original spec was authored from (still in `specs/intents.md` or its archive).
- `project`: `.ai/project.md`.
- `adrs`: every ADR referenced in the amended Design section, plus any ADR newly superseded or affected by this amendment (Step 3b).
- `upstream_specs`: every spec listed in this spec's `depends_on` (re-read post-amendment; amendments can change `depends_on`).
- `downstream_specs`: every spec that declares this spec in its `depends_on` (use `specs/spec-index.json`). Downstream contradiction probing matters MORE on amendments than on first-draft specs — a contract that was honored at v1 can break at v2.
- `previous_output`: if a prior `spec-reviewer` iteration on this spec is available (e.g., from the original `spec-authoring` Phase 2 invocation or a previous amendment), pass it so nit/suggestion findings on unchanged sections carry forward per the contract in `review-primitives.md`. On the first amendment this is `null`.
- `variant`: omit (defaults to `"default"`).

**Present findings to the owner** alongside the amendment summary in Step 7. Render the JSON output as a graded list: blocker → major → nit → suggestion, with `criterion`, `location`, `finding`, and `suggested_fix`.

**Validate every returned envelope before folding it:**

```bash
node scripts/sdlc/validate-review-envelope.mjs <envelope.json>
```

Exit `0` folds the findings. `2` is an abstention and escalates — never accept it, even with
an empty findings list. `3` is a contract violation: re-dispatch or escalate, never treat it as a
clean review. This is also where a self-review is caught: an envelope with `reviewed_by: inline`
carrying blockers, or carrying none at all, is rejected — an empty envelope is a verdict of
"nothing wrong", so an inline one is a self-accept.

**Apply the routing policy.** Severity → action is defined in [`review-primitives.md`](../review-primitives.md) > Orchestrator severity→action policy — do not duplicate it here. In summary: blockers/majors → `fix_loop`; nits/suggestions → `batch_followup_and_accept` (appended to `spec_followups:` per SPEC-001 Design > Spec followups format); empty → `accept`. Loop with the author to fix or with the owner to override until no un-overridden blockers/majors remain; re-DISPATCH the reviewer agent after edits — a fix round is graded by a fresh agent, never inline — with the prior output as `previous_output`.

**Owner override format.** When the owner judges a finding's severity is too high — e.g., the reviewer flags a workspace-coverage gap that the amendment explicitly leaves for a follow-up spec — the owner downgrades severity by appending a `spec_review_overrides:` entry to the amended spec body. The section lives after `Migration` and before any other appendix, per SPEC-001 Design > Owner override format. Example entry:

```yaml
## spec_review_overrides

- finding_id: F-009
  reviewer_severity: major
  owner_severity: nit
  reason: "Workspace coverage for shared/types is intentionally deferred to SPEC-NNN+1; this amendment scopes only the dealer-app surface."
  override_date: 2026-05-18
```

**Overrides downgrade severity only — they never silence the finding.** The reviewer's original output is preserved in the spec's review log (per SPEC-002 telemetry). The routing policy reads the *override* severity but the review log shows both. An override that removes a finding from the output, or marks it resolved without addressing it, is a SPEC-001 contract violation.

When the routing policy returns `accept` or `batch_followup_and_accept` (after any overrides), proceed to Step 7. The owner's sign-off in Step 7 remains the authority.

### Back-port open clarification gaps

Scan open `clarification` gaps for the parent spec (files in `specs/gaps/` where `spec: SPEC-NNN` and `status: open` and `resolution: clarification`). For each:
- If the gap's resolution is still applicable to the new amendment, incorporate it into the amendment text.
- Set the gap's `back_ported_to: SPEC-NNN-v<new-version>` (use `SPEC-NNN-v1.1` if the parent spec is `status: completed` and uses the Changelog-annotation extension pattern from SPEC-004).
- Set the gap's `status: resolved` and `resolved_date: <today>` and `resolved_by: <amendment commit SHA>` in the gap file.
- List the back-ported gaps in the amendment's commit message (e.g., `closes GAP-001, GAP-002`).

## Step 7: Review with the user

Present the full picture:

1. **The amendment summary** (from Step 3a)
2. **The guide impact table** (from Step 4)
3. **The guide changes** (rewritten, rework, new and cancelled steps)
4. **The rewritten kickoff prompt** (below)

Ask:
- Does the amendment capture the right change?
- Is the guide impact assessment correct?
- Are the new and rework steps scoped correctly?
- Any in-progress work I should handle differently?

**Rewrite the kickoff prompt.** A changed guide or AC set changes the prompt that starts delivery.
Regenerate `specs/tasks/SPEC-NNN/KICKOFF.md` whole from `templates/kickoff.md` against the amended
spec and guide, keep it within **3,800 characters** (Unicode characters, not bytes), and show it to
the owner in full. Validator rule 9 fails an approved guide whose prompt is missing or too long.

**Do not proceed until the user approves.** On approval the owner sets `plan_review.approved: true`
in `_index.yaml`, and `validate-guide.mjs` must exit 0 with it set. Write the `phase:` block with
`current: spec-amendment`, `next_action: spec-execution`, `next_trigger: 'execute SPEC-NNN'`,
`exit_condition_met: true` and `updated`, then set `handoff_surfaced: true` after surfacing the
handoff.

## Step 8: Commit and update Linear

**Commit everything together** — the spec change, `GUIDE.md`, `_index.yaml` and `KICKOFF.md` in one commit:
- Message: `SPEC-NNN v[new]: [amendment summary] (N steps rewritten, M new, K cancelled)`
- If the change is large enough for a PR: branch `amend/SPEC-NNN-v[new]-short-description`

**Update Linear:**
- Update the Linear project description to reference the new spec version
- Add a comment on the Linear project: "Spec amended to v[new]: [summary]"

## Step 9: Resume work

After the amendment is committed and Linear is updated:

1. The owner starts (or resumes) delivery by pasting the rewritten `KICKOFF.md`
2. `spec-execution` re-checks `validate-guide.mjs` and `plan-gate.mjs` and continues at the first
   unfinished step

---

## When to amend vs. when to supersede

| Situation | Action |
|-----------|--------|
| Design tweak discovered during implementation | Amend (this skill) |
| User adds a requirement | Amend (this skill) |
| User changes direction fundamentally | **Supersede** — create a new spec via spec-authoring |
| External shift invalidates most of the design | **Supersede** |
| More than ~50% of steps would need rework | **Supersede** |
| Original spec was the wrong solution to the problem | **Supersede** |

**Superseding means:** Create SPEC-NNN+1 via spec-authoring with `supersedes: SPEC-NNN`. Set the old spec to `status: superseded`. Cancel the old spec's remaining steps. Write a fresh guide for the new spec.

Amending means the spec is still fundamentally right — you're adjusting, not replacing.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Continuing implementation against a known-wrong spec | Stop and amend. Wasted work is worse than a pause. |
| Amending without checking guide impact | Always run Step 4. A "small" spec change can invalidate several steps. |
| Silently editing the guide without the amendment trail | The spec version bump + changelog + commit message create the audit trail. |
| Treating every change as breaking | Classify honestly. Additive changes are lower-friction and don't require rework analysis. |
| Amending when you should supersede | If >50% of steps need rework, the spec is fundamentally wrong. Start over. |
| Forgetting to update `_index.yaml` or `spec_version` | `validate-guide.mjs` fails on a step list that differs from the guide and on a stale `spec_version`. Run it before Step 6b. |
| Leaving the old kickoff prompt | The prompt names the steps and ACs. Rewrite it at re-approval, within 3,800 characters. |

<!-- sdlc:handoff:start -->
<!-- GENERATED from specs/sdlc-state-machine.yaml by scripts/sdlc/gen-handoffs.mjs — do not edit between markers; re-run the generator. -->

## Handoff

This phase is **spec-amendment** in the SDLC state machine (`specs/sdlc-state-machine.yaml`, the single source of truth). The fields below are generated from that file — do not hand-edit them here.

**Entry triggers:**

- the spec assumed X but it is actually Y
- we need to add scope
- this acceptance criterion is untestable
- the design does not work
- the requirements changed

**Preconditions:**

- an active spec is found to be wrong, incomplete, or in need of change mid-flight
- a spec is amendable IFF its status is active or draft — every other status (done, superseded, deprecated, cancelled) is CLOSED and immutable; route a change to a closed spec to a new spec (spec-authoring) or a bug spec under specs/bugs/ instead

**Exit condition:** spec is amended (version bumped), spec-reviewer re-signs off, the guide is updated in the same commit (Covers: re-mapped, spec_version bumped) and passes scripts/sdlc/validate-guide.mjs, KICKOFF.md is rewritten, and the owner re-approves plan_review; an active spec with no guide hands off to "write the guide for SPEC-NNN" instead

**Next step:** `spec-execution` — trigger: "execute SPEC-NNN"
<!-- sdlc:handoff:end -->
