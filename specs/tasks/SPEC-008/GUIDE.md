---
spec: SPEC-008
spec_version: 1
---

## Steps

### S1: Guide tooling
- Covers: AC-003, AC-004, AC-010, AC-014
- Changes: `skills/guide-schema.md`, `templates/guide.md`, `init-payload/templates/guide.md`, `scripts/sdlc/validate-guide.mjs`, `scripts/sdlc/validate-guide.test.mjs`, `init-payload/scripts/sdlc/validate-guide.mjs`, `.github/workflows/sdlc-validate.yml`, `init-payload/.github/workflows/sdlc-validate.yml`, `specs/tasks/SPEC-008/DECISIONS.md`
- Verify: `node --test scripts/sdlc/validate-guide.test.mjs`, `node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-008/GUIDE.md`, `cmp scripts/sdlc/validate-guide.mjs init-payload/scripts/sdlc/validate-guide.mjs`
- Notes: Match section headings only at the start of a line. SPEC-008 quotes `## Acceptance criteria` inline, and an unanchored search reads the wrong section. Run the new validator on this guide and record the result in `DECISIONS.md`, next to the bootstrap `EXECUTIVE DECISION` logged at run start. `guide-schema.md` holds the guide fields, the `steps:` and `decisions:` lists, the plan-review and phase-memory blocks, and the 10-step split rule.

### S2: Spec schema and templates
- Covers: AC-005, AC-018
- Changes: `skills/spec-schema.md`, `templates/spec.md`, `init-payload/templates/spec.md`, `templates/decisions.md`, `init-payload/templates/decisions.md`
- Verify: `node scripts/sdlc/check-stale-citations.mjs`, `cmp templates/decisions.md init-payload/templates/decisions.md`, `cmp templates/spec.md init-payload/templates/spec.md`
- Notes: AC and SC ids become required. The legacy `AC-NNN —` form stays valid. `DECISIONS.md` headings: `## S<n> — <title>`, the guide-change form, `## Cross-step values`.

### S3: Delivery and completion skills
- Covers: AC-007, AC-009
- Changes: `skills/spec-execution/SKILL.md`, `skills/spec-execution/SOP.md`, `skills/spec-execution/examples/**`, `skills/spec-completion/SKILL.md`
- Verify: `rg -n "validate-guide|Guide changes|After:|Run by:" skills/spec-execution`, `rg -n "Step-covered" skills/spec-completion/SKILL.md`
- Notes: §1 runs `validate-guide.mjs` before `plan-gate.mjs`. §6 carries every block in SPEC-008 Design > What blocks the integration PR. Leave the generated `## Handoff` footers alone; S6 regenerates them.

### S4: Authoring and amendment skills
- Covers: AC-006, AC-008
- Changes: `skills/spec-authoring/SKILL.md`, `skills/spec-amendment/SKILL.md`
- Verify: `rg -n "GUIDE.md|write the guide for|guide/SPEC" skills/spec-authoring/SKILL.md skills/spec-amendment/SKILL.md`
- Notes: The new spec-authoring step runs after Step 10a and can run alone on an active spec. The id-only edit goes in spec-amendment's Cosmetic class.

### S5: Review rules
- Covers: AC-016
- Changes: `skills/review-primitives.md`, `init-payload/.ai/skills/review-primitives.md`, `skills/sdlc-code-review/SKILL.md`, `skills/sdlc-code-standards/SKILL.md`, `skills/pr-reviewer/SKILL.md`, `agents/pr-reviewer.md`, `skills/create-domain-skill/SKILL.md`, `.ai/sdlc/review-constraints.yaml`, `init-payload/.ai/sdlc/review-constraints.stub.yaml`
- Verify: `node --test scripts/sdlc/prefix-parity.test.mjs scripts/sdlc/reviewer-routing.test.mjs`, `node scripts/sdlc/validate-constraints-registry.mjs`
- Notes: Prefix names do not change. Only what each one grounds on changes, per the SPEC-008 field table.

