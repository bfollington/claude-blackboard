#!/bin/bash
set -euo pipefail

# Required environment variables
DRONE_NAME="${DRONE_NAME:?DRONE_NAME required}"
SESSION_ID="${SESSION_ID:?SESSION_ID required}"
WORKER_ID="${WORKER_ID:?WORKER_ID required}"
DRONE_PROMPT="${DRONE_PROMPT:?DRONE_PROMPT required}"
MAX_ITERATIONS="${MAX_ITERATIONS:-100}"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-60}"
DB_PATH="/app/db/blackboard.db"

# Helper function to log to database
log_to_db() {
  local stream="$1"
  local line="$2"
  local iter="${3:-0}"

  # Use hex encoding to safely insert arbitrary text without SQL injection risk
  # SQLite's X'...' hex literal is decoded as a blob, CAST converts to text
  local hex_line
  hex_line=$(printf '%s' "$line" | xxd -p | tr -d '\n')

  blackboard --db "$DB_PATH" query \
    "INSERT INTO worker_logs (worker_id, stream, line, iteration) VALUES ('$WORKER_ID', '$stream', CAST(X'$hex_line' AS TEXT), $iter)" \
    2>/dev/null || true
}

# Configure git for commits inside container
git config --global user.email "drone@blackboard.local"
git config --global user.name "Blackboard Drone ${DRONE_NAME}"

# Start heartbeat background process
# Use a file to share iteration count between main loop and heartbeat subshell
iteration=0
ITERATION_FILE="/tmp/drone_iteration_$$"
echo "0" > "$ITERATION_FILE"

(while true; do
  current_iter=$(cat "$ITERATION_FILE" 2>/dev/null || echo "0")
  blackboard --db "$DB_PATH" query \
    "UPDATE workers SET last_heartbeat = datetime('now'), iteration = $current_iter WHERE id = '$WORKER_ID'" 2>/dev/null || true
  sleep 10
done) &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null; rm -f '$ITERATION_FILE'; exit" EXIT SIGTERM SIGINT

# Clone the repo into an isolated working directory (does not affect host checkout)
BRANCH="drones/${DRONE_NAME}/${SESSION_ID:0:8}"
WORK_DIR="/app/work"

git clone /app/repo "$WORK_DIR" 2>/dev/null
cd "$WORK_DIR"

# Check out or create the drone branch
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"

