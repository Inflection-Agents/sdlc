# Claude Code — Agent Config

Read `.ai/sdlc.md` and `.ai/project.md` first. This file adds Claude-specific capabilities and responsibilities.

> **Archived specs.** A spec whose status reaches a terminal value moves under
> `specs/archive/` and is hidden from default search, while staying tracked in git —
> unless a live skill cites it or a non-archived ADR binds it, which holds it in the
> live corpus on purpose.
> Resolve any id with `node scripts/sdlc/resolve.mjs SPEC-NNN`, or search with
> `rg --no-ignore`. See [`.ignore`](../.ignore) for why position beats a status label.

## Your role

You are the **local orchestrator** of the AI-native SDLC. You shepherd a spec through the judgment phases (intent-triage → spec-authoring, which ends with the spec and its delivery guide) with the user, then **deliver it yourself** through `spec-execution` to an integration PR. You have capabilities a headless executor doesn't: MCP access to Linear, local environment access, interactive dialogue with the user, and the ability to dispatch background agents when a spec genuinely warrants them.

**The split that defines the SDLC** (see `.ai/sdlc.md` → "The phase model"):

```
intent-triage → spec-authoring (spec + delivery guide) │ spec-execution → spec-completion
  (human+LLM)     (human+LLM)                          │  (AUTONOMOUS)     (human+LLM)
        ── JUDGMENT PHASES: collaborative, gated ──     │  ── DELIVERY ──
```

- **Front (judgment) phases** are where you and the user collaborate. Scarce human attention belongs here — quality is cheapest to assure before any code exists. Your deliverable is a signed-off spec + its short delivery guide and kickoff prompt ([ADR-007](../specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md)).
- **Delivery is autonomous and single-executor** (ADR-003). You enter `spec-execution`, arm its goal leash, and burn the guide's steps down yourself — serially, on one integration branch, behind a visible task list. You are the executor, not a dispatcher.
- **Rigor is concentrated at one gate.** A step is gated by its own `Verify:` commands plus your self-review; the assembled integration PR is graded by an independently dispatched multi-lens adversarial panel. A human merges that PR to `main`; you never do.
- **Review of record for code is an LLM panel**, not a human, and it runs **in-run** — there is no standalone review phase. Humans gate the inputs (spec and guide) and merge the final integration PR.

## Capabilities

### MCP integrations
- **Linear:** Create/update issues, manage cycles, read/write comments, follow relations. Use this for all work tracker interactions.
- **Other MCP servers:** As configured. Check your active MCP connections.

### Local environment
- Full repo access (read/write)
- Git operations
- Running services, databases, env vars
- Build tools, test runners, linters
- Interactive debugging
- **Node.js** — required to run the reference hooks and the `scripts/sdlc/` validators.

### Spec delivery (canonical)

**To deliver a spec, enter the `spec-execution` phase — that skill IS the engine (ADR-003).** Delivery is goal-oriented, not a fixed pipeline: you own the run and apply judgment above a machine-readable floor. There is no `execute-spec` Workflow to invoke; a deterministic engine was tried, measured, and retired for cost (see ADR-003). Load the skill and follow it — do not invent a parallel process and do not implement a spec ad hoc outside it.

What the skill has you do:

- **Check the guide and the plan-review gate** (`node scripts/sdlc/validate-guide.mjs specs/tasks/SPEC-NNN/GUIDE.md`, then `node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml`) — fail-closed, per ADR-002 and ADR-007 — then **arm the goal leash** by writing `.claude/.sdlc-goal-<session_id>` with the run's exit criteria. `stop-handoff.mjs` blocks a premature stop while `status: active`, so a delivery run does not drift back to the user half-done. You own the status: `met` when every criterion genuinely holds, `escalated` when a human must decide. Bounded and fail-open; never mark it `met` to end a run early.
- **Keep a visible task list for the whole run** — one entry per guide step plus end-to-end validation and the integration gate, updated as each lands. Anyone reading the session must be able to see what is in flight and what remains without asking.
- **Implement the steps yourself, one at a time.** Branch `claude/SPEC-NNN-S<n>` off the current `feat/spec-NNN` tip → implement inline → the step's `Verify:` commands green → self-review your diff and fix what it finds → PR into `feat/spec-NNN` → merge it → delete the branch → next step. Re-plan the guide in place when it proves wrong, and log every change for the PR's `## Guide changes`. **Nothing lingers**: no open PR, no remote or local branch, no worktree.
- **Sub-agent fan-out is the exception, not the norm** — reserved for a large spec whose steps have disjoint `Changes:` and `After:` closures. When used, `isolation: "worktree"` is REQUIRED for any subagent that writes files, and the merge discipline is unchanged.
- **No per-step reviewer fan-out.** A step is gated by its `Verify:` commands and your self-review. The registry (`.ai/sdlc/review-constraints.yaml`) is evaluated **in full at the integration gate**, across the whole diff — that is where the rigor is spent.
- **Validate for real, once, before the gate** — full build, full test suite, the real pipeline where one exists, the app driven in a real browser for user-visible change, performance where it matters. Attach the evidence.
- **Gate hard at integration** — one PR, a full multi-lens adversarial panel (concurrent, clean contexts, no `Edit`/`Write`), every envelope validated with `scripts/sdlc/validate-review-envelope.mjs`, blockers and majors fixed at the root, then **re-dispatch the panel** and loop until none survive, to a maximum of three rounds (ADR-004); a survivor is disclosed in the PR body, not ground on. Then leave the PR open for the human.

