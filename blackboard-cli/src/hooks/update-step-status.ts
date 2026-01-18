/**
 * SubagentStop hook - Update step status based on recent breadcrumbs.
 * Matches behavior of blackboard/scripts/update-step-status.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { dbExists } from "../db/schema.ts";
import { getDb } from "../db/connection.ts";
import { updateStepStatus, getActivePlan, updatePlanStatus } from "../db/queries.ts";

/**
 * Update step status hook handler.
 * - Reads JSON from stdin (consumes it)
 * - Checks for recent breadcrumbs (last minute) that have a step_id
 * - Marks step as completed
 * - Checks if all steps are done and marks plan complete if so
 */
export async function updateStepStatusHook(): Promise<void> {
  // Read input (consume it)
  await readStdin<unknown>();

  // Check database exists
  if (!dbExists()) {
    Deno.exit(0);
  }

  const db = getDb();

  // Check for recent breadcrumbs (last minute) that have a step_id
  const stmt = db.prepare(`
    SELECT step_id FROM breadcrumbs
    WHERE step_id IS NOT NULL
      AND created_at > datetime('now', '-1 minute')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const results = stmt.all() as Array<{ step_id: string }>;

  if (results.length > 0 && results[0].step_id) {
    const stepId = results[0].step_id;

    // Mark step as completed
    updateStepStatus(stepId, "completed");

    // Check if all steps are done
    const activePlan = getActivePlan();
    if (activePlan) {
      const pendingStmt = db.prepare(`
        SELECT COUNT(*) as count FROM plan_steps
        WHERE plan_id = :planId AND status = 'pending'
      `);
      const pendingResults = pendingStmt.all({ planId: activePlan.id }) as Array<{ count: number }>;

      if (pendingResults.length > 0 && pendingResults[0].count === 0) {
        // All done - mark plan complete
        updatePlanStatus(activePlan.id, "completed");
      }
    }
  }

  Deno.exit(0);
}
