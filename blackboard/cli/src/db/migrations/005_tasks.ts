/**
 * Migration 005: Add tasks table.
 * Persists Claude Code tasks from filesystem to database for historical preservation.
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
 * Run the tasks migration.
 * Creates tasks table to persist task data from filesystem.
 */
export function migrate(db: Database): void {
  // Create tasks table if it doesn't exist
  if (!tableExists(db, "tasks")) {
    db.exec(`
      CREATE TABLE tasks (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        thread_id TEXT REFERENCES threads(id) ON DELETE SET NULL,
        subject TEXT NOT NULL,
        description TEXT,
        active_form TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        blocks TEXT,
        blocked_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, id)
      );

      CREATE INDEX idx_tasks_thread ON tasks(thread_id);
      CREATE INDEX idx_tasks_session ON tasks(session_id);
    `);
  }
}
