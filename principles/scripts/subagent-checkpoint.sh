#!/bin/bash

# Subagent Checkpoint Hook
# Smart filtering: only trigger checkpoints for specific subagent types that made file changes

# Read hook event data from stdin
EVENT_DATA=$(cat)

# Extract subagent type
SUBAGENT_TYPE=$(echo "$EVENT_DATA" | jq -r '.subagent_type // "unknown"')

# List of subagent types that should trigger checkpoints
TRIGGER_TYPES=("plan-implementer" "strategic-planner" "Plan" "Explore" "general-purpose")

# Check if this subagent type should trigger a checkpoint
SHOULD_TRIGGER=false
for type in "${TRIGGER_TYPES[@]}"; do
  if [[ "$SUBAGENT_TYPE" == "$type" ]]; then
    SHOULD_TRIGGER=true
    break
  fi
done

# If not a triggering type, approve silently
if [[ "$SHOULD_TRIGGER" == false ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true
}
EOF
  exit 0
fi

# Check if subagent made file modifications
# Look for Edit, Write, NotebookEdit in the tool uses
MADE_CHANGES=$(echo "$EVENT_DATA" | jq -r '
  .transcript.messages // [] |
  map(select(.role == "assistant") | .content // []) |
  flatten |
  map(select(.type == "tool_use") | .name) |
  map(select(. == "Edit" or . == "Write" or . == "NotebookEdit")) |
  length > 0
')

# If no file changes, approve silently
if [[ "$MADE_CHANGES" != "true" ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true
}
EOF
  exit 0
fi

# Subagent made file changes - inject targeted checkpoint context
cat <<EOF
{
  "decision": "approve",
  "continue": true,
  "additionalContext": "**Subagent Checkpoint** (${SUBAGENT_TYPE} made file changes)

The subagent completed work that modified files. Consider:

1. **Do these changes affect operational principles?**
   - If new features were added, run \`/sync-principles\` or \`/extract-principles\`
   - If existing features changed, run \`/sync-principles\`

2. **Were architectural decisions made?**
   - If yes, run \`/record-decision\` to capture them

3. **Need to verify consistency?**
   - Run \`/audit-alignment\` to check type-principle-code alignment

You can proceed without taking action if the changes don't warrant updating principles or decisions."
}
EOF
