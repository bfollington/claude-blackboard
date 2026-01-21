/**
 * Migration 001: Add threads table and thread_id to plans.
 * Threads are the top-level organizing concept for work units.
 */

import { Database } from "@db/sqlite";

/**
 * Check if a column exists in a table.
 */
function columnExists(db: Database, table: string, column: string): boolean {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const columns = stmt.all() as Array<{ name: string }>;
  return columns.some((c) => c.name === column);
}

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
 * Run the threads migration.
 * Creates threads table and adds thread_id column to plans.
 */
export function migrate(db: Database): void {
  // Create threads table if it doesn't exist
  if (!tableExists(db, "threads")) {
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        current_plan_id TEXT REFERENCES plans(id),
        git_branches TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'archived'))
      );

      CREATE INDEX idx_threads_updated ON threads(updated_at DESC);
      CREATE INDEX idx_threads_status ON threads(status);
      CREATE INDEX idx_threads_name ON threads(name);
    `);
  }

  // Add thread_id column to plans if it doesn't exist
  if (!columnExists(db, "plans", "thread_id")) {
    db.exec(`
      ALTER TABLE plans ADD COLUMN thread_id TEXT REFERENCES threads(id);
    `);

    // Create index for thread_id
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_plans_thread ON plans(thread_id, created_at DESC);
    `);
  }
}
