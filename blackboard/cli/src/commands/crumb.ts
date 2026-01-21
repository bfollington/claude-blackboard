/**
 * Crumb command - Record a breadcrumb for the current plan.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getActivePlan, getCurrentThread } from "../db/queries.ts";

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

  // Get target plan (prefer current thread's plan)
  const planId = getTargetPlanId();
  if (!planId) {
    console.error("Error: No active plan or thread found. Cannot record breadcrumb.");
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
    plan_id: planId,
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
