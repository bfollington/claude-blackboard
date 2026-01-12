#!/usr/bin/env bash
set -euo pipefail

# SessionStart hook - Initialize blackboard database if it doesn't exist

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB_DIR="$PROJECT_DIR/.claude"
DB="$DB_DIR/blackboard.db"
SCHEMA="${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}/schema.sql"

# Read stdin (SessionStart input) but we don't need it
cat > /dev/null

# Create directory if needed
mkdir -p "$DB_DIR"

# Initialize database if it doesn't exist
if [ ! -f "$DB" ]; then
  sqlite3 "$DB" < "$SCHEMA"

  # Add to .gitignore if not already present
  GITIGNORE="$PROJECT_DIR/.gitignore"
  if [ -f "$GITIGNORE" ]; then
    if ! grep -q "blackboard.db" "$GITIGNORE" 2>/dev/null; then
      echo -e "\n# Claude Code blackboard\n.claude/blackboard.db" >> "$GITIGNORE"
    fi
  fi
  
  echo '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Blackboard database initialized at .claude/blackboard.db"}}'
else
  # Database exists, just exit cleanly
  exit 0
fi
