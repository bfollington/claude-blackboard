#!/usr/bin/env bash
set -euo pipefail

# SessionStart - Check for active plan with pending steps and offer to resume

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"

# Check database exists
if [ ! -f "$DB" ]; then
  exit 0
fi

# Get active plan with pending steps
PLAN_ROW=$(sqlite3 -separator '|' "$DB" "SELECT id, description FROM active_plan" 2>/dev/null || echo "")
if [ -z "$PLAN_ROW" ]; then
  exit 0
fi

PLAN_ID=$(echo "$PLAN_ROW" | cut -d'|' -f1)
PLAN_DESC=$(echo "$PLAN_ROW" | cut -d'|' -f2)

# Check for pending steps
PENDING_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id='$PLAN_ID' AND status IN ('pending','in_progress')" 2>/dev/null || echo "0")

if [ "$PENDING_COUNT" -eq 0 ]; then
  exit 0
fi

# Get step summary
COMPLETED=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id='$PLAN_ID' AND status='completed'" 2>/dev/null || echo "0")
TOTAL=$(sqlite3 "$DB" "SELECT COUNT(*) FROM plan_steps WHERE plan_id='$PLAN_ID'" 2>/dev/null || echo "0")

# Build resume prompt
read -r -d '' PROMPT << PROMPT_END || true
## Active Plan Detected: $PLAN_ID

**"$PLAN_DESC"** - $COMPLETED/$TOTAL steps completed, $PENDING_COUNT remaining.

To resume this plan:

1. **Check context** - Query recent breadcrumbs to see where we left off:
   \`\`\`bash
   sqlite3 "\${CLAUDE_PROJECT_DIR:-\$PWD}/.claude/blackboard.db" "SELECT summary, issues, next_context FROM breadcrumbs WHERE plan_id='$PLAN_ID' ORDER BY created_at DESC LIMIT 5"
   \`\`\`

2. **Execute pending steps** using subagents:
   - Spawn Task tools with \`subagent_type: "blackboard:implementer"\`
   - Pass explicitly: plan_id="$PLAN_ID" and the step_id(s) being worked on
   - Subagents record breadcrumbs via crumb.sh

3. **Step status** updates automatically via SubagentStop hook.

4. **Completion**: When all steps done, run /reflect.

Run \`/blackboard:status\` to see full details, or say "continue" to resume work.
PROMPT_END

# Escape for JSON
PROMPT_JSON=$(echo "$PROMPT" | jq -Rs .)

cat <<EOF
{
  "systemMessage": $PROMPT_JSON
}
EOF
