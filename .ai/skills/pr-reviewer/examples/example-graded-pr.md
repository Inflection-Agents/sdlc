# Worked example — pr-reviewer graded output

This is a fictional but representative worked example showing the JSON envelope `pr-reviewer` emits per the SPEC-001 contract. The PR, files, and IDs are illustrative; the JSON shape, severity assignments, and citation prefixes are normative and match `../review-primitives.md` verbatim.

## Fictional PR under review

**Repo:** `Inflection-Agents/high-gear`
**PR #142:** "Add status filter to InventoryList"
**Branch:** `task/TASK-088-inventory-status-filter`
**Spec:** `SPEC-042` — Dealer-app inventory triage UX
**Task:** `TASK-088` (addresses AC-003: "Given a dealer with inventory of mixed statuses, when the dealer selects a status filter chip, then only vehicles with the selected status are shown in the list within 200ms.")

**Diff summary (~120 lines):**

- `apps/dealer-app/src/components/InventoryList.tsx` — +94 / -8. Adds a `<StatusFilterChips>` row above the list, wires an `useState<Status | null>` for the selected chip, and renders the list. The filter handler stores the selected chip in state but the list mapping never consults that state — every render returns the full `inventory` array regardless of which chip is active. There is also a local helper `formatVin(vin: string)` that re-implements the existing `apps/dealer-app/src/utils/vin.ts` `formatVin` utility character-for-character.
- `apps/dealer-app/src/components/InventoryList.test.tsx` — +18 / -0. Adds one test that asserts the chips render; no test asserts that selecting a chip changes the list contents.

The PR claims to address `TASK-088` AC-003 in its description and is targeted at `main`.

## pr-reviewer JSON output

```json
{
  "artifact": "pr",
  "artifact_id": "TASK-088",
  "spec_id": "SPEC-042",
  "pr_number": 142,
  "tier": 1,
  "findings": [
    {
      "id": "F-001",
      "severity": "blocker",
      "criterion": "AC-003",
      "location": "apps/dealer-app/src/components/InventoryList.tsx:74",
      "finding": "The selected-status state is set by the chip handler but never consulted by the list-mapping JSX, so toggling a chip does not change the visible inventory and AC-003's 'only vehicles with the selected status are shown' clause fails.",
      "suggested_fix": "Filter the inventory array by the selected status before mapping to rows, e.g. `(selectedStatus ? inventory.filter(v => v.status === selectedStatus) : inventory).map(...)`.",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-002",
      "severity": "major",
      "criterion": "sdlc-code-standards:dry",
      "location": "apps/dealer-app/src/components/InventoryList.tsx:112",
      "finding": "The local `formatVin` helper duplicates the existing `formatVin` exported by `apps/dealer-app/src/utils/vin.ts` character-for-character, creating a maintenance trap where future VIN-format changes will silently diverge.",
      "suggested_fix": "Delete the local helper and import `formatVin` from `apps/dealer-app/src/utils/vin.ts`.",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-003",
      "severity": "nit",
      "criterion": "sdlc-code-standards:naming",
      "location": "apps/dealer-app/src/components/InventoryList.tsx:31",
      "finding": "The state variable `chip` is less descriptive than the surrounding code's conventions; sibling components use the `selectedX` prefix for selection state.",
      "suggested_fix": "Rename `chip` / `setChip` to `selectedStatus` / `setSelectedStatus` for consistency with the rest of the file.",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-004",
      "severity": "nit",
      "criterion": "sdlc-code-standards:naming",
      "location": "apps/dealer-app/src/components/InventoryList.test.tsx:9",
      "finding": "The test description 'renders chips' is less informative than the file's existing 'renders <X> when <Y>' pattern and will read awkwardly in test output once a behavior assertion is added.",
      "suggested_fix": "Rename to 'renders status filter chips when inventory has multiple statuses' to match the file's existing test-naming pattern.",
      "carried_forward_from_previous": false
    }
  ],
  "verification": {
    "commands_run": [
      "pnpm -F dealer-app test",
      "pnpm -F dealer-app lint",
      "pnpm -F dealer-app typecheck"
    ],
    "all_passed": true,
    "details": "pnpm -F dealer-app test: 47 passed (no test exercises the filter behavior). pnpm -F dealer-app lint: 0 warnings. pnpm -F dealer-app typecheck: 0 errors."
  },
  "tier_2_dispatch_recommended": ["domain:nextjs"]
}
```

Note that `verification.all_passed` is `true` here even though the PR has a blocker: the existing test suite passes because no test exercises the broken filter behavior. This is exactly the kind of gap the AC-003 finding (F-001) is meant to surface — green tests are not evidence of a met acceptance criterion when the AC's observable behavior is not under test.

`tier_2_dispatch_recommended` is `["domain:nextjs"]` because the diff touches `apps/*/components/**` — see the Tier 2 PR dispatch table in `../SKILL.md`. The orchestrator trusts this list and does not re-evaluate file globs.

## Expected orchestrator action

Per SPEC-001 policy (see `../review-primitives.md` > Orchestrator severity→action policy): `fix_loop` (1 blocker triggers the loop; the major and the two nits ride along in the same iteration). The orchestrator invokes the fix agent with the findings list as `previous_output`. On the next iteration, the reviewer carries forward the two nits IF the files they cite (`InventoryList.tsx` and `InventoryList.test.tsx`) are NOT touched by the fix. Since the fix will almost certainly touch `InventoryList.tsx` to wire the filter through and very likely touch the test file to add a behavior assertion, F-003 and F-004 will be re-evaluated from scratch rather than carried forward.
