---
id: SPEC-007
title: "Spec-review convergence: cap the loop, mechanize the checks, make findings durable"
status: draft
version: 1
supersedes:
initiative: INI-001
owner: franklin
created: 2026-09-11
updated: 2026-09-11
tags: [spec-authoring, spec-review, convergence, throughput, review-primitives]
depends_on: [SPEC-001]
linear_project:
---

## Problem

The spec-side review loop does not terminate. The owner reports 10-15 rounds to reach a clean spec
(owner estimate, 2026-09-11; no instrumented measurement exists, see `## Risks & constraints`).
Spec authoring itself is not the expensive part; the review that follows it is.

This is the same failure ADR-004 diagnosed at the integration gate and fixed there. Its Context
section records one downstream spec running that gate for twenty-six rounds across four days, and
names the mechanism: "The loop was not finding a decreasing series of defects; it generated them at
roughly the rate it closed them. Every round's fixes became the next round's review surface."
ADR-004 capped that gate at three rounds. The cap was never ported one phase upstream, so the spec
gate still runs the loop ADR-004 deleted.

Five defects produce the non-termination. Each is independently verifiable at `a73eeb3`.

**1. The loop has no bound.** `skills/spec-authoring/SKILL.md:330` reads "Continue looping until
there are no remaining un-overridden blockers or majors." `skills/spec-amendment/SKILL.md:323`
carries the same rule for amendments. The routing policy that backs both,
`skills/review-primitives.md:251-252`, is `if blockers: action = "fix_loop"` / `elif majors: action
= "fix_loop"`, with no round counter anywhere in the policy block
(`skills/review-primitives.md:232-263`).

**2. Carry-forward is keyed on section bytes, so every fix reopens its own section.**
`skills/spec-reviewer/SKILL.md:26` carries a `nit` or `suggestion` forward "only when the named spec
section's text bytes are byte-identical to the previous revision (whitespace-significant; line
breaks count)." Fixing a blocker in Design rewrites Design, which drops carry-forward for every
finding located there, and a fresh clean-context reviewer re-reads the whole document and raises
them again alongside new ones. No fixed point exists whenever fixes land in the sections that carry
findings.

**3. Owner overrides do not survive a round.** `skills/spec-schema.md:141` binds an override to
`finding_id`, "Matches `id` from the `spec-reviewer` JSON output (e.g., `F-003`)." The envelope
schema types that `id` as an unconstrained string and requires only `severity` per finding
(`skills/review-envelope.schema.json`, `properties.findings.items.required` is `["severity"]`), and
the illustrative envelope at `skills/review-primitives.md:118` shows the ordinal form `"F-001"`.
Ordinals are minted per round by a fresh agent, so `F-003` in round 4 names a different finding than
`F-003` in round 1. Every override the owner records is silently re-litigated on the next pass.

**4. Step 10a contradicts itself on the adversarial variant.**
`skills/spec-authoring/SKILL.md:294` instructs that both variants "go in ONE message so they run
concurrently against the same draft." Eighteen lines later, `skills/spec-authoring/SKILL.md:312`
instructs "`variant`: omit (defaults to `"default"`). The `"adversarial"` variant is reserved for
the AC-010 measurement protocol." (That names SPEC-001's AC-010, not this spec's.) Under the first
reading every round dispatches a reviewer that
`skills/spec-reviewer/SKILL.md` describes as biasing severity upward on ambiguity-class findings and
biasing missing-migration findings to `blocker`, into a policy that loops on any blocker. That
guarantees a blocker supply for as long as the owner has patience.

**5. Nothing mechanical validates a spec body.** `scripts/sdlc/` holds 13 non-test scripts
(`ls scripts/sdlc/*.mjs | grep -v test | wc -l` at `a73eeb3`), none of which reads a spec body, and
of the 10 named check steps in `.github/workflows/sdlc-validate.yml`, the only one that touches the
spec corpus is the archive-boundary step, which grades where a spec file sits rather than what it
contains (`.github/workflows/sdlc-validate.yml:57-61`). Three of the nine gap categories in
`skills/spec-reviewer/SKILL.md:137-145` > Gap catalog are decidable by a script: missing required
section, unscoped scope where In-scope and Out-of-scope are both empty, and a workspace declared in
frontmatter that no acceptance criterion scopes to. Two further rows of the spec-side consequence
catalog in `skills/review-primitives.md` are equally decidable: a missing or schema-invalid
frontmatter field, and a design that "references a non-existent ADR", which is a file-resolution
check. Every such finding is graded by an LLM today,
re-graded after the next byte change, and costs a round each time.

Compounding all five: the skill instructs the reviewer to be seeded with files this repo does not
have. `specs/spec-index.json` is referenced 35 times across 20 files
(`grep -rn "spec-index.json" --include="*.md" --include="*.mjs" --include="*.yaml" --include="*.sh" .`
at `a73eeb3`), including on six lines of `spec-authoring` alone (63, 65, 72, 146, 150, 311), covering
the Step 2 collision check, both open-PR id checks, id assignment, and the `downstream_specs`
reviewer input. The file does not exist (`ls specs/spec-index.json` at `a73eeb3` matches nothing),
while `skills/spec-schema.md:355` documents its full shape and `skills/spec-schema.md` > Directory
layout declares it "auto-generated, agent-readable". `.ai/project.md`, seeded as a concrete reviewer
input at `skills/spec-authoring/SKILL.md:308`, is likewise absent from this repo at `a73eeb3` (`ls
.ai/` returns `AGENTS.md`, `CLAUDE.md`, `sdlc`, `sdlc.md`, `setup.md`, `skills`). Phase 1 Step 3
gives no research protocol beyond four prose bullets, so each round's author re-derives repo state by
hand, and the reviewer has no record of what was already checked.

