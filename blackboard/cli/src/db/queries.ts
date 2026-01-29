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
  ThreadSession,
  NextUp,
  PlanStatus,
  StepStatus,
  BugReportStatus,
  ThreadStatus,
  NextUpStatus,
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
// Thread Sessions
// ============================================================================

/**
 * Adds a session to a thread (tracks which sessions have worked on the thread).
 *
 * @param threadId - Thread ID
 * @param sessionId - Session ID
 */
export function addSessionToThread(threadId: string, sessionId: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO thread_sessions (thread_id, session_id)
    VALUES (:threadId, :sessionId)
    ON CONFLICT(thread_id, session_id) DO NOTHING
  `);
  stmt.run({ threadId, sessionId });
}

/**
 * Gets all session IDs that have worked on a thread.
 *
 * @param threadId - Thread ID
 * @returns Array of session IDs ordered by creation time (oldest first)
 */
export function getSessionsForThread(threadId: string): string[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT session_id FROM thread_sessions
    WHERE thread_id = :threadId
    ORDER BY created_at ASC
  `);
  const results = stmt.all({ threadId }) as { session_id: string }[];
  return results.map(row => row.session_id);
}

// ============================================================================
// Plans
// ============================================================================

/**
 * Gets the currently active plan (status = 'accepted' or 'in_progress').
 * Returns the most recently created active plan.
 *
 * @deprecated Use session-scoped plan lookup via getSessionState("selected_thread_id")
 * and getThreadById() instead. This global "active plan" concept is being phased out
 * in favor of thread-scoped plans.
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

/**
 * Gets a single step by its ID.
 *
 * @param stepId - Step ID
 * @returns Step or null if not found
 */
export function getStepById(stepId: string): PlanStep | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM plan_steps WHERE id = :stepId
  `);
  const results = stmt.all({ stepId }) as PlanStep[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Inserts a single step into a plan.
 * If step_order is not provided, appends at the end of the plan.
 *
 * @param planId - Plan ID
 * @param step - Step details (description, optional status and step_order)
 * @returns The ID of the newly created step
 */
export function insertStep(
  planId: string,
  step: { description: string; status?: StepStatus; step_order?: number }
): string {
  const db = getDb();
  const stepId = crypto.randomUUID();

  // If step_order not provided, get max and append at end
  const stepOrder = step.step_order ?? (getMaxStepOrder(planId) + 1);
  const status = step.status ?? 'pending';

  const stmt = db.prepare(`
    INSERT INTO plan_steps (id, plan_id, step_order, description, status)
    VALUES (:id, :planId, :step_order, :description, :status)
  `);

  stmt.run({
    id: stepId,
    planId,
    step_order: stepOrder,
    description: step.description,
    status,
  });

  return stepId;
}

/**
 * Deletes a single step by its ID.
 *
 * @param stepId - Step ID to delete
 */
export function deleteStep(stepId: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM plan_steps WHERE id = :stepId
  `);
  stmt.run({ stepId });
}

/**
 * Gets the highest step_order value for a plan.
 * Returns 0 if the plan has no steps.
 *
 * @param planId - Plan ID
 * @returns Maximum step_order value, or 0 if no steps exist
 */
