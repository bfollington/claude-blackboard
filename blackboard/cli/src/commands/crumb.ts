/**
 * Crumb command - Record a breadcrumb for the current plan.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getTargetPlanId, quietLog } from "../utils/command.ts";
import { generateId } from "../utils/id.ts";

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

  // Get target plan from current thread
  const planId = getTargetPlanId();
  if (!planId) {
    console.error("Error: No current thread with a plan found. Load a thread first.");
    Deno.exit(1);
  }

  // Generate ID
  const crumbId = generateId();

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
    plan_id: planId,
    step_id: options.step ?? null,
    agent_type: options.agent ?? "implementer",
    summary: summary,
    files_touched: options.files ?? null,
    issues: options.issues ?? null,
    next_context: options.next ?? null,
  });

  quietLog(`Breadcrumb ${crumbId} recorded`, options.quiet);
}
