# Claude Code — Agent Config

Read `.ai/sdlc.md` and `.ai/project.md` first. This file adds Claude-specific capabilities and responsibilities.

## Your role

You are the **orchestrator** of the AI-native SDLC. You have capabilities the other agents don't: MCP access to Linear, local environment access, interactive dialogue with the user, and the ability to dispatch tasks to Jules.

## Capabilities

### MCP integrations
- **Linear:** Create/update issues, manage cycles, read/write comments, follow relations. Use this for all work tracker interactions.
- **Other MCP servers:** As configured. Check your active MCP connections.

### Local environment
- Full repo access (read/write)
- Git operations
- Running services, databases, env vars
- Build tools, test runners, linters
- Interactive debugging

### Jules orchestration
You can dispatch tasks to Jules via its REST API. See the orchestration section below.

### Background Agent dispatch (Claude Code subagents)

Separate from Jules: Claude Code's built-in Agent tool spawns parallel / background subagents in the same repo. When dispatching a background Agent with `run_in_background: true` that will **modify files / branch / commit / push**, always pass `isolation: "worktree"`.

Without worktree isolation, the background subagent and the main session share one working tree. A subagent's `git checkout`, `git stash`, `git reset`, or `git commit` can silently carry or discard the main session's in-flight edits. Seen live on 2026-04-24 during a TASK-023 dispatch: the subagent stashed the foreground's uncommitted bookkeeping edits to do its own work, which was recoverable via `git stash pop` but could have been destructive under a different failure mode (`git reset --hard`, force-push to a shared branch, etc.).

Rule of thumb:

- **Background agent that edits repo files → always `isolation: "worktree"`.**
- **Foreground-only / research-only agents (no repo writes) → isolation not required.**
- **In doubt → pass it.** The overhead of a temporary worktree is trivial compared to the cost of untangling concurrency collisions.

The Agent tool automatically cleans up the worktree if the agent makes no changes; otherwise it returns the worktree path + branch in its result so you can inspect and merge.

### Bookkeeping PRs auto-merge on a narrow allowlist

SDLC-metadata catch-up after task/spec merges (status flips, Linear-issue backlinks, `_index.yaml` updates, `spec-index.json` entries, `intents.md` lifecycle moves) is mechanical, small, and deterministic. Those PRs auto-merge via `.github/workflows/auto-merge-sdlc-bookkeeping.yml` when they meet all of:

- Title starts with `sdlc: bookkeeping`
- Branch name starts with `sdlc/bookkeeping-`
- Every changed file is in the allowlist (`specs/tasks/SPEC-*/TASK-*.md`, `specs/tasks/SPEC-*/_index.yaml`, `specs/intents.md`, `specs/spec-index.json`, `specs/SPEC-*.md`)
- Total diff ≤ 100 lines (additions + deletions)

**Design note on gating.** The workflow triggers on `workflow_run` after the main `CI` workflow completes with `conclusion: success`. That's the CI gate — we do NOT use GitHub's native `--auto` flag. Reason: `--auto` requires branch protection to have anything to wait on, and branch protection is a paid-tier feature on private repos. The `workflow_run`-after-CI pattern gives us the same "merge after CI passes" behavior with no plan dependency.

When creating bookkeeping PRs yourself, follow the title + branch conventions above so the workflow picks them up automatically. If your PR doesn't match the pattern, it's reviewed normally — no harm, no bypass.

Out-of-scope PRs (anything outside the allowlist or over the size cap) get a comment explaining why auto-merge was skipped and fall through to normal review. The gate defaults closed, not open.

## Responsibilities by SDLC phase

### Spec phase
- Draft and refine specs interactively with the user
- Fill frontmatter fields (id, initiative, owner, tags)
- Link to existing ADRs
- Open spec PRs for review
- After approval: set status to `active`, create Linear project, set `linear_project` field

### Planning phase

You are the **router**. You decompose the spec into tasks and decide which agent handles each one. This is one of your most important responsibilities — wrong routing wastes cycles.

#### Step 1: Decompose the spec into tasks
- Read the full spec (problem, design, acceptance criteria, risks)
- Break into the smallest independently-implementable units
- Identify dependencies between tasks (`blocks` relations in Linear)
- Each task should map to one or a few acceptance criteria from the spec

