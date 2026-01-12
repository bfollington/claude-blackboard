#!/usr/bin/env bash
set -euo pipefail

# PostToolUse[TodoWrite] - Sync todos with plan_steps (upsert logic)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"
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
TODOS=$(echo "$INPUT" | jq -r '.tool_input.todos // .tool_input.items // []')
TODO_COUNT=$(echo "$TODOS" | jq 'length')

if [ "$TODO_COUNT" = "0" ] || [ "$TODO_COUNT" = "null" ]; then
  exit 0
fi

# Strategy: Replace all steps for this plan with the current todo list
# This ensures the database always reflects the current state without duplicates
sqlite3 "$DB" "DELETE FROM plan_steps WHERE plan_id = '$PLAN_ID'"

# Insert each todo as a plan_step
ORDER=1
echo "$TODOS" | jq -c '.[]' | while read -r TODO; do
  STEP_ID=$(openssl rand -hex 4)
  CONTENT=$(echo "$TODO" | jq -r '.content // .text // .description // .')
  STATUS=$(echo "$TODO" | jq -r '.status // "pending"')

  # Map status
  case "$STATUS" in
    completed|done) DB_STATUS="completed" ;;
    in_progress)    DB_STATUS="in_progress" ;;
    *)              DB_STATUS="pending" ;;
  esac

  # Escape for SQL
  CONTENT_ESCAPED=$(echo "$CONTENT" | sed "s/'/''/g")

  sqlite3 "$DB" "INSERT INTO plan_steps (id, plan_id, step_order, description, status) VALUES ('$STEP_ID', '$PLAN_ID', $ORDER, '$CONTENT_ESCAPED', '$DB_STATUS')"

  ORDER=$((ORDER + 1))
done

# Update plan status based on step states
COMPLETED=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id='$PLAN_ID' AND status='completed'")
TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id='$PLAN_ID'")

if [ "$COMPLETED" = "$TOTAL" ] && [ "$TOTAL" != "0" ]; then
  sqlite3 "$DB" "UPDATE plans SET status = 'completed' WHERE id = '$PLAN_ID'"
  PLAN_STATUS="completed"
else
  sqlite3 "$DB" "UPDATE plans SET status = 'in_progress' WHERE id = '$PLAN_ID'"
  PLAN_STATUS="in_progress"
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Synced $TODO_COUNT steps for plan $PLAN_ID ($COMPLETED/$TOTAL completed). Plan status: $PLAN_STATUS."
  }
}
EOF
