/**
 * Migration 008: Make workers.thread_id nullable.
 * Drones use workers but don't belong to threads, so thread_id must be optional.
 * SQLite doesn't support ALTER COLUMN, so we recreate the table.
 */

import { Database } from "@db/sqlite";

/**
 * Check if a table exists.
 */
function tableExists(db: Database, table: string): boolean {
  const stmt = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=:table
  `);
  const result = stmt.all({ table });
  return result.length > 0;
}

/**
 * Check if workers.thread_id is already nullable.
 */
function isThreadIdNullable(db: Database): boolean {
  const stmt = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type='table' AND name='workers'
  `);
  const result = stmt.all() as Array<{ sql: string }>;
  if (result.length === 0) return false;

  const createSql = result[0].sql;
  // If it says "thread_id TEXT NOT NULL" it's not nullable
  // If it says "thread_id TEXT REFERENCES" (without NOT NULL) it is nullable
  return !createSql.includes("thread_id TEXT NOT NULL");
}

/**
 * Run the nullable thread_id migration.
 * Recreates workers table with thread_id as nullable.
 */
export function migrate(db: Database): void {
  // Skip if workers table doesn't exist
  if (!tableExists(db, "workers")) {
    return;
  }

  // Skip if already migrated
  if (isThreadIdNullable(db)) {
    return;
  }

  // Recreate table with nullable thread_id
  db.exec(`
    -- Create new table with nullable thread_id
    CREATE TABLE workers_new (
      id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL,
      thread_id TEXT REFERENCES threads(id),
      status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'killed')),
      last_heartbeat TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      auth_mode TEXT CHECK(auth_mode IN ('env', 'config', 'oauth')),
      iteration INTEGER DEFAULT 0,
      max_iterations INTEGER DEFAULT 50
    );

    -- Copy existing data
    INSERT INTO workers_new SELECT * FROM workers;

    -- Drop old table
    DROP TABLE workers;

    -- Rename new table
    ALTER TABLE workers_new RENAME TO workers;

    -- Recreate indexes
    CREATE INDEX idx_workers_status ON workers(status);
    CREATE INDEX idx_workers_thread ON workers(thread_id);
  `);
}
