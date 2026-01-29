/**
 * PostToolUse[TodoWrite] hook - Sync todos with plan_steps.
 * Matches behavior of blackboard/scripts/capture-todo.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { generateId } from "../utils/id.ts";
import { dbExists } from "../db/schema.ts";
import {
  getSessionState,
  getThreadById,
  getPlanById,
  mergeStepsForPlan,
  updatePlanStatus,
} from "../db/queries.ts";
import type { StepStatus } from "../types/schema.ts";

interface TodoItem {
  content?: string;
  text?: string;
  description?: string;
  status?: string;
  [key: string]: unknown;
}

interface PostToolUseInput {
  tool_name?: string;
  tool_input?: {
    todos?: TodoItem[];
    items?: TodoItem[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Capture todo hook handler.
 * - Reads JSON from stdin (PostToolUseInput)
 * - Verifies tool_name === "TodoWrite", exits if not
 * - Gets plan from selected thread (session-scoped)
 * - Extracts todos from tool_input.todos
 * - Merges steps for plan (using mergeStepsForPlan, preserves completed steps)
 * - Updates plan status based on completion
 * - Outputs PostToolUseOutput with sync summary
 */
export async function captureTodo(): Promise<void> {
  const input = await readStdin<PostToolUseInput>();

  // Check if this is TodoWrite
  if (input.tool_name !== "TodoWrite") {
    Deno.exit(0);
  }

  // Check database exists
  if (!dbExists()) {
    Deno.exit(0);
  }

  // Get plan from selected thread (session-scoped)
  const selectedThreadId = getSessionState("selected_thread_id");
  if (!selectedThreadId) {
    Deno.exit(0); // No thread selected, let todos pass through
  }

  const thread = getThreadById(selectedThreadId);
  if (!thread?.current_plan_id) {
    Deno.exit(0); // Thread has no plan, let todos pass through
  }

  const plan = getPlanById(thread.current_plan_id);
  if (!plan) {
    Deno.exit(0); // Plan not found, let todos pass through
  }

  // Extract todos from tool_input
  const todos = input.tool_input?.todos ?? input.tool_input?.items ?? [];

  // Skip merge if incoming list is empty to avoid clearing pending steps
  if (todos.length === 0) {
    Deno.exit(0);
  }

  // Map todos to plan steps
  const steps = todos.map((todo, index) => {
    const content = todo.content ?? todo.text ?? todo.description ?? String(todo);
    let status: StepStatus = "pending";

    // Map status
    const todoStatus = todo.status?.toLowerCase();
    if (todoStatus === "completed" || todoStatus === "done") {
      status = "completed";
    } else if (todoStatus === "in_progress") {
      status = "in_progress";
    }

    return {
      step_order: index + 1,
      description: content,
      status,
    };
  });

  // Merge steps for this plan (preserves completed/failed/skipped steps)
  const mergeResult = mergeStepsForPlan(plan.id, steps);

  // Count completed vs total
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = steps.length;

  // Update plan status based on step states
  let planStatus: "in_progress" | "completed";
  if (completedCount === totalCount && totalCount > 0) {
    planStatus = "completed";
  } else {
    planStatus = "in_progress";
  }
  updatePlanStatus(plan.id, planStatus);

  // Output sync summary with merge statistics
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          `Merged steps: ${mergeResult.added} added, ${mergeResult.updated} updated, ${mergeResult.preserved} preserved. Plan status: ${planStatus}.`,
      },
    }),
  );
}
