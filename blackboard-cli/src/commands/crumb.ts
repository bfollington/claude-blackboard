/**
 * Crumb command - Record a breadcrumb for the current plan.
 */

import { getDb } from "../db/connection.ts";
import { getActivePlan } from "../db/queries.ts";

interface CrumbOptions {
  db?: string;
  quiet?: boolean;
  step?: string;
  files?: string;
  issues?: string;
  next?: string;
  agent?: string;
}

/**
 * Record a breadcrumb in the database.
 *
 * @param summary - Summary of what was accomplished
 * @param options - Command options
 */
export async function crumbCommand(
  summary: string,
  options: CrumbOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get active plan
  const activePlan = getActivePlan();
  if (!activePlan) {
    console.error("Error: No active plan found. Cannot record breadcrumb.");
    Deno.exit(1);
  }

  // Generate ID
  const crumbId = crypto.randomUUID().replace(/-/g, "").substring(0, 8);

  // Insert breadcrumb
  const stmt = db.prepare(`
    INSERT INTO breadcrumbs (
      id, plan_id, step_id, agent_type, summary,
      files_touched, issues, next_context
    )
    VALUES (
      :id, :plan_id, :step_id, :agent_type, :summary,
      :files_touched, :issues, :next_context
    )
  `);

  stmt.run({
    id: crumbId,
    plan_id: activePlan.id,
    step_id: options.step ?? null,
    agent_type: options.agent ?? "implementer",
    summary: summary,
    files_touched: options.files ?? null,
    issues: options.issues ?? null,
    next_context: options.next ?? null,
  });

  if (!options.quiet) {
    console.log(`Breadcrumb ${crumbId} recorded`);
  }
}
