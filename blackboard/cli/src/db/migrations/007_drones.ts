/**
 * Migration 007: Add drones and drone_sessions tables.
 * Drones are persistent prompt configurations that run autonomously.
 * Each drone session creates a fresh git branch and tracks iterations.
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
 * Run the drones migration.
 * Creates drones and drone_sessions tables for autonomous worker management.
 */
export function migrate(db: Database): void {
  // Create drones table if it doesn't exist
  if (!tableExists(db, "drones")) {
    db.exec(`
      CREATE TABLE drones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        prompt TEXT NOT NULL,
        max_iterations INTEGER DEFAULT 100,
        timeout_minutes INTEGER DEFAULT 60,
        cooldown_seconds INTEGER DEFAULT 60,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'archived')),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_drones_status ON drones(status);
      CREATE INDEX idx_drones_name ON drones(name);
    `);
  }

  // Create drone_sessions table if it doesn't exist
  if (!tableExists(db, "drone_sessions")) {
    db.exec(`
      CREATE TABLE drone_sessions (
        id TEXT PRIMARY KEY,
        drone_id TEXT NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
        worker_id TEXT REFERENCES workers(id),
        git_branch TEXT,
        status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'stopped', 'failed')),
        iteration INTEGER DEFAULT 0,
        started_at TEXT DEFAULT (datetime('now')),
        ended_at TEXT,
        stop_reason TEXT
      );

      CREATE INDEX idx_drone_sessions_drone ON drone_sessions(drone_id, started_at DESC);
      CREATE INDEX idx_drone_sessions_status ON drone_sessions(status);
    `);
  }
}
