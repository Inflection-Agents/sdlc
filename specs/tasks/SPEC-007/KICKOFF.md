execute SPEC-007: Spec-review convergence: cap the loop, mechanize the checks, make findings durable

Goal: a spec review ends in at most four rounds, with every survivor disclosed in the spec, because a validator decides the mechanical checks first and findings keep a stable id and a durable log across rounds.

Use the spec-execution skill and its SOP. Arm the goal file with this statement and these exit criteria:
1. Every step in specs/tasks/SPEC-007/_index.yaml is done, cancelled with a reason, or deferred with a reason that names a decided owner decision.
2. End-to-end validation from the guide ran once on the integration tip, with output attached as evidence.
3. One integration PR, feat/spec-007 to main, is open. Its body maps every SC to evidence, has a "## Guide changes" section (or "none"), and survived the full adversarial panel, capped at three rounds (ADR-004), with any survivor listed under "## Disclosed, not fixed".

Read once, in one batch, before starting:
- specs/SPEC-007-spec-review-convergence.md (the spec), with ADR-005, ADR-006 and specs/decisions/SPEC-007.md
- specs/tasks/SPEC-007/GUIDE.md (8 steps, in order) and specs/tasks/SPEC-007/_index.yaml
- skills/spec-execution/SKILL.md and skills/spec-execution/SOP.md

S4 is a breaking change to the review envelope for both reviewers; every example envelope and agent must validate after it. SC-2 and SC-3 are measured forward from the review log, so the integration PR maps them to the log's existence and shape, not to a measured decline.

Owner decisions pending: none.

Limits:
- Never merge or push to main, and never approve your own PR. Step PRs merge into feat/spec-007 only.
- Stop and escalate (goal status: escalated, with the reason) on security, data-loss or payment risk, a decision that is the owner's and that every remaining step depends on, or a step that cannot land and cannot be fixed at the root.
- A finding that the spec itself is wrong goes to spec-amendment. Do not widen a step to absorb it.

When every criterion holds, set the goal to met, write the phase block, and hand off to spec-completion.
