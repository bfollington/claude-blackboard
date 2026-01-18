/**
 * Database connection management for blackboard CLI.
 * Provides lazy singleton connection with proper cleanup.
 */

import { Database } from "@db/sqlite";

let dbInstance: Database | null = null;

/**
 * Resolves the database path based on CLAUDE_PROJECT_DIR or current working directory.
 * @returns Absolute path to the blackboard database
 */
export function resolveDbPath(): string {
  const projectDir = Deno.env.get("CLAUDE_PROJECT_DIR") ?? Deno.cwd();
  return `${projectDir}/.claude/blackboard.db`;
}

/**
 * Gets or creates a database connection with proper configuration.
 * Uses lazy singleton pattern - only one connection per process.
 *
 * @param path - Optional database path override (defaults to resolveDbPath())
 * @returns Database instance with foreign keys enabled
 */
export function getDb(path?: string): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path ?? resolveDbPath();
  dbInstance = new Database(dbPath);

  // Enable foreign key constraints (critical for referential integrity)
  dbInstance.exec("PRAGMA foreign_keys = ON");

  return dbInstance;
}

/**
 * Closes the database connection and releases resources.
 * Should be called on process exit for clean shutdown.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
