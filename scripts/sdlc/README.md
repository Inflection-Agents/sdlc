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

**`stop-handoff.mjs`** (Stop + SubagentStop) — an advisory next-phase handoff at
a phase exit. A Stop hook cannot print to the user, so when a spec's
`specs/tasks/SPEC-NNN/_index.yaml` `phase:` block has `exit_condition_met: true`
(and the handoff has not already been surfaced), it blocks the stop exactly once
with a continuation reason naming the `next_phase` + `next_trigger` (read from
the state machine, keyed by `phase.current`) so the agent surfaces the handoff.
It is a no-op for mid-phase work, honors the block cap (`stop_hook_active`), and
is silent on any error.

**`pre-tool-use-edit-write.mjs`** (PreToolUse, matcher `Edit|Write`) — the
no-active-task gate. It blocks an edit to an implementation-code path when there
is no active task context (the git branch does not match `claude/SPEC-…` |
`task/…` | `spec/…` | `feat/SPEC-…`). Process-artifact paths (`specs/**`,
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
accept is detected. There is **no override** for this gate. Advisory by default;
fails open if either identity cannot be resolved.

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
booleans. It exports `validatePhaseBlock` / `loadPhaseIds` / `parsePhaseBlock`
for in-process tests. Run:
`node scripts/sdlc/validate-phase-memory.mjs <_index.yaml> [...]`.

**`gen-handoffs.mjs`** — generates the phase-handoff documentation FROM the
state machine so it never drifts from the source. It writes/refreshes a
marker-delimited `## Handoff` footer on each phase owner-skill `SKILL.md`
(reviewer/standards skills excluded) and the phase-narrative section of
`.ai/sdlc.md`. Generation is idempotent: hand-edits outside the markers are
preserved, and `--check` reports drift without writing (suitable as a CI gate).
Run: `node scripts/sdlc/gen-handoffs.mjs` (write) or
`node scripts/sdlc/gen-handoffs.mjs --check` (verify).

## Forthcoming validators

The framework also intends to ship (documented here as forthcoming) a
review-contract drift checker (keeping `review-primitives.md` consumers in
sync), a DAG-acyclicity check over the `_index.yaml` `depends_on` graph, an
acceptance-criteria coverage check, and a one-workspace-per-task check.
