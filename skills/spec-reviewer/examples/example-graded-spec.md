# Worked example — spec-reviewer graded output

This is a fictional but representative worked example showing the JSON envelope `spec-reviewer` emits per the SPEC-001 contract. The spec, sections, and IDs are illustrative; the JSON shape, severity assignments, and citation prefixes are normative and match `../review-primitives.md` verbatim.

## Fictional draft spec under review

**File:** `specs/SPEC-099-admin-metrics-export.md`
**Title:** "Add metrics export to admin-app"
**Status:** `draft`
**Workspaces (frontmatter):** `[admin-app]` — empty for `shared/`
**Owner:** sample owner

**Summary of contents (excerpts the reviewer is responding to):**

- **Acceptance criteria > AC-001:** "Given an admin user on the dashboard, when they click the new Export button, then a CSV download of the last 30 days of metrics is initiated within 2 seconds."
- **Acceptance criteria > AC-002:** "The export dashboard should feel fast." (No measurement protocol, no observable verification procedure.)
- **Design > Storage adapter:** describes adding a `MetricsExporter` helper to `shared/exporters/metrics.ts` and importing it from `apps/admin-app/src/pages/Dashboard.tsx`. The frontmatter `workspaces:` field lists only `admin-app`; `shared` is not listed even though the design adds a file under `shared/`.
- **Risks & constraints:** present but worded as "Various considerations apply." (Generic / unscoped.)
- **In-scope / Out-of-scope:** In-scope says "Metrics export"; Out-of-scope says "Anything else." (Generic / unscoped, but less severe than AC-002 because spine-graded.)

The reviewer is invoked by `spec-authoring` Phase 2 at the sign-off gate, with `variant: "default"`, and `previous_output: null` (first iteration).

## spec-reviewer JSON output

```json
{
  "artifact": "spec",
  "artifact_id": "SPEC-099",
  "spec_id": "SPEC-099",
  "pr_number": null,
  "tier": 1,
  "findings": [
    {
      "id": "F-001",
      "severity": "blocker",
      "criterion": "spec-authoring:testable-acceptance-criteria",
      "location": "Acceptance criteria > AC-002",
      "finding": "AC-002 'the export dashboard should feel fast' is untestable: 'feel fast' has no observable test, command, or inspection procedure that could verify the criterion is met.",
      "suggested_fix": "Replace with a measurable threshold, e.g. 'Given an admin user on the dashboard, when they click Export, then the download dialog appears within 500ms (p95 over 50 runs on the staging dataset).'",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-002",
      "severity": "major",
      "criterion": "monorepo:workspaces",
      "location": "Frontmatter > workspaces",
      "finding": "The design adds a new file under `shared/exporters/metrics.ts` and imports it from `admin-app`, but the frontmatter `workspaces:` field lists only `admin-app`; `shared` is missing, creating a workspace-coverage gap that hides cross-workspace impact from downstream consumers.",
      "suggested_fix": "Add `shared` to the `workspaces:` frontmatter list and add an AC scoped to the `shared/exporters/metrics.ts` contract (e.g., its public signature and error semantics).",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-003",
      "severity": "nit",
      "criterion": "spec-authoring:risks-and-constraints",
      "location": "Risks & constraints > first paragraph",
      "finding": "The phrasing 'Various considerations apply' does not name any specific risk surface; the section reads as a placeholder rather than a constraint enumeration.",
      "suggested_fix": "Replace with an enumerated list of the actual risk surfaces (e.g., 'CSV size on large dealers; PII in exported rows; rate-limit interaction with the metrics API').",
      "carried_forward_from_previous": false
    },
    {
      "id": "F-004",
      "severity": "nit",
      "criterion": "spec-authoring:in-scope-out-of-scope",
      "location": "In-scope / Out-of-scope",
      "finding": "Both bullets are generic ('Metrics export' / 'Anything else') and do not delineate concrete edges of scope; readers cannot tell whether scheduled exports, multi-format exports, or per-dealer exports are in or out.",
      "suggested_fix": "Name the concrete cases at the edges (e.g., In-scope: 'on-demand CSV export of last 30 days from the dashboard'; Out-of-scope: 'scheduled exports, non-CSV formats, per-dealer drill-downs').",
      "carried_forward_from_previous": false
    }
  ],
  "verification": null,
  "tier_2_dispatch_recommended": []
}
```

Per the shared envelope (see `../review-primitives.md` > Output schema): `pr_number` is `null`, `verification` is `null`, and `tier_2_dispatch_recommended` is `[]` for every spec-side review. These are not "not yet populated" — they are structurally absent for spec artifacts.

## Expected orchestrator action

Per SPEC-001 policy (see `../review-primitives.md` > Orchestrator severity→action policy): `fix_loop` (1 blocker, 1 major; either severity alone is sufficient to trigger the loop). The spec owner can override the blocker via `spec_review_overrides:` appended to the spec body if they genuinely intend AC-002 as an aspirational rather than testable criterion — the override is visible in the spec and never silenced — but the recommended path is to revise AC-002 to be measurable and to add `shared` to the workspaces frontmatter so the cross-workspace impact is declared. On the next iteration the reviewer carries forward F-003 and F-004 only if the byte content of "Risks & constraints > first paragraph" and "In-scope / Out-of-scope" is identical to this revision — otherwise both are re-evaluated.
