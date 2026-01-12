#!/usr/bin/env bash
set -euo pipefail

# PreToolUse[ExitPlanMode] - Store the plan in the database

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"
INPUT=$(cat)

# Check if this is ExitPlanMode
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [ "$TOOL_NAME" != "ExitPlanMode" ]; then
  exit 0
fi

# Ensure database exists
if [ ! -f "$DB" ]; then
  echo "Blackboard database not found. Run /init or restart session." >&2
  exit 2
fi

# Extract plan content
PLAN=$(echo "$INPUT" | jq -r '.tool_input.plan // empty')
if [ -z "$PLAN" ]; then
  echo "No plan content in ExitPlanMode input" >&2
  exit 2
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Generate ID (8 random hex chars)
PLAN_ID=$(openssl rand -hex 4)

# Extract first line as description
DESCRIPTION=$(echo "$PLAN" | head -n1 | sed 's/^#* *//' | cut -c1-200)

# Escape single quotes for SQL
PLAN_ESCAPED=$(echo "$PLAN" | sed "s/'/''/g")
DESC_ESCAPED=$(echo "$DESCRIPTION" | sed "s/'/''/g")

# Insert into database
sqlite3 "$DB" "INSERT INTO plans (id, description, plan_markdown, session_id) VALUES ('$PLAN_ID', '$DESC_ESCAPED', '$PLAN_ESCAPED', '$SESSION_ID')"

# Output JSON to allow the tool and add context
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Plan stored with ID: $PLAN_ID"
  }
}
EOF
