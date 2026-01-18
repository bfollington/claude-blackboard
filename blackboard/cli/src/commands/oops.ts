/**
 * Oops command - Record a correction or mistake for future reference.
 */

import { getDb } from "../db/connection.ts";
import { getActivePlan } from "../db/queries.ts";

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

  // Get active plan (optional - corrections can exist without a plan)
  const activePlan = getActivePlan();
  const planId = activePlan?.id ?? null;

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
