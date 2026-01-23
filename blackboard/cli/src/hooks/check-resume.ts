/**
 * SessionStart hook - Show recent threads and suggest loading one.
 * Thread-aware version that replaces the old plan-focused resume logic.
 */

import { dbExists } from "../db/schema.ts";
import { listThreads, getStepsForPlan } from "../db/queries.ts";

/**
 * Formats a relative time string from ISO datetime.
 */
function relativeTime(isoDate: string): string {
  const date = new Date(isoDate + "Z"); // Assume UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return isoDate.split("T")[0];
}

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
