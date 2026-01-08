#!/usr/bin/env bash
set -euo pipefail

# PostToolUse[ExitPlanMode] - Inject orchestration instructions

DB="$CLAUDE_PROJECT_DIR/.claude/blackboard.db"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
INPUT=$(cat)

# Check if this is ExitPlanMode
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
if [ "$TOOL_NAME" != "ExitPlanMode" ]; then
  exit 0
fi

# Get active plan
PLAN_ROW=$(sqlite3 -separator '|' "$DB" "SELECT id, description FROM active_plan" 2>/dev/null || echo "")
if [ -z "$PLAN_ROW" ]; then
  exit 0
fi

PLAN_ID=$(echo "$PLAN_ROW" | cut -d'|' -f1)
PLAN_DESC=$(echo "$PLAN_ROW" | cut -d'|' -f2)

# Build orchestration prompt
read -r -d '' PROMPT << 'PROMPT_END' || true
## Plan Stored: PLAN_ID_PLACEHOLDER

The plan "PLAN_DESC_PLACEHOLDER" has been stored in the blackboard. Now execute it:

1. **Create steps**: Use TodoWrite to break this plan into discrete, ordered steps. Each todo item becomes a plan_step in the database.

2. **Staged execution**: Implement steps using subagents. For each batch of parallelizable steps:
   - Spawn Task tools with the implementer subagent
   - Pass explicitly in the prompt: plan_id="PLAN_ID_PLACEHOLDER" and the step_id(s) being worked on
   - Subagents will record breadcrumbs using the crumb.sh script
   - ALWAYS use a subagent, even for trivial, serial changes to conserve the root context window

3. **Context continuity**: Before spawning each batch, query recent breadcrumbs:
   ```bash
   sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT summary, issues, next_context FROM breadcrumbs WHERE plan_id='PLAN_ID_PLACEHOLDER' ORDER BY created_at DESC LIMIT 5"
   ```

4. **Step status**: After each subagent completes, the step status updates automatically via the SubagentStop hook.

5. **Completion**: When all steps are done, run /reflect to capture lessons learned.

Begin by creating the steps with TodoWrite.
PROMPT_END

# Replace placeholders
PROMPT="${PROMPT//PLAN_ID_PLACEHOLDER/$PLAN_ID}"
PROMPT="${PROMPT//PLAN_DESC_PLACEHOLDER/$PLAN_DESC}"

# Escape for JSON
PROMPT_JSON=$(echo "$PROMPT" | jq -Rs .)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": $PROMPT_JSON
  }
}
EOF
