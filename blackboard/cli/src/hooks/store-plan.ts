/**
 * PreToolUse[ExitPlanMode] hook - Store the plan in the database.
 * Thread-aware: associates plan with current thread or creates one.
 */

import { readStdin } from "../utils/stdin.ts";
import { generateId } from "../utils/id.ts";
import { dbExists } from "../db/schema.ts";
import {
  insertPlan,
  getCurrentThread,
  insertThread,
  updateThread,
} from "../db/queries.ts";

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
 * Converts a description to a kebab-case thread name.
 * Falls back to "plan-<timestamp>" if conversion fails.
 */
function slugifyToThreadName(description: string): string {
  // Remove markdown headers and special chars
  const clean = description
    .replace(/^#+\s*/, "")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase();

  if (!clean) {
    return `plan-${Date.now()}`;
  }

  // Convert to kebab-case, limit to 50 chars
  const slug = clean
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 50)
    .replace(/-$/, "");

  return slug || `plan-${Date.now()}`;
}

/**
 * Gets the current git branch.
 */
function getCurrentGitBranch(): string | null {
  try {
    const command = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const result = command.outputSync();
    if (result.success) {
      return new TextDecoder().decode(result.stdout).trim();
    }
  } catch {
    // Not in a git repo or git not available
  }
  return null;
}

/**
 * Store plan hook handler.
 * - Reads JSON from stdin (PreToolUseInput)
 * - Verifies tool_name === "ExitPlanMode", exits if not
 * - Extracts plan content from tool_input.plan
 * - Gets current thread or creates one from plan description
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

  // Get or create thread
  let thread = getCurrentThread();
  let threadCreated = false;

  if (!thread) {
    // No active thread - create one from plan description
    const threadId = generateId();
    const threadName = slugifyToThreadName(description);
    const gitBranch = getCurrentGitBranch();

    insertThread({
      id: threadId,
      name: threadName,
      current_plan_id: null, // Will update after plan insert
      git_branches: gitBranch,
      status: "active",
    });

    thread = {
      id: threadId,
      name: threadName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_plan_id: null,
      git_branches: gitBranch,
      status: "active",
    };
    threadCreated = true;
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
  let reason = `Plan stored with ID: ${planId}`;
  if (threadCreated) {
    reason += ` (new thread: ${thread.name})`;
  } else {
    reason += ` (thread: ${thread.name})`;
  }

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
