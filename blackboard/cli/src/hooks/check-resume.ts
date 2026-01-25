/**
 * SessionStart hook - Show recent threads and suggest loading one.
 * Thread-aware version that replaces the old plan-focused resume logic.
 */

import { dbExists } from "../db/schema.ts";
import { listThreads, getStepsForPlan, clearSessionState } from "../db/queries.ts";
import { relativeTime } from "../utils/time.ts";

/**
 * Check resume hook handler.
 * - Checks if database exists (exit 0 if not)
 * - Lists recent threads with pending step counts
 * - Outputs systemMessage with thread options
 */
export async function checkResume(): Promise<void> {
  // Check database exists
  if (!dbExists()) {
    Deno.exit(0);
  }

  // Clear session state from previous sessions
  // This ensures each session requires explicit thread selection
  clearSessionState("selected_thread_id");

  // Get recent threads (all statuses, limit 5)
  const threads = listThreads(undefined, 5);

  if (threads.length === 0) {
    // No threads yet - silent exit
    Deno.exit(0);
  }

  // Build thread list with pending counts
  const threadLines: string[] = [];
  for (const t of threads) {
    let pendingCount = 0;
    let stepInfo = "";

    if (t.current_plan_id) {
      const steps = getStepsForPlan(t.current_plan_id);
      pendingCount = steps.filter(
        (s) => s.status === "pending" || s.status === "in_progress"
      ).length;
      const completedCount = steps.filter((s) => s.status === "completed").length;
      stepInfo = ` (${completedCount}/${steps.length} steps)`;
      if (pendingCount > 0) {
        stepInfo = ` (${pendingCount} pending)`;
      }
    }

    const statusIcon =
      t.status === "active"
        ? "●"
        : t.status === "paused"
        ? "○"
        : t.status === "completed"
        ? "✓"
        : "◌";

    threadLines.push(
      `  ${statusIcon} ${t.name}${stepInfo} - last active ${relativeTime(t.updated_at)}`
    );
  }

  // Check for active workers
  let workerLine = "";
  try {
    const { getActiveWorkers } = await import("../db/worker-queries.ts");
    const activeWorkers = getActiveWorkers();
    if (activeWorkers.length > 0) {
      workerLine = `\n\n**Active workers**: ${activeWorkers.length} running. Use \`blackboard workers\` to check status.`;
    }
  } catch {
    // Worker queries may not be available yet
  }

  // Build resume prompt with workflow context
  const prompt = `## Blackboard: Recent Threads

${threadLines.join("\n")}${workerLine}

### Commands

- \`/blackboard:thread <name>\` — load a thread and work on it directly
- \`/blackboard:threads\` — orchestrate: plan, spawn workers, monitor progress
- \`blackboard thread new <name>\` — create a new thread

### Thread-Worker Model

Threads are independent units of work. You can work on a thread directly, or spawn containerized workers that execute steps autonomously on isolated git branches. Workers push results to \`threads/<name>\` branches without affecting your checkout. Use \`/threads\` to manage the full lifecycle.`;

  // Output JSON with systemMessage
  console.log(
    JSON.stringify({
      systemMessage: prompt,
    }),
  );
}
