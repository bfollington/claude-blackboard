/**
 * Oops command - Record a correction or mistake for future reference.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getTargetPlanId, quietLog } from "../utils/command.ts";
import { generateId } from "../utils/id.ts";

interface OopsOptions {
  db?: string;
  quiet?: boolean;
  symptoms?: string;
  fix?: string;
  tags?: string;
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
  const corrId = generateId();

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

  quietLog(`Correction ${corrId} recorded`, options.quiet);
}
