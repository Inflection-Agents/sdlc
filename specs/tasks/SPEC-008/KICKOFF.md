execute SPEC-008: Delivery guide replaces task decomposition

Goal: deliver SPEC-008, so a spec goes from an approved spec plus a short delivery guide straight to spec-execution, and the task-decomposition phase, skill, schema and template are gone.

Use the spec-execution skill and its SOP. Arm the goal file with this statement and these exit criteria:
1. Every step S1 to S9 in specs/tasks/SPEC-008/_index.yaml is done, or deferred with a reason that names a decided owner decision.
2. End-to-end validation from the guide ran once on the integration tip, with output attached as evidence.
3. One integration PR, feat/spec-008 to main, is open. Its body maps SC-1 to SC-5 to evidence, has a "## Guide changes" section (or "none"), and survived the full adversarial panel, capped at three rounds (ADR-004), with any survivor listed under "## Disclosed, not fixed".

Read once, in one batch, before starting:
- specs/SPEC-008-delivery-guide-replaces-decomposition.md (the spec; 20 ACs)
- specs/tasks/SPEC-008/GUIDE.md (9 steps, in order) and specs/tasks/SPEC-008/_index.yaml
- specs/adrs/ADR-007-delivery-guide-replaces-decomposition.md
- skills/spec-execution/SKILL.md and skills/spec-execution/SOP.md

This run delivers from a guide before the tooling for guides exists. The owner's sign-off authorizes that. So:
- Today's skill section 1 requires decomposed tasks. Skip that check. Run plan-gate.mjs on the _index.yaml; it must exit 0.
- At run start, create DECISIONS.md and log "## EXECUTIVE DECISION — delivering SPEC-008 from a guide" recording that authorization.
- Follow the spec's Design > Delivering SPEC-008 rule 5 from the start: branches claude/SPEC-008-S<n>, DECISIONS.md headings "## S<n> — <title>", guide changes logged as "## EXECUTIVE DECISION — guide change: <summary>" and listed in the PR, and a task:scope blocker re-plans the guide in place.
- Read guide fields where the skill reads task fields: one task-list entry per step, Changes: for touches, the step PR body for per-AC evidence.
- S1 lands validate-guide.mjs. Run it on specs/tasks/SPEC-008/GUIDE.md and record the result in DECISIONS.md.
- Until S6 merges, the Stop hook reads the old state machine and may suggest "decompose SPEC-008". Ignore it.

Step order matters. S6 deletes skills/task-decomposition/ in the same commit that removes its phase, because validate-state-machine.mjs fails on an unregistered skill directory. S7 drops task-schema from exempt: when the file goes.

Owner decisions pending: none.

Limits:
- Never merge or push to main, and never approve your own PR. Task-step PRs merge into feat/spec-008 only.
- Stop and escalate (goal status: escalated, with the reason) on security, data-loss or payment risk, a decision that is the owner's, or a step that cannot land and cannot be fixed at the root.
- A finding that the spec itself is wrong goes to spec-amendment. Do not widen a step to absorb it.
- Leave SPEC-007's uncommitted files alone.

When every criterion holds, set the goal to met, write the phase block, and hand off to spec-completion.
