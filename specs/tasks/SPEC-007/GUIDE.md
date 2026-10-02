---
spec: SPEC-007
spec_version: 1
---

## Steps

### S1: Cap the spec-side loop at four rounds
- Covers: AC-001, AC-002, AC-003, AC-004
- Changes: `skills/review-primitives.md`, `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`, `skills/spec-schema.md`, `specs/SPEC-001-tiered-code-review.md` (Changelog only), `init-payload/.sdlc/contracts/review-primitives.md`
- Verify: `rg -n 'disclose_and_accept' skills/review-primitives.md skills/spec-authoring/SKILL.md skills/spec-amendment/SKILL.md`, `rg -n 'Worked trace' skills/review-primitives.md` (two traces: a round-4 spec blocker returning `disclose_and_accept`, and a round-4 PR blocker returning `fix_loop`), `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/prefix-parity.test.mjs .sdlc/scripts/validate-plugin-manifest.test.mjs`, `node .sdlc/scripts/gen-handoffs.mjs --check`
- Risk: medium
- Notes: the cap is one constant in the policy block of `review-primitives.md`. `spec-authoring` and `spec-amendment` cite it and copy no rule text (AC-003). `round` is optional, and without it the policy is unchanged, so the PR-side call in SPEC-002 Appendix B stays valid. Declare `## Disclosed, not reviewed-clean` and `resolution: wontfix` in `spec-schema.md` here; S3 enforces the section position.

### S2: One reviewer per round after the first
- Covers: AC-012, AC-013
- Changes: `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`, `skills/review-primitives.md`, `init-payload/.sdlc/contracts/review-primitives.md`
- Verify: `rg -n 'adversarial' skills/spec-authoring/SKILL.md`, `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/prefix-parity.test.mjs`
- After: S1
- Notes: state the per-round count once, in Step 10a, and delete the contradicting line 312 wording. Keep the SPEC-001 AC-010 measurement exception.

### S3: validate-spec.mjs before the reviewer, and in CI
- Covers: AC-006, AC-007, AC-008, AC-009, AC-010, AC-011
- Changes: `scripts/sdlc/validate-spec.mjs`, `scripts/sdlc/validate-spec.test.mjs`, `init-payload/.sdlc/scripts/validate-spec.mjs`, `scripts/sdlc/lib/released-payloads.json`, `.github/workflows/sdlc-validate.yml`, `init-payload/.github/workflows/sdlc-validate.yml`, `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`, `skills/spec-schema.md`
- Verify: `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/validate-spec.test.mjs .sdlc/scripts/validate-plugin-manifest.test.mjs`, `node .sdlc/scripts/validate-spec.mjs --ci`, `node .sdlc/scripts/validate-spec.mjs specs/SPEC-007-spec-review-convergence.md`, `node .sdlc/scripts/gen-released-payloads.mjs --check`, `node .sdlc/scripts/scan-legacy-paths.mjs --only hooks,scripts/sdlc --no-allow`
- After: S1
- Notes: findings use the review envelope shape, so one routing policy folds both. Add the `depends_on` row to `spec-schema.md` > Field rules here. Reuse `validate-guide.mjs`'s acceptance-criteria parser. Take `--root` and resolve paths through `lib/sdlc-paths.mjs`, as every SPEC-009 validator does. Skills call it through `run.mjs`. Follow `check-stale-citations.mjs` for shape.

