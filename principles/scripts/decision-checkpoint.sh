#!/bin/bash

# Decision Checkpoint Hook
# Triggers decision recording at key moments in the development workflow

# Read hook event data from stdin
EVENT_DATA=$(cat)

# Extract hook event name for context
HOOK_EVENT=$(echo "$EVENT_DATA" | jq -r '.hook_event_name // "unknown"')

# Output JSON to trigger the /record-decision slash command
cat <<EOF
{
  "decision": "approve",
  "continue": true,
  "additionalContext": "**Decision Recording Checkpoint** (triggered by: $HOOK_EVENT)

Please run the /record-decision slash command to capture any decisions from this session."
}
EOF
