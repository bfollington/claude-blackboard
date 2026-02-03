/**
 * Workers command - List and monitor container workers.
 */

import { getDb } from "../db/connection.ts";
import { getActiveWorkers, updateWorkerStatus } from "../db/worker-queries.ts";
import { reconcileWorkers, isDockerAvailable } from "../docker/client.ts";
import { relativeTime } from "../utils/time.ts";
import type { Worker } from "../types/schema.ts";
import { outputJson } from "../utils/command.ts";

interface WorkersOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  all?: boolean;
}

/**
 * List workers.
 */
export async function workersCommand(
  options: WorkersOptions
): Promise<void> {
  const db = getDb(options.db);

  // Reconcile running workers with actual container state before listing
  const dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    const runningWorkers = getActiveWorkers();
    if (runningWorkers.length > 0) {
      const result = await reconcileWorkers(runningWorkers, updateWorkerStatus);
      if (result.updated > 0 && !options.quiet && !options.json) {
        console.log(`Reconciled ${result.updated} dead worker(s)\n`);
      }
    }
  }

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
    // Get only active workers (re-query after reconciliation)
    workers = getActiveWorkers();
  }

  if (workers.length === 0) {
    if (options.json) {
      outputJson([]));
    } else if (!options.quiet) {
      console.log("No workers found");
    }
    return;
  }

  if (options.json) {
    outputJson(workers);
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