Who is affected: every spec author and every spec owner in this framework and in both downstream
consumers, on every spec, before any code is written.

## Success criteria

- [ ] SC-1: The spec-side review loop terminates at a bounded round count on every spec and every
      amendment, with any surviving blocker or major disclosed in the spec body rather than carried
      into another round.
- [ ] SC-2: Across the rounds of a single spec review, the count of **first-appearance findings per
      dispatched reviewer** is non-increasing and strictly decreases at least once. The count comes
      from `specs/review-logs/SPEC-NNN.json` (findings whose `first_round` equals that round),
      divided by the number of reviewers dispatched in that round, which normalizes round 1's second
      reviewer out of the comparison. A review that closes in one round is excluded from the series
      rather than passing vacuously. The owner computes it at `spec-completion` for each spec in the
      measurement window defined in `## Risks & constraints`, and the window extends until two
      multi-round reviews exist.
- [ ] SC-3: For each spec in the measurement window, zero round-1 findings in
      `specs/review-logs/SPEC-NNN.json` carry a `location` and `criterion` naming a defect Lever 2
      lists among the validator's checks. Counted from the log over the same window SC-2 uses.
      Re-running `validate-spec.mjs` on the round-1 draft cannot serve here: AC-010 gates the
      dispatch on that script exiting `0`, so the draft the reviewer saw has already passed it and
      the re-run is guaranteed to pass, which would make this criterion unfalsifiable.
- [ ] SC-4: An owner override or `wontfix` recorded in round N is not routed as a blocker or major in
      any round after N, on any spec, because the routing policy drops it by stable id before
      severity routing.
- [ ] SC-5: Every file that `spec-authoring` names as a concrete reviewer input either resolves in
      this repo or is explicitly marked optional in the skill, with zero unqualified references to a
      path that does not exist.
- [ ] SC-6: A spec review leaves a durable, machine-readable trace: for every spec reviewed after
      this ships, `specs/review-logs/SPEC-NNN.json` exists and records each finding, the round it
      first appeared in, and its resolution.

## Scope

### In scope

- A round cap on the **spec-side** fix loop, in `spec-authoring`, `spec-amendment`, and the shared
  routing policy in `review-primitives.md`, with a disclosure section for survivors.
- `scripts/sdlc/validate-spec.mjs`, wired into the authoring flow before reviewer dispatch and into
  `.github/workflows/sdlc-validate.yml`.
- Resolving the Step 10a variant contradiction and fixing the per-round reviewer count.
- Content-addressed finding identity in `review-envelope.schema.json`,
  `validate-review-envelope.mjs`, `review-primitives.md`, and `spec-schema.md`, for both the
  spec-side and PR-side reviewers, including making the hashed fields required.
- A durable per-spec review log at `specs/review-logs/SPEC-NNN.json` that populates `previous_output`
  and backs deterministic suppression of overridden findings in the routing policy.
- An authoring decision ledger at `specs/decisions/SPEC-NNN.md`, with a template in both
  `templates/` and `init-payload/templates/`, a schema entry, archiver handling, and a new
  `spec-reviewer` input.
- `scripts/sdlc/gen-spec-index.mjs` producing `specs/spec-index.json` in the shape
  `skills/spec-schema.md:355` documents, plus the schema update for the fields this spec adds to it.
- A Phase 1 Step 3 research protocol that records what was searched, including what came back empty.

### Out of scope

- **Cutting spec size.** Proposed and declined by the owner (`specs/decisions/SPEC-007.md` > D-002).
  No size budget, no split-at-N-lines rule. Findings-per-round scales with surface area, so this
  spec accepts a higher per-round finding count than a size cap would give.
- **The PR-side review loop, in every respect.** ADR-004 set the integration gate's cap at three and
  this spec does not reopen it. The `disclose_and_accept` action Lever 1 adds is returned only for
  `artifact: "spec"`, so the action set SPEC-002 > Appendix B enumerates for PR artifacts
  (`fix_loop`, `batch_followup_and_accept`, `accept`, `escalate`) remains exhaustive and unchanged,
  and this spec needs no `depends_on: SPEC-002` edge (`specs/decisions/SPEC-007.md` > D-008). Lever 4
  is the one deliberate exception: it changes the envelope both reviewers emit, and it is scoped to
  finding identity only.
- **Reinstating per-task review.** `specs/intents.md:42` holds the pre-registered trigger for that
  decision: "Reinstate blocker-severity lenses per task, if defects start escaping to the gate." It
  is a separate call on separate evidence.
- **Mechanizing the loop in code.** `specs/intents.md:60` holds a `[deferred]` intent for a
  deterministic plan-review convergence loop (`review-spec.js`) with a code-enforced cap and
  auto-applied implementation-altitude fixes. This spec partially discharges it: the cap ships, at
  four rather than three, enforced in skill prose and the shared routing policy rather than in a
  Workflow script. The auto-apply loop and the code enforcement stay deferred, and that intent stays
  open with its caveat intact, that a port must drive `spec-reviewer`'s knowledge rather than replace
  it with thinner prompts.
- **Changing what the reviewer grades.** The 9-category gap catalog in
  `skills/spec-reviewer/SKILL.md` and the spec-side consequence catalog in
  `skills/review-primitives.md` keep their current contents. This spec changes when, how often, and
  with what memory the reviewer runs, not its grading standard.
- **Retiring the `adversarial` variant.** It keeps its round-1 slot and its SPEC-001 AC-010
  measurement role.
- **Retiring `previous_output`.** SPEC-001's second success criterion requires both reviewers to
  consume the same `previous_output` carry-forward contract and SPEC-001 AC-008 pins that contract's
  two definitions. Lever 5 populates `previous_output` from the review log rather than replacing it, and
  the carry-forward rule itself is untouched (`specs/decisions/SPEC-007.md` > D-009).

## Design

