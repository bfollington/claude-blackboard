/**
 * PreCompact hook - Suggest reflection before compacting.
 * Matches behavior of blackboard/scripts/prompt-reflect.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { dbExists } from "../db/schema.ts";
import { getActivePlan } from "../db/queries.ts";

/**
 * Prompt reflect hook handler.
 * - Reads JSON from stdin (consumes it)
 * - Checks if there's an active plan
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

  // Get active plan
  const plan = getActivePlan();
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
