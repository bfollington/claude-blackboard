#!/bin/bash

# Type Check Hook - Warn before editing type files

EVENT_DATA=$(cat)
TOOL_NAME=$(echo "$EVENT_DATA" | jq -r '.tool // ""')

# Only trigger for Edit/Write tools
if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true
}
EOF
  exit 0
fi

# Check if editing a type definition file
FILE_PATH=$(echo "$EVENT_DATA" | jq -r '.params.file_path // ""')

# Detect type files by extension and path patterns
IS_TYPE_FILE=false
if [[ "$FILE_PATH" =~ \.(ts|rs|sql|clj)$ ]]; then
  # Check if it's in a domain/types directory or contains type keywords
  if [[ "$FILE_PATH" =~ (domain|types|components\.ts|models) ]] ||
     grep -qE "(interface|type|enum|struct|CREATE TABLE|CREATE DOMAIN|s/def)" "$FILE_PATH" 2>/dev/null; then
    IS_TYPE_FILE=true
  fi
fi

if [[ "$IS_TYPE_FILE" == "true" ]]; then
  cat <<EOF
{
  "decision": "approve",
  "continue": true,
  "additionalContext": "**Editing Type Definitions** ($FILE_PATH)

Before modifying types, consider:

1. **Are you making illegal states unrepresentable?**
   - Use sum types for mutual exclusion
   - Use wrapper types for validation
   - Avoid optional field proliferation

2. **Will this change affect operational principles?**
   - New variant → New behavioral scenario?
   - Changed semantics → Update rationale?
   - Run /sync-principles after changes

3. **Module boundaries maintained?**
   - Types should define structure, not call other concepts
   - Cross-concept coordination via synchronizations

4. **Pattern check:**
   - Adding optional fields? Consider sum type instead
   - Adding booleans? Consider state machine
   - Using primitives? Consider wrapper type

See: principles/PATTERNS.md for examples"
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