# Set up .claude directory with subagent definitions
# This makes subagents available to Claude inside the container
mkdir -p "$WORK_DIR/.claude/agents"
cp -r /app/claude-config/agents/* "$WORK_DIR/.claude/agents/" 2>/dev/null || true

# Main drone loop
while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "$iteration" > "$ITERATION_FILE"

  # Update iteration in DB
  blackboard --db "$DB_PATH" query \
    "UPDATE workers SET iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true

  # Update session iteration count
  blackboard --db "$DB_PATH" query \
    "UPDATE drone_sessions SET iteration = $iteration WHERE id = '$SESSION_ID'" 2>/dev/null || true

  # Build prompt for Claude
  PROMPT="You are a drone executing automated maintenance.

## Your Task
${DRONE_PROMPT}

## Context
- This is iteration ${iteration} of ${MAX_ITERATIONS}
- Drone: ${DRONE_NAME}
- Session: ${SESSION_ID}
- Branch: ${BRANCH}

## Guidelines
- Work autonomously within the defined scope
- Record progress with: blackboard crumb \"summary\" --agent drone
- Commit changes with meaningful messages
- If you complete the task, that's OK - the loop will continue after cooldown
- If nothing to do, that's OK - the loop will continue

## Available Tools
- blackboard crumb \"summary\" - Record what you did
- git add/commit - Save changes
- Any other tools for your specific task

Work efficiently and record your progress."

  # Log iteration start
  log_to_db "system" "Starting iteration $iteration of $MAX_ITERATIONS" "$iteration"

  # Run Claude CLI with stream-json output and parse events
  # Create temp files for stdout and stderr
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)

  set +e
  timeout 600 claude -p "$PROMPT" \
    --output-format stream-json \
    --verbose \
    --dangerously-skip-permissions \
    --append-system-prompt "IMPORTANT: You are a drone executing automated maintenance. Record breadcrumbs using 'blackboard crumb' to track your progress. Use 'blackboard query' to inspect or update the database as needed. Git commits are encouraged when you make changes." \
    2> "$STDERR_FILE" \
    | tee "$STDOUT_FILE" \
    | deno run --allow-read --allow-write --allow-env --allow-net --allow-ffi /app/parse-worker-events.ts "$WORKER_ID" "$iteration" "$DB_PATH" \
    > /dev/null
  STATUS=$?
  set -e

  # Capture the result
  RESULT=$(cat "$STDOUT_FILE" 2>/dev/null || echo "")

  # Log stdout (raw stream-json for backup)
  if [ -s "$STDOUT_FILE" ]; then
    while IFS= read -r line; do
      log_to_db "stdout" "$line" "$iteration"
    done < "$STDOUT_FILE"
  fi

  # Log stderr
  if [ -s "$STDERR_FILE" ]; then
    while IFS= read -r line; do
      log_to_db "stderr" "$line" "$iteration"
    done < "$STDERR_FILE"
  fi

  # Clean up temp files
  rm -f "$STDOUT_FILE" "$STDERR_FILE"

  # Handle errors
  if [ $STATUS -ne 0 ]; then
    # Timeout handling (exit code 124)
    if [ $STATUS -eq 124 ]; then
      MSG="Claude CLI timed out after 600 seconds in iteration $iteration"
      echo "[drone:${DRONE_NAME}] $MSG"
      log_to_db "system" "$MSG" "$iteration"
      blackboard --db "$DB_PATH" crumb "$MSG" \
        --agent drone --next "Timeout occurred - retrying in next iteration" 2>/dev/null || true
      sleep 5
      continue
    fi
    # Rate limit handling with exponential backoff
    if [ $STATUS -eq 429 ] || [ $STATUS -eq 529 ]; then
      BACKOFF=$((2 ** (iteration % 6)))
      JITTER=$((RANDOM % 5))
      WAIT=$((BACKOFF + JITTER))
      MSG="Rate limited (status $STATUS), waiting ${WAIT}s..."
      echo "[drone:${DRONE_NAME}] $MSG"
      log_to_db "system" "$MSG" "$iteration"
      sleep $WAIT
      continue
    fi
    # Other error - record and continue
    MSG="Iteration $iteration failed with status $STATUS"
    echo "[drone:${DRONE_NAME}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    blackboard --db "$DB_PATH" crumb "$MSG" \
      --agent drone --next "Retry needed" 2>/dev/null || true
    sleep 2
    continue
  fi

  # Push commits back to the host repo (origin = /app/repo)
  git push origin "$BRANCH" 2>/dev/null || true

  # Check if session should stop (stop signal from database)
  SHOULD_STOP=$(blackboard --db "$DB_PATH" query --quiet \
    "SELECT 1 FROM drone_sessions WHERE id = '$SESSION_ID' AND status != 'running' LIMIT 1" 2>/dev/null || echo "")
  if [ -n "$SHOULD_STOP" ]; then
    MSG="Session stopped by external signal after $iteration iterations"
    echo "[drone:${DRONE_NAME}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    blackboard --db "$DB_PATH" query \
      "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
    exit 0
  fi

  # Cooldown between iterations (configurable)
  if [ $iteration -lt $MAX_ITERATIONS ]; then
    MSG="Cooldown for ${COOLDOWN_SECONDS}s before next iteration"
    echo "[drone:${DRONE_NAME}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    sleep "$COOLDOWN_SECONDS"
  fi
done

# Max iterations reached
MSG="Max iterations ($MAX_ITERATIONS) reached"
echo "[drone:${DRONE_NAME}] $MSG"
log_to_db "system" "$MSG" "$iteration"
blackboard --db "$DB_PATH" query \
  "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
blackboard --db "$DB_PATH" query \
  "UPDATE drone_sessions SET status = 'completed', stop_reason = 'max_iterations' WHERE id = '$SESSION_ID'" 2>/dev/null || true
exit 0
