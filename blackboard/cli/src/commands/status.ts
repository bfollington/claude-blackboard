/**
 * Status command - Display current blackboard status.
 * Shows active plan, step progress, recent breadcrumbs, bug reports, and corrections.
 */

import { getDb } from "../db/connection.ts";
import { formatTable } from "../output/table.ts";

interface StatusOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
}

/**
 * Display current blackboard status with multiple queries.
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const db = getDb(options.db);

  if (options.json) {
    // JSON mode - return all data as structured JSON
    const data = {
      activePlan: queryOne(db, "SELECT id, status, substr(description, 1, 50) as description, created_at FROM active_plan"),
      stepsProgress: queryAll(db, `
        SELECT status, COUNT(*) as count
        FROM plan_steps
        WHERE plan_id = (SELECT id FROM active_plan)
        GROUP BY status
        ORDER BY CASE status
          WHEN 'completed' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'pending' THEN 3
          ELSE 4
        END
      `),
      stepDetails: queryAll(db, `
        SELECT id, step_order as step, status, substr(description, 1, 50) as description
        FROM plan_steps
        WHERE plan_id = (SELECT id FROM active_plan)
        ORDER BY step_order
        LIMIT 10
      `),
      recentBreadcrumbs: queryAll(db, `
        SELECT substr(created_at, 12, 8) as time, agent_type, substr(summary, 1, 40) as summary
        FROM breadcrumbs
        WHERE plan_id = (SELECT id FROM active_plan)
        ORDER BY created_at DESC
        LIMIT 5
      `),
      openBugReports: queryAll(db, `
        SELECT id, substr(title, 1, 40) as title, substr(created_at, 1, 10) as date
        FROM bug_reports
        WHERE status = 'open'
        LIMIT 5
      `),
      recentCorrections: queryAll(db, `
        SELECT substr(created_at, 1, 10) as date, substr(mistake, 1, 40) as mistake
        FROM corrections
        ORDER BY created_at DESC
        LIMIT 3
      `),
    };
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Table mode - format as readable tables
  if (!options.quiet) {
    console.log("\n=== Blackboard Status ===\n");
  }

  // Active Plan
  console.log("Active Plan:");
  const activePlan = queryOne(db, "SELECT id, status, substr(description, 1, 50) as description, created_at FROM active_plan");
  if (activePlan) {
    console.log(formatTable(
      ["id", "status", "description", "created_at"],
      [[activePlan.id, activePlan.status, activePlan.description || "", activePlan.created_at]]
    ));
  } else {
    console.log("  (no active plan)");
  }
  console.log();

  // Steps Progress
  console.log("Steps Progress:");
  const stepsProgress = queryAll(db, `
    SELECT status, COUNT(*) as count
    FROM plan_steps
    WHERE plan_id = (SELECT id FROM active_plan)
    GROUP BY status
    ORDER BY CASE status
      WHEN 'completed' THEN 1
      WHEN 'in_progress' THEN 2
      WHEN 'pending' THEN 3
      ELSE 4
    END
  `);
  if (stepsProgress.length > 0) {
    console.log(formatTable(
      ["status", "count"],
      stepsProgress.map(r => [r.status, String(r.count)])
    ));
  } else {
    console.log("  (no steps)");
  }
  console.log();

  // Step Details
  console.log("Step Details (first 10):");
  const stepDetails = queryAll(db, `
    SELECT id, step_order as step, status, substr(description, 1, 50) as description
    FROM plan_steps
    WHERE plan_id = (SELECT id FROM active_plan)
    ORDER BY step_order
    LIMIT 10
  `);
  if (stepDetails.length > 0) {
    console.log(formatTable(
      ["id", "#", "status", "description"],
      stepDetails.map(r => [r.id, String(r.step), r.status, r.description])
    ));
  } else {
    console.log("  (no steps)");
  }
  console.log();

  // Recent Breadcrumbs
  console.log("Recent Breadcrumbs (last 5):");
  const breadcrumbs = queryAll(db, `
    SELECT substr(created_at, 12, 8) as time, agent_type, substr(summary, 1, 40) as summary
    FROM breadcrumbs
    WHERE plan_id = (SELECT id FROM active_plan)
    ORDER BY created_at DESC
    LIMIT 5
  `);
  if (breadcrumbs.length > 0) {
    console.log(formatTable(
      ["time", "agent_type", "summary"],
      breadcrumbs.map(r => [r.time || "", r.agent_type || "", r.summary])
    ));
  } else {
    console.log("  (no breadcrumbs)");
  }
  console.log();

  // Open Bug Reports
  console.log("Open Bug Reports (last 5):");
  const bugReports = queryAll(db, `
    SELECT id, substr(title, 1, 40) as title, substr(created_at, 1, 10) as date
    FROM bug_reports
    WHERE status = 'open'
    LIMIT 5
  `);
  if (bugReports.length > 0) {
    console.log(formatTable(
      ["id", "title", "date"],
      bugReports.map(r => [r.id, r.title, r.date])
    ));
  } else {
    console.log("  (no open bug reports)");
  }
  console.log();

  // Recent Corrections
  console.log("Recent Corrections (last 3):");
  const corrections = queryAll(db, `
    SELECT substr(created_at, 1, 10) as date, substr(mistake, 1, 40) as mistake
    FROM corrections
    ORDER BY created_at DESC
    LIMIT 3
  `);
  if (corrections.length > 0) {
    console.log(formatTable(
      ["date", "mistake"],
      corrections.map(r => [r.date, r.mistake])
    ));
  } else {
    console.log("  (no corrections)");
  }
  console.log();
}

// Helper functions for querying
function queryOne(db: any, sql: string): any {
  const stmt = db.prepare(sql);
  const results = stmt.all();
  return results.length > 0 ? results[0] : null;
}

function queryAll(db: any, sql: string): any[] {
  const stmt = db.prepare(sql);
  return stmt.all();
}
