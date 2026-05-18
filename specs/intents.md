# Intents

Raw and triaged ideas for the SDLC framework's evolution. Specs in `specs/SPEC-NNN-*.md` are written from intents that the owner prioritizes through `intent-triage` and `spec-authoring`.

## Status legend

- **`active`** — has a spec in `specs/`, work in progress.
- **`next`** — top of backlog, spec to be written soon.
- **`backlog`** — port-back or improvement; not yet sequenced.
- **`deferred`** — captured for later; depends on or follows other work.

---

## Initiative: sdlc-throughput

Reduce the friction in the spec → implementation → review → merge loop without losing the rigor that catches real defects. Originates from observed pain in high-gear's SPEC-042 execution: 4-reviewer always-on PR fan-out, binary verdicts, hot-fix amendment commits indicating spec gaps leaking to PR time.

### `[active]` Graded review for specs and PRs → [SPEC-001](SPEC-001-tiered-code-review.md)
Severity ladder, grounding rules, shared JSON envelope, two reviewer skills (`pr-reviewer`, `spec-reviewer`), orchestrator severity→action policy, tiered PR review router.

### `[active]` Spec execution orchestration → [SPEC-002](SPEC-002-spec-execution-orchestration.md)
Wave-based loop with worktree isolation, Tier 0 CI gating, severity-driven routing, fix loop with cap, integration PR. Consumes SPEC-001 contracts.

### `[deferred]` Spec rehearsal — pre-implementation dry-run agent
Complementary to `spec-reviewer`. Where the reviewer *reads* the spec, the rehearsal agent *acts* on it: drafts test cases per AC, maps the file surface the implementation will touch, attempts cross-workspace impact analysis. Catches a different class of gaps — those that look fine on paper but fail under simulation. Wait until SPEC-001 ships and we measure whether `spec-reviewer` alone closes the hot-fix amendment gap. If it does not, rehearsal becomes next priority.

### `[deferred]` Agent Teams adoption
Claude Code's experimental `agent-teams` feature (shared task list with file-locking, peer-to-peer messaging, lead+teammates pattern, `TeammateIdle`/`TaskCompleted` hooks) maps onto SPEC-002's wave loop natively. Migration would replace background-subagent dispatch with team teammates and let reviewers cross-talk (e.g., adversarial reviewer challenges AC-completeness reviewer to eliminate duplicate findings). Compatible with SPEC-001's contracts. Wait until SPEC-002 ships and stabilizes before migrating the substrate.

### `[deferred]` Telemetry roll-up tooling
SPEC-002 defines per-task JSONL telemetry; a tool that rolls multiple specs' logs into a "did throughput change?" report does not exist. Could be a small script or a dashboard. Spec when SPEC-001 success criteria need to be measured at scale (after two completed specs prove the pattern).

---

## Initiative: sdlc-onboarding `[NEW — user-flagged priority]`

The current path from "I want to use this framework" to "I have shipped my first spec" requires reading ≥11 docs, manually filling in `.ai/project.md`, customizing `.ai/CLAUDE.md`, ensuring Linear labels exist, and then deriving the first-spec workflow from the playbook. `bootstrap.sh` does file scaffolding but stops short of getting you to a working spec. High-gear's `setup.md` is more opinionated and uses a unified `setup-sdlc.sh` to wire skills into both Claude and Gemini, but it's project-specific. The upstream onboarding should be at least as clean.

### `[next]` Significantly simplify getting started
**Principles to design against:**