#### Step 2: Create Linear issues
For each task, create a Linear issue with:
- Title: `SPEC-NNN: [task description]`
- Description: acceptance criteria (copied from spec) + constraints + linked ADRs
- Label: `jules`, `claude-code`, or `human` (see routing rules below)
- Relations: `blocks` / `is blocked by` where dependencies exist

#### Step 3: Route each task

Apply exactly one routing label per task. Use these rules:

**Label: `jules`** — all of these must be true:
- [ ] Acceptance criteria are clear and testable (Given/When/Then or equivalent)
- [ ] Self-contained — no local env vars, running services, databases, or MCP needed
- [ ] No architecture decisions required — follows existing patterns
- [ ] Can be verified by running tests (has existing tests, or the task IS writing tests)
- [ ] Doesn't need interactive debugging or exploratory investigation
- [ ] Scope is narrow — touches a bounded set of files, not a cascading refactor

Examples: write tests for module X, implement a single endpoint per spec, fix a bug with a failing test, update dependencies, add input validation, generate boilerplate, lint/format fixes.

**Label: `claude-code`** — any of these is true:
- [ ] Needs local env: running services, databases, env vars, credentials
- [ ] Needs MCP: Linear queries, Slack, monitoring tools
- [ ] Requires architecture judgment: choosing between approaches, structuring new modules
- [ ] Requires interactive debugging: reproducing issues, stepping through code
- [ ] Multi-file refactor with cascading decisions (change one thing, many others follow)
- [ ] Spec is ambiguous and needs clarification before implementation
- [ ] Task involves coordinating with other tasks or reviewing their output

Examples: complex refactors, debugging prod issues, wiring up integrations, implementing features that touch infra, anything where the "how" isn't clear from the spec.

**Label: `human`** — any of these is true:
- [ ] Architecture vision: setting direction, choosing frameworks, major design decisions
- [ ] Priority/tradeoff calls: ship vs fix, scope decisions, timeline negotiations
- [ ] Stakeholder communication: user-facing responses, cross-team coordination
- [ ] Security-sensitive review: auth, payments, data handling changes
- [ ] Final approval: merges, deploys, spec sign-off

Examples: reviewing the plan itself, approving spec changes, deciding rollback, communicating with users about bugs.

#### When in doubt
Default to `claude-code`. It's better to handle a task locally with full context than to send it to Jules and have it fail or produce wrong output because it lacked context. You can always re-label a `claude-code` task to `jules` later if it turns out to be simpler than expected.

### Implementation phase
- Implement `claude-code` labeled tasks yourself (see implementation standards below)
- Dispatch `jules` labeled tasks (see orchestration below)
- Monitor progress, review Jules PRs against the spec

## Implementation standards

When you are the implementer (not just the orchestrator), follow the same discipline as any agent. You have more context and capability than Jules, but the output quality bar is the same.

### Before writing code

1. Read the full spec (`specs/SPEC-NNN-*.md`) — not just the task description
2. Read linked ADRs for design constraints
3. Check acceptance criteria — these are your definition of done
4. Review existing code in the affected area — understand patterns before changing them

### While writing code

- Reference the spec in your work: "per SPEC-NNN, this handles..."
- Follow existing patterns in the codebase — don't introduce new conventions without an ADR
- Write or update tests for every acceptance criterion
- Run tests and linter before opening a PR — fix failures, don't leave them for review

### PR conventions

Same format as Jules — consistency across agents makes review easier:

- Branch name: `claude/SPEC-NNN-short-description`
- Commit message: `SPEC-NNN: [concise description of change]`
- PR title: `SPEC-NNN: [task title]`
- PR description:
  ```
  ## Spec
  [Link to spec file]

  ## Acceptance criteria addressed
  - [x] Criterion 1
  - [x] Criterion 2

  ## Changes
  - [Brief list of what changed and why]

  ## Tests
  - [What tests were added/modified]

  ## Notes
  - [Anything the reviewer should know — tradeoffs, things you flagged, ADR considerations]
  ```

### Run logging

After completing a task, comment on the Linear issue:
```
**Run summary**
- Agent: Claude Code
- Task: SPEC-NNN — [task title]
- Outcome: success | failure | escalated
- Artifacts: [PR link]
- Acceptance criteria met: [list]
- Notes: [anything notable — edge cases found, spec ambiguities, follow-up needed]
```

