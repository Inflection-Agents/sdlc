---
id: ADR-006
title: "A review finding's identity is derived from its content, not its position"
status: proposed
spec: SPEC-007
date: 2026-09-11
author: franklin
superseded_by:
---

## Context

Both reviewers emit the shared envelope in `skills/review-primitives.md` > Output schema, and every
finding in it carries an `id`. The schema types that field as an unconstrained string
(`skills/review-envelope.schema.json`, `properties.findings.items.properties.id`) and the
illustrative envelope shows the ordinal form `"F-001"` (`skills/review-primitives.md:118`, checked at
`a73eeb3`).

Ordinals are positional, and each round is graded by a fresh agent with a clean context, so the
numbering restarts every round. Two contracts are built on top of that unstable id and both are
broken by it:

- **Owner overrides.** `skills/spec-schema.md:141` binds a `spec_review_overrides` entry to
  `finding_id`, "Matches `id` from the `spec-reviewer` JSON output (e.g., `F-003`)." The `F-003` an
  owner overrode in round 1 names a different finding in round 4, so the override does not suppress
  what it was written to suppress, and the finding returns as if it had never been judged.
- **Follow-ups.** `skills/spec-schema.md:155` binds `spec_followups` entries the same way, so a
  deferred nit cannot be traced back to the finding that produced it once another round has run.

The same defect exists PR-side. ADR-004 requires a `## Disclosed, not fixed` block listing findings
that survived three rounds, and with ordinal ids a reader cannot tell whether a survivor is the
finding raised in round 1 or a different one that happens to have landed in the same list position.

An alternative was considered and rejected: keep ordinals and have the orchestrator maintain a
round-to-round mapping table. It puts the burden on the one component that is not independent, adds
state that can desynchronize from the envelopes it describes, and still leaves the id meaningless to
anyone reading a single envelope on its own.

A second alternative, applying stable ids spec-side only, was rejected because it costs a conditional
in `.sdlc/scripts/validate-review-envelope.mjs` and leaves two envelope shapes in a repo whose
`prefix-parity.test.mjs` exists specifically to stop the schema, the validator, and the prose from
drifting apart.

## Decision

**A finding's `id` is derived from its content:**

```
F-<first 8 hex characters of sha256(location_key || NUL || criterion || NUL || finding)>
```

`NUL` is a zero byte, chosen so that field boundaries cannot be forged by field content.

`location_key` is **line-independent**. For a spec finding it is `location` verbatim, a section
heading. For a PR finding it is `location` with any trailing `:line` stripped, leaving the file path.
`skills/review-primitives.md:141` defines PR-side `location` as `file:line`, and hashing that would
mint a new id for an unchanged defect every time an edit shifts a line, which is the normal case
between fix rounds. That would have voided both PR-side benefits this ADR claims below, and with them
the ground for applying the decision to the PR side at all.

This applies to both reviewers and both envelope artifacts, spec-side and PR-side alike. One shape,
one rule.

`review-envelope.schema.json` enforces the form with a `pattern` and makes `id`, `location`,
`criterion` and `finding` **required**, which they are not today: the schema currently requires only
`severity` per finding, so a pattern on an optional field would still admit an envelope with nothing
to bind to. `.sdlc/scripts/validate-review-envelope.mjs` recomputes the hash from the envelope's own
fields, normalizing the `citation` alias into `criterion` first, and rejects the envelope on a
mismatch. Identity is verified rather than self-declared, which matters because `reviewed_by` is already documented as forensics
rather than enforcement (`skills/review-primitives.md` > Reviewer provenance) and a second
self-declared field would carry the same weakness.

The three hashed fields are the ones that define what a finding *is*. `severity` is excluded on
purpose: a reviewer that re-raises the same defect at a different severity, or an owner who
downgrades one, must not thereby mint a new finding. `suggested_fix`, `lens`, and `altitude` are
excluded because they describe how to route or resolve a finding rather than what it is.

SPEC-001 is `status: completed` and closed to amendment, so this lands as an annotation on SPEC-001's
Changelog, on the precedent of its v1.3 entry, which records a change to the live artifact while
stating that it does not rely on the extension pattern. The extension pattern
(`skills/review-primitives.md:42`) charters only new consequence rows and citation prefixes, and a
required-fields change to `review-envelope.schema.json` is neither.

## Consequences

**Good.** An override binds to a finding and stays bound, which is what lets the routing policy
suppress it deterministically instead of asking a clean-context reviewer to honor it voluntarily. A
re-raised finding is visibly the same finding, which turns "the loop is regenerating defects" from an
impression into something a review log can show. ADR-004's disclosed set becomes traceable to the
round that first raised it. The carry-forward contract SPEC-001 AC-008 pins is untouched: this ADR
changes what a finding is called, not when one is carried forward. The id is also meaningful in
isolation: two envelopes from different rounds, different repos, or different reviewers agree on it
without coordination.

**Bad.** Requiring four fields is a breaking schema change. Any envelope carrying only `severity`,
which the current schema permits, is rejected after this lands. Every shipped reviewer agent already
emits all four, so the break is theoretical rather than observed, but it is a break.

**Also bad.** The id is no longer human-friendly. `F-3a9c21b8` is harder to say aloud than `F-003`, and
every override, follow-up, and disclosure entry now carries an opaque token. Envelopes and override
entries written under the ordinal scheme remain valid text but cannot be matched against
content-addressed ones, so history written before this decision does not participate in the
traceability it buys.

**And a sharp edge.** A trivial edit to a finding's own wording changes its id. A reviewer that rephrases the
same defect between rounds mints a new finding, and the override on the old wording does not follow.
The hash makes identity exact rather than approximate, and exactness cuts in both directions; the
review log records both ids in that case, which makes the split visible without resolving it
automatically.
