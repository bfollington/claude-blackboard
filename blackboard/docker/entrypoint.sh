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

# Set up git branch (branch-per-thread, shared across workers)
BRANCH="threads/${THREAD_NAME}"
git fetch origin "$BRANCH" 2>/dev/null || true
git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null || \
  git checkout -b "$BRANCH" 2>/dev/null || \
  git checkout "$BRANCH"
git pull --rebase origin "$BRANCH" 2>/dev/null || true

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

Work on the next pending step. Use the blackboard CLI to record progress:
- blackboard --db ${DB_PATH} crumb \"summary\" --agent worker
- blackboard --db ${DB_PATH} oops \"mistake\" --fix \"fix\"

When ALL pending steps are genuinely complete, output '${COMPLETION_PROMISE}'."

  # Snapshot working tree state before Claude runs (to know what it changed)
  PRE_STATUS=$(git status --porcelain 2>/dev/null || true)

  # Run Claude CLI
  RESULT=$(claude -p "$PROMPT" \
    --output-format json \
    --dangerously-skip-permissions \
    --append-system-prompt "When all steps are genuinely complete, output '${COMPLETION_PROMISE}'. Do not output it prematurely. Always include a brief summary of what you accomplished in your response." \
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

  # Only stage files that changed during this iteration (not pre-existing untracked files)
  POST_STATUS=$(git status --porcelain 2>/dev/null || true)
  CHANGED_FILES=$(diff <(echo "$PRE_STATUS") <(echo "$POST_STATUS") 2>/dev/null | grep "^>" | sed 's/^> //' | awk '{print $2}' || true)

  if [ -n "$CHANGED_FILES" ]; then
    echo "$CHANGED_FILES" | xargs git add 2>/dev/null || true

    # Generate a meaningful commit message from the result
    SUMMARY=$(echo "$RESULT" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(chunks.join(''));
    let text = '';
    if (data && data.result) text = data.result;
    else if (Array.isArray(data)) text = data.filter(b => b.type==='text').map(b => b.text).join(' ');
    else text = String(data);
    const lines = text.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const summary = (lines[0] || 'Worker iteration').substring(0, 120);
    process.stdout.write(summary);
  } catch(e) {
    process.stdout.write('Worker iteration ${iteration} on thread ${THREAD_NAME}');
  }
});
" 2>/dev/null || echo "Worker iteration $iteration on thread $THREAD_NAME")

    git diff --cached --quiet 2>/dev/null || \
      git commit -m "[${THREAD_NAME}] ${SUMMARY}" --no-verify 2>/dev/null || true
  fi

  # Check for completion promise
  if echo "$RESULT" | grep -q "$COMPLETION_PROMISE"; then
    echo "[worker:${WORKER_ID}] Thread work complete after $iteration iterations"
    git pull --rebase origin "$BRANCH" 2>/dev/null || true
    git push origin "$BRANCH" 2>/dev/null || true
    blackboard --db "$DB_PATH" query \
      "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
    exit 0
  fi

  # Brief pause between iterations
  sleep 2
done

# Max iterations reached without completion
echo "[worker:${WORKER_ID}] Max iterations ($MAX_ITERATIONS) reached"
git pull --rebase origin "$BRANCH" 2>/dev/null || true
git push origin "$BRANCH" 2>/dev/null || true
blackboard --db "$DB_PATH" query \
  "UPDATE workers SET status = 'failed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
exit 1