export function getMaxStepOrder(planId: string): number {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT COALESCE(MAX(step_order), 0) as max_order
    FROM plan_steps
    WHERE plan_id = :planId
  `);
  const result = stmt.all({ planId }) as { max_order: number }[];
  return result[0].max_order;
}

/**
 * Normalizes a step description for matching.
 * Converts to lowercase and normalizes whitespace.
 *
 * @param description - Step description
 * @returns Normalized description
 */
function normalizeDescription(description: string): string {
  return description.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Merges incoming steps with existing steps for a plan.
 * - Matches steps by normalized description (case-insensitive, whitespace-normalized)
 * - Preserves completed/failed/skipped steps (never removes them)
 * - Adds new steps from incoming list
 * - Drops pending steps not in incoming list (Claude removed them intentionally)
 * - Appends orphaned completed steps at end
 * - Uses a transaction for atomicity
 *
 * @param planId - Plan ID
 * @param incomingSteps - Array of incoming steps from TodoWrite
 * @returns Object with counts of added, updated, and preserved steps
 */
export function mergeStepsForPlan(
  planId: string,
  incomingSteps: Array<{ description: string; status: StepStatus }>
): { added: number; updated: number; preserved: number } {
  const db = getDb();

  let added = 0;
  let updated = 0;
  let preserved = 0;

  db.exec("BEGIN TRANSACTION");

  try {
    // Get all existing steps
    const existingSteps = getStepsForPlan(planId);

    // Create a map of normalized descriptions to existing steps
    const existingMap = new Map<string, PlanStep>();
    for (const step of existingSteps) {
      const normalized = normalizeDescription(step.description);
      existingMap.set(normalized, step);
    }

    // Create a map of normalized descriptions from incoming steps
    const incomingMap = new Map<string, { description: string; status: StepStatus }>();
    for (const step of incomingSteps) {
      const normalized = normalizeDescription(step.description);
      incomingMap.set(normalized, step);
    }

    // Track which existing steps are matched
    const matchedStepIds = new Set<string>();

    // Process incoming steps in order
    const insertStmt = db.prepare(`
      INSERT INTO plan_steps (id, plan_id, step_order, description, status)
      VALUES (:id, :planId, :step_order, :description, :status)
    `);

    const updateStmt = db.prepare(`
      UPDATE plan_steps
      SET step_order = :step_order, description = :description, status = :status
      WHERE id = :id
    `);

    let order = 1;
    for (const incomingStep of incomingSteps) {
      const normalized = normalizeDescription(incomingStep.description);
      const existing = existingMap.get(normalized);

      if (existing) {
        // Step exists - update its order and keep its status unless incoming status is different
        matchedStepIds.add(existing.id);

        // Preserve existing status if it's completed/failed/skipped
        const statusToUse = ['completed', 'failed', 'skipped'].includes(existing.status)
          ? existing.status
          : incomingStep.status;

        updateStmt.run({
          id: existing.id,
          step_order: order,
          description: incomingStep.description, // Use incoming description for freshness
          status: statusToUse,
        });

        if (statusToUse === existing.status) {
          preserved++;
        } else {
          updated++;
        }
      } else {
        // New step - insert it
        insertStmt.run({
          id: crypto.randomUUID(),
          planId,
          step_order: order,
          description: incomingStep.description,
          status: incomingStep.status,
        });
        added++;
      }
      order++;
    }

    // Handle unmatched existing steps
    const deleteStmt = db.prepare(`
      DELETE FROM plan_steps WHERE id = :id
    `);

    for (const existing of existingSteps) {
      if (!matchedStepIds.has(existing.id)) {
        // Step was not in incoming list
        if (['completed', 'failed', 'skipped'].includes(existing.status)) {
          // Preserve completed/failed/skipped steps by appending at end
          updateStmt.run({
            id: existing.id,
            step_order: order,
            description: existing.description,
            status: existing.status,
          });
          order++;
          preserved++;
        } else {
          // Remove pending/in_progress steps not in incoming list
          deleteStmt.run({ id: existing.id });
        }
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { added, updated, preserved };
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
// Next-Ups
// ============================================================================

/**
 * Lists active next-ups, ordered by most recently updated.
 *
 * @param includeArchived - Whether to include archived/launched next-ups (default: false)
 * @returns Array of next-ups
 */
export function listNextUps(includeArchived = false): NextUp[] {
  const db = getDb();
  if (includeArchived) {
    const stmt = db.prepare(`
      SELECT * FROM next_ups
      ORDER BY updated_at DESC
    `);
    return stmt.all() as NextUp[];
  } else {
    const stmt = db.prepare(`
      SELECT * FROM next_ups
      WHERE status = 'active'
      ORDER BY updated_at DESC
    `);
    return stmt.all() as NextUp[];
  }
}

/**
 * Inserts a new next-up.
 *
 * @param nextUp - Next-up object to insert (without id, created_at, updated_at, last_launched_at, launch_count)
 * @returns The ID of the newly created next-up
 */
export function insertNextUp(
  nextUp: Omit<NextUp, 'id' | 'created_at' | 'updated_at' | 'last_launched_at' | 'launch_count'>
): string {
  const db = getDb();
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO next_ups (id, title, content, is_template, status)
    VALUES (:id, :title, :content, :is_template, :status)
  `);
  stmt.run({
    id,
    title: nextUp.title,
    content: nextUp.content,
    is_template: nextUp.is_template,
    status: nextUp.status,
  });
  return id;
}

/**
 * Updates a next-up's title, content, and/or template status.
 *
 * @param id - Next-up ID
 * @param updates - Fields to update
 */
export function updateNextUp(
  id: string,
  updates: { title?: string; content?: string; is_template?: number }
): void {
  const db = getDb();
  const setClauses: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, string | number> = { id };

  if (updates.title !== undefined) {
    setClauses.push("title = :title");
    params.title = updates.title;
  }
  if (updates.content !== undefined) {
    setClauses.push("content = :content");
    params.content = updates.content;
  }
  if (updates.is_template !== undefined) {
    setClauses.push("is_template = :is_template");
    params.is_template = updates.is_template;
  }

  const stmt = db.prepare(`
    UPDATE next_ups
    SET ${setClauses.join(", ")}
    WHERE id = :id
  `);
  stmt.run(params);
}

