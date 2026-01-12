#!/usr/bin/env bash
set -euo pipefail

# oops.sh - Record a correction/mistake in the blackboard
# Usage: oops.sh <mistake> [--symptoms <text>] [--fix <text>] [--tags <list>]

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
DB="$PROJECT_DIR/.claude/blackboard.db"

# Check database exists
if [ ! -f "$DB" ]; then
  echo "Error: Blackboard database not found at $DB" >&2
  exit 1
fi

MISTAKE=""
SYMPTOMS=""
FIX=""
TAGS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --symptoms)
      SYMPTOMS="$2"
      shift 2
      ;;
    --fix)
      FIX="$2"
      shift 2
      ;;
    --tags)
      TAGS="$2"
      shift 2
      ;;
    *)
      if [ -z "$MISTAKE" ]; then
        MISTAKE="$1"
      else
        MISTAKE="$MISTAKE $1"
      fi
      shift
      ;;
  esac
done

if [ -z "$MISTAKE" ]; then
  echo "Usage: oops.sh <mistake> [--symptoms <text>] [--fix <text>] [--tags <list>]" >&2
  exit 1
fi

CORR_ID=$(openssl rand -hex 4)

escape_sql() {
  echo "$1" | sed "s/'/''/g"
}

MISTAKE_ESC=$(escape_sql "$MISTAKE")
SYMPTOMS_SQL=${SYMPTOMS:+"'$(escape_sql "$SYMPTOMS")'"}
SYMPTOMS_SQL=${SYMPTOMS_SQL:-NULL}
FIX_SQL=${FIX:+"'$(escape_sql "$FIX")'"}
FIX_SQL=${FIX_SQL:-NULL}
TAGS_SQL=${TAGS:+"'$(escape_sql "$TAGS")'"}
TAGS_SQL=${TAGS_SQL:-NULL}

sqlite3 "$DB" "INSERT INTO corrections (id, plan_id, mistake, symptoms, resolution, tags) VALUES ('$CORR_ID', (SELECT id FROM active_plan), '$MISTAKE_ESC', $SYMPTOMS_SQL, $FIX_SQL, $TAGS_SQL)"

echo "Correction $CORR_ID recorded"