Seven levers, ordered by how much each removes from the loop. Alternatives considered and rejected
are recorded per decision in `specs/decisions/SPEC-007.md`; the two that warrant architecture records
are [ADR-005](adrs/ADR-005-capped-spec-review-loop.md) and
[ADR-006](adrs/ADR-006-content-addressed-finding-identity.md).

### Lever 1: cap the spec-side loop at four rounds

Per ADR-005, the spec-side fix loop runs at most four rounds. A fifth is not run.

The round counter lives in the shared routing policy in `review-primitives.md` > Orchestrator
severity-action policy, which gains a `round` input and a fifth action, `disclose_and_accept`. The
policy already returns four (`accept`, `batch_followup_and_accept`, `fix_loop`, `escalate`).

**`disclose_and_accept` is returned only when `artifact == "spec"`.** For `artifact: "pr"` the
policy's behavior is byte-for-byte what it is today, which is why this lever touches no PR-side
contract: SPEC-002 > Appendix B enumerates the PR-side return set exhaustively and that enumeration
stays true.

Spec-side scoping does **not** settle SPEC-001, which carries the same enumeration one level up. Its
third success criterion reads "An orchestrator policy maps `(severity, count)` tuples to one of:
`fix_loop | batch_followup_and_accept | accept | escalate`. The policy is invocable from
`spec-execution` (PR side) and from `spec-authoring` (spec side) without ambiguity." A fifth
spec-side action extends that set, and `skills/review-primitives.md:5` declares the policy block
"content-equivalent to SPEC-001 > Design", a claim M1 would otherwise falsify. M1 therefore carries
a SPEC-001 Changelog annotation and updates that content-equivalence line to name the spec-side
extension. The precedent is SPEC-001's own Changelog v1.3, which records a change to the live
artifact while stating outright "This is not an extension-pattern change and does not rely on one",
because the extension pattern at `skills/review-primitives.md:41` charters only "New consequence rows
and citation prefixes" and a fifth orchestrator action is neither. The cap is a single constant in the shared policy, and `spec-authoring` and
`spec-amendment` cite it rather than copying it, so AC-003 can require the amendment path to carry
no rule text of its own.

Survivors go into a `## Disclosed, not reviewed-clean` section of the spec body, one entry per
finding, naming its stable `id`, the round it was first raised in, its severity, its grounded
`criterion`, its `location`, and why it was not closed. The id and round are what let a reader join
an entry to the review log and to any override. The owner then signs off with the survivors named in
front of them. This mirrors ADR-004's `## Disclosed, not fixed` block in shape and in intent, and
takes its position in the section order after `## spec_followups` and before `## Changelog`.

A `blocker` that survives four rounds is a real risk, and this lever converts an unbounded grind into
a visible, dated decision the owner makes. That trade is ADR-004's, restated for the spec side.

### Lever 2: `validate-spec.mjs`, before the reviewer sees the draft

`scripts/sdlc/validate-spec.mjs` decides the mechanical share of the gap catalog and reports its
findings in the same envelope shape the reviewer uses, so one routing policy folds both. It checks:

- every required section from `skills/spec-schema.md` > Body structure is present and non-empty;
- the optional sections, when present, appear in the declared order;
- frontmatter carries every required field with a schema-valid value, and `status` is a legal value;
- every `ADR-NNN` referenced in the body resolves to a file under `specs/adrs/`, which the spec-side
  consequence catalog already grades a `blocker` and which is a file-resolution check;
- In-scope and Out-of-scope are both non-empty, and Out-of-scope carries at least two items, per
  `skills/spec-authoring/SKILL.md` > Step 9;
- every workspace in `workspaces:` is named by at least one acceptance criterion, when the field is
  present;
- no placeholder markers (`TBD`, `TODO`, `to be determined`, `XXX`) survive in the body, ignoring
  occurrences inside code spans and fenced blocks, so a spec that names the markers while specifying
  them does not trip its own check;
- every `depends_on` entry resolves via `node scripts/sdlc/resolve.mjs`.

`check-stale-citations.mjs` is the shape to follow: a focused corpus check with its own tests, scoped
by blast radius rather than by document.

**One exit code, two consumers.** The script exits `0` clean and `1` on findings, always, regardless
of the spec's status. At the authoring gate a non-zero exit blocks the `spec-reviewer` dispatch, so
the author fixes first and the reviewer never spends a round on a decidable defect. `Step 10a` runs
on a `status: draft` spec by definition, and the empty-section allowance at
`skills/spec-schema.md:435` ("can be empty only in `draft`") is about what may sit in the repo, not
about what may be sent to a reviewer: a draft complete enough to review is complete enough to pass.
In CI the script runs over the corpus under `--ci`, which maps exit `1` to a warning for a
`status: draft` spec and to a build failure for any other status. The status split lives in the CI
mode only; nothing about the script's own exit code is status-aware.

### Lever 3: one reviewer per round after the first

Round 1 dispatches `default` and `adversarial` concurrently, which is where a second opinion is worth
its cost. Rounds 2 through 4 dispatch `default` only. `skills/spec-authoring/SKILL.md:294` and `:312`
are rewritten to state this once, in one place, resolving the contradiction between them.

The `adversarial` variant keeps its SPEC-001 AC-010 measurement role unchanged. That protocol
dispatches both variants against the same draft by design, and Lever 3 does not touch it.

Because round 1 dispatches two reviewers and later rounds one, SC-2 normalizes its count per
dispatched reviewer. Without that, this lever would manufacture the decline SC-2 is meant to observe.

### Lever 4: content-addressed finding identity

Per ADR-006, a finding's `id` derives from its content rather than its position in a list:

```
F-<first 8 hex of sha256(location_key || NUL || criterion || NUL || finding)>
```

`NUL` is a zero byte, so field boundaries cannot be forged by field content.

