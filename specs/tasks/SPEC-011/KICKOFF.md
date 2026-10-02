execute SPEC-011: Worktree lifecycle: when to create one, where it goes, and when it is removed

Goal: every worktree an SDLC repo uses has one location, one owner and one removal point, strays are reported with their reason once per session, and a delivery run works in its own spec worktree without the tooling acting on the main checkout.

Use the spec-execution skill and its SOP. Arm the goal file with this statement and these exit criteria:
1. Every step in specs/tasks/SPEC-011/_index.yaml is done, cancelled with a reason, or deferred with a reason that names a decided owner decision.
2. End-to-end validation from the guide ran once on the integration tip, with output attached as evidence.
3. One integration PR, feat/spec-011 to main, is open. Its body maps every SC to evidence, has a "## Guide changes" section (or "none"), and survived the full adversarial panel, capped at three rounds (ADR-004), with any survivor listed under "## Disclosed, not fixed".

Read once, in one batch, before starting:
- specs/SPEC-011-worktree-lifecycle.md (the spec), specs/decisions/SPEC-011.md and specs/adrs/ADR-009-worktree-lifecycle.md
- specs/tasks/SPEC-011/GUIDE.md (6 steps, in order) and specs/tasks/SPEC-011/_index.yaml
- skills/spec-execution/SKILL.md and skills/spec-execution/SOP.md

This run follows the SOP as it stands at the run's start, in the main checkout: the spec-worktree procedure only exists once S6 lands, so do not adopt it mid-run. S1 changes resolveRoot, which every script and hook imports, so run the full suite after it, not only the step's Verify. S1 to S3 need real `git worktree add` fixtures with a bare remote; a path-only fixture does not exercise the behaviour. The spec body's "## Disclosed, not reviewed-clean" entry (F-3e582b60) was fixed after the review cap and not re-reviewed: the gate panel should grade S2's prune rule against it.

Owner decisions pending: none.

Limits:
- Never merge or push to main, and never approve your own PR. Step PRs merge into feat/spec-011 only.
- Stop and escalate (goal status: escalated, with the reason) on security, data-loss or payment risk, a decision that is the owner's and that every remaining step depends on, or a step that cannot land and cannot be fixed at the root.
- A finding that the spec itself is wrong goes to spec-amendment. Do not widen a step to absorb it.

When every criterion holds, set the goal to met, write the phase block, and hand off to spec-completion.
