/**
 * Migration 002: Add workers table for container orchestration.
 * Workers track Docker containers executing thread work units.
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
 * Run the workers migration.
 * Creates workers table for tracking container ↔ thread mappings.
 */
export function migrate(db: Database): void {
  // Create workers table if it doesn't exist
  if (!tableExists(db, "workers")) {
    db.exec(`
      CREATE TABLE workers (
        id TEXT PRIMARY KEY,
        container_id TEXT NOT NULL,
        thread_id TEXT NOT NULL REFERENCES threads(id),
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'killed')),
        last_heartbeat TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now')),
        auth_mode TEXT CHECK(auth_mode IN ('env', 'config')),
        iteration INTEGER DEFAULT 0,
        max_iterations INTEGER DEFAULT 50
      );

      CREATE INDEX idx_workers_status ON workers(status);
      CREATE INDEX idx_workers_thread ON workers(thread_id);
    `);
  }
}