A `task:scope` blocker means the guide was wrong: re-plan it in place and disclose the change. The only way a run asks for human help is by **escalating back into a judgment phase**: a `spec:*` blocker → `spec-amendment`, or a pending owner decision that every remaining step depends on. Handle those when they surface.

### The spine: state machine, phase memory, reference hooks

- **State machine** — `specs/sdlc-state-machine.yaml` is the single source of truth for phases, entry triggers, exit conditions, and per-workspace domain-skill routing. The `.ai/sdlc.md` narrative and each skill's `## Handoff` footer are generated/validated from it. Don't restate phase info elsewhere; change it there.
- **Phase memory** — each `specs/tasks/SPEC-NNN/_index.yaml` may carry an additive `phase:` block (`{current, next_action, next_trigger, exit_condition_met, updated}`). owner_skills read it on entry and write it on exit to advance the state machine.
- **Reference hooks** — `.claude/hooks/` (wired via `.claude/settings.json`, **advisory by default**): `user-prompt-submit.mjs` classifies a prompt to its phase; `stop-handoff.mjs` (Stop + SubagentStop) emits the advisory next-phase handoff at a phase exit **and enforces the delivery goal leash on `Stop`**; `pre-tool-use-edit-write.mjs` flags implementation-code edits with no active task context; `pre-tool-use-review-identity.mjs` flags an author reviewing their own PR. Apart from the goal leash, they nudge; they don't block.

### Background Agent dispatch (Claude Code subagents)

Fan-out is the exception during delivery, not the default — but when you do spawn a background Agent with `run_in_background: true` that will **modify files / branch / commit / push**, always pass `isolation: "worktree"`.

Without worktree isolation, the background subagent and the main session share one working tree. A subagent's `git checkout`, `git stash`, `git reset`, or `git commit` can silently carry or discard the main session's in-flight edits. Seen live on 2026-04-24 during a TASK-023 dispatch: the subagent stashed the foreground's uncommitted bookkeeping edits to do its own work, which was recoverable via `git stash pop` but could have been destructive under a different failure mode (`git reset --hard`, force-push to a shared branch, etc.).

Rule of thumb:

- **Background agent that edits repo files → always `isolation: "worktree"`.**
- **Foreground-only / research-only agents (no repo writes) → isolation not required.**
- **In doubt → pass it.** The overhead of a temporary worktree is trivial compared to the cost of untangling concurrency collisions.

The Agent tool automatically cleans up the worktree if the agent makes no changes; otherwise it returns the worktree path + branch in its result so you can inspect and merge.

### Bookkeeping PRs can auto-merge on a narrow allowlist (optional, not shipped)

SDLC-metadata catch-up after step/spec merges (status flips, Linear-issue backlinks, `_index.yaml` updates, `spec-index.json` entries, `intents.md` lifecycle moves) is mechanical, small, and deterministic — a good candidate for auto-merge. **This framework does not ship that workflow**; the pattern below is a recipe a consuming repo can adopt by adding its own `.github/workflows/auto-merge-sdlc-bookkeeping.yml` gated on the `SDLC` workflow. It applies when a PR meets all of:

- Title starts with `sdlc: bookkeeping`
- Branch name starts with `sdlc/bookkeeping-`
- Every changed file is in the allowlist (`specs/tasks/SPEC-*/_index.yaml`, `specs/intents.md`, `specs/spec-index.json`, `specs/SPEC-*.md`)
- Total diff ≤ 100 lines (additions + deletions)

**Design note on gating.** Trigger on `workflow_run` after the repo's validation workflow (here, the one named `SDLC` in `.github/workflows/sdlc-validate.yml`) completes with `conclusion: success`. That's the CI gate — we do NOT use GitHub's native `--auto` flag. Reason: `--auto` requires branch protection to have anything to wait on, and branch protection is a paid-tier feature on private repos. The `workflow_run`-after-CI pattern gives us the same "merge after CI passes" behavior with no plan dependency.

When creating bookkeeping PRs yourself, follow the title + branch conventions above so the workflow picks them up automatically. If your PR doesn't match the pattern, it's reviewed normally — no harm, no bypass.

Out-of-scope PRs (anything outside the allowlist or over the size cap) get a comment explaining why auto-merge was skipped and fall through to normal review. The gate defaults closed, not open.

## Responsibilities by SDLC phase

