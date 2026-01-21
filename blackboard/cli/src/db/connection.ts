/**
 * Database connection management for blackboard CLI.
 * Provides lazy singleton connection with proper cleanup.
 * Auto-initializes schema on first connection.
 */

import { Database } from "@db/sqlite";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

let dbInstance: Database | null = null;

/**
 * Resolves the path to schema.sql using CLAUDE_PLUGIN_ROOT or module location.
 */
function resolveSchemaPath(): string {
  const pluginRoot = Deno.env.get("CLAUDE_PLUGIN_ROOT");
  if (pluginRoot) {
    return `${pluginRoot}/schema.sql`;
  }
  // Fallback: resolve relative to this module (cli/src/db/connection.ts -> blackboard/schema.sql)
  const moduleDir = dirname(fromFileUrl(import.meta.url));
  return join(moduleDir, "..", "..", "..", "schema.sql");
}

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
 * Automatically initializes schema on first connection.
 *
 * @param path - Optional database path override (defaults to resolveDbPath())
 * @returns Database instance with foreign keys enabled and schema initialized
 */
export function getDb(path?: string): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path ?? resolveDbPath();
  dbInstance = new Database(dbPath);

  // Enable foreign key constraints (critical for referential integrity)
  dbInstance.exec("PRAGMA foreign_keys = ON");

  // Auto-initialize schema (idempotent - uses CREATE IF NOT EXISTS)
  const schema = Deno.readTextFileSync(resolveSchemaPath());
  dbInstance.exec(schema);

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