/**
 * Archives a next-up (sets status to 'archived').
 *
 * @param id - Next-up ID
 */
export function archiveNextUp(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE next_ups
    SET status = 'archived', updated_at = datetime('now')
    WHERE id = :id
  `);
  stmt.run({ id });
}

/**
 * Marks a next-up as launched and updates launch metrics.
 * For templates: increments launch_count and updates last_launched_at.
 * For non-templates: sets status to 'launched'.
 *
 * @param id - Next-up ID
 */
export function launchNextUp(id: string): void {
  const db = getDb();

  // Get the next-up to check if it's a template
  const nextUp = getNextUpById(id);
  if (!nextUp) return;

  if (nextUp.is_template) {
    // Template: increment launch_count and update last_launched_at
    const stmt = db.prepare(`
      UPDATE next_ups
      SET launch_count = launch_count + 1,
          last_launched_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = :id
    `);
    stmt.run({ id });
  } else {
    // Non-template: mark as launched
    const stmt = db.prepare(`
      UPDATE next_ups
      SET status = 'launched', updated_at = datetime('now')
      WHERE id = :id
    `);
    stmt.run({ id });
  }
}

/**
 * Deletes a next-up permanently.
 *
 * @param id - Next-up ID
 */
export function deleteNextUp(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM next_ups WHERE id = :id
  `);
  stmt.run({ id });
}

/**
 * Gets a next-up by ID.
 *
 * @param id - Next-up ID
 * @returns Next-up or null if not found
 */
export function getNextUpById(id: string): NextUp | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM next_ups WHERE id = :id");
  const results = stmt.all({ id }) as NextUp[];
  return results.length > 0 ? results[0] : null;
}

/**
 * Touches a next-up (updates updated_at).
 *
 * @param id - Next-up ID
 */
export function touchNextUp(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE next_ups
    SET updated_at = datetime('now')
    WHERE id = :id
  `);
  stmt.run({ id });
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
// Tasks
// ============================================================================

/**
 * Upserts a task to the database for persistence.
 * If the task already exists (by session_id + id), it will be updated.
 *
 * @param sessionId - Session ID that owns the task
 * @param threadId - Thread ID (can be null if task is not associated with a thread)
 * @param task - Task data to persist
 */
export function upsertTask(
  sessionId: string,
  threadId: string | null,
  task: {
    id: string;
    subject: string;
    description?: string;
    activeForm?: string;
    status: string;
    blocks?: string[];
    blockedBy?: string[];
  }
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, session_id, thread_id, subject, description, active_form,
      status, blocks, blocked_by, updated_at
    )
    VALUES (
      :id, :sessionId, :threadId, :subject, :description, :activeForm,
      :status, :blocks, :blockedBy, datetime('now')
    )
    ON CONFLICT(session_id, id) DO UPDATE SET
      thread_id = :threadId,
      subject = :subject,
      description = :description,
      active_form = :activeForm,
      status = :status,
      blocks = :blocks,
      blocked_by = :blockedBy,
      updated_at = datetime('now')
  `);

  stmt.run({
    id: task.id,
    sessionId,
    threadId,
    subject: task.subject,
    description: task.description ?? null,
    activeForm: task.activeForm ?? null,
    status: task.status,
    blocks: task.blocks ? JSON.stringify(task.blocks) : null,
    blockedBy: task.blockedBy ? JSON.stringify(task.blockedBy) : null,
  });
}

/**
 * Gets persisted tasks for a thread from the database.
 * Returns tasks from all sessions that worked on this thread.
 *
 * @param threadId - Thread ID
 * @returns Array of persisted tasks
 */
export function getPersistedTasksForThread(threadId: string): Array<{
  id: string;
  session_id: string;
  subject: string;
  description: string | null;
  activeForm: string | null;
  status: string;
  blocks: string[];
  blockedBy: string[];
  created_at: string;
  updated_at: string;
}> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM tasks
    WHERE thread_id = :threadId
    ORDER BY created_at ASC
  `);

  const results = stmt.all({ threadId }) as Array<{
    id: string;
    session_id: string;
    subject: string;
    description: string | null;
    active_form: string | null;
    status: string;
    blocks: string | null;
    blocked_by: string | null;
    created_at: string;
    updated_at: string;
  }>;

  // Parse JSON fields
  return results.map(task => ({
    id: task.id,
    session_id: task.session_id,
    subject: task.subject,
    description: task.description,
    activeForm: task.active_form,
    status: task.status,
    blocks: task.blocks ? JSON.parse(task.blocks) : [],
    blockedBy: task.blocked_by ? JSON.parse(task.blocked_by) : [],
    created_at: task.created_at,
    updated_at: task.updated_at,
  }));
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
