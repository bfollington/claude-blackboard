/**
 * PreCompact hook - Suggest reflection before compacting.
 * Matches behavior of blackboard/scripts/prompt-reflect.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { dbExists } from "../db/schema.ts";
import { getSessionState, getThreadById, getPlanById } from "../db/queries.ts";

/**
 * Prompt reflect hook handler.
 * - Reads JSON from stdin (consumes it)
 * - Gets plan from selected thread (session-scoped)
 * - Suggests running /reflect before compacting
 * - Outputs systemMessage with suggestion
 */
export async function promptReflect(): Promise<void> {
  // Read input (consume it)
  await readStdin<unknown>();

  // Check database exists
  if (!dbExists()) {
    Deno.exit(0);
  }

  // Get plan from selected thread (session-scoped)
  const selectedThreadId = getSessionState("selected_thread_id");
  if (!selectedThreadId) {
    Deno.exit(0);
  }

  const thread = getThreadById(selectedThreadId);
  if (!thread?.current_plan_id) {
    Deno.exit(0);
  }

  const plan = getPlanById(thread.current_plan_id);
  if (!plan) {
    Deno.exit(0);
  }

  // Build suggestion message
  const message =
    `Before compacting, consider running /reflect to capture insights from the current session on plan "${plan.description}" (${plan.id}).`;

  // Output JSON with additionalContext
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreCompact",
        additionalContext: message,
      },
    }),
  );
}
