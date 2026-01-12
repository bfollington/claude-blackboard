#!/usr/bin/env bash
set -euo pipefail

# crumb.sh - Record a breadcrumb in the blackboard
# Usage: crumb.sh <summary> [--step <id>] [--files <list>] [--issues <text>] [--next <text>]

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"

# Check database exists
if [ ! -f "$DB" ]; then
  echo "Error: Blackboard database not found at $DB" >&2
  exit 1
fi

# Defaults
SUMMARY=""
STEP_ID=""
FILES=""
ISSUES=""
NEXT=""
AGENT_TYPE="implementer"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --step)
      STEP_ID="$2"
      shift 2
      ;;
    --files)
      FILES="$2"
      shift 2
      ;;
    --issues)
      ISSUES="$2"
      shift 2
      ;;
    --next)
      NEXT="$2"
      shift 2
      ;;
    --agent)
      AGENT_TYPE="$2"
      shift 2
      ;;
    *)
      # Accumulate positional args as summary
      if [ -z "$SUMMARY" ]; then
        SUMMARY="$1"
      else
        SUMMARY="$SUMMARY $1"
      fi
      shift
      ;;
  esac
done

if [ -z "$SUMMARY" ]; then
  echo "Usage: crumb.sh <summary> [--step <id>] [--files <list>] [--issues <text>] [--next <text>]" >&2
  exit 1
fi

# Generate ID
CRUMB_ID=$(openssl rand -hex 4)

# Escape single quotes for SQL
escape_sql() {
  echo "$1" | sed "s/'/''/g"
}

SUMMARY_ESC=$(escape_sql "$SUMMARY")
STEP_ID_SQL=${STEP_ID:+"'$(escape_sql "$STEP_ID")'"}
STEP_ID_SQL=${STEP_ID_SQL:-NULL}
FILES_SQL=${FILES:+"'$(escape_sql "$FILES")'"}
FILES_SQL=${FILES_SQL:-NULL}
ISSUES_SQL=${ISSUES:+"'$(escape_sql "$ISSUES")'"}
ISSUES_SQL=${ISSUES_SQL:-NULL}
NEXT_SQL=${NEXT:+"'$(escape_sql "$NEXT")'"}
NEXT_SQL=${NEXT_SQL:-NULL}

# Insert
sqlite3 "$DB" "INSERT INTO breadcrumbs (id, plan_id, step_id, agent_type, summary, files_touched, issues, next_context) VALUES ('$CRUMB_ID', (SELECT id FROM active_plan), $STEP_ID_SQL, '$AGENT_TYPE', '$SUMMARY_ESC', $FILES_SQL, $ISSUES_SQL, $NEXT_SQL)"

echo "Breadcrumb $CRUMB_ID recorded"
