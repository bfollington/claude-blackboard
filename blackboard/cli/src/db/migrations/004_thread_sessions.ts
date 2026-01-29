/**
 * Migration 004: Add thread_sessions table.
 * Tracks all session_ids that have worked on a thread for task lookup.
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
 * Run the thread_sessions migration.
 * Creates thread_sessions table to track sessions working on threads.
 */
export function migrate(db: Database): void {
  // Create thread_sessions table if it doesn't exist
  if (!tableExists(db, "thread_sessions")) {
    db.exec(`
      CREATE TABLE thread_sessions (
        thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (thread_id, session_id)
      );

      CREATE INDEX idx_thread_sessions_session ON thread_sessions(session_id);
    `);
  }
}
