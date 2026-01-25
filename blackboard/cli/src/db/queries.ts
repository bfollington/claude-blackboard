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
  Thread,
  PlanStatus,
  StepStatus,
  BugReportStatus,
  ThreadStatus,
} from "../types/schema.ts";

// ============================================================================
// Threads
// ============================================================================

/**
 * Gets the current thread (most recently updated, status = 'active').
 *
 * @returns Current thread or null if none exists
 */
export function getCurrentThread(): Thread | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM current_thread");
  const results = stmt.all() as Thread[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Gets a thread by its name.
 *
 * @param name - Thread name (kebab-case)
 * @returns Thread or null if not found
 */
export function getThreadByName(name: string): Thread | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM threads WHERE name = :name");
  const results = stmt.all({ name }) as Thread[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Gets a thread by its ID.
 *
 * @param id - Thread ID
 * @returns Thread or null if not found
 */
export function getThreadById(id: string): Thread | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM threads WHERE id = :id");
  const results = stmt.all({ id }) as Thread[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Inserts a new thread into the database.
 *
 * @param thread - Thread object to insert (without timestamps)
 */
export function insertThread(
  thread: Omit<Thread, "created_at" | "updated_at">
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO threads (id, name, current_plan_id, git_branches, status)
    VALUES (:id, :name, :current_plan_id, :git_branches, :status)
  `);
  stmt.run({
    id: thread.id,
    name: thread.name,
    current_plan_id: thread.current_plan_id ?? null,
    git_branches: thread.git_branches ?? null,
    status: thread.status,
  });
}

/**
 * Updates a thread's mutable fields.
 *
 * @param id - Thread ID
 * @param updates - Fields to update
 */
export function updateThread(
  id: string,
  updates: Partial<Pick<Thread, "current_plan_id" | "git_branches" | "status">>
): void {
  const db = getDb();
  const setClauses: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, string | null> = { id };

  if (updates.current_plan_id !== undefined) {
    setClauses.push("current_plan_id = :current_plan_id");
    params.current_plan_id = updates.current_plan_id;
  }
  if (updates.git_branches !== undefined) {
    setClauses.push("git_branches = :git_branches");
    params.git_branches = updates.git_branches;
  }
  if (updates.status !== undefined) {
    setClauses.push("status = :status");
    params.status = updates.status;
  }

  const stmt = db.prepare(`
    UPDATE threads
    SET ${setClauses.join(", ")}
    WHERE id = :id
  `);
  stmt.run(params as Record<string, string | null>);
}

/**
 * Touches a thread (updates updated_at to now).
 *
 * @param id - Thread ID
 */
export function touchThread(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE threads
    SET updated_at = datetime('now')
    WHERE id = :id
  `);
  stmt.run({ id });
}

/**
 * Lists threads with optional status filter.
 *
 * @param status - Optional status filter
 * @param limit - Maximum number of threads to return (default: 20)
 * @returns Array of threads ordered by updated_at DESC
 */
export function listThreads(status?: ThreadStatus, limit = 20): Thread[] {
  const db = getDb();
  if (status) {
    const stmt = db.prepare(`
      SELECT * FROM threads
      WHERE status = :status
      ORDER BY updated_at DESC
      LIMIT :limit
    `);
    return stmt.all({ status, limit }) as Thread[];
  } else {
    const stmt = db.prepare(`
      SELECT * FROM threads
      ORDER BY updated_at DESC
      LIMIT :limit
    `);
    return stmt.all({ limit }) as Thread[];
  }
}

/**
 * Gets a thread by name or ID.
 *
 * @param nameOrId - Thread name or ID
 * @returns Thread or null if not found
 */
export function resolveThread(nameOrId: string): Thread | null {
  // Try by name first (more common usage)
  const byName = getThreadByName(nameOrId);
  if (byName) return byName;

  // Fall back to ID
  return getThreadById(nameOrId);
}

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
    INSERT INTO plans (id, status, description, plan_markdown, session_id, thread_id)
    VALUES (:id, :status, :description, :plan_markdown, :session_id, :thread_id)
  `);
  stmt.run({
    id: plan.id,
    status: plan.status,
    description: plan.description ?? null,
    plan_markdown: plan.plan_markdown,
    session_id: plan.session_id ?? null,
    thread_id: plan.thread_id ?? null,
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

/**
 * Lists all bug reports with optional status filter.
 *
 * @param status - Optional status filter
 * @param limit - Maximum number of bug reports to return (default: 20)
 * @returns Array of bug reports ordered by created_at DESC
 */
export function listBugReports(status?: BugReportStatus, limit = 20): BugReport[] {
  const db = getDb();
  if (status) {
    const stmt = db.prepare(`
      SELECT * FROM bug_reports
      WHERE status = :status
      ORDER BY created_at DESC
      LIMIT :limit
    `);
    return stmt.all({ status, limit }) as BugReport[];
  } else {
    const stmt = db.prepare(`
      SELECT * FROM bug_reports
      ORDER BY created_at DESC
      LIMIT :limit
    `);
    return stmt.all({ limit }) as BugReport[];
  }
}

/**
 * Updates a bug report's status.
 *
 * @param id - Bug report ID
 * @param status - New status value
 */
export function updateBugReportStatus(id: string, status: BugReportStatus): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE bug_reports
    SET status = :status
    WHERE id = :id
  `);
  stmt.run({ id, status });
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

// ============================================================================
// TUI-specific queries
// ============================================================================

/**
 * Gets a plan by its ID.
 *
 * @param id - Plan ID
 * @returns Plan or null if not found
 */
export function getPlanById(id: string): Plan | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM plans WHERE id = :id");
  const results = stmt.all({ id }) as Plan[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Updates a plan's markdown content.
 *
 * @param id - Plan ID
 * @param planMarkdown - New markdown content
 */
export function updatePlanMarkdown(id: string, planMarkdown: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE plans
    SET plan_markdown = :planMarkdown
    WHERE id = :id
  `);
  stmt.run({ id, planMarkdown });
}

/**
 * Updates a step's description.
 *
 * @param stepId - Step ID
 * @param description - New description
 */
export function updateStepDescription(stepId: string, description: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE plan_steps
    SET description = :description
    WHERE id = :stepId
  `);
  stmt.run({ stepId, description });
}

/**
 * Updates a breadcrumb's summary.
 *
 * @param crumbId - Breadcrumb ID
 * @param summary - New summary
 */
export function updateBreadcrumbSummary(crumbId: string, summary: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE breadcrumbs
    SET summary = :summary
    WHERE id = :crumbId
  `);
  stmt.run({ crumbId, summary });
}

// ============================================================================
// Session State
// ============================================================================

/**
 * Sets a session state value.
 *
 * @param key - State key
 * @param value - State value
 */
export function setSessionState(key: string, value: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO session_state (key, value, updated_at)
    VALUES (:key, :value, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = :value, updated_at = datetime('now')
  `);
  stmt.run({ key, value });
}

/**
 * Gets a session state value.
 *
 * @param key - State key
 * @returns Value or null if not found
 */
export function getSessionState(key: string): string | null {
  const db = getDb();
  const stmt = db.prepare("SELECT value FROM session_state WHERE key = :key");
  const results = stmt.all({ key }) as { value: string }[];
  return results.length > 0 ? results[0].value : null;
}

/**
 * Clears a session state value.
 *
 * @param key - State key to clear
 */
export function clearSessionState(key: string): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM session_state WHERE key = :key");
  stmt.run({ key });
}
