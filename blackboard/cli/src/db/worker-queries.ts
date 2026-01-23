/**
 * Typed query functions for worker table operations.
 * Uses prepared statements with named parameters for safety.
 * Write transactions use BEGIN IMMEDIATE since multiple containers write concurrently.
 */

import { getDb } from "./connection.ts";
import type { Worker, WorkerStatus } from "../types/schema.ts";

// ============================================================================
// Workers
// ============================================================================

/**
 * Inserts a new worker record.
 *
 * @param worker - Worker object to insert (without last_heartbeat and created_at)
 */
export function insertWorker(
  worker: Omit<Worker, "last_heartbeat" | "created_at">
): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      INSERT INTO workers (
        id, container_id, thread_id, status, auth_mode, iteration, max_iterations
      )
      VALUES (
        :id, :container_id, :thread_id, :status, :auth_mode, :iteration, :max_iterations
      )
    `);
    stmt.run({
      id: worker.id,
      container_id: worker.container_id,
      thread_id: worker.thread_id,
      status: worker.status,
      auth_mode: worker.auth_mode ?? null,
      iteration: worker.iteration,
      max_iterations: worker.max_iterations,
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Updates the heartbeat timestamp for a worker.
 * Uses BEGIN IMMEDIATE since containers call this concurrently.
 *
 * @param workerId - Worker ID
 */
export function updateHeartbeat(workerId: string): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      UPDATE workers
      SET last_heartbeat = datetime('now')
      WHERE id = :workerId
    `);
    stmt.run({ workerId });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Updates the status of a worker.
 *
 * @param id - Worker ID
 * @param status - New status value
 */
export function updateWorkerStatus(id: string, status: WorkerStatus): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      UPDATE workers
      SET status = :status
      WHERE id = :id
    `);
    stmt.run({ id, status });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Updates the iteration count for a worker.
 *
 * @param id - Worker ID
 * @param iteration - New iteration value
 */
export function updateWorkerIteration(id: string, iteration: number): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      UPDATE workers
      SET iteration = :iteration
      WHERE id = :id
    `);
    stmt.run({ id, iteration });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Gets all active workers with their thread names.
 *
 * @returns Array of workers with thread_name field
 */
export function getActiveWorkers(): Array<Worker & { thread_name: string }> {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT w.*, t.name as thread_name
    FROM workers w
    JOIN threads t ON w.thread_id = t.id
    WHERE w.status = 'running'
  `);
  return stmt.all() as Array<Worker & { thread_name: string }>;
}

/**
 * Gets all workers for a specific thread, ordered by creation time.
 *
 * @param threadId - Thread ID
 * @returns Array of workers ordered by created_at DESC
 */
export function getWorkersForThread(threadId: string): Worker[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM workers
    WHERE thread_id = :threadId
    ORDER BY created_at DESC
  `);
  return stmt.all({ threadId }) as Worker[];
}

/**
 * Gets workers that haven't sent a heartbeat within the timeout period.
 *
 * @param timeoutSeconds - Timeout threshold in seconds
 * @returns Array of stale workers
 */
export function getStaleWorkers(timeoutSeconds: number): Worker[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM workers
    WHERE status = 'running'
      AND (julianday('now') - julianday(last_heartbeat)) * 86400 > :timeoutSeconds
  `);
  return stmt.all({ timeoutSeconds }) as Worker[];
}

/**
 * Cleans up worker records older than 24 hours with terminal status.
 *
 * @returns Number of rows deleted
 */
export function cleanupWorkerRecords(): number {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      DELETE FROM workers
      WHERE status IN ('completed', 'failed', 'killed')
        AND (julianday('now') - julianday(created_at)) * 86400 > 86400
    `);
    const result = stmt.run();

    db.exec("COMMIT");

    // Return number of changes
    return db.changes;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
