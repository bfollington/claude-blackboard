/**
 * Oops command - Record a correction or mistake for future reference.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getActivePlan, getCurrentThread } from "../db/queries.ts";

interface OopsOptions {
  db?: string;
  quiet?: boolean;
  symptoms?: string;
  fix?: string;
  tags?: string;
}

/**
 * Gets the plan ID to use, preferring current thread's plan.
 */
function getTargetPlanId(): string | null {
  // First try current thread's plan
  const thread = getCurrentThread();
  if (thread?.current_plan_id) {
    return thread.current_plan_id;
  }

  // Fall back to active plan
  const activePlan = getActivePlan();
  return activePlan?.id ?? null;
}

/**
 * Record a correction/mistake in the database.
 *
 * @param mistake - Description of the mistake
 * @param options - Command options
 */
export async function oopsCommand(
  mistake: string,
  options: OopsOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get target plan (optional - corrections can exist without a plan)
  const planId = getTargetPlanId();

  // Generate ID
  const corrId = crypto.randomUUID().replace(/-/g, "").substring(0, 8);

  // Insert correction
  const stmt = db.prepare(`
    INSERT INTO corrections (
      id, plan_id, mistake, symptoms, resolution, tags
    )
    VALUES (
      :id, :plan_id, :mistake, :symptoms, :resolution, :tags
    )
  `);

  stmt.run({
    id: corrId,
    plan_id: planId,
    mistake: mistake,
    symptoms: options.symptoms ?? null,
    resolution: options.fix ?? null,
    tags: options.tags ?? null,
  });

  if (!options.quiet) {
    console.log(`Correction ${corrId} recorded`);
  }
}
