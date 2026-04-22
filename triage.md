# Triage

How defects move from raw signal to scheduled fix. Bugs are the one area where the flow starts in Linear (not the repo), because non-technical reporters need a low-friction intake path.

## The exception: bugs start in Linear

Everything else in this SDLC starts in the repo (specs, tasks, ADRs). Bugs are different because:

- Non-technical stakeholders need to report them without touching markdown or YAML
- The signal is often vague — "it's broken" — and needs agent-driven investigation before it becomes a structured artifact
- Speed matters more than process: capture first, structure later

**Linear is the intake point. The agent normalizes the signal into the repo.**

## Intake paths

All paths converge at the same point: a Linear issue with the `bug` label.

### Path 1: Linear issue (primary)

For non-technical stakeholders, PMs, or anyone on the team.

1. Create a Linear issue in the project
2. Apply the `bug` label
3. Write whatever you can — a sentence is fine
4. Attach screenshots if available

No template required. No frontmatter. No severity classification. The agent handles all of that.

### Path 2: Error monitoring (Sentry, Datadog, etc.)

Automated alerts from monitoring tools.

1. Alert fires → webhook creates a Linear issue with label `bug` and label `automated`
2. Alert payload attached as issue description
3. Agent picks it up from there

### Path 3: Slack / chat (future)

Someone posts about a bug in a channel.

1. Agent detects the signal (via Slack MCP or integration)
2. Agent creates a Linear issue with label `bug`, copies the relevant message
3. Agent replies in the thread: "I've captured this — tracking as [Linear issue link]"

### Path 4: In-app feedback (future)

User submits feedback from within the product.

1. Feedback widget creates a Linear issue with label `bug` and label `user-report`
2. Includes: user ID, page, browser, timestamp, user's message
3. Agent picks it up from there

## Pipeline

```
Signal (Linear issue with bug label)
  │
  1. Detect    → NOC agent finds new bug-labeled issues
  │
  2. Clarify   → Agent asks reporter for missing context (as Linear comments)
  │
  3. Normalize → Agent creates structured bug spec in repo
  │
  4. Reproduce → Agent attempts reproduction
  │
  5. Classify  → Agent proposes severity, links spec, identifies component
  │
  6. Confirm   → Human engineer reviews (<60 seconds)
  │
  7. Prioritize → Human PM/lead makes the call
  │
  8. Fix       → Agent creates task files, routes for implementation
```

## Stage details

### 1. Detect — agent monitors Linear

The NOC agent periodically checks Linear for new issues with the `bug` label (or receives a webhook notification). This is the trigger.

### 2. Clarify — agent interviews the reporter

The agent reads the issue and determines what's missing. It asks clarifying questions as Linear comments — this keeps the conversation where the reporter already is.

Questions the agent asks:
- What did you expect to happen?
- What actually happened?
- Can you describe the steps to get there?
- What device/browser are you using?
- When did this start? (Was it working before?)
- Can you share a screenshot or screen recording?

The agent should be conversational, not robotic. One or two targeted questions, not a form with 15 fields.

If the reporter already provided enough context, the agent skips this step.

### 3. Normalize — agent creates bug spec in repo

The agent creates a structured bug spec file:

**File:** `specs/bugs/BUG-NNN-short-description.md`

```yaml
---
id: BUG-NNN
title: "Login times out on mobile Safari"
status: reported
severity: sev2                    # agent's proposal, human confirms
violates: SPEC-001                # which spec this contradicts
regression_of:                    # optional: run or PR that introduced it
source: user-report | monitoring | eval-regression | internal
reporter: Linear issue author
assignee:                         # set after prioritization
linear_issue: LIN-XYZ             # the original intake issue
created: 2026-04-22
updated: 2026-04-22
confidence: high | medium | low   # agent's self-assessment
---

## Observed

[What actually happens — in the reporter's words, cited]

## Expected

[What should happen — linked to the spec it violates]

## Repro steps

1. [Step by step]

## Environment

[Version, platform, browser, account]

## Evidence

[Stack trace, screenshot, error log, session replay — attached or linked]

## Investigation

[What the agent found: recent deploys, related merges, similar bugs, frequency]
```

The agent also updates the original Linear issue:
- Adds the structured description (observed/expected/repro) as a comment
- Links to the bug spec file in the repo
- Applies labels: proposed severity (`sev1`/`sev2`/`sev3`), affected component
- Applies label: `needs-confirmation`

### 4. Reproduce — agent attempts in sandbox

The agent tries to reproduce the issue:

| Outcome | What happens |
|---------|-------------|
| **Reproduced** | Agent writes a failing test, attaches it to the bug spec. Strong evidence for confirmation. |
| **Cannot reproduce** | Agent documents what was tried. Flags for human — may need more context from reporter. |
| **Works as designed** | Agent links to the spec that defines current behavior. Proposes closing as "not a bug — possible spec gap." Human decides. |

### 5. Classify — agent proposes

The agent proposes:
- **Severity:** sev1 (critical), sev2 (major), sev3 (minor)
- **Affected component:** which part of the system
- **Violated spec:** which spec defines the expected behavior
- **Root cause area:** suspected location in the codebase
- **Agent-fixable?** Can an agent handle the fix, or does it need human judgment?

