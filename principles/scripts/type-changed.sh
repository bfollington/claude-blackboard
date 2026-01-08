#!/bin/bash

# Type Changed Hook - Suggest principle sync after type edits

EVENT_DATA=$(cat)
TOOL_NAME=$(echo "$EVENT_DATA" | jq -r '.tool // ""')

# Only trigger after Edit/Write tools
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true
}
EOF
  exit 0
fi

# Check if a type file was modified
FILE_PATH=$(echo "$EVENT_DATA" | jq -r '.params.file_path // ""')

IS_TYPE_FILE=false
if [[ "$FILE_PATH" =~ \.(ts|rs|sql|clj)$ ]]; then
  if [[ "$FILE_PATH" =~ (domain|types|components\.ts|models) ]] ||
     grep -qE "(interface|type|enum|struct|CREATE TABLE|s/def)" "$FILE_PATH" 2>/dev/null; then
    IS_TYPE_FILE=true
  fi
fi

if [[ "$IS_TYPE_FILE" == "true" ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true,
  "additionalContext": "**Type Definitions Modified** ($FILE_PATH)

Type changes detected. Consider:

1. **Update behavioral principles?**
   Run /sync-principles to check if operational principles need updates

2. **New anti-patterns introduced?**
   Run /validate-types to check for issues

3. **Synchronizations affected?**
   If this type is used in cross-concept interactions, update contracts

4. **Tests need updates?**
   New variants/fields may need test scenarios"
}
EOF
else
  cat <<EOF
{
  "decision": "approve",
  "continue": true
}
EOF
fi
