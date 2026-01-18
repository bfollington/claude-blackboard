/**
 * Typed query functions for all database operations.
 * Uses prepared statements with named parameters for safety.
 */

import { getDb } from "./connection.ts";
import type {
  Plan,
  PlanStep,
  Breadcrumb,
  Correction,
  BugReport,
  Reflection,
  PlanStatus,
  StepStatus,
  BugReportStatus,
} from "../types/schema.ts";

// ============================================================================
// Plans
// ============================================================================

/**
 * Gets the currently active plan (status = 'accepted' or 'in_progress').
 * Returns the most recently created active plan.
 *
 * @returns Active plan or null if none exists
 */
export function getActivePlan(): Plan | null {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT * FROM active_plan"
  );
  const results = stmt.all() as Plan[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Inserts a new plan into the database.
 *
 * @param plan - Plan object to insert
 */
export function insertPlan(plan: Omit<Plan, "created_at">): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO plans (id, status, description, plan_markdown, session_id)
    VALUES (:id, :status, :description, :plan_markdown, :session_id)
  `);
  stmt.run({
    id: plan.id,
    status: plan.status,
    description: plan.description ?? null,
    plan_markdown: plan.plan_markdown,
    session_id: plan.session_id ?? null,
  });
}

/**
 * Updates the status of an existing plan.
 *
 * @param id - Plan ID
 * @param status - New status value
 */
export function updatePlanStatus(id: string, status: PlanStatus): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE plans
    SET status = :status
    WHERE id = :id
  `);
  stmt.run({ id, status });
}

// ============================================================================
// Plan Steps
// ============================================================================

/**
 * Gets all steps for a specific plan, ordered by step_order.
 *
 * @param planId - Plan ID
 * @returns Array of plan steps
 */
export function getStepsForPlan(planId: string): PlanStep[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM plan_steps
    WHERE plan_id = :planId
    ORDER BY step_order
  `);
  return stmt.all({ planId }) as PlanStep[];
}

/**
 * Gets all pending steps for a specific plan.
 *
 * @param planId - Plan ID
 * @returns Array of pending steps
 */
export function getPendingSteps(planId: string): PlanStep[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM plan_steps
    WHERE plan_id = :planId AND status = 'pending'
    ORDER BY step_order
  `);
  return stmt.all({ planId }) as PlanStep[];
}

/**
 * Atomically replaces all steps for a plan.
 * Deletes existing steps and inserts new ones in a transaction.
 *
 * @param planId - Plan ID
 * @param steps - Array of new steps (without IDs or timestamps)
 */
export function replaceStepsForPlan(
  planId: string,
  steps: Array<Omit<PlanStep, "id" | "plan_id" | "created_at">>
): void {
  const db = getDb();

  // Start transaction
  db.exec("BEGIN TRANSACTION");

  try {
    // Delete existing steps (cascade will handle breadcrumb references)
    const deleteStmt = db.prepare(`
      DELETE FROM plan_steps WHERE plan_id = :planId
    `);
    deleteStmt.run({ planId });

    // Insert new steps
    const insertStmt = db.prepare(`
      INSERT INTO plan_steps (id, plan_id, step_order, description, status)
      VALUES (:id, :planId, :step_order, :description, :status)
    `);

    for (const step of steps) {
      insertStmt.run({
        id: crypto.randomUUID(),
        planId,
        step_order: step.step_order,
        description: step.description,
        status: step.status,
      });
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Updates the status of a single step.
 *
 * @param stepId - Step ID
 * @param status - New status value
 */
export function updateStepStatus(stepId: string, status: StepStatus): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE plan_steps
    SET status = :status
    WHERE id = :stepId
  `);
  stmt.run({ stepId, status });
}

// ============================================================================
// Breadcrumbs
// ============================================================================

/**
 * Inserts a new breadcrumb.
 *
 * @param crumb - Breadcrumb object to insert (without id and created_at)
 */
export function insertBreadcrumb(
  crumb: Omit<Breadcrumb, "id" | "created_at">
): void {
  const db = getDb();
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
    id: crypto.randomUUID(),
    plan_id: crumb.plan_id,
    step_id: crumb.step_id ?? null,
    agent_type: crumb.agent_type ?? null,
    summary: crumb.summary,
    files_touched: crumb.files_touched ?? null,
    issues: crumb.issues ?? null,
    next_context: crumb.next_context ?? null,
  });
}

/**
 * Gets recent breadcrumbs for a plan, ordered by most recent first.
 *
 * @param planId - Plan ID
 * @param limit - Maximum number of breadcrumbs to return (default: 10)
 * @returns Array of breadcrumbs
 */
export function getRecentBreadcrumbs(
  planId: string,
  limit = 10
): Breadcrumb[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM breadcrumbs
    WHERE plan_id = :planId
    ORDER BY created_at DESC
    LIMIT :limit
  `);
  return stmt.all({ planId, limit }) as Breadcrumb[];
}

// ============================================================================
// Corrections
// ============================================================================

/**
 * Inserts a new correction (mistake/learning).
 *
 * @param correction - Correction object to insert (without id and created_at)
 */
export function insertCorrection(
  correction: Omit<Correction, "id" | "created_at">
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO corrections (
      id, plan_id, mistake, symptoms, resolution, tags
    )
    VALUES (
      :id, :plan_id, :mistake, :symptoms, :resolution, :tags
    )
  `);
  stmt.run({
    id: crypto.randomUUID(),
    plan_id: correction.plan_id ?? null,
    mistake: correction.mistake,
    symptoms: correction.symptoms ?? null,
    resolution: correction.resolution ?? null,
    tags: correction.tags ?? null,
  });
}

// ============================================================================
// Bug Reports
// ============================================================================

/**
 * Inserts a new bug report.
 *
 * @param report - Bug report object to insert (without id and created_at)
 */
export function insertBugReport(
  report: Omit<BugReport, "id" | "created_at">
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO bug_reports (
      id, plan_id, title, repro_steps, evidence, status
    )
    VALUES (
      :id, :plan_id, :title, :repro_steps, :evidence, :status
    )
  `);
  stmt.run({
    id: crypto.randomUUID(),
    plan_id: report.plan_id ?? null,
    title: report.title,
    repro_steps: report.repro_steps,
    evidence: report.evidence ?? null,
    status: report.status,
  });
}

/**
 * Gets open bug reports, ordered by most recent first.
 *
 * @param limit - Maximum number of bug reports to return (default: 10)
 * @returns Array of open bug reports
 */
export function getOpenBugReports(limit = 10): BugReport[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM bug_reports
    WHERE status = 'open'
    ORDER BY created_at DESC
    LIMIT :limit
  `);
  return stmt.all({ limit }) as BugReport[];
}

// ============================================================================
// Reflections
// ============================================================================

/**
 * Inserts a new reflection.
 *
 * @param reflection - Reflection object to insert (without id and created_at)
 */
export function insertReflection(
  reflection: Omit<Reflection, "id" | "created_at">
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO reflections (
      id, plan_id, trigger, content
    )
    VALUES (
      :id, :plan_id, :trigger, :content
    )
  `);
  stmt.run({
    id: crypto.randomUUID(),
    plan_id: reflection.plan_id ?? null,
    trigger: reflection.trigger ?? null,
    content: reflection.content,
  });
}
