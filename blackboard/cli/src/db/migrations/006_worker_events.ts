/**
 * Migration 006: Add worker_events table for structured event logging.
 * Parses tool calls, results, and file interactions from Claude stream-json output.
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
 * Run the worker_events migration.
 * Creates worker_events table for tracking structured tool usage and file interactions.
 */
export function migrate(db: Database): void {
  // Create worker_events table if it doesn't exist
  if (!tableExists(db, "worker_events")) {
    db.exec(`
      CREATE TABLE worker_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        event_type TEXT NOT NULL CHECK(event_type IN ('tool_call', 'tool_result', 'text', 'error', 'system')),
        tool_name TEXT,
        tool_input TEXT,
        tool_output_preview TEXT,
        file_path TEXT,
        duration_ms INTEGER
      );

      CREATE INDEX idx_worker_events_worker ON worker_events(worker_id, iteration);
      CREATE INDEX idx_worker_events_file ON worker_events(file_path) WHERE file_path IS NOT NULL;
      CREATE INDEX idx_worker_events_tool ON worker_events(tool_name) WHERE tool_name IS NOT NULL;
    `);
  }
}
