/**
 * PreToolUse[ExitPlanMode] hook - Store the plan in the database.
 * Matches behavior of blackboard/scripts/store-plan.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { generateId } from "../utils/id.ts";
import { dbExists } from "../db/schema.ts";
import { insertPlan } from "../db/queries.ts";

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
 * - Generates plan ID, extracts description from first line
 * - Inserts into database
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

  // Generate ID (8 random hex chars)
  const planId = generateId();

  // Extract first line as description
  const lines = plan.split("\n");
  const firstLine = lines[0] || "";
  const description = firstLine.replace(/^#*\s*/, "").substring(0, 200);

  // Insert into database
  insertPlan({
    id: planId,
    status: "accepted",
    description: description || null,
    plan_markdown: plan,
    session_id: sessionId,
  });

  // Output JSON to allow the tool and add context
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `Plan stored with ID: ${planId}`,
      },
    }),
  );
}
