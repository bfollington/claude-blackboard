/**
 * Typed query functions for drone and drone_session table operations.
 * Uses prepared statements with named parameters for safety.
 * Write transactions use BEGIN IMMEDIATE for consistency.
 */

import { getDb } from "./connection.ts";
import type { Drone, DroneStatus, DroneSession, DroneSessionStatus } from "../types/schema.ts";
import { generateId } from "../utils/id.ts";

// ============================================================================
// Drones
// ============================================================================

export interface CreateDroneOptions {
  maxIterations?: number;
  timeoutMinutes?: number;
  cooldownSeconds?: number;
}

/**
 * Creates a new drone with the given configuration.
 *
 * @param name - Kebab-case drone name (e.g., "fix-typos", "update-deps")
 * @param prompt - The core prompt template for the drone
 * @param options - Optional configuration overrides
 * @returns The created drone's ID
 */
export function createDrone(
  name: string,
  prompt: string,
  options?: CreateDroneOptions
): string {
  const db = getDb();
  const droneId = generateId();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      INSERT INTO drones (
        id, name, prompt, max_iterations, timeout_minutes, cooldown_seconds
      )
      VALUES (
        :id, :name, :prompt, :max_iterations, :timeout_minutes, :cooldown_seconds
      )
    `);
    stmt.run({
      id: droneId,
      name,
      prompt,
      max_iterations: options?.maxIterations ?? 100,
      timeout_minutes: options?.timeoutMinutes ?? 60,
      cooldown_seconds: options?.cooldownSeconds ?? 60,
    });

    db.exec("COMMIT");
    return droneId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Gets a drone by name or ID.
 *
 * @param nameOrId - Drone name (kebab-case) or ID
 * @returns Drone object or null if not found
 */
export function getDrone(nameOrId: string): Drone | null {
  const db = getDb();

  // Try by ID first
  let stmt = db.prepare("SELECT * FROM drones WHERE id = :nameOrId");
  let result = stmt.get({ nameOrId }) as Drone | undefined;

  if (result) {
    return result;
  }

  // Try by name
  stmt = db.prepare("SELECT * FROM drones WHERE name = :nameOrId");
  result = stmt.get({ nameOrId }) as Drone | undefined;

  return result ?? null;
}

export interface ListDronesOptions {
  status?: DroneStatus;
}

/**
 * Lists drones with optional filtering by status.
 *
 * @param options - Optional filters
 * @returns Array of drones ordered by updated_at DESC
 */
export function listDrones(options?: ListDronesOptions): Drone[] {
  const db = getDb();

  let query = "SELECT * FROM drones";
  const params: Record<string, any> = {};

  if (options?.status) {
    query += " WHERE status = :status";
    params.status = options.status;
  }

  query += " ORDER BY updated_at DESC";

  const stmt = db.prepare(query);
  return stmt.all(params) as Drone[];
}

export interface UpdateDroneData {
  prompt?: string;
  max_iterations?: number;
  timeout_minutes?: number;
  cooldown_seconds?: number;
  status?: DroneStatus;
}

/**
 * Updates a drone's configuration.
 *
 * @param nameOrId - Drone name or ID
 * @param updates - Fields to update
 */
export function updateDrone(nameOrId: string, updates: UpdateDroneData): void {
  const db = getDb();

  // Resolve drone ID
  const drone = getDrone(nameOrId);
  if (!drone) {
    throw new Error(`Drone not found: ${nameOrId}`);
  }

  const fields: string[] = [];
  const params: Record<string, any> = { id: drone.id };

  if (updates.prompt !== undefined) {
    fields.push("prompt = :prompt");
    params.prompt = updates.prompt;
  }
  if (updates.max_iterations !== undefined) {
    fields.push("max_iterations = :max_iterations");
    params.max_iterations = updates.max_iterations;
  }
  if (updates.timeout_minutes !== undefined) {
    fields.push("timeout_minutes = :timeout_minutes");
    params.timeout_minutes = updates.timeout_minutes;
  }
  if (updates.cooldown_seconds !== undefined) {
    fields.push("cooldown_seconds = :cooldown_seconds");
    params.cooldown_seconds = updates.cooldown_seconds;
  }
  if (updates.status !== undefined) {
    fields.push("status = :status");
    params.status = updates.status;
  }

  if (fields.length === 0) {
    return; // Nothing to update
  }

  fields.push("updated_at = datetime('now')");

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      UPDATE drones
      SET ${fields.join(", ")}
      WHERE id = :id
    `);
    stmt.run(params);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Archives a drone (soft delete - sets status to 'archived').
 *
 * @param nameOrId - Drone name or ID
 */
