#!/bin/bash
# Tier 0 evidence-presence synthetic test (SPEC-004 AC-014)
# Usage: ./test-tier0-evidence-presence.sh [task-file-path]
# Default: ./empty-evidence-task.md
# Requires: Python 3 + PyYAML
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
missing = [ac['id'] for ac in acs if not (ac.get('evidence') or '').strip()]
if missing:
    print(f"Tier 0 FAIL: empty evidence in {', '.join(missing)}", file=sys.stderr); sys.exit(1)
print(f"Tier 0 PASS: {len(acs)} ACs have populated evidence"); sys.exit(0)
EOF
