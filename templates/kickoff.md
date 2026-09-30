<!-- KICKOFF.md: the prompt the owner pastes to start delivery. HARD LIMIT: at most 3,800
     characters for the whole file, this comment included, counted as Unicode characters, not bytes.
     validate-guide.mjs rule 9 fails an approved guide whose KICKOFF.md is missing or longer.
     Generated from this template by spec-authoring (at sign-off) and spec-amendment (at
     re-approval). Rewrite it whole; never hand-edit. Delete this comment when you fill it in. -->
execute SPEC-NNN: <spec title>

Goal: <one sentence from the spec's Problem: what is true once this spec is delivered>.

Use the spec-execution skill and its SOP. Arm the goal file with this statement and these exit criteria:
1. Every step in specs/tasks/SPEC-NNN/_index.yaml is done, cancelled with a reason, or deferred with a reason that names a decided owner decision.
2. End-to-end validation from the guide ran once on the integration tip, with output attached as evidence.
3. One integration PR, feat/spec-NNN to main, is open. Its body maps every SC to evidence, has a "## Guide changes" section (or "none"), and survived the full adversarial panel, capped at three rounds (ADR-004), with any survivor listed under "## Disclosed, not fixed".

Read once, in one batch, before starting:
- specs/SPEC-NNN-<slug>.md (the spec)
- specs/tasks/SPEC-NNN/GUIDE.md (<N> steps, in order) and specs/tasks/SPEC-NNN/_index.yaml
- skills/spec-execution/SKILL.md and skills/spec-execution/SOP.md

<Only when this run has something unusual: step-order traps, steps a human must run (Run by:), a
browser or data-pipeline validation. One line each. Otherwise delete this paragraph.>

Owner decisions pending: <D1: question, or "none">.

Limits:
- Never merge or push to main, and never approve your own PR. Step PRs merge into feat/spec-NNN only.
- Stop and escalate (goal status: escalated, with the reason) on security, data-loss or payment risk, a decision that is the owner's and that every remaining step depends on, or a step that cannot land and cannot be fixed at the root.
- A finding that the spec itself is wrong goes to spec-amendment. Do not widen a step to absorb it.

When every criterion holds, set the goal to met, write the phase block, and hand off to spec-completion.