### S6: State machine and phase memory
- Covers: AC-001, AC-002, AC-019
- Changes: `specs/sdlc-state-machine.yaml`, `init-payload/sdlc-state-machine.yaml`, `skills/task-decomposition/**`, `scripts/sdlc/validate-phase-memory.mjs`, `scripts/sdlc/validate-phase-memory.test.mjs`, `init-payload/scripts/sdlc/validate-phase-memory.mjs`, `skills/*/SKILL.md` (generated footers only)
- Verify: `node scripts/sdlc/validate-state-machine.mjs`, `node scripts/sdlc/gen-handoffs.mjs --check`, `node --test scripts/sdlc/validate-phase-memory.test.mjs`, `cmp scripts/sdlc/validate-phase-memory.mjs init-payload/scripts/sdlc/validate-phase-memory.mjs`
- Notes: Runs after S3 and S4, so the footers are regenerated from skills that already describe the guide. Delete `skills/task-decomposition/` here, in the same commit that removes its phase, because `validate-state-machine.mjs` fails on a skill directory that no phase or `exempt:` entry names. Add `guide-schema` to `exempt:`. Remove `task-schema` in S7, when the file goes.

### S7: Deletions and code comments
- Covers: AC-010, AC-011
- Changes: `skills/task-schema.md`, `templates/task.md`, `init-payload/templates/task.md`, `scripts/sdlc/__fixtures__/review-primitives-examples/test-fixtures/**`, `scripts/sdlc/plan-gate.mjs`, `init-payload/scripts/sdlc/plan-gate.mjs`, `specs/sdlc-state-machine.yaml`, `init-payload/sdlc-state-machine.yaml`
- Verify: `node --test scripts/sdlc/plan-gate.test.mjs`, `node scripts/sdlc/validate-state-machine.mjs`, `cmp scripts/sdlc/plan-gate.mjs init-payload/scripts/sdlc/plan-gate.mjs`
- Notes: Change plan-gate wording only (comments and the `--presence-only` message). Leave its logic as it is. Drop `task-schema` from `exempt:` in both state machines.

### S8: Docs
- Covers: AC-011
- Changes: `README.md`, `playbook.md`, `skills.md`, `skill-architecture.md`, `roles.md`, `agent-orchestration.md`, `sync.md`, `triage.md`, `tooling.md`, `work-graph.md`, `specs/_index.md`, `.ai/*.md`, `templates/project.md`, `init-payload/templates/project.md`, `init-payload/.ai/project.stub.md`
- Verify: the AC-011 `rg` command prints nothing
- Notes: Describe four main-line phases and the guide. Do not edit SPEC-003's task files.

### S9: Release and ADR pointers
- Covers: AC-012, AC-013, AC-015, AC-017
- Changes: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `docs/RELEASING.md`, `specs/adrs/ADR-002-plan-review-gate-in-index-yaml.md`, `specs/adrs/ADR-003-goal-oriented-single-executor-delivery.md`, `specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md`
- Verify: `node scripts/sdlc/validate-plugin-manifest.mjs`, `node --test scripts/sdlc/*.test.mjs hooks/__tests__/*.test.mjs`
- Notes: Version `0.3.0`. The `RELEASING.md` row carries the pre-1.0 rule and the four adopter actions from SPEC-008 Migration > Adopters. ADR-002 and ADR-003 each get a single pointer line.

## Owner decisions

None at sign-off.

## End-to-end validation

- Every `run:` step of `.github/workflows/sdlc-validate.yml`, run locally on the integration tip.
- `node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-008/GUIDE.md` and the AC-011 search.
- Adopter dry run: copy `init-payload/` into a fresh temp git repo, then run `validate-state-machine.mjs`, `gen-handoffs.mjs --check` and `validate-guide.mjs` against a two-step sample guide there. Also run `validate-phase-memory.mjs` on an `_index.yaml` that says `current: task-decomposition`.
- SC-2: `wc -w` on this guide and on the spec, and report the ratio.
