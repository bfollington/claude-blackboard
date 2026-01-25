/**
 * PreToolUse[ExitPlanMode] hook - Store the plan in the database.
 * Thread-aware: requires explicit thread selection before plan storage.
 */

import { readStdin } from "../utils/stdin.ts";
import { generateId } from "../utils/id.ts";
import { dbExists } from "../db/schema.ts";
import {
  insertPlan,
  updateThread,
  getSessionState,
  getThreadById,
} from "../db/queries.ts";
import type { Thread } from "../types/schema.ts";

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: {
    plan?: string;
    [key: string]: unknown;
  };
  session_id?: string;
  [key: string]: unknown;
}

/**
 * Store plan hook handler.
 * - Reads JSON from stdin (PreToolUseInput)
 * - Verifies tool_name === "ExitPlanMode", exits if not
 * - Extracts plan content from tool_input.plan
 * - Verifies an explicit thread has been selected for this session
 * - Blocks plan storage if no thread selected (prevents accidental overwrites)
 * - Generates plan ID, extracts description from first line
 * - Inserts plan with thread_id
 * - Updates thread's current_plan_id
 * - Outputs PreToolUseOutput with permissionDecision: "allow" or "block"
 */
export async function storePlan(): Promise<void> {
  const input = await readStdin<PreToolUseInput>();

  // Check if this is ExitPlanMode
  if (input.tool_name !== "ExitPlanMode") {
    Deno.exit(0);
  }

  // Ensure database exists
  if (!dbExists()) {
    console.error("Blackboard database not found. Run /init or restart session.");
    Deno.exit(2);
  }

  // Extract plan content
  const plan = input.tool_input?.plan;
  if (!plan) {
    console.error("No plan content in ExitPlanMode input");
    Deno.exit(2);
  }

  const sessionId = input.session_id ?? null;

  // Generate plan ID (8 random hex chars)
  const planId = generateId();

  // Extract first line as description
  const lines = plan.split("\n");
  const firstLine = lines[0] || "";
  const description = firstLine.replace(/^#*\s*/, "").substring(0, 200);

  // Check for explicitly selected thread
  const selectedThreadId = getSessionState("selected_thread_id");
  let thread: Thread | null = null;

  if (selectedThreadId) {
    thread = getThreadById(selectedThreadId);
    if (!thread) {
      // Selected thread was deleted - clear stale state
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "block",
            permissionDecisionReason:
              "Previously selected thread no longer exists. Use /blackboard:thread <name> to select a thread.",
          },
        })
      );
      return;
    }
  } else {
    // No explicit thread selection - block plan storage
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "block",
          permissionDecisionReason:
            "No thread selected for this session. Use /blackboard:thread <name> to select an existing thread, or `blackboard thread new <name>` to create one.",
        },
      })
    );
    return;
  }

  // Insert plan with thread_id
  insertPlan({
    id: planId,
    status: "accepted",
    description: description || null,
    plan_markdown: plan,
    session_id: sessionId,
    thread_id: thread.id,
  });

  // Update thread's current_plan_id
  updateThread(thread.id, { current_plan_id: planId });

  // Build response message
  let reason = `Plan stored with ID: ${planId} (thread: ${thread.name})`;

  // Output JSON to allow the tool and add context
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: reason,
      },
    }),
  );
}
