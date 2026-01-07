#!/usr/bin/env bash
set -euo pipefail

# PreCompact - Suggest reflection before compacting

DB="$CLAUDE_PROJECT_DIR/.claude/blackboard.db"

# Read input
cat > /dev/null

# Check database exists
if [ ! -f "$DB" ]; then
  exit 0
fi

# Get active plan
PLAN_ROW=$(sqlite3 -separator '|' "$DB" "SELECT id, description FROM active_plan" 2>/dev/null || echo "")
if [ -z "$PLAN_ROW" ]; then
  exit 0
fi

PLAN_ID=$(echo "$PLAN_ROW" | cut -d'|' -f1)
PLAN_DESC=$(echo "$PLAN_ROW" | cut -d'|' -f2)

MSG="Before compacting, consider running /reflect to capture insights from the current session on plan \"$PLAN_DESC\" ($PLAN_ID)."
MSG_JSON=$(echo "$MSG" | jq -Rs .)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": $MSG_JSON
  }
}
EOF