1. **Working first spec in 10 minutes, not files scaffolded in 10 minutes.** Current bootstrap leaves you with empty directories and a "next steps" checklist of five items. Target: by the end of onboarding, you've authored a tiny throwaway spec, decomposed it into a task, and round-tripped it through the loop. *That* is "set up."
2. **Three doors with clear signposting.** Greenfield repo, existing repo adopting the framework, and joining a team that already uses it are three different journeys. Today they're one undifferentiated bash script. Each should have its own entry point.
3. **Defer all reference material.** The README currently inventories 11 docs. A first-time reader should see three principles (spec is root, agents are assignees, runs are observable) and a single "start here" pointer. Schemas, work-graph, tooling rationale, and skill architecture should be findable but not in the critical path.
4. **One interactive command, not a checklist.** `npx sdlc init` (or equivalent — name TBD) walks you through choices interactively: which agents (Claude / Jules / Gemini, any combination), which work tracker (Linear / GitHub Issues / none), whether this is a monorepo. Bootstrap.sh became 200 lines because every check is conditional; that complexity should be hidden behind a wizard.
5. **Verify by doing, not by checking.** The "is it set up?" verification is "run `sdlc demo`, which dispatches a no-op example task end-to-end." If it round-trips, you're set up. If not, the wizard tells you what to fix.
6. **Adopt high-gear's unified skill-wiring approach.** `tools/dev/setup-sdlc.sh` in high-gear links `.ai/skills/` into both `.ai/skills/` and `~/.agents/skills/` so the same skills work across local agents. Upstream should ship this pattern, not require each consumer to invent it.

**Open questions for the spec author:**

- Single CLI binary or shell script? CLI gives a better wizard experience but adds a build step; script is portable and editable but harder to UX.
- Templates as code or as files? File templates (current approach) are easy to inspect; generated templates allow project-specific defaults.
- How much of the "first spec" should be guided? A throwaway spec that demonstrates the loop is one option; auto-detecting "what would your first spec be?" from repo signals (open TODOs, recent commits) is another.
- Where does Linear setup fit? Currently a manual step ("ensure labels exist"); could be automated via Linear MCP if available.

**Out of scope for this initiative:** redesigning the SDLC process itself. This is about lowering the barrier to *adopting* the framework as it stands (with SPEC-001 / SPEC-002 improvements in flight).

**Why now:** The user has lived through onboarding twice (initial sdlc setup, then high-gear adoption) and identified it as a blocker. Without simplification, the framework's reach is limited to repos the owner sets up personally.

---

## Initiative: sdlc-artifact-completeness

Port high-gear's artifact-shape improvements upstream. These are small individually but compound — each one removes a class of ambiguity from spec/task interpretation.

### `[backlog]` `evidence:` field on acceptance criteria
High-gear task files include an `evidence:` field per AC populated by the executor with the actual proof (test output, dbt run, diff analysis). Upstream task schema has no such field. The result is "AC passed" claims that can't be audited. Port to upstream task schema; require population before PR review.

### `[backlog]` `spec_followups:` section convention
Referenced in SPEC-001's `batch_followup_and_accept` routing path. Defines where nit findings get logged when they don't block merge. Conventions: append to the spec or a sibling file, format, when grooming tasks get created from accumulated followups. Small spec; can ship with or after SPEC-001.

### `[backlog]` Spec gap capture pattern (GAP-NNN)
High-gear has `SPEC-029-SUPERVISION.md` and `hot-fix GAP-008`-style commits, indicating a convention for tracking gaps discovered mid-execution. Upstream has no formalized "gap" artifact distinct from amendments. Decide: are gaps a sub-class of amendment, a sibling artifact, or just a tagging convention on amendment commits?

### `[backlog]` Strengthen `spec-completion` skill
Skill exists upstream but high-gear's version is more rigorous — it explicitly verifies success criteria (not just task completion), checks integration, measurement, and manual validation. Port the depth.

### `[backlog]` Skill-level enforcement of `workspaces` / `verify_workspaces`
These fields exist in upstream task/spec schema but the upstream `sdlc-code-review` skill mentions them as "if set, check"; in high-gear, they're enforced (a PR that breaks a workspace not in `verify_workspaces` is a finding). Tighten upstream skills to enforce.

### `[deferred]` `DESIGN.md` and `figma_frame:` task fields
High-gear has `.ai/DESIGN.md` (Figma frame mapping) and `figma_frame:` URL on tasks that need design verification. Optional pattern — only relevant when the consumer has a design surface. Port as an *optional* convention so it doesn't add ceremony for consumers without designs.

