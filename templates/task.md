---
id: TASK-NNN
spec: SPEC-NNN
title: ""
status: pending
agent: jules | claude-code | human
workspace:                      # primary workspace (see .ai/project.md)
verify_workspaces: []           # workspaces whose tests must pass — include consumers if touching shared code
depends_on: []
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: ""
    status: pending
    evidence: |
      npm test -- --grep auth-middleware
      PASS  tests/middleware/auth.test.ts
        auth middleware
          ✓ extracts JWT from Authorization header (12 ms)
          ✓ rejects missing header with 401 (4 ms)
          ✓ rejects expired token with token_expired code (3 ms)
      Tests: 3 passed, 0 failed
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Context

<!-- Why this task exists. What part of the spec it addresses. -->

## Requirements

<!-- What needs to be built. Scoped to just this task. -->

## Constraints

<!-- ADR references, patterns to follow, files NOT to touch, dependency notes. -->

## Verification

<!-- Test commands, lint commands, whether new tests are required. -->
