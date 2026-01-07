#!/usr/bin/env bash
set -euo pipefail

# SubagentStop - Update step status based on recent breadcrumbs

DB="$CLAUDE_PROJECT_DIR/.claude/blackboard.db"

# Read input (consume it)
cat > /dev/null

# Check database exists
if [ ! -f "$DB" ]; then
  exit 0
fi

# Check for recent breadcrumbs (last minute) that have a step_id
STEP_ID=$(sqlite3 "$DB" "SELECT step_id FROM breadcrumbs WHERE step_id IS NOT NULL AND created_at > datetime('now', '-1 minute') ORDER BY created_at DESC LIMIT 1" 2>/dev/null || echo "")

if [ -n "$STEP_ID" ]; then
  # Mark step as completed
  sqlite3 "$DB" "UPDATE plan_steps SET status = 'completed' WHERE id = '$STEP_ID'"
fi

# Check if all steps are done
PENDING=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id = (SELECT id FROM active_plan) AND status = 'pending'" 2>/dev/null || echo "0")

if [ "$PENDING" = "0" ]; then
  # All done - mark plan complete
  sqlite3 "$DB" "UPDATE plans SET status = 'completed' WHERE id = (SELECT id FROM active_plan)"
fi

exit 0
