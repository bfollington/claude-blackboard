#!/usr/bin/env bash
set -euo pipefail

# bug-report.sh - File a blocking bug report
# Usage: bug-report.sh <title> --steps <repro steps> [--evidence <logs>]

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"

# Check database exists
if [ ! -f "$DB" ]; then
  echo "Error: Blackboard database not found at $DB" >&2
  exit 1
fi

TITLE=""
STEPS=""
EVIDENCE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --steps)
      STEPS="$2"
      shift 2
      ;;
    --evidence)
      EVIDENCE="$2"
      shift 2
      ;;
    *)
      if [ -z "$TITLE" ]; then
        TITLE="$1"
      else
        TITLE="$TITLE $1"
      fi
      shift
      ;;
  esac
done

if [ -z "$TITLE" ] || [ -z "$STEPS" ]; then
  echo "Usage: bug-report.sh <title> --steps <repro steps> [--evidence <logs>]" >&2
  echo "--steps is required" >&2
  exit 1
fi

BUG_ID=$(openssl rand -hex 4)

escape_sql() {
  echo "$1" | sed "s/'/''/g"
}

TITLE_ESC=$(escape_sql "$TITLE")
STEPS_ESC=$(escape_sql "$STEPS")
EVIDENCE_SQL=${EVIDENCE:+"'$(escape_sql "$EVIDENCE")'"}
EVIDENCE_SQL=${EVIDENCE_SQL:-NULL}

sqlite3 "$DB" "INSERT INTO bug_reports (id, plan_id, title, repro_steps, evidence) VALUES ('$BUG_ID', (SELECT id FROM active_plan), '$TITLE_ESC', '$STEPS_ESC', $EVIDENCE_SQL)"

echo "Bug report $BUG_ID filed"
