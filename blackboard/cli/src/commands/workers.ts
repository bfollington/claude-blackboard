/**
 * Workers command - List and monitor container workers.
 */

import { getDb } from "../db/connection.ts";
import { getActiveWorkers } from "../db/worker-queries.ts";
import type { Worker } from "../types/schema.ts";

interface WorkersOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  all?: boolean;
}

/**
 * Formats a relative time string from ISO datetime.
 */
function relativeTime(isoDate: string): string {
  const date = new Date(isoDate + "Z"); // Assume UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return isoDate.split("T")[0];
}

/**
 * List workers.
 */
export async function workersCommand(
  options: WorkersOptions
): Promise<void> {
  const db = getDb(options.db);

  let workers: Array<Worker & { thread_name: string }>;

  if (options.all) {
    // Get all workers ordered by created_at DESC
    const stmt = db.prepare(`
      SELECT w.*, t.name as thread_name
      FROM workers w
      JOIN threads t ON w.thread_id = t.id
      ORDER BY w.created_at DESC
    `);
    workers = stmt.all() as Array<Worker & { thread_name: string }>;
  } else {
    // Get only active workers
    workers = getActiveWorkers();
  }

  if (workers.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([]));
    } else if (!options.quiet) {
      console.log("No workers found");
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(workers, null, 2));
    return;
  }

  // Table output
  console.log("Workers:\n");
  for (const w of workers) {
    const id = w.id.substring(0, 8);
    const iteration = `${w.iteration}/${w.max_iterations}`;
    const heartbeat = relativeTime(w.last_heartbeat);
    const statusIcon =
      w.status === "running"
        ? ">"
        : w.status === "completed"
        ? "✓"
        : w.status === "failed"
        ? "✗"
        : "•";

    console.log(
      `  ${statusIcon} ${id} | ${w.thread_name} | ${w.status} | ${iteration} | heartbeat: ${heartbeat}`
    );
  }
}
