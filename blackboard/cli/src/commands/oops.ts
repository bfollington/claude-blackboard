/**
 * Oops command - Record a correction or mistake for future reference.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getCurrentThread } from "../db/queries.ts";

interface OopsOptions {
  db?: string;
  quiet?: boolean;
  symptoms?: string;
  fix?: string;
  tags?: string;
}

/**
 * Gets the plan ID from the current thread (most recently touched).
 */
function getTargetPlanId(): string | null {
  const thread = getCurrentThread();
  return thread?.current_plan_id ?? null;
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
