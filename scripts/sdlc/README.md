# SDLC phase-spine: hooks & validators

Generic, dependency-free (Node built-ins only) reference implementations of the
AI-native SDLC "phase spine" — the enforcement hooks and validators that keep
work anchored to the state machine in `specs/sdlc-state-machine.yaml` and the
phase-memory contract documented in that file's header. They ship with the
framework as references: adapt them per repo. The hooks parse YAML with a small
inlined subset reader, so no npm package (`js-yaml` etc.) is required.

**Hooks default to ADVISORY (warn) mode.** Each hook reads `SDLC_GUARD_MODE`
(`warn` | `enforce` | `off`); the built-in default is `warn`, which means a
hook that *would* block instead emits a `[SDLC guard — WARN, …]` line and
allows the action. Flip the constant in the hook (or set the env var) to
`enforce` once a repo trusts the gate, or `off` as an emergency kill-switch. The
two `Stop`/advisory-only hooks never hard-fail regardless. **All hooks FAIL
SAFE** — any internal error or missing source-of-truth results in a no-op
(allow), never a broken tool call. The hooks are wired in `.claude/settings.json`
(which travels with the repo), not `settings.local.json`.

## Hooks (`.claude/hooks/`)

**`user-prompt-submit.mjs`** (UserPromptSubmit) — the only hook that sees the
raw prompt. It does three deterministic, silent-when-uncertain jobs: (1) reads
the `entry_triggers` table from the state machine and, when a prompt matches an
entry trigger and no task is active for the referenced spec, injects advisory
routing context naming the matched phase and its owner skill; (2) injects an
optional domain-routing chain when the prompt references a workspace listed in
the state machine's `domain_routing` (a no-op until a repo populates that block);
(3) captures an `out-of-process: <reason>` token from the prompt into a
per-session override file (`.claude/.sdlc-override-<session_id>`) that the
edit/write gate honors. It never blocks and is silent on any error.

**`stop-handoff.mjs`** (Stop + SubagentStop) — two jobs. (1) An advisory
next-phase handoff at a phase exit: a Stop hook cannot print to the user, so when
a spec's `specs/tasks/SPEC-NNN/_index.yaml` `phase:` block has
`exit_condition_met: true` (and the handoff has not already been surfaced), it
blocks the stop exactly once with a continuation reason naming the `next_phase` +
`next_trigger` (read from the state machine, keyed by `phase.current`). It is a
no-op for mid-phase work and honors the block cap (`stop_hook_active`).
(2) **The delivery goal leash** (ADR-003): while
`.claude/.sdlc-goal-<session_id>` is `status: active` it blocks the stop on
**`Stop` only** and feeds the run's exit criteria back, so a delivery run cannot
drift back to the user half-done. `met` and `escalated` are the only release
words. Unlike the handoff branch it deliberately does not release on
`stop_hook_active` — a one-shot block is not a leash — but it is bounded by a
hook-owned counter (`.sdlc-goalblocks-<session_id>`, default 12, a goal's
`max_blocks` may only lower it), expires 24h after `armed_at`, and fails OPEN
whenever that bound cannot be enforced. `.sdlc-goal-current` is a one-shot arming
name the first `Stop` claims by renaming to the session-keyed path; echoed goal
text is clamped and labeled untrusted. Covered by
`.claude/hooks/__tests__/stop-handoff-goal-leash.test.mjs`. Silent on any error.

**`pre-tool-use-edit-write.mjs`** (PreToolUse, matcher `Edit|Write`) — the
no-active-task gate. It blocks an edit to an implementation-code path when there
is no active task context (the git branch does not match `claude/SPEC-…` |
`task/…` | `spec/…` | `feat/spec-…`). Process-artifact paths (`specs/**`,
`.ai/**`, `.claude/**`, `docs/**`, root-level `*.md`, the state machine) are
categorically exempt — authoring them *is* the SDLC. The generic rule is "if it
is not a process artifact, it is implementation code," so no repo-specific
workspace list is baked in. The block is bypassable by the logged per-session
override file (recorded to `.claude/.sdlc-override-log` — visible, never silent).
Advisory by default; fails open.

**`pre-tool-use-review-identity.mjs`** (PreToolUse, matcher `Bash`) — the
author≠reviewer review-independence gate. It refuses to let a PR author post an
accept/approve verdict (or merge) on their own PR, the structural half of the
review-independence rule in `.ai/skills/review-primitives.md`. It only acts on
`gh pr review --approve`, `gh pr merge`, and accept-verdict `gh pr comment`
commands; everything else (request-changes, blocking verdicts, non-`gh`
commands) is a no-op. Identities are resolved via `gh`/`git` only after an
accept is detected. Advisory by default (`warn`); fails open if either identity
cannot be resolved or the mode is not `enforce`.

