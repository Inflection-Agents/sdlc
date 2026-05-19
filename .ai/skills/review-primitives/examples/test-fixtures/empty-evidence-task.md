---
id: TASK-TEST-001
spec: SPEC-TEST-001
title: "Synthetic test fixture — empty evidence field"
status: pending
agent: claude-code
depends_on: []
blocks: []
acceptance_criteria:
  - id: AC-001
    description: "Synthetic AC for testing Tier 0 evidence-presence check"
    status: pending
    evidence:
created: 2026-05-18
updated: 2026-05-18
---

# Fixture

This task file is intentionally malformed: AC-001 has an empty `evidence:` field. The Tier 0 mechanical gate per SPEC-004 should fail closed on this.