---

## Initiative: sdlc-multi-agent

High-gear runs Claude Code, Jules, and Gemini side-by-side; upstream framework was built around Claude + Jules. The patterns for keeping multiple agents coherent need to port back.

### `[backlog]` Three role-specific entry points with consistent shape
High-gear has `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` with prescriptive role framing ("You are the orchestrator", "You are a task executor"). Upstream has the first two but no consistent template. Decide: do we ship `GEMINI.md` upstream, or do we ship a single agent-entry-point template that the consumer instantiates per agent?

### `[backlog]` Worktree isolation rule as a standalone doc
Referenced in SPEC-002 with the 2026-04-24 stash-incident justification. Belongs as a top-level rule (e.g., in `agent-orchestration.md` or a sibling doc) so consumers find it without reading SPEC-002. Small; can ship with the SPEC-002 work.

### `[backlog]` `.ai/project.md` workspace dependency graph + change propagation pattern
High-gear's `project.md` ballooned to 406 lines and includes a workspace dependency graph and explicit "when X changes, also verify Y" propagation rules. Upstream `templates/project.md` is generic. Port as an *optional* monorepo extension — single-app consumers don't need it.

### `[backlog]` Auto-merge bookkeeping workflow template
High-gear has `.github/workflows/auto-merge-sdlc-bookkeeping.yml` that auto-merges status flips, index updates, and spec-index entries (PRs titled `sdlc: bookkeeping`, capped at 100 lines, gated on CI). Ship upstream as a reference template under `templates/ci/` or similar.

### `[deferred]` Deeper Jules orchestration patterns
High-gear's `CLAUDE.md` has more depth around Jules: source ID discovery, fallback flow when Jules unavailable, MCP wiring for Jules. Upstream version is solid but high-gear has lived experience. Port the lessons (not the full file) into upstream `.ai/CLAUDE.md`.

---

## Cross-cutting captures (not yet bucketed)

### `[deferred]` Inter-spec dependency tooling
SPEC-002 declares `depends_on: [SPEC-001]`. Today this is a frontmatter field with no enforcement — nothing prevents SPEC-002 from going `active` before SPEC-001. A small CI check or a `spec-graph` doc could surface dependency violations.

### `[deferred]` Spec template review
Current `templates/spec.md` is the shape both SPEC-001 and SPEC-002 used. After the first dogfood pass through `spec-reviewer` (once it exists), the template itself may need adjustments. Defer until then.

### `[deferred]` Skill discoverability index
The framework now has ≥8 process skills and (in high-gear) ≥11 domain skills. A flat list in `skills.md` works at this size but won't at 30+. Consider an index by trigger keyword, by SDLC phase, or by artifact type.

### `[deferred]` "Migrating to the SDLC" guide for existing repos
The onboarding initiative covers greenfield + joining-an-existing-team. A *migration* guide — how to introduce specs into a repo with existing tickets, history, and conventions — is its own piece of work. Capture once onboarding lands.

---

## Process notes for the owner

- **Priority signal:** the user has explicitly flagged `sdlc-onboarding` as a top priority alongside `sdlc-throughput`. Treat them as parallel, not sequential.
- **Sequencing within sdlc-throughput:** SPEC-001 → SPEC-002 (already enforced via `depends_on`). Within SPEC-001, `spec-reviewer` can land before `pr-reviewer` because it has no orchestration dependency — see SPEC-001 migration strategy.
- **Avoid SPEC-NNN inflation:** several backlog items (evidence field, spec_followups, gap capture, workspace enforcement) are individually small. Consider bundling related ones into a single spec rather than one-per-item to avoid spec sprawl.
- **Dogfooding moment:** once SPEC-001 ships, all subsequent specs in this framework — including SPEC-001 itself, retroactively — should be the first inputs to `spec-reviewer`. That's the natural validation.