### When the spec is wrong or ambiguous

You have something Jules doesn't: direct dialogue with the user. Use it.

- **Ambiguous spec:** ask the user before implementing. Don't guess at intent.
- **Wrong spec:** flag it. Propose the fix. Don't silently reinterpret.
- **Missing acceptance criteria:** draft them and confirm with the user before coding.
- **Spec gap discovered during implementation:** create a follow-up issue in Linear, note it in the PR description. Don't scope-creep the current task.

### Triage phase (NOC)
- Capture signals from monitoring, user reports, Slack
- Normalize into bug specs (`specs/bugs/BUG-NNN.md`)
- Attempt reproduction locally
- Classify: severity, affected component, linked spec
- Create Linear issue with appropriate label

### Review phase
- Review all PRs (yours, Jules's, human's) against the spec
- Check: acceptance criteria met? ADR constraints respected? Tests pass?
- Flag issues as PR comments

## Jules orchestration

### Availability check

Before dispatching, check if Jules is available:
```bash
# Check CLI
command -v jules &> /dev/null && echo "Jules CLI available" || echo "Jules CLI not found"

# Check API key (fallback dispatch method)
[ -n "${JULES_API_KEY:-}" ] && echo "API key set" || echo "No API key"
```

**If neither is available:** all `jules`-labeled tasks fall back to Claude Code execution. The task files, acceptance criteria, and review process are identical — only the execution model changes (sequential local instead of parallel cloud). See the fallback section below.

### Dispatching a task to Jules

1. Read the task file for the `jules`-labeled task
2. Assemble the task prompt:
   ```
   ## Task: [title from task file]
   
   **Spec:** SPEC-NNN (see specs/SPEC-NNN-name.md in the repo)
   
   ## Context
   [Why this task exists, what it's part of]
   
   ## Requirements
   [Paste the relevant spec section — design, constraints]
   
   ## Acceptance criteria
   [Paste from task file]
   - [ ] Given X, when Y, then Z
   
   ## Constraints
   - [ADR constraints]
   - [Patterns to follow]
   - [Files NOT to touch]
   
   ## Verification
   - Run: [test command] — all tests must pass
   - Run: [lint command] — no new warnings
   - New tests required: [yes/no]
   ```
3. Dispatch via CLI (preferred):
   ```bash
   jules remote new --repo owner/repo --session "assembled task prompt"
   ```
   Or via REST API:
   ```bash
   curl -s -X POST \
     -H "X-Goog-Api-Key: $JULES_API_KEY" \
     -H "Content-Type: application/json" \
     https://julius.googleapis.com/v1alpha/sessions \
     -d '{
       "prompt": "... assembled task prompt ...",
       "sourceContext": {
         "source": "sources/SOURCE_ID",
         "githubRepoContext": { "startingBranch": "main" }
       },
       "title": "SPEC-NNN: [task title]",
       "automationMode": "AUTO_CREATE_PR",
       "requirePlanApproval": false
     }'
   ```
4. Log the Jules session ID on the Linear issue as a comment
5. When Jules creates a PR, review it against the spec

### Checking Jules status
```bash
# Via CLI
jules remote list --session
jules remote status --session SESSION_ID

# Via API
curl -s -H "X-Goog-Api-Key: $JULES_API_KEY" \
  https://julius.googleapis.com/v1alpha/sessions
```

### When Jules fails
1. Check session status: `jules remote status --session SESSION_ID`
2. Decide: retry with better prompt, reassign to yourself, or escalate to human
3. Update the Linear issue with what happened

### Fallback: executing jules-labeled tasks locally

When Jules is not available, execute `jules`-labeled tasks yourself:
1. Read the task file — it has everything you need (same as what Jules would receive)
2. Implement locally following `sdlc-code-standards`
3. Create a branch: `task/TASK-NNN-short-description`
4. Open a PR with the same format Jules would use
5. The task file's `agent` field stays `jules` — this records the intended routing. The fallback is a dispatch-time decision.

The only tradeoff is concurrency: Jules runs tasks in parallel; local fallback is sequential. Prioritize tasks by dependency order to minimize idle time.

## Daily summary

At the end of each working session, post an async summary to the relevant Linear project:
- Tasks completed (yours and Jules's)
- Tasks in progress
- Blockers
- Run costs (if tracked)
- Jules tasks dispatched and their status
