/**
 * Bug report command - File a blocking bug report with reproduction steps.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getTargetPlanId, quietLog } from "../utils/command.ts";
import { generateId } from "../utils/id.ts";

interface BugReportOptions {
  db?: string;
  quiet?: boolean;
  steps?: string;
  evidence?: string;
}

/**
 * File a bug report in the database.
 *
 * @param title - Title of the bug
 * @param options - Command options
 */
export async function bugReportCommand(
  title: string,
  options: BugReportOptions
): Promise<void> {
  const db = getDb(options.db);

  // Validate required options
  if (!options.steps) {
    console.error("Error: --steps is required for bug reports");
    console.error("Usage: blackboard bug-report <title> --steps <repro steps> [--evidence <logs>]");
    Deno.exit(1);
  }

  // Get target plan (optional - bug reports can exist without a plan)
  const planId = getTargetPlanId();

  // Generate ID
  const bugId = generateId();

  // Insert bug report
  const stmt = db.prepare(`
    INSERT INTO bug_reports (
      id, plan_id, title, repro_steps, evidence, status
    )
    VALUES (
      :id, :plan_id, :title, :repro_steps, :evidence, :status
    )
  `);

  stmt.run({
    id: bugId,
    plan_id: planId,
    title: title,
    repro_steps: options.steps,
    evidence: options.evidence ?? null,
    status: "open",
  });

  quietLog(`Bug report ${bugId} filed`, options.quiet);
}