**`location_key` is line-independent.** For a spec finding it is the `location` verbatim, a section
heading. For a PR finding it is `location` with any trailing `:line` stripped, leaving the file path.
`review-primitives.md:141` defines PR-side `location` as `file:line`, and hashing that would mint a
new id for an unchanged defect every time an edit shifts a line, which is the normal case between fix
rounds. That would void the very traceability ADR-006 exists to buy.

**The hashed fields become required.** `review-envelope.schema.json` today requires only `severity`
per finding, so a `pattern` on an optional `id` would still admit an envelope with nothing to bind
to. The schema gains `id`, `location`, `criterion`, and `finding` as required, and
`validate-review-envelope.mjs` recomputes the hash from the envelope's own fields and fails on a
mismatch, so identity is verified rather than self-declared. Where a reviewer emits the `citation`
alias instead of `criterion`, the validator normalizes `citation` into `criterion` first and hashes
the normalized value.

`severity` is excluded from the hash on purpose: a reviewer that re-raises the same defect at a
different severity, or an owner who downgrades one, must not thereby mint a new finding.
`suggested_fix`, `lens`, and `altitude` are excluded because they describe how to route or resolve a
finding rather than what it is.

This applies to both reviewers (`specs/decisions/SPEC-007.md` > D-004). SPEC-001 is
`status: completed` and closed to amendment, so M3 annotates its Changelog on the v1.3 precedent
rather than the extension pattern: the pattern charters new consequence rows and citation prefixes,
and a required-fields change to `review-envelope.schema.json` is neither. Making four fields required
is a breaking schema change and is recorded as one in `## Risks & constraints` and in M3's rollback.

### Lever 5: a durable review log

`specs/review-logs/SPEC-NNN.json`, append-only, holds every finding ever raised against that spec
with its stable id, the round it first appeared in (`first_round`), every round it recurred in, and a
`resolution` of `fixed`, `overridden`, `wontfix`, or `open`. The `overridden` and `wontfix` entries
each carry a `reason` and a date.

**`previous_output` stays.** SPEC-001's second success criterion requires both reviewers to consume
the same `previous_output` carry-forward contract, and SPEC-001 AC-008 pins that contract's two
precise definitions, spec-side being section-text-identical. This lever changes neither. The log is the
durable record; `previous_output` remains the transport into each round and is now projected from the
log rather than hand-carried from the previous envelope. The carry-forward rule at
`skills/spec-reviewer/SKILL.md:26` is unchanged. Everything here is additive, which is what makes the
extension pattern legitimate for it (`specs/decisions/SPEC-007.md` > D-009).

**Suppression is deterministic, not voluntary.** An override must not depend on a clean-context
reviewer choosing to honor a log entry, which is the same LLM judgment Lever 2 exists to delete for
decidable checks. The routing policy gains a step before severity routing: drop any finding whose
stable id carries a `wontfix` resolution in the log, and apply the owner's severity to any finding
whose id carries an `overridden` resolution. The finding still appears in the envelope and in the
log, exactly as `spec-schema.md` > `spec_review_overrides` requires; what changes is that it can no
longer route as a blocker after the owner has ruled on it. This is the mechanism that makes SC-4
hold.

