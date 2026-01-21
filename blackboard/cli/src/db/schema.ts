/**
 * Database schema utilities.
 * Schema is now loaded from blackboard/schema.sql by connection.ts.
 */

import { getDb, resolveDbPath } from "./connection.ts";

/**
 * Checks if the database file exists on disk.
 * Useful for determining if this is first-time initialization.
 *
 * @returns true if database file exists, false otherwise
 */
export function dbExists(): boolean {
  try {
    const dbPath = resolveDbPath();
    const stat = Deno.statSync(dbPath);
    return stat.isFile;
  } catch {
    return false;
  }
}

/**
 * Initializes the database schema if tables don't exist.
 * Idempotent - safe to call multiple times.
 *
 * Note: getDb() now auto-initializes the schema, so this is just
 * a convenience wrapper for backwards compatibility.
 */
export function initializeSchema(): void {
  // getDb() auto-initializes schema on first connection
  getDb();
}