**One exemption exists** (ADR-003): a `gh pr merge` whose PR base resolves to a
`feat/spec-*` integration branch is a delivery executor merging its own task
PR — mandatory work, not a self-accept — and is allowed. Every other case denies:
`main`/any other base, a chained or cross-repo command, an unresolvable PR
selector, and every `gh pr review`/`gh pr comment` accept. There is no override
for those. Command parsing runs on a hand-rolled shell-word tokenizer (quoting,
escaping, flag-spelling normalization), not raw-string regex — five review
rounds found distinct bypasses, three in the regex version and two more the
tokenizer rewrite introduced on its own. It deliberately does NOT try to see
through deliberate shell obfuscation (an invocation built via command
substitution, wrapped in an interpreter, or hidden inside a file executed
indirectly) — an earlier version tried to catch inline wrapper commands and
review found that unsound in both directions (an incomplete allowlist AND
false denials on unrelated commands); catching genuine adversarial obfuscation
of an arbitrary shell command is not a bounded problem for a string classifier,
and `SDLC_GUARD_MODE` defaults to `warn` regardless. See
`.claude/hooks/__tests__/review-identity-merge-carveout.test.mjs` for the exact
boundary.

## Validators (`scripts/sdlc/`)

**`validate-state-machine.mjs`** — structural + referential validator for
`specs/sdlc-state-machine.yaml`. It checks that every phase carries the stable
contract fields, that there are no duplicate phase ids, that each `next_phase`
resolves to a real phase id or the terminal sentinel `none` (with terminal
phases pairing `next_phase: none` and `next_trigger: none`), and that every
skill under the skills dir (`.ai/skills/`, where `.claude/skills` symlinks) is
registered as a phase `owner_skill`, a domain skill, or in the `exempt:` list —
and conversely that every owner/domain skill resolves to a real skill. Exit 0
when valid, 1 with diagnostics otherwise. Run:
`node scripts/sdlc/validate-state-machine.mjs`.

**`validate-phase-memory.mjs`** — validator for the optional `phase:` block in
each `specs/tasks/SPEC-NNN/_index.yaml`. Absence of the block is compliant
(additive/optional). When present, `current` and `next_action` must be a valid
state-machine phase id or `none`; `next_trigger` and `updated` must be present;
and the optional `exit_condition_met` / `handoff_surfaced` flags must be
booleans. An unmatched shell glob (no `specs/tasks/` yet on a fresh repo) is a
clean no-op, not a failure — an explicit missing literal path still fails. It
exports `validatePhaseBlock` / `loadPhaseIds` / `parsePhaseBlock` for in-process
tests. Run: `node scripts/sdlc/validate-phase-memory.mjs <_index.yaml> [...]`.

**`gen-handoffs.mjs`** — generates the phase-handoff documentation FROM the
state machine so it never drifts from the source. It writes/refreshes a
marker-delimited `## Handoff` footer on each phase owner-skill `SKILL.md`
(reviewer/standards skills excluded) and the phase-narrative section of
`.ai/sdlc.md`. Generation is idempotent: hand-edits outside the markers are
preserved, and `--check` reports drift without writing (suitable as a CI gate).
Run: `node scripts/sdlc/gen-handoffs.mjs` (write) or
`node scripts/sdlc/gen-handoffs.mjs --check` (verify).

**`plan-gate.mjs`** — the fail-closed plan-review gate (ADR-002, re-homed by
ADR-003). Reads the top-level `plan_review:` block from one or more
`specs/tasks/SPEC-NNN/_index.yaml`. **Two modes:** the default checks
**approval** — exits 0 only when the block is present, `approved: true`, and not
`needs-rework` (a *missing* block halts exactly like an unapproved one); this is
what `spec-execution` runs, per-spec, before a delivery run starts. `--presence-only`
checks only that the block **exists**, run repo-wide in CI — approval is a
per-spec, run-start question, so enforcing it on every PR would redden any PR
touching a spec still mid-decomposition. An unmatched shell glob (no
`specs/tasks/` yet on a fresh repo) is a clean no-op in either mode, not a
failure — see `empty-glob.test.mjs`. Exports `planApproved` / `parsePlanReviewBlock`
/ `checkPlanGate`. Run: `node scripts/sdlc/plan-gate.mjs specs/tasks/SPEC-NNN/_index.yaml`
or `node scripts/sdlc/plan-gate.mjs --presence-only specs/tasks/*/_index.yaml`.

