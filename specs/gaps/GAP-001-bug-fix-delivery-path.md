---
id: GAP-001
spec: SPEC-008
title: "No delivery path from a bug spec straight to a guide"
status: open
owner: franklin
created: 2026-09-30
discovered_in: PR-057
resolution: workaround
# Fields below are null while the gap is open; populate on resolution
resolved_date: null
resolved_by: null
back_ported_to: null
---

## Gap

SPEC-008 replaces task files with a delivery guide but never says how a bug is delivered. Before
SPEC-008, `triage.md` had the agent write task files under `specs/tasks/BUG-NNN/`. Under the guide
model that path cannot work: `validate-guide.mjs` resolves the spec as `specs/<id>-*.md`, while bug
specs live in `specs/bugs/` and carry no `version` or `## Acceptance criteria`, and `spec-execution`
requires `status: active`, which no bug status has. CI runs the validator on every
`specs/tasks/*/GUIDE.md`, so a `BUG-NNN` guide would fail every PR. Found by the integration panel
on PR #57, round 2.

## Resolution

Workaround, in `triage.md` stage 8: a bug fix is delivered as its own small fix spec
(`tags: [bug]`, linking the bug spec) with a normal guide, which every existing gate accepts.
Whether bugs should get a lighter, direct path is an owner decision for a follow-up spec.

## Impact

`triage.md` stage 8 and any adopter that delivered bug fixes from `specs/tasks/BUG-NNN/`.
