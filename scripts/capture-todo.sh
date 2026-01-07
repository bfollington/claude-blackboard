#!/usr/bin/env bash
set -euo pipefail

# PostToolUse[TodoWrite] - Capture todos as plan_steps

DB="$CLAUDE_PROJECT_DIR/.claude/blackboard.db"
INPUT=$(cat)

# Check if this is TodoWrite
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [ "$TOOL_NAME" != "TodoWrite" ]; then
  exit 0
fi

# Check database exists
if [ ! -f "$DB" ]; then
  exit 0
fi

# Get active plan
PLAN_ID=$(sqlite3 "$DB" "SELECT id FROM active_plan" 2>/dev/null || echo "")
if [ -z "$PLAN_ID" ]; then
  exit 0  # No active plan, let todos pass through
fi

# Extract todos from tool_input
# TodoWrite input format may vary - try common patterns
TODOS=$(echo "$INPUT" | jq -r '.tool_input.todos // .tool_input.items // []')
TODO_COUNT=$(echo "$TODOS" | jq 'length')

if [ "$TODO_COUNT" = "0" ] || [ "$TODO_COUNT" = "null" ]; then
  exit 0
fi

# Insert each todo as a plan_step
ORDER=1
echo "$TODOS" | jq -c '.[]' | while read -r TODO; do
  STEP_ID=$(openssl rand -hex 4)
  CONTENT=$(echo "$TODO" | jq -r '.content // .text // .description // .')
  STATUS=$(echo "$TODO" | jq -r '.status // "pending"')
  
  # Map status
  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "done" ]; then
    DB_STATUS="completed"
  else
    DB_STATUS="pending"
  fi
  
  # Escape for SQL
  CONTENT_ESCAPED=$(echo "$CONTENT" | sed "s/'/''/g")
  
  sqlite3 "$DB" "INSERT INTO plan_steps (id, plan_id, step_order, description, status) VALUES ('$STEP_ID', '$PLAN_ID', $ORDER, '$CONTENT_ESCAPED', '$DB_STATUS')"
  
  ORDER=$((ORDER + 1))
done

# Update plan status
sqlite3 "$DB" "UPDATE plans SET status = 'in_progress' WHERE id = '$PLAN_ID'"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Created $TODO_COUNT steps for plan $PLAN_ID. Steps stored in blackboard."
  }
}
EOF
