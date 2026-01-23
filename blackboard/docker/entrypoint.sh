#!/bin/bash
set -euo pipefail

# Required environment variables
THREAD_NAME="${THREAD_NAME:?THREAD_NAME required}"
WORKER_ID="${WORKER_ID:?WORKER_ID required}"
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"
COMPLETION_PROMISE="THREAD_WORK_COMPLETE"
DB_PATH="/app/db/blackboard.db"

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
  PROMPT="You are a worker executing thread '${THREAD_NAME}'. Here is your current context:

${CONTEXT}

Work on the next pending step(s). After completing work:

1. Mark completed steps:
   blackboard --db ${DB_PATH} query \"UPDATE plan_steps SET status = 'completed' WHERE id = '<step_id>'\"

2. Record a breadcrumb summarizing what you did:
   blackboard --db ${DB_PATH} crumb \"<summary>\" --agent worker --files \"<comma-separated files>\"

3. Commit your changes with a meaningful message:
   git add <files you created/modified>
   git commit -m \"[${THREAD_NAME}] <description of changes>\" --no-verify

When ALL steps are genuinely complete, also run:
   blackboard --db ${DB_PATH} query \"UPDATE plans SET status = 'completed' WHERE id = '<plan_id>'\"

Then output '${COMPLETION_PROMISE}'."

  # Run Claude CLI
  RESULT=$(claude -p "$PROMPT" \
    --output-format json \
    --dangerously-skip-permissions \
    --append-system-prompt "When all steps are genuinely complete, output '${COMPLETION_PROMISE}'. Do not output it prematurely." \
    2>/dev/null) || {
    STATUS=$?
    # Rate limit handling with exponential backoff
    if [ $STATUS -eq 429 ] || [ $STATUS -eq 529 ]; then
      BACKOFF=$((2 ** (iteration % 6)))
      JITTER=$((RANDOM % 5))
      WAIT=$((BACKOFF + JITTER))
      echo "[worker:${WORKER_ID}] Rate limited (status $STATUS), waiting ${WAIT}s..."
      sleep $WAIT
      continue
    fi
    # Other error - record and continue
    echo "[worker:${WORKER_ID}] Iteration $iteration failed with status $STATUS"
    blackboard --db "$DB_PATH" crumb "Iteration $iteration failed with status $STATUS" \
      --agent worker --next "Retry needed" 2>/dev/null || true
    sleep 2
    continue
  }

  # Push commits back to the host repo (origin = /app/repo)
  git push origin "$BRANCH" 2>/dev/null || true

  # Check for completion promise
  if echo "$RESULT" | grep -q "$COMPLETION_PROMISE"; then
    echo "[worker:${WORKER_ID}] Thread work complete after $iteration iterations"
    blackboard --db "$DB_PATH" query \
      "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
    exit 0
  fi

  # Brief pause between iterations
  sleep 2
done

# Max iterations reached without completion
echo "[worker:${WORKER_ID}] Max iterations ($MAX_ITERATIONS) reached"
blackboard --db "$DB_PATH" query \
  "UPDATE workers SET status = 'failed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
exit 1
