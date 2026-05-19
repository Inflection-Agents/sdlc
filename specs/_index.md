# Specs

Live specs for the upstream SDLC framework itself. Each spec is a markdown file at `specs/SPEC-NNN-*.md`; tasks (once decomposed) live under `specs/tasks/SPEC-NNN/`.

This framework dogfoods itself — improvements to the SDLC ship as specs in this directory.

**Backlog:** see [`intents.md`](intents.md) for the full port-back / improvement surface, grouped by initiative. Specs below are the ones currently drafted; the rest are queued there.

## By initiative

### sdlc-throughput

Tightening the developer loop without losing the rigor that catches real defects. Source of pain: high-gear's downstream use revealed that uniform-depth review (4 always-on reviewers, binary verdict) was high-signal but too slow, and that the most expensive defects (spec gaps) were the ones leaking from spec time into PR time as hot-fix amendments.

| ID | Title | Status | Initiative | Depends on |
|---|---|---|---|---|
| [SPEC-001](SPEC-001-tiered-code-review.md) | Graded review for specs and PRs | completed | INI-001 | — |
| [SPEC-002](SPEC-002-spec-execution-orchestration.md) | Spec execution orchestration — wave-based loop with tiered review | completed | INI-001 | SPEC-001 |
| [SPEC-003](SPEC-003-onboarding-phase-1.md) | Onboarding simplification — Phase 1 (docs + bootstrap fix) | active | INI-002 | — |
| [SPEC-004](SPEC-004-artifact-completeness-ports.md) | Artifact completeness ports from high-gear | active | INI-003 | — |
| [SPEC-005](SPEC-005-conditional-integration-branch.md) | Conditional integration-branch strategy for spec-execution | active | INI-001 | SPEC-002 |

## Reading order for a fresh contributor

1. **SPEC-001 first.** Defines the primitives — severity ladder, grounding rules, shared JSON envelope, carry-forward semantics, and two reviewer skills (`pr-reviewer`, `spec-reviewer`). Independent landing: `spec-reviewer` can ship without any orchestration change.
2. **SPEC-002 second.** Defines the loop that consumes those primitives — wave-based parallel execution, worktree isolation, Tier 0 CI gating, severity-driven routing, fix loop with cap, integration PR. The orchestrator is deliberately dumb; it routes signals defined in SPEC-001.

Together they replace high-gear's hard-coded 4-reviewer always-on fan-out with a tiered, graded, contract-driven model.

## Sequencing notes

- **SPEC-001 ships before SPEC-002.** SPEC-002 consumes SPEC-001's reviewer contracts and severity policy by reference. Landing SPEC-002 against an undefined SPEC-001 would force the orchestrator to inline-define contracts that should live in the reviewers.
- **`spec-reviewer` is the recommended first deliverable.** Of the four skills introduced across both specs (`pr-reviewer`, `spec-reviewer`, updated `sdlc-code-review`, new `spec-execution`), `spec-reviewer` has no orchestration dependency. It can be invoked by the existing `spec-authoring` and `spec-amendment` skills today, against the next drafted spec. That gives the cleanest read on whether codifying the manual spec-review pass actually catches what the owner catches today, plus anything currently being missed.
- **Cut over to the new `spec-execution` only on a fresh spec.** Mid-flight swap (e.g., during high-gear's SPEC-042) is not supported. Wait for the in-flight spec to complete, then dispatch the next spec via the new orchestrator with the legacy version kept as `spec-execution-legacy/` for one spec as a side-by-side baseline.

## Out-of-scope follow-ups (named, not yet specced)

These ideas surfaced during SPEC-001 / SPEC-002 authoring and were intentionally deferred. Captured here so they don't get lost:

- **Spec rehearsal.** An agent that dry-runs the implementation against a draft spec — drafts test cases per AC, maps the file surface, attempts cross-workspace impact analysis. Complementary to `spec-reviewer` (which reads the spec) — rehearsal *acts* on it. Would catch a different class of gaps (those that look fine on paper but fail under simulation).
- **Agent Teams adoption.** Claude Code's experimental `agent-teams` feature (shared task list, peer messaging, lead+teammates pattern) maps onto SPEC-002's wave loop natively. Migration would replace background-subagent dispatch with team teammates and let reviewers cross-talk (e.g., adversarial reviewer challenges AC-completeness reviewer). Compatible with the contracts in SPEC-001; requires its own spec.
- **Telemetry tooling.** SPEC-002 specifies the `_execution.log.jsonl` schema; tooling to roll up multiple specs' logs into a "did the throughput change?" report does not exist. Could be a small script or a dashboard. Specced when the manual measurement from SPEC-001's success criteria proves the pattern out.