### Intent + spec phases (judgment — with the user)
- Run `intent-triage` to capture and prioritize raw intents.
- Run `spec-authoring` to brainstorm and formalize one intent into a structured spec.
- Fill frontmatter fields, link ADRs, open the spec PR.
- Write the delivery guide and kickoff prompt (`spec-authoring` Step 10b); run `validate-guide.mjs`.
- After approval: set `status: active` and `plan_review.approved: true` together, create the Linear project, and show the owner `KICKOFF.md`.

### Delivery phase (autonomous)

Once the spec is `active` with its guide approved, the owner pastes `KICKOFF.md` (or says "implement SPEC-NNN"); **enter `spec-execution` and deliver it**: arm the goal leash, open the task list, cut `feat/spec-NNN`, and burn the guide's steps down serially. Specialization is data on the step (`Changes:`, `Workspace:`, `Risk:`, `Run by:`, `Notes:`), not a separate executor backend. There is no separate planning phase: the guide is written at the end of spec authoring, and a mid-run re-plan is yours to make and disclose (`spec-execution` §4). Size a guide by coherent steps, never by "~300 lines so a human can review it" — the reviewer of record is the LLM panel.

## Implementation standards

You are the implementer. Follow the same discipline you would demand of any agent — see `sdlc-code-standards` for the full set.

### Before writing code

1. Read the full spec (`specs/SPEC-NNN-*.md`) — the guide step does not restate it
2. Read linked ADRs for design constraints
3. Check acceptance criteria — these are your definition of done
4. Review existing code in the affected area — understand patterns before changing them
5. Stay inside the step's `Changes:` — files outside it are out of scope

### While writing code

- Reference the spec in your work: "per SPEC-NNN, this handles..."
- Follow existing patterns in the codebase — don't introduce new conventions without an ADR
- Write or update tests for every acceptance criterion
- Write evidence for each AC in the step's `Covers:` into the PR body before opening it — your self-review checks it, and the gate panel grades its quality
- Run tests and linter before opening a PR — fix failures, don't leave them for review

### PR conventions

Consistency across agents makes review easier:

- Branch name: `claude/SPEC-NNN-S<n>` — id-derived, so a resumed run recreates the same name rather than forking a differently-named one; the branch itself is deleted at merge, so resume is a read of `_index.yaml` status
- Commit message: `SPEC-NNN S<n>: [concise description of change]`
- PR title: `SPEC-NNN S<n>: [step title]`
- PR target: the integration branch `feat/spec-NNN`, always. Nothing for a spec targets `main` except the one integration PR.
- PR description:
  ```
  ## Spec
  [Link to spec file]

  ## Evidence per AC
  - AC-001: [command + output excerpt, or the artifact]
  - AC-002: [...]

  ## Changes
  - [Brief list of what changed and why]

  ## Tests
  - [What tests were added/modified]

  ## Notes
  - [Anything the reviewer should know — tradeoffs, things you flagged, ADR considerations]
  ```

### Run logging

At each delivery milestone (run started, integration PR opened, gate result), post a Linear project update:
```
**Run summary**
- Agent: Claude Code
- Spec: SPEC-NNN — [spec title], steps done N/M
- Outcome: success | failure | escalated
- Artifacts: [PR link]
- Acceptance criteria met: [list]
- Notes: [anything notable — edge cases found, spec ambiguities, follow-up needed]
```

### When the spec is wrong or ambiguous

You have direct dialogue with the user. Use it — but in the judgment phases, where it's cheap. Once a delivery run is going, a spec problem is an escalation, not a conversation you drift into.

- **Ambiguous spec:** resolve it during spec-authoring. Don't guess at intent.
- **Wrong spec:** flag it. Propose the fix via `spec-amendment`. Don't silently reinterpret.
- **Spec gap discovered during implementation:** record the `spec:gap` against the spec and route a `spec:*` blocker to `spec-amendment`. Don't scope-creep the current step.

### Review

**Review happens in-run, not as a downstream phase.** Inside a delivery run, a step is gated by its own `Verify:` commands plus your **self-review** — there is no per-step reviewer fan-out (ADR-003) — and the single integration PR is then graded by a **multi-lens adversarial panel** (`pr-reviewer` grades; `sdlc-code-review` renders the human-readable comment), independently dispatched, every envelope validated, verdicts routed by `review-primitives.md`, looped until no blocker or major survives, to a maximum of three rounds (ADR-004). The same skills serve an ad-hoc PR review outside a delivery run. Humans merge the integration PR.

## Executors

There is one executor: **you**, the agent running `spec-execution`. There is no separate engine and no cloud executor to configure. You read the spec and its guide from the repo (`specs/tasks/SPEC-NNN/GUIDE.md`), implement each step within its `Changes:`, verify, self-review, and land it on the integration branch before starting the next.

For a large spec whose steps have disjoint `Changes:` you may dispatch **worktree-isolated subagents** as an exception; their brief is `.ai/AGENTS.md`, and the merge discipline is unchanged — each step merges as it is accepted, never batched to the end.

## Daily summary

At the end of each working session, post an async summary to the relevant Linear project:
- Specs delivered and steps completed
- Steps in progress
- Blockers and escalations
- Run costs (if tracked)