**`reviewer-routing.mjs`** — lens → reviewer resolution (ADR-001, re-homed by
ADR-003). The binding is data on the constraint that owns the lens
(`.ai/skills/review-constraints.yaml` → optional `agent:`); a lens with no such
constraint folds into the generic `task-reviewer`. Exports `agentForLens` /
`parseConstraints` / `loadConstraints`. Run:
`node scripts/sdlc/reviewer-routing.mjs <lens>` or `--list`.

**`validate-review-envelope.mjs`** — the owner of reviewer-envelope validation.
Every returned verdict is checked against `.ai/skills/review-envelope.schema.json`
plus the grounding rule (a `blocker`/`major` finding must cite an allowed PR-side
prefix). Exit **0** valid + assessed (fold the findings), **2** valid but
`reviewer_status: abstained` (escalate — never an accept), **3** malformed,
absent or ungrounded (contract violation: re-dispatch or escalate). Never let a
malformed envelope fold to "no findings" — that is the silent-accept path.
Exports `validateEnvelope` / `PR_SIDE_PREFIXES`. Run:
`node scripts/sdlc/validate-review-envelope.mjs <envelope.json>` (or `-` for stdin).

**`check-review-constraint-globs.mjs`** — resolvability gate for the review
registry. Every `when.touches` glob should match at least one real file: a dead
glob silently advertises coverage that can never fire, which matters more now that
the registry is the review floor the panel is graded against. (Note what this does and
does not prove: it checks that a row's globs RESOLVE, not that a reviewer consulted the
row — nothing mechanical evaluates the registry since ADR-003 retired the engine's
selector.) **Warn by default** (the shipped
registry is illustrative); pass `--enforce` in CI once a repo has replaced the
example rows. Run: `node scripts/sdlc/check-review-constraint-globs.mjs [--enforce]`.

## Tests

`node --test scripts/sdlc/*.test.mjs` covers the plan gate, reviewer routing, the
envelope validator, the registry glob checker, and PR-side prefix parity
(`review-primitives.md` ↔ the validator's `PR_SIDE_PREFIXES` ↔ the envelope
schema ↔ the `pr-reviewer` GROUNDING block). `node --test
.claude/hooks/__tests__/*.test.mjs` covers the goal leash and the merge
carve-out. Both suites are dependency-free and hermetic.

## Reviewer agents (`.claude/agents/`)

The registry routes a lens to an agent NAME (ADR-001); these files are what those
names resolve to. Their `tools:` line omits `Edit`/`Write`, which is how reviewer
independence is enforced rather than merely instructed — a reviewer that cannot edit
cannot fix what it grades.

`task-reviewer` backs every lens that names no specialist. `security-reviewer`,
`design-fidelity-reviewer` and `integration-reviewer` are dispatched by an `agent:`
field in the registry or by the gate itself. Two tests in `reviewer-routing.test.mjs`
hold the contract: every routed name resolves to a file, and no reviewer carries
Edit/Write.

## `check-stale-citations.mjs`

Corpus-wide, no changed-file scope: the defect this catches sits in files nobody is
editing. Scoped by blast radius — a wholly superseded decision cited as current in
always-loaded context (`.ai/**`, `.claude/{agents,hooks,skills}/**`) fails the build;
the same citation in a spec body, a plan or a test only reports. `--strict` fails on
both. Detection is frontmatter-only (`superseded_by`), so a row-level reversal is out
of scope: no automated check can tell which of an ADR's rows a citation relies on.

## `complete-spec.mjs`

Grades whether a spec's `## Success criteria` are all checked. Exit 0 completable,
1 not, 2 on a bad argument or missing spec. It never writes — whether the evidence
substantiates a criterion is judgment. An empty criteria section refuses, because zero
criteria is not zero unchecked criteria.

## `archive-specs.mjs` and `resolve.mjs`

`archive-specs.mjs` moves specs whose status has reached a terminal value under
`specs/archive/`, with their task trees, using `git mv`. Two denylist clauses,
both derived at runtime: a spec a live skill names, and a spec that is the `spec:`
binding of a non-archived ADR. Modes: default moves, `--check` exits 1 when the
boundary is wrong (this is the CI gate), `--dry-run` prints the plan.

`resolve.mjs` maps an id to its file, live or archived, reading the filesystem
directly so ripgrep's ignore rules do not apply. It is what keeps the fence a
filter rather than a trap: ids are how the corpus refers to itself.

## Forthcoming validators

The framework also intends to ship (documented here as forthcoming) a
review-contract drift checker (keeping `review-primitives.md` consumers in
sync), a DAG-acyclicity check over the `_index.yaml` `depends_on` graph, an
acceptance-criteria coverage check, and a one-workspace-per-task check.
