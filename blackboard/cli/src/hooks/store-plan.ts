/**
 * PreToolUse[ExitPlanMode] hook - Store the plan in the database.
 * Thread-aware: auto-creates a thread if none selected.
 */

import { readStdin } from "../utils/stdin.ts";
import { generateId } from "../utils/id.ts";
import { dbExists } from "../db/schema.ts";
import {
  insertPlan,
  insertThread,
  updateThread,
  getSessionState,
  setSessionState,
  getThreadById,
  resolveThread,
} from "../db/queries.ts";
import { getCurrentGitBranch } from "../utils/git.ts";
import { toKebabCase } from "../utils/string.ts";
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
 * - Auto-creates thread if none selected (derived from plan description)
 * - Generates plan ID, extracts description from first line
 * - Inserts plan with thread_id
 * - Updates thread's current_plan_id
 * - Outputs PreToolUseOutput with permissionDecision: "allow"
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

  // Check for explicitly selected thread, or auto-create one
  const selectedThreadId = getSessionState("selected_thread_id");
  let thread: Thread | null = null;
  let autoCreated = false;

  if (selectedThreadId) {
    thread = getThreadById(selectedThreadId);
    if (!thread) {
      // Selected thread was deleted - auto-create a new one instead of blocking
      autoCreated = true;
    }
  } else {
    // No explicit thread selection - auto-create one
    autoCreated = true;
  }

  if (autoCreated) {
    // Generate thread name from plan description
    let threadName = toKebabCase(description) || `plan-${Date.now()}`;

    // Handle collision by appending timestamp
    if (resolveThread(threadName)) {
      threadName = `${threadName}-${Date.now()}`;
    }

    const threadId = generateId();
    const gitBranch = getCurrentGitBranch();

    insertThread({
      id: threadId,
      name: threadName,
      current_plan_id: null,
      git_branches: gitBranch,
      status: "active",
    });

    // Set session state so subsequent operations use this thread
    setSessionState("selected_thread_id", threadId);

    thread = {
      id: threadId,
      name: threadName,
      current_plan_id: null,
      git_branches: gitBranch,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // Insert plan with thread_id
  insertPlan({
    id: planId,
    status: "accepted",
    description: description || null,
    plan_markdown: plan,
    session_id: sessionId,
    thread_id: thread!.id,
  });

  // Update thread's current_plan_id
  updateThread(thread!.id, { current_plan_id: planId });

  // Build response message
  const createdSuffix = autoCreated ? " [thread auto-created]" : "";
  const reason = `Plan stored with ID: ${planId} (thread: ${thread!.name})${createdSuffix}`;

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