### S4: Content-addressed finding ids
- Covers: AC-014, AC-015, AC-016, AC-017
- Changes: `skills/review-envelope.schema.json`, `init-payload/.sdlc/contracts/review-envelope.schema.json`, `scripts/sdlc/validate-review-envelope.mjs`, `scripts/sdlc/validate-review-envelope.test.mjs`, `init-payload/.sdlc/scripts/validate-review-envelope.mjs`, `scripts/sdlc/lib/released-payloads.json`, `skills/review-primitives.md`, `init-payload/.sdlc/contracts/review-primitives.md`, `skills/spec-schema.md`, `skills/spec-reviewer/SKILL.md`, `skills/pr-reviewer/SKILL.md`, `agents/*.md`, `skills/*/examples/*.md`, `specs/SPEC-001-tiered-code-review.md` (Changelog only)
- Verify: `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/validate-review-envelope.test.mjs .sdlc/scripts/prefix-parity.test.mjs .sdlc/scripts/reviewer-routing.test.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S1
- Risk: high
- Notes: a breaking schema change for both reviewers. A model cannot compute sha256 by hand, so give the validator a `--stamp` mode that writes each finding's id from its own fields; the orchestrator stamps and then validates, and the reviewer's own id is never trusted. Update every example envelope so it validates.

### S5: The durable review log, projection and suppression
- Covers: AC-005, AC-018, AC-019, AC-020
- Changes: `scripts/sdlc/review-log.mjs`, `scripts/sdlc/review-log.test.mjs`, `init-payload/.sdlc/scripts/review-log.mjs`, `scripts/sdlc/lib/released-payloads.json`, `skills/review-primitives.md`, `init-payload/.sdlc/contracts/review-primitives.md`, `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`, `skills/spec-schema.md`, `.github/workflows/sdlc-validate.yml`
- Verify: `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/review-log.test.mjs`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S4
- Risk: medium
- Notes: `review-log.mjs` appends a stamped envelope for a round, projects `previous_output`, and records an owner's `overridden` (with `owner_severity`) or `wontfix`. It refuses a resolution whose `recorded_by` is not the spec's `owner`, or that the spec body's `spec_review_overrides` does not already show with the same value (AC-005, D-017). The suppression step in the policy reads the log only (D-013).

### S6: The authoring decision ledger
- Covers: AC-021, AC-022, AC-023
- Changes: `.sdlc/templates/authoring-decisions.md`, `init-payload/.sdlc/templates/authoring-decisions.md`, `skills/spec-schema.md`, `skills/spec-authoring/SKILL.md`, `skills/spec-reviewer/SKILL.md`, `agents/spec-reviewer.md`, `scripts/sdlc/archive-specs.mjs`, `scripts/sdlc/archive-specs.test.mjs`, `init-payload/.sdlc/scripts/archive-specs.mjs`, `scripts/sdlc/lib/released-payloads.json`
- Verify: `diff -rq .sdlc/templates init-payload/.sdlc/templates`, `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/archive-specs.test.mjs .sdlc/scripts/install-payload.test.mjs`, `node .sdlc/scripts/archive-specs.mjs --check`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S5
- Notes: the archiver moves `specs/decisions/SPEC-NNN.md` and `specs/review-logs/SPEC-NNN.json` under `specs/archive/` with their spec, and restores them with it.

### S7: The spec index
- Covers: AC-024, AC-025
- Changes: `scripts/sdlc/gen-spec-index.mjs`, `scripts/sdlc/gen-spec-index.test.mjs`, `init-payload/.sdlc/scripts/gen-spec-index.mjs`, `scripts/sdlc/lib/released-payloads.json`, `specs/spec-index.json`, `skills/spec-schema.md`, `.github/workflows/sdlc-validate.yml`, `init-payload/.github/workflows/sdlc-validate.yml`
- Verify: `env -u CLAUDE_PROJECT_DIR node --test .sdlc/scripts/gen-spec-index.test.mjs`, `node .sdlc/scripts/gen-spec-index.mjs --check`, `node .sdlc/scripts/gen-released-payloads.mjs --check`
- After: S3
- Notes: reuse the frontmatter parsing `archive-specs.mjs` and `complete-spec.mjs` already have. Index archived specs too, with their `path` under `specs/archive/`.

### S8: Reviewer inputs that resolve, and the research protocol
- Covers: AC-026, AC-027
- Changes: `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`, `.sdlc/templates/authoring-decisions.md`, `init-payload/.sdlc/templates/authoring-decisions.md`
- Verify: `diff -rq .sdlc/templates init-payload/.sdlc/templates`, `rg -n 'optional' skills/spec-authoring/SKILL.md`, `node .sdlc/scripts/gen-handoffs.mjs --check`
- After: S6, S7
- Notes: `AGENTS.md` is the live instance: absent in this repo, present in every adopter `/sdlc-init` sets up. Mark it optional where Step 10a seeds it.

## Owner decisions

None at sign-off.

## End-to-end validation

- Every `run:` step of `.github/workflows/sdlc-validate.yml`, locally on the integration tip, with `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PROJECT_DIR` unset.
- A dry review of a small fixture spec through the new flow: `validate-spec.mjs` blocks a draft with a missing section, then passes it once fixed. Two recorded round-1 envelopes are stamped, validated and appended to the review log. An owner override is recorded. A round-2 envelope that repeats the overridden finding verbatim routes it at the owner's severity, and one that rephrases it gets a new id. A round-4 envelope with a blocker routes to `disclose_and_accept`.
- A fresh `/sdlc-init` repo receives `validate-spec.mjs`, `review-log.mjs`, `gen-spec-index.mjs` and `authoring-decisions.md`, and `scan-legacy-paths.mjs` reports 0 there.
- `node .sdlc/scripts/validate-spec.mjs specs/SPEC-007-spec-review-convergence.md` exits 0.
