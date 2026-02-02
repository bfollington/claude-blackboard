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

  # Use hex encoding to safely insert arbitrary text without SQL injection risk
  # SQLite's X'...' hex literal is decoded as a blob, CAST converts to text
  local hex_line
  hex_line=$(printf '%s' "$line" | xxd -p | tr -d '\n')

  blackboard --db "$DB_PATH" query \
    "INSERT INTO worker_logs (worker_id, stream, line, iteration) VALUES ('$WORKER_ID', '$stream', CAST(X'$hex_line' AS TEXT), $iter)" \
    2>/dev/null || true
}

# Configure git for commits inside container
git config --global user.email "worker@blackboard.local"
git config --global user.name "Blackboard Worker ${WORKER_ID}"

# Start heartbeat background process
# Use a file to share iteration count between main loop and heartbeat subshell
iteration=0
ITERATION_FILE="/tmp/worker_iteration_$$"
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
BRANCH="threads/${THREAD_NAME}"
WORK_DIR="/app/work"

git clone /app/repo "$WORK_DIR" 2>/dev/null
cd "$WORK_DIR"

# Check out or create the thread branch
git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"

# Set up .claude directory with subagent definitions
# This makes the implementer subagent available to Claude inside the container
mkdir -p "$WORK_DIR/.claude/agents"
cp -r /app/claude-config/agents/* "$WORK_DIR/.claude/agents/" 2>/dev/null || true

# Idle detection - get initial plan ID for tracking
PLAN_ID=$(blackboard --db "$DB_PATH" query \
  "SELECT p.id FROM plans p JOIN threads t ON p.id = t.current_plan_id WHERE t.name = '$THREAD_NAME' LIMIT 1" 2>/dev/null | grep -v "^id$" | head -1 || echo "")

# Main Ralph Wiggum loop
while [ $iteration -lt $MAX_ITERATIONS ]; do
  iteration=$((iteration + 1))
  echo "$iteration" > "$ITERATION_FILE"

  # Update iteration in DB
  blackboard --db "$DB_PATH" query \
    "UPDATE workers SET iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true

  # Capture state for idle detection
  PREV_CRUMB_COUNT=$(blackboard --db "$DB_PATH" query \
    "SELECT COUNT(*) as cnt FROM breadcrumbs WHERE plan_id = '$PLAN_ID'" 2>/dev/null | grep -v "^cnt$" | head -1 || echo "0")
  PREV_STEP_STATE=$(blackboard --db "$DB_PATH" query \
    "SELECT GROUP_CONCAT(status) FROM plan_steps WHERE plan_id = '$PLAN_ID'" 2>/dev/null | tail -1 || echo "")

  # Generate context packet for the thread
  CONTEXT=$(blackboard --db "$DB_PATH" thread status "$THREAD_NAME" --json 2>/dev/null || echo '{"error": "failed to get context"}')

  # Build prompt from thread context
  PROMPT="You are a worker executing thread '${THREAD_NAME}'. This is iteration ${iteration} of ${MAX_ITERATIONS}.

## Current Context
${CONTEXT}

## Strategic Context Management

Your context window is precious. Use subagents strategically to:
- **Parallelize independent work**: Launch multiple Task tools in a single message for independent steps
- **Conserve your context**: Delegate implementation to subagents even for small tasks
- **Track progress granularly**: Record one breadcrumb per subagent (roughly 1:1 ratio)

You have access to the \`implementer\` subagent (see .claude/agents/implementer.md):
\`\`\`
Task tool with subagent_type: \"implementer\"
Prompt: \"Implement step X: <description>. plan_id='<plan_id>' step_id='<step_id>'\"
\`\`\`

### Parallelization Strategy
- Identify steps that can run in parallel (no dependencies between them)
- Launch them together in a SINGLE message with multiple Task tool calls
- Example: If steps 2, 3, and 4 are independent, spawn 3 implementer subagents at once
- Wait for all to complete, then check breadcrumbs and move to next batch

## Your Workflow

Work on pending steps using subagents. For each iteration:

### 1. Plan Your Batch
Review pending steps and identify which can be parallelized:
\`\`\`bash
blackboard --db ${DB_PATH} query \"SELECT id, step_order, description, status FROM plan_steps WHERE plan_id='<plan_id>' ORDER BY step_order\"
\`\`\`

### 2. Check Recent Progress
Before spawning subagents, review what's been done:
\`\`\`bash
blackboard --db ${DB_PATH} query \"SELECT summary, issues, next_context FROM breadcrumbs WHERE plan_id='<plan_id>' ORDER BY created_at DESC LIMIT 5\"
\`\`\`

### 3. Spawn Subagents
Launch Task tools with implementer subagent for each step in your batch:
- Pass plan_id and step_id explicitly in the prompt
- For independent steps, launch multiple in ONE message (parallel execution)
- For dependent steps, launch sequentially and wait for completion

### 4. Record Breadcrumb After Each Subagent
After EACH subagent completes, record what it did:
\`\`\`bash
blackboard --db ${DB_PATH} crumb \"<summary of what subagent accomplished>\" --agent worker --files \"<files touched>\"
\`\`\`
Maintain roughly 1:1 ratio: one breadcrumb per subagent spawned.

### 5. Update Step Status
When a subagent completes its step:
\`\`\`bash
blackboard --db ${DB_PATH} query \"UPDATE plan_steps SET status = 'completed' WHERE id = '<step_id>'\"
\`\`\`

### 6. Update Plan If Needed
If you discover the plan needs adjustment (new steps, scope changes, blockers):
\`\`\`bash
# Write updated plan to a temp file, then:
blackboard --db ${DB_PATH} thread plan ${THREAD_NAME} /tmp/updated-plan.md
\`\`\`
If the plan has no steps yet and you're doing initial research/planning, add them:
\`\`\`bash
# Add new steps by inserting directly into plan_steps table:
blackboard --db ${DB_PATH} query \"INSERT INTO plan_steps (id, plan_id, step_order, description) VALUES ('step-' || hex(randomblob(4)), '<plan_id>', <order>, '<description>')\"
\`\`\`

### 7. Commit Changes (if applicable)
If subagents modified files, commit them:
\`\`\`bash
git add <files>
git commit -m \"[${THREAD_NAME}] <description>\" --no-verify
\`\`\`
For plan-only work (research, planning), you may not need commits - that's OK!

### 8. Report Blockers
If you hit a blocker:
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

  # Run Claude CLI with stream-json output and parse events
  # Create temp files for stdout and stderr
  STDOUT_FILE=$(mktemp)
  STDERR_FILE=$(mktemp)

  set +e
  timeout 600 claude -p "$PROMPT" \
    --output-format stream-json \
    --verbose \
    --dangerously-skip-permissions \
    --append-system-prompt "IMPORTANT: Record breadcrumbs FREQUENTLY using 'blackboard crumb' to track your progress - after exploring code, making decisions, completing modifications, running tests, etc. Update the plan with 'blackboard thread plan' if you discover it needs changes. Use 'blackboard query' to inspect or update the database as needed. Git commits are only required if you modified files - plan-only work (research, planning, adding steps) doesn't need commits. When all steps are genuinely complete, output '${COMPLETION_PROMISE}'. Do not output it prematurely." \
    2> "$STDERR_FILE" \
    | tee "$STDOUT_FILE" \
    | deno run --allow-read --allow-write --allow-env /app/parse-worker-events.ts "$WORKER_ID" "$iteration" "$DB_PATH" \
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
      echo "[worker:${WORKER_ID}] $MSG"
      log_to_db "system" "$MSG" "$iteration"
      blackboard --db "$DB_PATH" crumb "$MSG" \
        --agent worker --next "Timeout occurred - retrying in next iteration" 2>/dev/null || true
      sleep 5
      continue
    fi
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

  # Also check if plan is marked complete in database
  PLAN_COMPLETE=$(blackboard --db "$DB_PATH" query \
    "SELECT 1 FROM plans p JOIN threads t ON p.id = t.current_plan_id WHERE t.name = '$THREAD_NAME' AND p.status = 'completed' LIMIT 1" 2>/dev/null || echo "")
  if [ -n "$PLAN_COMPLETE" ]; then
    MSG="Plan completed (detected via database) after $iteration iterations"
    echo "[worker:${WORKER_ID}] $MSG"
    log_to_db "system" "$MSG" "$iteration"
    blackboard --db "$DB_PATH" query \
      "UPDATE workers SET status = 'completed', iteration = $iteration WHERE id = '$WORKER_ID'" 2>/dev/null || true
    exit 0
  fi

  # Idle detection - check if any progress was made
  NEW_CRUMB_COUNT=$(blackboard --db "$DB_PATH" query \
    "SELECT COUNT(*) as cnt FROM breadcrumbs WHERE plan_id = '$PLAN_ID'" 2>/dev/null | grep -v "^cnt$" | head -1 || echo "0")
  NEW_STEP_STATE=$(blackboard --db "$DB_PATH" query \
    "SELECT GROUP_CONCAT(status) FROM plan_steps WHERE plan_id = '$PLAN_ID'" 2>/dev/null | tail -1 || echo "")

  if [ "$PREV_CRUMB_COUNT" = "$NEW_CRUMB_COUNT" ] && [ "$PREV_STEP_STATE" = "$NEW_STEP_STATE" ]; then
    MSG="No progress detected in iteration $iteration - exiting (idle)"
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