All of this is in the bug spec frontmatter and body. The agent also comments on the Linear issue with a summary.

### 6. Confirm — human reviews

An engineer (on-call, domain lead, or EM) reviews the agent's work. Target: **<60 seconds.**

They see in the Linear issue:
- Structured description (observed/expected/repro)
- Proposed severity
- Linked spec
- Reproduction result (failing test, or "could not reproduce")
- Agent's confidence level

They either:
- **Confirm:** change label from `needs-confirmation` to `confirmed`. Agent proceeds.
- **Reject:** close with reason — `duplicate`, `wontfix`, `works-as-designed`, `not-enough-info`. Agent updates bug spec status.
- **Reclassify:** change severity, component, or linked spec. Agent updates bug spec.

### 7. Prioritize — human decides

PM or tech lead decides when this gets fixed, considering:
- Severity and impact
- Current cycle capacity
- Competing priorities
- Customer relationships

The agent provides:
- Impact estimate (users affected, frequency, trend)
- Cost estimate (agent-fixable? how complex?)
- Cluster analysis (is this the Nth report of the same root cause?)
- Conflict analysis (what in-flight work does this affect?)

Human makes the call. Agent drafts the rationale on the Linear issue for audit.

### 8. Fix — agent creates task files

Once prioritized, the bug needs to become executable work:

1. Agent creates task files in `specs/tasks/BUG-NNN/`:
   ```
   specs/tasks/BUG-NNN/
   ├── _index.yaml
   ├── TASK-NNN-write-failing-test.md     (if not already done in reproduce step)
   ├── TASK-NNN-implement-fix.md
   └── TASK-NNN-add-regression-guard.md
   ```
2. Agent applies routing labels (`jules` or `claude-code`) based on eligibility rules
3. Agent creates corresponding Linear issues linked to the bug issue
4. Fix proceeds through normal task execution flow

## The NOC agent

The NOC agent is a role, not a separate system. It's Claude Code (or equivalent) running in triage mode. Its responsibilities:

- Monitor Linear for new `bug`-labeled issues
- Run the full pipeline: clarify → normalize → reproduce → classify
- Maintain the bug spec in the repo
- Keep the Linear issue updated at every step
- Escalate immediately for: security, data loss, payments, sev1 components

The NOC agent can run as a scheduled task, a webhook-triggered process, or simply as part of a developer's daily routine ("check for new bugs before starting feature work").

## Escalation rules

Agent must hand off to a human immediately for:
- Security vulnerabilities
- Data loss or corruption
- Payment/billing issues
- Anything touching sev1 components
- Anything affecting >N% of users (define N per product)
- Agent confidence below threshold on severity

## Human roles

| Role | Who | Does what | Time per bug |
|------|-----|-----------|--------------|
| **Reporter** | Anyone — stakeholder, PM, user, support, oncall | Creates a Linear issue with `bug` label. A sentence is enough. | 1–2 min |
| **Confirmer** | On-call engineer or domain lead | Reviews agent's normalized spec. Confirms, rejects, or reclassifies. | <60s |
| **Prioritizer** | PM or tech lead | Decides when and whether to fix, considering business context. | 2–5 min |

## What reporters see

The experience for a non-technical reporter:

1. Create a Linear issue, write "login is broken on mobile," add `bug` label
2. Within minutes, the agent comments: "Thanks — can you tell me what browser you're using and whether you see an error message?"
3. Reporter replies
4. Agent comments: "I've reproduced this. It's a timeout in the auth service on Safari 17. I've filed it as sev2 and linked it to the auth spec. An engineer will confirm shortly."
5. After confirmation: "This is confirmed and prioritized for the current cycle. I'll notify you when the fix is merged."
6. After fix: "This is fixed in PR #234, deploying today."

The reporter never touches markdown, YAML, or the repo. They stay in Linear and get specific, cited updates at every stage.

## Context capture checklist

What the NOC agent must gather before producing the bug spec:
- [ ] Reporter's exact words (cited, not paraphrased)
- [ ] Recent deploys (last 48h)
- [ ] Recent merges touching affected files
- [ ] Related open bugs (cluster analysis)
- [ ] Prior reports from the same reporter
- [ ] The spec version in production vs. in main
- [ ] Session replay or request logs if available
- [ ] Error frequency and trend (new? increasing? stable?)
- [ ] Stack trace or error log if available

## Anti-patterns

- **Agent closes bugs silently.** Always surface works-as-designed findings for human review.
- **Bug spec without linked spec.** If there's no spec to violate, it's either a spec gap or a feature request — classify it correctly.
- **Separate bug board.** Bugs compete with features for cycle capacity. Same board, same burndown.
- **Triage meetings as data entry.** The meeting is for prioritization only. All investigation happens before humans sit down.
- **Requiring reporters to fill templates.** The agent does the structuring. The reporter's job is to describe the problem in their own words.
- **Skipping the confirmation step.** The agent proposes; the human confirms. No auto-closing, no auto-prioritizing.
