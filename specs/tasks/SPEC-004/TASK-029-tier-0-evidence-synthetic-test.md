---
id: TASK-029
spec: SPEC-004
title: "Tier 0 evidence-presence synthetic test"
status: done
agent: claude-code
depends_on: [TASK-022]
blocks: []
linear_issue:
acceptance_criteria:
  - id: AC-001
    description: "Given a synthetic test fixture (a task file with one AC whose `evidence:` field is empty or missing), when the Tier 0 CI check defined by SPEC-004's review-primitives.md extension runs, then it fails closed with the AC id named in stderr and no LLM reviewer is dispatched. The test fixture and CI log are recorded as the spec-completion evidence (SPEC-004 AC-014)"
    status: pass
    evidence: |
      Fixture: .ai/skills/review-primitives/examples/test-fixtures/empty-evidence-task.md
      Script: .ai/skills/review-primitives/examples/test-fixtures/test-tier0-evidence-presence.sh
      Run: bash test-tier0-evidence-presence.sh empty-evidence-task.md
      stderr: "Tier 0 FAIL: empty evidence in AC-001"
      exit code: 1 ✓
      Fix applied: null guard (ac.get('evidence') or '').strip() handles YAML null for bare evidence: key
created: 2026-05-18
updated: 2026-05-19
---

## Context

Per SPEC-004 AC-014. The Tier 0 evidence-presence check (added by TASK-022 to `review-primitives.md`) is a CI gate — this task verifies it actually fires correctly with a synthetic broken input. Depends on TASK-022 for the Tier 0 extension being in place.

## Requirements

1. **Create a synthetic test fixture** at `/Users/franklin/_code/sdlc/.ai/skills/review-primitives/examples/test-fixtures/empty-evidence-task.md`:

```markdown
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
```

2. **Create a small test script** at `/Users/franklin/_code/sdlc/.ai/skills/review-primitives/examples/test-fixtures/test-tier0-evidence-presence.sh`:

```bash
#!/bin/bash
# Tier 0 evidence-presence synthetic test (SPEC-004 AC-014)
# Usage: ./test-tier0-evidence-presence.sh [task-file-path]
# Default: ./empty-evidence-task.md
set -euo pipefail
TASK_FILE="${1:-$(dirname "$0")/empty-evidence-task.md}"

# Extract acceptance_criteria block; check each AC has non-empty evidence
# Returns 0 if all populated; non-zero with AC id in stderr if any empty/missing
python3 - "$TASK_FILE" <<'EOF'
import sys, re, yaml
path = sys.argv[1]
with open(path) as f: content = f.read()
fm_match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
if not fm_match:
    print(f"ERROR: no frontmatter in {path}", file=sys.stderr); sys.exit(2)
fm = yaml.safe_load(fm_match.group(1))
acs = fm.get('acceptance_criteria', [])
missing = [ac['id'] for ac in acs if not ac.get('evidence', '').strip()]
if missing:
    print(f"Tier 0 FAIL: empty evidence in {', '.join(missing)}", file=sys.stderr); sys.exit(1)
print(f"Tier 0 PASS: {len(acs)} ACs have populated evidence"); sys.exit(0)
EOF
```

3. **Run the test once on the synthetic fixture; assert** exit code 1 and stderr contains "Tier 0 FAIL: empty evidence in AC-001".

4. **Record** the test fixture path, the test script path, and the captured stderr output as spec-completion evidence for AC-014.

## Constraints

- The test fixture is intentionally broken — do not "fix" the empty `evidence:` field.
- The test script is a reference implementation of the Tier 0 check; the actual CI integration is a follow-up infrastructure task (out of scope for SPEC-004).
- The script requires Python 3 + PyYAML; document this in a comment if not already standard in the repo's CI tooling.
- Keep the fixture small (10-15 lines); its job is to be the canonical "what fails Tier 0" example.

## Verification

- `[ -f /Users/franklin/_code/sdlc/.ai/skills/review-primitives/examples/test-fixtures/empty-evidence-task.md ]` returns 0.
- `[ -f /Users/franklin/_code/sdlc/.ai/skills/review-primitives/examples/test-fixtures/test-tier0-evidence-presence.sh ]` returns 0.
- Running the test script: `bash .ai/skills/review-primitives/examples/test-fixtures/test-tier0-evidence-presence.sh` exits 1 with stderr containing "Tier 0 FAIL: empty evidence in AC-001".
- Capture the output as evidence.