**`wontfix` is owner-only and never silent.** It is a stronger authority than anything the corpus
has: `spec-schema.md:143` lets `spec_review_overrides` only downgrade (`owner_severity` "Must be a
lower severity than `reviewer_severity` (this section only downgrades)"), and
`skills/spec-reviewer/SKILL.md:17` states overrides "are visible in the spec, never silenced." A
resolution that drops a finding outright therefore carries three constraints. Only the owner may
record one, never the author and never a reviewer. Each one requires a paired
`spec_review_overrides` entry carrying its reason, so the judgment is visible in the spec body and
not only in the log. And a `wontfix` applied to a `blocker` or `major` is listed in
`## Disclosed, not reviewed-clean` alongside the cap's survivors, which is what keeps SC-1 true for
the class that was suppressed by hand rather than by surviving four rounds
(`specs/decisions/SPEC-007.md` > D-011).

That paired entry cannot be written against the section as it stands: `owner_severity` is required
and must be strictly lower than `reviewer_severity`, so no legal value means "dropped", and a
`wontfix` on a `suggestion` has nothing lower to name. `spec_review_overrides` therefore gains an
optional `resolution: wontfix` field, and when it is present `owner_severity` is omitted rather than
overloaded. The schema change lands in M1 beside the `## Disclosed, not reviewed-clean` entry, since
both are edits to the same optional-sections contract.

The log is also the instrument SC-2, SC-3 and SC-6 measure: rounds, first-appearance findings per
round, and the resolution mix become readable without instrumenting anything further.

### Lever 6: the authoring decision ledger

`specs/decisions/SPEC-NNN.md`, written during Phase 1 as decisions are made, seeded to
`spec-reviewer` as a new input. Format: one entry per genuinely open question, carrying the question,
what was decided, what was rejected and on what grounds, what was deliberately left ambiguous, and
who raised it. `specs/decisions/SPEC-007.md` is the worked example and was written before this spec
body.

Phase 1 produces nothing durable today. The brainstorming lives in the conversation, and
`skills/spec-authoring/SKILL.md` > Step 9 states the consequence directly: `spec-reviewer` "is seeded
only by the artifacts listed in its Inputs, never the author's reasoning." So every judgment call,
every rejected alternative, and every deliberate ambiguity is invisible to the reviewer, which is why
the reviewer reopens them. A ledger is cheaper than re-arguing.

The `specs/decisions/` subdirectory is not cosmetic. `scripts/sdlc/archive-specs.mjs:40` filters the
live corpus with `SPEC_FILE = /^spec-\d+.*\.md$/i`, which a top-level `specs/SPEC-NNN.decisions.md`
would match; the scan at line 171 is non-recursive, so a subdirectory keeps the sidecar out of the
spec enumeration entirely. Archiving it alongside its spec is therefore explicit work, not a
side effect: the archiver gains handling for `specs/decisions/` and `specs/review-logs/`, covered by
AC-023.

The template carries one rule the ledger's position makes necessary: the ledger is written before the
spec body exists, so any acceptance criterion it names must be re-checked whenever the spec's AC list
is renumbered. Three rounds of this spec's own review each broke a ledger cross-reference that way,
which is the cheapest possible evidence that the rule belongs in the template rather than in an
author's memory. Prefer naming a criterion by what it requires over naming it by number.

The ledger ships as a template in both `templates/authoring-decisions.md` and
`init-payload/templates/authoring-decisions.md`. The two trees are mirrored with no parity check in
CI, so a template added only to `templates/` never reaches a plugin-installed consumer.

This is deliberately not `templates/decisions.md`. That file is the per-run execution log
`spec-execution` creates at `specs/tasks/SPEC-NNN/DECISIONS.md` (`skills/spec-schema.md` >
`DECISIONS.md`, the per-run decision log), and it records what the executor decided while building.
The ledger here records what the author decided before building. Same insight, one phase earlier,
different file.

### Lever 7: `spec-index.json` and a research protocol

`scripts/sdlc/gen-spec-index.mjs` generates `specs/spec-index.json` in the shape
`skills/spec-schema.md:355` already documents: a `specs[]` array carrying id, title, status, version,
path, initiative, tags, `acceptance_criteria_count`, `acceptance_criteria_done` and `gaps[]`, plus
top-level `adrs`, `bugs` and `gaps` arrays. Three fields are added to that documented shape, because
`spec-authoring` needs them and cannot get them from it today: `owner`, `workspaces`, and
`depends_on`, the last being what the `downstream_specs` reviewer input at
`skills/spec-authoring/SKILL.md:311` requires. The `skills/spec-schema.md` entry is updated in the
same milestone, so the generator and the documented contract agree.

`depends_on` needs one further schema edit. It is not a declared frontmatter field: the Field rules
table in `skills/spec-schema.md` enumerates thirteen fields and `depends_on` is not among them
(`grep -c depends_on skills/spec-schema.md` returns `0` at `a73eeb3`), yet SPEC-002, SPEC-006 and
this spec all carry it. M4 adds it to that table alongside the index-shape update, so the validator
check in Lever 2 and the generator field in this lever both rest on a defined field.

`archive-specs.mjs` and `complete-spec.mjs` already parse spec frontmatter, so the parsing exists and
the generator reuses it. A `--check` mode fails CI when the committed index does not match what the
corpus would generate, following `gen-handoffs.mjs --check`.

Every reviewer input `spec-authoring` names is then audited. An input that cannot resolve in a given
repo is marked optional in the skill text, so the reviewer is told the file is absent rather than
instructed to read something that is not there. `.ai/project.md` is the live instance: absent here,
present in a bootstrapped consumer repo.

Phase 1 Step 3 gains a research protocol, a fixed question list answered in one fan-out rather than
iterative grep, with results written to a `## Research` section of the decision ledger. The protocol
records negative results, "grepped X across `skills/` and `agents/`, zero hits, at `<ref>`", because
a negative result is the expensive thing to re-derive and the citation rule at
`skills/spec-authoring/SKILL.md` > Step 3 currently gives it nowhere to live. Every citation names
the git ref it was checked against, which that rule already requires for existence claims and which
makes the claims lintable later.

## Acceptance criteria

- [ ] AC-001: Given a spec review in round 4 with an un-overridden blocker, when the routing policy
      runs, then it returns `disclose_and_accept` and not `fix_loop`, and no round 5 is dispatched.
- [ ] AC-002: Given a spec review that reaches the cap with surviving blockers or majors, or that
      records a `wontfix` on a blocker or major in any round, when the
      loop exits, then the spec body carries a `## Disclosed, not reviewed-clean` section with one
      entry per survivor naming its stable `id`, the round it was first raised in, its severity, its
      `criterion`, its `location`, and the reason it was not closed.
- [ ] AC-003: Given `spec-amendment` running its post-amendment review, when a blocker survives four
      rounds, then it discloses exactly as AC-001 and AC-002 specify, with no separate rule text of
      its own and no second copy of the cap constant.
- [ ] AC-004: Given the routing policy invoked with `artifact: "pr"` at any round, then it never
      returns `disclose_and_accept`, and its returned action is one of the four SPEC-002 > Appendix B
      enumerates.
- [ ] AC-005: Given a `wontfix` resolution recorded in a review log, then it was recorded by the
      owner and not by the author or a reviewer, and a `spec_review_overrides` entry exists for the
      same finding id carrying `resolution: wontfix` and a reason, with `owner_severity` omitted.
- [ ] AC-006: Given `skills/spec-schema.md`, then it declares `## Disclosed, not reviewed-clean` as
      an optional appended section, with its fields and its position in the section order (after
      `## spec_followups`, before `## Changelog`), and `validate-spec.mjs` enforces that position.
- [ ] AC-007: Given a spec missing a required section, with frontmatter lacking a required field,
      citing an `ADR-NNN` with no matching file, or containing a placeholder marker in prose, when
      `node scripts/sdlc/validate-spec.mjs <file>` runs, then it exits non-zero and reports one
      envelope finding per defect; given the same markers appearing only inside code spans or fenced
      blocks, then no placeholder finding is reported.
- [ ] AC-008: Given a spec with optional sections out of the order `skills/spec-schema.md` declares,
      a frontmatter field carrying a schema-invalid value or an illegal `status`, an empty In-scope
      or an Out-of-scope with fewer than two items, a `workspaces:` entry named by no acceptance
      criterion, or a `depends_on` entry that `node scripts/sdlc/resolve.mjs` cannot resolve, when
      `validate-spec.mjs` runs, then it exits non-zero and reports one envelope finding per defect.
      Together with AC-007 this covers all eight checks Lever 2 lists.
- [ ] AC-009: Given a schema-valid spec with no mechanical defects, when `validate-spec.mjs` runs,
      then it exits `0` and emits an empty findings list.
- [ ] AC-010: Given `validate-spec.mjs` exits non-zero on a draft, when `spec-authoring` reaches Step
      10a, then it does not dispatch `spec-reviewer` until the script exits `0`.
- [ ] AC-011: Given `node scripts/sdlc/validate-spec.mjs --ci` runs over the corpus, when a
      `status: draft` spec has a mechanical defect, then the defect is reported as a warning and the
      command exits `0`; when a spec at any other status has one, then the command exits non-zero.
- [ ] AC-012: Given round 1 of a spec review, then exactly two reviewers are dispatched (`default`
      and `adversarial`); given any round from 2 to 4, then exactly one is dispatched (`default`),
      except when the SPEC-001 AC-010 measurement protocol is being run, which dispatches both
      variants in whichever round it runs against.
- [ ] AC-013: Given `skills/spec-authoring/SKILL.md`, when its variant-dispatch instructions are read
      end to end, then they state the per-round reviewer count once and no two passages contradict
      each other on it.
- [ ] AC-014: Given two reviewer envelopes produced in different rounds that each contain a finding
      with identical `location_key`, `criterion`, and `finding`, then both envelopes carry the
      identical `id`; given any two findings differing in any of those three values, then their ids
      differ.
- [ ] AC-015: Given a PR finding whose `location` is `src/a.ts:40` in one round and `src/a.ts:57` in
      the next, with `criterion` and `finding` unchanged, then its `id` is identical in both rounds.
- [ ] AC-016: Given an envelope whose `findings[].id` does not equal the hash recomputed from its own
      `location_key`, `criterion`, and `finding`, or which omits any of `id`, `location`, `criterion`
      or `finding`, when `node scripts/sdlc/validate-review-envelope.mjs` runs on it, then it exits
      non-zero.
- [ ] AC-017: Given a finding whose `criterion` is absent but whose `citation` alias is present, when
      the validator recomputes the hash, then it normalizes `citation` into `criterion` and the
      recomputed id matches.
- [ ] AC-018: Given a finding recorded in the review log with `resolution: wontfix`, when the routing
      policy runs on a later round's envelope containing that id, then the finding is dropped before
      severity routing; given `resolution: overridden`, then the owner's severity is applied in place
      of the reviewer's before severity routing.
- [ ] AC-019: Given a completed spec review, then `specs/review-logs/SPEC-NNN.json` exists and
      records, for every finding raised in any round, its stable id, `first_round`, every round it
      recurred in, and a `resolution` of `fixed`, `overridden`, `wontfix`, or `open`, with a `reason`
      on the `overridden` and `wontfix` entries.
- [ ] AC-020: Given a round after the first, when `spec-reviewer` is dispatched, then its
      `previous_output` is projected from `specs/review-logs/SPEC-NNN.json`, and the carry-forward
      rule applied is the section-text-identical rule SPEC-001 AC-008 pins, unchanged.
- [ ] AC-021: Given a spec authored under the new flow, then `specs/decisions/SPEC-NNN.md` exists,
      conforms to `templates/authoring-decisions.md`, and is listed among the inputs `spec-authoring`
      seeds to `spec-reviewer`.
- [ ] AC-022: Given `templates/authoring-decisions.md`, then a byte-identical copy exists at
      `init-payload/templates/authoring-decisions.md`.
- [ ] AC-023: Given a spec whose status reaches a terminal value, when
      `node scripts/sdlc/archive-specs.mjs` runs, then its `specs/decisions/SPEC-NNN.md` and
      `specs/review-logs/SPEC-NNN.json` move with it and the live corpus retains neither.
- [ ] AC-024: Given the spec corpus, when `node scripts/sdlc/gen-spec-index.mjs` runs, then
      `specs/spec-index.json` matches the shape documented at `skills/spec-schema.md` >
      `spec-index.json`, including the `owner`, `workspaces` and `depends_on` fields this spec adds
      to that documented shape.
- [ ] AC-025: Given a committed `specs/spec-index.json` that does not match the corpus, when
      `node scripts/sdlc/gen-spec-index.mjs --check` runs, then it exits non-zero.
- [ ] AC-026: Given `skills/spec-authoring/SKILL.md`, then every file path it names as a concrete
      reviewer input either resolves at the repo root or is explicitly marked optional at the point
      it is named.
- [ ] AC-027: Given Phase 1 Step 3 research on any spec, then the resulting `## Research` section of
      the decision ledger records each question asked, the command or path that answered it, and the
      git ref it was checked against, including entries for searches that returned no results.

## Risks & constraints

- **No instrumented baseline exists.** The 10-15 round figure is the owner's estimate, not a
  measurement. `specs/gaps/` does not exist, no review log exists, and only `SPEC-001` and `SPEC-006`
  carry a `## spec_followups` section, so the corpus holds no round history to reconstruct one from.
  SC-2 and SC-3 are therefore measured forward, against the log this spec creates. Nothing here can
  be validated retroactively.
- **A cap can truncate rather than converge.** Four rounds bound the cost; they do not prove the loop
  was converging. This is why SC-2 measures first-appearance findings per dispatched reviewer and not
  the round count, which the cap makes true by construction
  (`specs/decisions/SPEC-007.md` > D-006). If that series stays flat, the cap is hiding the problem
  and the levers behind it have not worked.
- **A blocker can now reach sign-off unfixed.** ADR-005 accepts the same residual risk ADR-004
  accepted at the integration gate, one phase earlier, where the artifact is cheaper to change but
  the error propagates further, since every task decomposed from the spec inherits it. The disclosure
  section and the owner's signature are the control.
- **Lever 4 is a breaking schema change.** Making `id`, `location`, `criterion` and `finding`
  required rejects any envelope a reviewer emits with only `severity`, which the current schema
  permits. Every shipped reviewer agent already emits all four, and
  `scripts/sdlc/validate-review-envelope.test.mjs` plus `scripts/sdlc/prefix-parity.test.mjs` hold
  the schema, the validator and the prose in agreement, so the change is covered by existing tests.
  It still lands on the PR-side path, which has no current defect; that reach is deliberate and
  recorded (`specs/decisions/SPEC-007.md` > D-004, D-008).
- **Collision with SPEC-003.** SPEC-003 is the only spec at `status: active`
  (`grep -m1 '^status:' specs/SPEC-*.md` at `a73eeb3`) and its scope includes `bootstrap.sh` and the
  reference docs. Levers 2, 6 and 7 add scripts and a template that `bootstrap.sh` must copy and that
  `skills.md` documents. The overlap is additive and confined to a copy list, so the two can proceed
  in parallel; whichever lands second reconciles the list. Being `active`, SPEC-003 is also the one
  live spec that `validate-spec.mjs --ci` will grade as a failure rather than a warning, so M2
  includes bringing it to passing.
- **Seven levers in one spec.** Proposed as two and decided as one
  (`specs/decisions/SPEC-007.md` > D-001). The milestone ordering in `## Migration` preserves the
  sequencing. The residual risk is that a single integration PR carries all seven, which is the
  review-cost problem this spec exists to reduce, applied to itself.
- **Behavioral guardrail.** This spec changes a gating rule, so per
  `skills/spec-authoring/SKILL.md` > Step 9 it declares one. **Metric:** spec-review defect escape
  rate per spec, computed as the count of `spec:*`-prefixed findings in that spec's integration-gate
  panel envelopes plus the count of `GAP-NNN` artifacts filed under `specs/gaps/` during its
  delivery. **Baseline:** the first spec that runs end to end under the new loop. **Measurement
  window:** the two specs delivered end to end *after* the baseline spec, so the baseline spec is
  never compared against itself. **Regression threshold:** either windowed spec exceeding the
  baseline value. **Trigger evaluation:** owner-evaluated at `spec-completion`, not automatic. No
  roll-up tooling exists to compute this across specs, and building it is a separate `[deferred]`
  intent in `specs/intents.md`; claiming an automatic trigger would be claiming a computation nothing
  performs. **Armed rollback:** revert the `round` input and the `disclose_and_accept` branch in
  `review-primitives.md` > Orchestrator severity-action policy, restoring the unbounded loop. The cap
  exists only there, so that single revert is the whole rollback. Levers 2 and 4 through 7 are
  additive and are not reverted by this trigger.
- **The guardrail's trigger is not automatic, and that is a declared deviation.**
  `skills/spec-authoring/SKILL.md` > Step 9 asks for "an automatic trigger condition", and
  `skills/spec-completion/SKILL.md:24` is harder still: a behavioral change "is not complete until it
  has a declared guardrail (baseline + threshold), a realized measurement on the first production
  exposure, and an armed rollback with an automatic trigger", adding that a deferral "does not
  satisfy this". Nothing computes this spec's metric across specs, and the roll-up tooling that would
  is a separate `[deferred]` intent, so an automatic trigger would be a claim about a computation
  that does not exist. SPEC-007 therefore declares the deviation here rather than meeting it at the
  completion gate by surprise: the owner's evaluation at `spec-completion` Step 5a stands in for the
  automatic trigger, and closing SPEC-007 requires the owner to record that substitution explicitly.
  Every other element Step 9 enumerates — metric, baseline, threshold, window, revert artifact — is
  present and unwaived.

## Migration

### Current state

An unbounded spec-side fix loop (`skills/spec-authoring/SKILL.md:330`,
`skills/spec-amendment/SKILL.md:323`) driven by a routing policy with no round counter
(`skills/review-primitives.md:251-252`), fed by ordinal finding ids
(`skills/review-primitives.md:118`) in an envelope that requires only `severity`, carrying one round
of history hand-passed via `previous_output`, with no mechanical validation of a spec body, no
`specs/spec-index.json`, and no durable record of Phase 1 decisions.

### Target state

The same loop bounded at four rounds on the spec side only, with survivors disclosed in the artifact,
fed by content-addressed ids the validator verifies against required fields, carrying full history in
a per-spec review log that projects `previous_output` and deterministically suppresses overridden
findings, gated behind a mechanical validator that decides the deterministic gap categories, and
seeded from a generated spec index plus an authoring decision ledger.

### Migration strategy

Four milestones, in dependency order. Each lands on the integration branch and is independently
useful if the ones after it are delayed.

- **M1, termination.** Levers 1 and 3: the cap constant, the `round` input, the spec-only
  `disclose_and_accept` action, the `## Disclosed, not reviewed-clean` section with its schema entry
  and position constraint, the `resolution: wontfix` field on `spec_review_overrides`, the Step 10a
  variant fix, and the SPEC-001 Changelog annotation plus the `review-primitives.md:5`
  content-equivalence update. ADR-005. This alone bounds the cost of every
  subsequent round.
- **M2, mechanical absorption.** Lever 2: `validate-spec.mjs`, its tests, its dispatch-blocking
  wiring in `spec-authoring`, its `--ci` mode and CI step, and bringing SPEC-003 to passing.
- **M3, durable memory.** Levers 4 and 5: content-addressed ids with the required-field schema change
  and the line-independent `location_key`; the review log; the `previous_output` projection; the
  deterministic suppression step in the routing policy. ADR-006, plus the SPEC-001 Changelog
  annotation the extension pattern requires.
- **M4, grounded inputs.** Levers 6 and 7: the ledger template in both template trees, its schema
  entry, archiver handling for `specs/decisions/` and `specs/review-logs/`, and the bootstrap copy
  line; the spec-index generator with `--check`, its CI step, and the `skills/spec-schema.md` index
  shape update; the reviewer-input audit; the Step 3 research protocol.

Existing specs are not backfilled. `SPEC-001` through `SPEC-006` have no decision ledger and no
review log. Five of the six are at a terminal status and closed to editing, so `validate-spec.mjs
--ci` grades them at their status: a terminal-status spec that fails is fixed only if it is reopened
by amendment. SPEC-003 is the exception, being `active`, and M2 brings it to passing rather than
carving it out.

### Rollback plan

Each milestone is independently revertible.

- M1 reverts by removing the `round` input and the `disclose_and_accept` branch from the routing
  policy. The cap exists in exactly one place, so there is nothing else to undo. Any
  `## Disclosed, not reviewed-clean` section already written stays as history; the schema keeps the
  optional section so those specs stay valid.
- M2 reverts by removing the CI step and the dispatch-blocking line. The script can stay in the tree
  unused, since nothing else calls it.
- M3 carries the only data-format change, and it reverts in two parts. Removing the `pattern` on
  `findings[].id` and the recomputation check in `validate-review-envelope.mjs` accepts both id forms
  again, so envelopes and override entries written under either scheme stay valid. Reverting the
  required-field change is a separate edit to `review-envelope.schema.json` and is what must happen
  first if a reviewer starts emitting envelopes the new schema rejects. Review logs already written
  remain readable and are simply no longer projected into `previous_output`.
- M4 reverts by deleting `specs/spec-index.json` and the generator's CI step. The skill text
  referencing the index returns to its current state, which is the pre-existing defect, not a new
  one.

## spec_followups

Nit findings from the round-4 review, deferred per the orchestrator's routing policy. Ordinal ids are
scoped by `source_review` because content-addressed ids (Lever 4) are not yet implemented, which is
itself an instance of the problem this spec exists to fix.

```yaml
- finding_id: F-003
  source_review: "spec-reviewer round 4, default variant, 2026-09-11"
  severity: nit
  criterion: "SPEC-001:Changelog"
  location: "Migration > Migration strategy (M3) and ADR-006 > Decision"
  finding: "Round 3's extension-pattern correction landed in Lever 1 and Lever 4 but not in M3's bullet or ADR-006's closing Decision paragraph, which still name the extension pattern as the authority the spec body now rejects."
  deferred_date: 2026-09-11
  resolved: false
  resolved_date:
  resolved_by:

- finding_id: F-004
  source_review: "spec-reviewer round 4, default variant, 2026-09-11"
  severity: nit
  criterion: "spec-schema:spec_review_overrides"
  location: "specs/decisions/SPEC-007.md > D-011"
  finding: "The ledger cites `spec-schema.md:141` for the downgrade-only rule; :141 is the `finding_id` row and the rule is on :143. The spec body was corrected in round 4 and the ledger was not."
  deferred_date: 2026-09-11
  resolved: false
  resolved_date:
  resolved_by:

- finding_id: F-005
  source_review: "spec-reviewer round 4, default variant, 2026-09-11"
  severity: nit
  criterion: "spec-schema:Acceptance criteria"
  location: "Design > Lever 1: cap the spec-side loop at four rounds"
  finding: "Lever 1 does not say whether the policy's new `round` input is optional on a PR-side invocation, so SPEC-002 > Appendix B's one-argument call site `apply_spec_001_policy(all_findings)` is not literally satisfied by the text, weakening the checkability of the no-PR-side-contract claim."
  deferred_date: 2026-09-11
  resolved: false
  resolved_by:
```

## Disclosed, not reviewed-clean

Two `major` findings were open when the review reached the four-round cap (ADR-005). They are
disclosed here rather than carried into a fifth round. The owner signs off with them visible.

Both were raised in round 4 and neither survived multiple rounds; each is a consequence of a
round-3 fix rather than a defect the loop failed to close. Round trajectory, blockers then majors:
2/11 → 0/4 → 0/2 → 0/2.

| id | severity | criterion | location | finding | why not closed |
|---|---|---|---|---|---|
| F-001 | major | `spec-schema:spec_review_overrides` | Design > Lever 5 | AC-018 requires the routing policy to apply the owner's severity for an `overridden` finding, but neither Lever 5 nor AC-019 puts a severity field in the review log, so the only copy of `owner_severity` lives in the spec body's `spec_review_overrides` section and nothing states that the policy joins to it. Two reasonable data contracts follow and the spec picks neither. | Reached at the cap. The fix is a one-line choice (add `owner_severity` to the log entry, or state the join by `finding_id`), but making it would be an unreviewed design decision on the `wontfix`/`overridden` plumbing that rounds 2, 3 and 4 have each already revised. It belongs to the owner, or to the first task under M3. |
| F-002 | major | `ADR-006` | Risks & constraints | The residual risk ADR-006 records in its own Consequences — a reviewer that rephrases a defect between rounds mints a new id, so the override does not follow it — is absent from `## Risks & constraints`, and SC-4 is stated as an absolute the mechanism can only deliver when the later round reproduces the earlier round's sentence. | Reached at the cap. The finding is correct and the gap is real: ADR-006 names the risk, the spec does not surface it, and SC-4 overclaims. Closing it means softening a success criterion, which is an owner decision at the sign-off gate rather than an author's edit in an ungraded round. |

Both are `altitude: design` and neither blocks task decomposition. F-001 is a data-contract choice that
M3's first task must settle regardless. F-002 is a wording-strength question about SC-4 plus a missing
risk bullet.
