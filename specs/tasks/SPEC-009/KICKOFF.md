execute SPEC-009: One .sdlc/ folder: consolidate the adopter footprint and migrate existing repos on /sdlc-sync

Goal: deliver SPEC-009, so a fresh /sdlc-init adds only .sdlc/, specs/ and .github/ as top-level directories, every validator, hook and skill resolves paths through one module, and /sdlc-sync migrates plugin-init and forked repos to layout 2 on a reviewable branch.

Use the spec-execution skill and its SOP. Arm the goal file with this statement and these exit criteria:
1. Every step S1 to S10 in specs/tasks/SPEC-009/_index.yaml is done, cancelled with a reason, or deferred with a reason that names a decided owner decision.
2. End-to-end validation from the guide ran once on the integration tip, with output attached as evidence, including the SC-2 run on a local clone of high-gear-apps.
3. One integration PR, feat/spec-009 to main, is open. Its body maps SC-1 to SC-5 to evidence, has a "## Guide changes" section (or "none"), and survived the full adversarial panel, capped at three rounds (ADR-004), with any survivor listed under "## Disclosed, not fixed".

Read once, in one batch, before starting:
- specs/SPEC-009-sdlc-folder-consolidation.md (the spec; 23 ACs)
- specs/tasks/SPEC-009/GUIDE.md (10 steps, in order) and specs/tasks/SPEC-009/_index.yaml
- specs/adrs/ADR-008-sdlc-folder-layout.md
- skills/spec-execution/SKILL.md and skills/spec-execution/SOP.md

Before S1:
- Confirm SPEC-007 has merged and SPEC-003 is closed (D1). If either is not, stop and escalate.
- Rebase every Changes: list in the guide onto the tree after SPEC-007, and log each change as a guide change in DECISIONS.md.

Run traps:
- S1 to S4 keep layout 1 working at every step. This repo stays on layout 1 until S10, so its own gates must pass through the fallback in between.
- Build every fixture as a temp git repo. The plugin-init fixture comes from the 0.3.0 payload at 89cba06, never the working tree.
- The SC-2 clone lives in the scratchpad. Never push it, and never run the migration on ~/_code/high-gear-apps itself.

Owner decisions pending: none (D1 is decided).

Limits:
- Never merge or push to main, and never approve your own PR. Step PRs merge into feat/spec-009 only.
- Stop and escalate (goal status: escalated, with the reason) on security, data-loss or payment risk, a decision that is the owner's and that every remaining step depends on, or a step that cannot land and cannot be fixed at the root.
- A finding that the spec itself is wrong goes to spec-amendment. Do not widen a step to absorb it.

When every criterion holds, set the goal to met, write the phase block, and hand off to spec-completion.
