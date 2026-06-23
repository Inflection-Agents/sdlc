---
id: TASK-NNN
spec: SPEC-NNN
title: ""
status: pending
agent: claude-code | human   # routing; the deterministic engine treats `human` as deferred
workspace:                      # primary workspace (see .ai/project.md) — one workspace per task
touches:                        # REQUIRED for executable tasks: file globs this task may modify
  - src/path/to/area/**
  - src/path/to/file.ts
risk: low                       # low | medium | high — author hint; raises review tier
tier: standard                  # express | standard | fortified — review-intensity HINT (engine resolves the real tier)
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
  - id: AC-002
    description: ""
    status: pending
    evidence: ""
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Context

<!-- Why this task exists. What part of the spec it addresses. -->

## Requirements

<!-- What needs to be built. ONE coherent unit of AI execution, scoped to the declared `touches`.
     Sized by coherence, not line count — a whole token layer or a whole module is fine if it is
     one coherent thing. Give COMPLETE instructions: the executor and the reviewer are both AI;
     assume zero prior codebase context. -->

## Constraints

<!-- ADR references, patterns to follow, files NOT to touch, dependency notes.
     For boundary tasks, name the exact interface contract you produce/consume. -->

## Verification

<!-- Tier-0 gate commands (lint/typecheck/test), whether new tests are required, and where. -->
