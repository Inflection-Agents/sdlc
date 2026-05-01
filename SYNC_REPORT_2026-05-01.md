# SDLC canonical sync — 2026-05-01

Curated changes from `~/_code/high-gear` (the live workspace where the SDLC has evolved) into this canonical repo. Done on branch `sync-from-high-gear-2026-05-01`. Not pushed.

## What changed

### `.ai/CLAUDE.md`
- **New section: "Background Agent dispatch (Claude Code subagents)."** Captures the rule that any background subagent which modifies repo state must be spawned with `isolation: "worktree"`. Includes a real-world incident (a subagent stashed the foreground's uncommitted edits) and the rule of thumb. Generic — applies to any repo using Claude Code's Agent tool.
- **New section: "Bookkeeping PRs auto-merge on a narrow allowlist."** Documents the `sdlc/bookkeeping-*` branch + `sdlc: bookkeeping` title convention, the file allowlist, the 100-line size cap, and the `workflow_run`-after-CI gating pattern. The design note explains why we don't use GitHub's native `--auto` flag (branch protection is paid-tier on private repos).
- **Generalized one HG-specific reference:** the example `jules remote new` line was reverted from `--repo High-Gear-Data/high-gear-apps` back to the canonical `--repo owner/repo` placeholder.

### `.ai/sdlc.md`
- Two-line update generalizing "the local agent (Claude Code or equivalent)" to "the local orchestrator (Claude Code, Gemini CLI, or equivalent)" and pointing at "`CLAUDE.md` or `GEMINI.md`" rather than just CLAUDE.md.

### `.ai/AGENTS.md`
- One-line update mentioning Gemini CLI alongside Claude Code as a project.md consumer.

### `.ai/setup.md`
- Substantial rewrite to match HG's evolved version:
  - Multi-agent framing (Claude Code + Gemini CLI as peer orchestrators; Jules as cloud executor).
  - Numbered sections (1–9) instead of flat headings.
  - Added Gemini CLI install path.
  - Added Superpowers behavioral-skill install for both Claude Code and Gemini CLI.
  - Added a "Wire skills into your agents" section explaining the `.ai/skills/ → .claude/skills/` symlink + `~/.agents/skills/` for Gemini.
  - Added GEMINI.md to the directory structure diagram.
- **Generalized HG specifics:** removed `pnpm dev:bootstrap` / `pnpm dev:setup` / Node 22+ / pnpm 10+ / uv / Supabase CLI requirements (those belong in `project.md` of the receiving repo). Phrased toolchain bootstrap as "if the repo provides a script, prefer that; otherwise run `./sdlc/bootstrap.sh`."

### `templates/project.md`
- Changed `.claude/skills/` → `.ai/skills/` in the "Workspace skills" section. HG converged on storing skills under `.ai/skills/` (with `.claude/skills` as a symlink to it) so they travel with the rest of the `.ai/` SDLC content. New repos should follow that convention.

### New: `.ai/skills/` (8 skills)
HG authored a full SDLC skill suite that doesn't exist in this canonical repo. Copied the **8 SDLC-process skills** verbatim (HG-specific examples like dbt and Next.js are kept as illustrative — they show what kind of workspace patterns live in domain skills, not what conventions the receiver must adopt):

- `create-domain-skill` — process for codifying a new workspace's conventions into a skill.
- `intent-triage` — captured-intents → ready-spec promotion process.
- `sdlc-code-review` — universal code-review checklist + how to layer in domain skills.
- `sdlc-code-standards` — universal implementation principles (TDD, DRY, YAGNI, no DEPRECATED zombies). The "Three-layer enforcement" framing — standards declared here, override prohibition in upstream skills, self-review baked in — is the most important pattern.
- `spec-amendment` — controlled changes to active specs.
- `spec-authoring` — drafting a new spec, including the workspace constraints checklist.
- `spec-completion` — closing out a spec (status flips, ceremony PR, retro capture).
- `task-decomposition` — spec → tasks, single-workspace assignment, contract-pinning between dependent tasks.

The 8 skills mention `dbt` / `Next.js` / `Supabase` as illustrative example workspaces. These references are educational, not directive — they show the receiver what domain skills look like. Generalized phrasing would be vaguer and less useful.

## What was deliberately NOT carried forward

These are HG-specific skills that have no place in canonical:

- `capture-spec-gap` — HG's specific intent-capture variant tied to its team workflow.
- `dbt-cartographer` — dbt-specific planning skill.
- `dbt-craftsman` — dbt-specific implementation skill.
- `migrate-legacy-metric` — HG's metrics-registry-refactor pattern (SPEC-008/010/011/012 era).
- `nextjs-app-patterns` — HG dealer-app frontend conventions.
- `shared-package-patterns` — HG monorepo internal-package conventions.

If a future canonical user needs domain skills for these technologies, the `create-domain-skill` skill walks them through authoring their own.

## Known follow-ups (out of scope for this sync)

1. **`skills.md` and `bootstrap.sh` still reference `.claude/skills/`.** I updated `templates/project.md` (the file new repos copy from), but the higher-level `skills.md` doc and `bootstrap.sh` script in canonical still describe the old `.claude/skills/`-only convention. To fully align with HG's `.ai/skills/`-with-`.claude/skills`-symlink pattern, those would need updates too. Treat as a separate cleanup PR.

2. **HG has a `GEMINI.md` and a `tools/dev/setup-sdlc.sh`** that I did not port over. The setup-sdlc script is HG-specific (handles `pnpm`, Supabase, dbt). A canonical equivalent would just be the `bootstrap.sh` already present here, possibly extended to do the skills symlink. GEMINI.md is mostly a re-statement of CLAUDE.md for a different agent — adding it is a judgment call about whether canonical wants to be opinionated about Gemini CLI as a peer or just leave it as "available, configure yourself."

3. **HG-specific examples in skills** (TASK-023 incident in sdlc-code-standards, dbt/dealer-app in intent-triage's sample table). Left in as illustrative anchors. Reasonable people could disagree — they help readers see the rule in action; they also imply this is "the High Gear SDLC."

## How to merge

```bash
git -C ~/_code/sdlc log --oneline sync-from-high-gear-2026-05-01 ^main
git -C ~/_code/sdlc diff main..sync-from-high-gear-2026-05-01 --stat
# Review, then either:
git -C ~/_code/sdlc checkout main && git merge sync-from-high-gear-2026-05-01
# or open a PR
git -C ~/_code/sdlc push -u origin sync-from-high-gear-2026-05-01
```