export function archiveDrone(nameOrId: string): void {
  updateDrone(nameOrId, { status: "archived" });
}

/**
 * Deletes a drone permanently (hard delete).
 * Cascades to drone_sessions due to foreign key constraint.
 *
 * @param nameOrId - Drone name or ID
 */
export function deleteDrone(nameOrId: string): void {
  const db = getDb();

  // Resolve drone ID
  const drone = getDrone(nameOrId);
  if (!drone) {
    throw new Error(`Drone not found: ${nameOrId}`);
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare("DELETE FROM drones WHERE id = :id");
    stmt.run({ id: drone.id });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// ============================================================================
// Drone Sessions
// ============================================================================

/**
 * Creates a new drone session.
 *
 * @param droneId - Drone ID
 * @param workerId - Worker ID (optional, can be set later)
 * @param gitBranch - Git branch for this session
 * @param sessionId - Optional pre-generated session ID (generates one if not provided)
 * @returns The created session's ID
 */
export function createDroneSession(
  droneId: string,
  workerId: string | null,
  gitBranch: string | null,
  sessionId?: string
): string {
  const db = getDb();
  const finalSessionId = sessionId ?? generateId();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      INSERT INTO drone_sessions (
        id, drone_id, worker_id, git_branch
      )
      VALUES (
        :id, :drone_id, :worker_id, :git_branch
      )
    `);
    stmt.run({
      id: finalSessionId,
      drone_id: droneId,
      worker_id: workerId,
      git_branch: gitBranch,
    });

    db.exec("COMMIT");
    return finalSessionId;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Gets a drone session by ID.
 *
 * @param sessionId - Session ID
 * @returns DroneSession object or null if not found
 */
export function getDroneSession(sessionId: string): DroneSession | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM drone_sessions WHERE id = :sessionId");
  const result = stmt.get({ sessionId }) as DroneSession | undefined;
  return result ?? null;
}

/**
 * Gets the currently running session for a drone, if any.
 *
 * @param droneNameOrId - Drone name or ID
 * @returns Running DroneSession or null if none found
 */
export function getCurrentSession(droneNameOrId: string): DroneSession | null {
  const db = getDb();

  // Resolve drone ID
  const drone = getDrone(droneNameOrId);
  if (!drone) {
    return null;
  }

  const stmt = db.prepare(`
    SELECT * FROM drone_sessions
    WHERE drone_id = :droneId AND status = 'running'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  const result = stmt.get({ droneId: drone.id }) as DroneSession | undefined;
  return result ?? null;
}

/**
 * Lists recent sessions for a drone.
 *
 * @param droneNameOrId - Drone name or ID
 * @param limit - Maximum number of sessions to return (default: 10)
 * @returns Array of drone sessions ordered by started_at DESC
 */
export function listDroneSessions(
  droneNameOrId: string,
  limit: number = 10
): DroneSession[] {
  const db = getDb();

  // Resolve drone ID
  const drone = getDrone(droneNameOrId);
  if (!drone) {
    return [];
  }

  const stmt = db.prepare(`
    SELECT * FROM drone_sessions
    WHERE drone_id = :droneId
    ORDER BY started_at DESC
    LIMIT :limit
  `);
  return stmt.all({ droneId: drone.id, limit }) as DroneSession[];
}

/**
 * Updates a drone session's status and optionally sets stop reason and end time.
 *
 * @param sessionId - Session ID
 * @param status - New status
 * @param stopReason - Optional stop reason (e.g., 'manual', 'max_iterations', 'timeout', 'error')
 */
export function updateSessionStatus(
  sessionId: string,
  status: DroneSessionStatus,
  stopReason?: string
): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    let query = `
      UPDATE drone_sessions
      SET status = :status
    `;
    const params: Record<string, any> = { sessionId, status };

    if (stopReason !== undefined) {
      query += ", stop_reason = :stopReason";
      params.stopReason = stopReason;
    }

    // Set ended_at if status is terminal
    if (status === 'completed' || status === 'stopped' || status === 'failed') {
      query += ", ended_at = datetime('now')";
    }

    query += " WHERE id = :sessionId";

    const stmt = db.prepare(query);
    stmt.run(params);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Increments the iteration count for a drone session.
 *
 * @param sessionId - Session ID
 */
export function incrementSessionIteration(sessionId: string): void {
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");

  try {
    const stmt = db.prepare(`
      UPDATE drone_sessions
      SET iteration = iteration + 1
      WHERE id = :sessionId
    `);
    stmt.run({ sessionId });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
