# Roles

Clear boundaries between what AI agents do and what humans do at each stage of the SDLC.

## Role matrix

| Stage | AI does | Human does |
|-------|---------|------------|
| **Discovery** | Research prior art, summarize user feedback, draft problem statements | Define the problem worth solving, validate with users |
| **Spec writing** | Draft specs from conversations/requirements, link to existing ADRs | Review, refine intent, approve. Decide what's in/out of scope |
| **Planning** | Decompose specs into tasks, estimate effort, identify risks and dependencies | Review plan, challenge assumptions, approve approach |
| **Implementation** | Execute tasks (write code, tests, docs), open PRs | Review PRs, pair on ambiguous problems, own architecture decisions |
| **Triage** | Capture signals, normalize bug specs, attempt reproduction, classify | Confirm bugs, prioritize, decide tradeoffs |
| **Testing** | Write and run tests, generate edge cases, run evals | Define acceptance criteria, validate UX, exploratory testing |
| **Review** | Static analysis, consistency checks, flag regressions | Code review for intent, architecture, and maintainability |
| **Deploy** | Execute deployment steps, monitor rollout | Approve releases, decide rollback |
| **Incident response** | Correlate signals, draft timelines, propose fixes | Own communication, make severity calls, authorize hotfixes |

## What stays human forever

- **Judgment calls on tradeoffs** — ship vs fix, customer X vs customer Y, tech debt vs velocity
- **Stakeholder relationships** — talking to the affected user, negotiating with other teams
- **Spec intent** — deciding what the system *should* do (agents propose, humans decide)
- **Accountability** — severity, SLA, "who owns this"
- **Architecture vision** — agents suggest, humans decide direction

## Agent operating model

Think of the agent as a **very fast, tireless junior engineer who drafts well but needs sign-off**.

### Agent capabilities
- Read all code, specs, docs, git history
- Write code, tests, and documentation
- Open PRs and respond to review feedback
- Run builds, tests, and evals
- Search error logs and monitoring
- Draft specs, plans, and bug reports

### Agent constraints
- Cannot merge without human approval
- Cannot deploy without human approval
- Cannot close bugs without human confirmation
- Cannot make priority decisions
- Cannot communicate with external users
- Must cite sources for all claims
- Must self-report confidence levels
- Must escalate on security, data, and payment issues

### Agent budget
Each run has a budget:
- Token limit per run
- Wall-clock timeout
- Maximum tool calls
- Cost ceiling

If the agent hits a budget limit, it escalates with a summary of progress and what it needs to continue.
