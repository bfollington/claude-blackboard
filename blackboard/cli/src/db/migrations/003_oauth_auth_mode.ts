/**
 * Migration 003: Add 'oauth' to workers.auth_mode CHECK constraint.
 * SQLite doesn't support ALTER CONSTRAINT, so we recreate the table.
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
 * Check if the workers table already has oauth in its CHECK constraint.
 */
function hasOAuthConstraint(db: Database): boolean {
  const stmt = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type='table' AND name='workers'
  `);
  const result = stmt.all() as Array<{ sql: string }>;
  if (result.length === 0) return false;

  const createSql = result[0].sql;
  return createSql.includes("'oauth'");
}

/**
 * Run the oauth auth_mode migration.
 * Recreates workers table with updated CHECK constraint.
 */
export function migrate(db: Database): void {
  // Skip if workers table doesn't exist (will be created fresh by 002)
  if (!tableExists(db, "workers")) {
    return;
  }

  // Skip if already migrated
  if (hasOAuthConstraint(db)) {
    return;
  }

  // Recreate table with new constraint
  db.exec(`
    -- Create new table with updated constraint
    CREATE TABLE workers_new (
      id TEXT PRIMARY KEY,
      container_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES threads(id),
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
