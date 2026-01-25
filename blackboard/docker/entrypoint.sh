#!/bin/bash
set -euo pipefail

# Required environment variables
THREAD_NAME="${THREAD_NAME:?THREAD_NAME required}"
WORKER_ID="${WORKER_ID:?WORKER_ID required}"
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"
COMPLETION_PROMISE="THREAD_WORK_COMPLETE"
DB_PATH="/app/db/blackboard.db"

# Helper function to log to database
log_to_db() {
  local stream="$1"
  local line="$2"
  local iter="${3:-0}"

  # Escape single quotes in the line for SQL
  local escaped_line="${line//\'/\'\'}"

  blackboard --db "$DB_PATH" query \
    "INSERT INTO worker_logs (worker_id, stream, line, iteration) VALUES ('$WORKER_ID', '$stream', '$escaped_line', $iter)" \
    2>/dev/null || true
}

# Configure git for commits inside container
git config --global user.email "worker@blackboard.local"
git config --global user.name "Blackboard Worker ${WORKER_ID}"

# Start heartbeat background process
iteration=0
(while true; do
  blackboard --db "$DB_PATH" query \
    "UPDATE workers SET last_heartbeat = datetime('now'), iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
  sleep 10
done) &
HEARTBEAT_PID=$!
trap "kill $HEARTBEAT_PID 2>/dev/null; exit" EXIT SIGTERM SIGINT

# Clone the repo into an isolated working directory (does not affect host checkout)
BRANCH="threads/${THREAD_NAME}"
WORK_DIR="/app/work"

git clone /app/repo "$WORK_DIR" 2>/dev/null
cd "$WORK_DIR"

# Check out or create the thread branch
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"

# Main Ralph Wiggum loop
while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))

  # Update iteration in DB
  blackboard --db "$DB_PATH" query \
    "UPDATE workers SET iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true

  # Generate context packet for the thread
  CONTEXT=$(blackboard --db "$DB_PATH" thread status "$THREAD_NAME" --json 2>/dev/null || echo '{"error": "failed to get context"}')

  # Build prompt from thread context
  PROMPT="You are a worker executing thread '${THREAD_NAME}'. This is iteration ${iteration} of ${MAX_ITERATIONS}.

## Current Context
${CONTEXT}

## Your Workflow

Work on the next pending step(s). As you work:

### 1. Record Progress with Breadcrumbs (REQUIRED)
After each significant action, record a breadcrumb:
\`\`\`bash
blackboard --db ${DB_PATH} crumb \"<what you did>\" --agent worker --files \"<files touched>\"
\`\`\`
Breadcrumbs help track progress across iterations and aid debugging.

### 2. Update Step Status
When completing a step:
\`\`\`bash
blackboard --db ${DB_PATH} query \"UPDATE plan_steps SET status = 'completed' WHERE id = '<step_id>'\"
\`\`\`

### 3. Update the Plan if Needed
If you discover the plan needs adjustment (new steps, scope changes, blockers):
\`\`\`bash
# Write updated plan to a temp file, then:
blackboard --db ${DB_PATH} thread plan ${THREAD_NAME} /tmp/updated-plan.md
\`\`\`
Keeping the plan accurate helps future iterations and other workers.

### 4. Commit Your Changes
\`\`\`bash
git add <files>
git commit -m \"[${THREAD_NAME}] <description>\" --no-verify
\`\`\`

### 5. Report Blockers
If you hit a blocker that prevents progress:
\`\`\`bash
blackboard --db ${DB_PATH} bug-report \"<title>\" --steps \"<repro steps>\" --thread ${THREAD_NAME}
\`\`\`

## Completion
When ALL steps are genuinely complete:
\`\`\`bash
blackboard --db ${DB_PATH} query \"UPDATE plans SET status = 'completed' WHERE id = '<plan_id>'\"
\`\`\`
Then output '${COMPLETION_PROMISE}'.

Do NOT output the completion promise until all work is truly done."

  # Log iteration start
  log_to_db "system" "Starting iteration $iteration of $MAX_ITERATIONS" "$iteration"

  # Run Claude CLI with output capture
  # Create temp files for stdout and stderr
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)

  set +e
  claude -p "$PROMPT" \
    --output-format json \
    --dangerously-skip-permissions \
    --append-system-prompt "IMPORTANT: Record breadcrumbs frequently using 'blackboard crumb' to track your progress. Update the plan with 'blackboard thread plan' if you discover it needs changes. When all steps are genuinely complete, output '${COMPLETION_PROMISE}'. Do not output it prematurely." \
    > "$STDOUT_FILE" 2> "$STDERR_FILE"
  STATUS=$?
  set -e

  # Capture the result
  RESULT=$(cat "$STDOUT_FILE" 2>/dev/null || echo "")

  # Log stdout
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
    # Rate limit handling with exponential backoff
    if [ $STATUS -eq 429 ] || [ $STATUS -eq 529 ]; then
      BACKOFF=$((2 ** (iteration % 6)))
      JITTER=$((RANDOM % 5))
      WAIT=$((BACKOFF + JITTER))
      MSG="Rate limited (status $STATUS), waiting ${WAIT}s..."
      echo "[worker:${WORKER_ID}] $MSG"
      log_to_db "system" "$MSG" "$iteration"
      sleep $WAIT
      continue
    fi
    # Other error - record and continue
    MSG="Iteration $iteration failed with status $STATUS"
    echo "[worker:${WORKER_ID}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    blackboard --db "$DB_PATH" crumb "$MSG" \
      --agent worker --next "Retry needed" 2>/dev/null || true
    sleep 2
    continue
  fi

  # Push commits back to the host repo (origin = /app/repo)
  git push origin "$BRANCH" 2>/dev/null || true

  # Check for completion promise
  if echo "$RESULT" | grep -q "$COMPLETION_PROMISE"; then
    MSG="Thread work complete after $iteration iterations"
    echo "[worker:${WORKER_ID}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    blackboard --db "$DB_PATH" query \
      "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
    exit 0
  fi

  # Brief pause between iterations
  sleep 2
done

# Max iterations reached without completion
MSG="Max iterations ($MAX_ITERATIONS) reached"
echo "[worker:${WORKER_ID}] $MSG"
log_to_db "system" "$MSG" "$iteration"
blackboard --db "$DB_PATH" query \
  "UPDATE workers SET status = 'failed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
exit 1
