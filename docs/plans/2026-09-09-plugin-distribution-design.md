# SDLC as a public Claude Code plugin — design

Status: approved for planning, 2026-09-09.
Follows [`2026-09-09-enforcement-tiers-delivery.md`](2026-09-09-enforcement-tiers-delivery.md) (PR #43, merged).

---

## Problem

The framework has no upgrade path. `bootstrap.sh` carries nine "only if absent" guards, so every
component is copy-once: a repo that adopted in June and re-runs bootstrap today receives nothing
from PR #43 — not the round cap, not archiving, not the reviewer agents, not the 176 tests. The only
way to take an upstream improvement is to diff two checkouts by hand.

That is the concrete pain. Becoming a plugin is the mechanism that fixes it, not the goal.

## Decisions taken

**D1. Audience is public / open-source.** Published to a marketplace anyone can install. This raises
the bar on everything below: strangers' repos have layouts we never anticipated, the illustrative
constraint rows become a product surface, and every breaking change costs support.

**D2. The plugin ships `/sdlc:init`.** A plugin cannot seed repo directories, so the repo-local half
travels as plugin data that an init skill copies into the user's repo via `${CLAUDE_PROJECT_DIR}`.
One install channel, one version number. The rejected alternative — plugin plus a separate `curl | sh`
installer — reintroduces exactly the two-sources drift this effort exists to end.

**D3. `/sdlc:init` interviews and generates real constraint rows.** Not commented examples. See §3
for why an interview is defensible here specifically.

**D4. This repo becomes the plugin.** One repo, one version, no build artifact that can drift from
source. It keeps dogfooding: its own `specs/`, gates and CI stay. The alternative — a build step
emitting a plugin — means the thing users install is not the thing we test, which is precisely how
the propagation defects in PR #43's round 4 arose.

**D5. Restructure by inverting a symlink, not by moving files.** `skills/` becomes the real directory
at the repo root; `.ai/skills` becomes a symlink to it. The repo already uses this pattern in the
other direction (`.claude/skills` → `.ai/skills`, git mode `120000`).

## Why the symlink inversion, concretely

326 references to `.ai/skills` across 70 files. The split is what matters:

| | Files | Can be rewritten? |
| --- | --- | --- |
| Live (docs, scripts, hooks, skills) | 28 | Yes |
| Completed specs and shipped plans | 42 | **No** — a completed spec is immutable under this framework's own rule |

A big-bang move leaves 42 dangling paths inside documents we are not allowed to correct. The
symlink keeps every reference resolving, makes migrating the 28 live ones optional cleanup, and
lets plugin packaging read the real `skills/`.

---

## 1. The seam

The plugin owns what nobody edits. The repo owns what everybody edits, plus anything CI reads.

| Layer | Lives in | Update semantics |
| --- | --- | --- |
| 12 skills, 4 agents, 4 hooks, `review-primitives.md`, `review-envelope.schema.json` | Plugin | Overwritten on update — which is the point |
| `review-constraints.yaml`, `domain_routing`, `.ai/project.md`, `specs/` | Repo | Never touched by an update |
| 11 validators, 2 CI workflows, templates, `.ignore` | Repo | Refreshed only by an explicit `/sdlc:sync` |

Two constraints force that third row, and neither is negotiable:

- **A plugin cannot ship `.github/workflows/`**, and a GitHub Actions runner checks out the repo,
  not the plugin cache. `sdlc-validate.yml` runs `node scripts/sdlc/validate-state-machine.mjs`
  against the repo checkout, so validators must physically exist there.
- **User modifications to plugin-shipped files are destroyed on update.** Anything an adopter is
  expected to edit therefore cannot ship in the plugin, at any cost.

The seam works because `${CLAUDE_PROJECT_DIR}` is available to plugin hooks and MCP servers. The
engine ships generic and reads the repo's law at runtime — the same mechanism-versus-registry-data
line ADR-001 already drew. Skills are prose instructing an agent whose cwd is the repo, so their
60+ repo-path references (`.ai/project.md` ×28, `specs/sdlc-state-machine.yaml` ×14) resolve
normally from a plugin.

## 2. Repo layout after the restructure

```
skills/                    real; the plugin's skills/
agents/                    moved from .claude/agents/
hooks/hooks.json           wraps the four existing .mjs
.claude-plugin/
    plugin.json            manifest + version
    marketplace.json       marketplace entry
init-payload/              validators, workflows, templates, .ignore, config stubs
.ai/skills                 symlink -> skills/
specs/  scripts/sdlc/  .github/workflows/    unchanged; this repo keeps dogfooding
```

## 3. `/sdlc:init` — three phases

1. **Scaffold.** Copy `init-payload/` into the repo through `${CLAUDE_PROJECT_DIR}`. Idempotent,
   never clobbers an existing file.
2. **Interview.** Ask about workspaces, layer boundaries, security surfaces and design surfaces,
   then generate `review-constraints.yaml` rows from the answers.
3. **Prove it.** Run `check-review-constraint-globs.mjs --enforce` so every generated glob must
   resolve against the user's real tree; run the cite-prefix and agent-resolvability tests from
   `reviewer-routing.test.mjs`. A row that does not hold is corrected or dropped before the file is
   written.

Phase 3 is why an interview is safer here than the pattern usually is. The standing objection to
generated config is that it produces confidently wrong rules; this framework already ships gates
that grade the interview's own output, so a wrong glob fails during init rather than at the user's
first review. It does not catch a rule that resolves and is still wrong — that residual is real and
is the reason phase 2 asks rather than infers.

`/sdlc:sync` re-runs phase 1 only, under the never-clobber rule, so an adopter's config survives.

## 4. Hardening required before packaging

- **Move `review-constraints.yaml` out of the skills directory.** It is the one repo-specific file
  sitting in what becomes plugin-owned space; shipping it there destroys every adopter's real
  invariants on their first update. High-gear already keeps its registry at `.ai/sdlc/`.
  `review-primitives.md` and `review-envelope.schema.json` are universal contracts and stay.
- **Fix the hook project-root fallback.** The hooks prefer `CLAUDE_PROJECT_DIR` and fall back to
  walking up from their own location. From a plugin cache that resolves to the wrong tree, and
  because the hooks fail open it degrades to a silent no-op — the failure mode that is hardest to
  diagnose and the one this codebase has now been bitten by three times.
- **Public-surface pass.** README, LICENSE, contribution norms, and versioning discipline: users
  only receive an update when the version string changes.

## 5. Deliberately not doing

- **No `userConfig` prompts.** They are per-user; every setting here is per-project.
- **No MCP server.** Nothing in the framework needs a long-lived process.
- **No splitting into several plugins** until someone actually asks for the spec lifecycle without
  the enforcement tiers.
- **No attempt to ship CI workflows from the plugin.** Unsupported, and the runner could not read
  them anyway.

## 6. Open risk

The interview can generate a constraint that resolves cleanly and still encodes the wrong law. No
gate can catch that. The mitigation is that phase 2 asks rather than infers, and that a wrong row is
cheap to delete — but an adopter who accepts a generated rule they do not understand will get
findings they cannot act on. Worth measuring once there are real adopters.
