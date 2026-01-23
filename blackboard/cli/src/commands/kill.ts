/**
 * Kill command - Terminate a running worker container.
 * Accepts either a worker ID or thread name.
 */

import { getActiveWorkers, getWorkersForThread, updateWorkerStatus } from "../db/worker-queries.ts";
import { resolveThread } from "../db/queries.ts";
import { dockerKill } from "../docker/client.ts";

export interface KillOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
}

/**
 * Kill a running worker by worker ID or thread name.
 *
 * Resolution logic:
 * 1. Try to find a running worker with matching ID (supports short-id prefix matching)
 * 2. If not found, try resolveThread() and find running workers for that thread
 * 3. If still no match, error out
 *
 * Once resolved, calls dockerKill() and updates worker status to 'killed'.
 */
export async function killCommand(
  workerIdOrThreadName: string,
  options: KillOptions
): Promise<void> {
  // Step 1: Try to find a running worker by ID
  const activeWorkers = getActiveWorkers();
  let targetWorker = activeWorkers.find(w => w.id === workerIdOrThreadName);

  // If not exact match, try short-id prefix matching
  if (!targetWorker) {
    const matches = activeWorkers.filter(w => w.id.startsWith(workerIdOrThreadName));
    if (matches.length === 1) {
      targetWorker = matches[0];
    } else if (matches.length > 1) {
      if (options.json) {
        console.log(JSON.stringify({
          error: "Ambiguous worker ID",
          matches: matches.map(w => ({ id: w.id, thread: w.thread_name, container_id: w.container_id }))
        }, null, 2));
      } else {
        console.error(`Error: Ambiguous worker ID '${workerIdOrThreadName}'. Matches:`);
        for (const w of matches) {
          console.error(`  - ${w.id} (thread: ${w.thread_name})`);
        }
      }
      Deno.exit(1);
    }
  }

  // Step 2: If still not found, try as thread name
  if (!targetWorker) {
    const thread = resolveThread(workerIdOrThreadName);
    if (thread) {
      const threadWorkers = getWorkersForThread(thread.id);
      const runningWorkers = threadWorkers.filter(w => w.status === 'running');

      if (runningWorkers.length === 1) {
        targetWorker = { ...runningWorkers[0], thread_name: thread.name };
      } else if (runningWorkers.length > 1) {
        if (options.json) {
          console.log(JSON.stringify({
            error: "Multiple workers found for thread",
            thread: thread.name,
            workers: runningWorkers.map(w => ({ id: w.id, container_id: w.container_id }))
          }, null, 2));
        } else {
          console.error(`Error: Multiple workers found for thread '${thread.name}'. Specify worker ID:`);
          for (const w of runningWorkers) {
            console.error(`  - ${w.id}`);
          }
        }
        Deno.exit(1);
      } else if (runningWorkers.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({
            error: "No running workers found for thread",
            thread: thread.name
          }, null, 2));
        } else {
          console.error(`Error: No running workers found for thread '${thread.name}'`);
        }
        Deno.exit(1);
      }
    }
  }

  // Step 3: Error if still not found
  if (!targetWorker) {
    if (options.json) {
      console.log(JSON.stringify({
        error: "Worker or thread not found",
        input: workerIdOrThreadName
      }, null, 2));
    } else {
      console.error(`Error: No running worker or thread found matching '${workerIdOrThreadName}'`);
    }
    Deno.exit(1);
  }

  // Kill the container
  try {
    await dockerKill(targetWorker.container_id);
    if (!options.quiet) {
      if (!options.json) {
        console.log(`Container ${targetWorker.container_id} killed successfully`);
      }
    }
  } catch (error) {
    // If docker kill fails (container already dead), we still update the status
    if (!options.quiet && !options.json) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: Docker kill failed (container may already be dead): ${errorMessage}`);
    }
  }

  // Always update worker status to 'killed'
  updateWorkerStatus(targetWorker.id, 'killed');

  if (options.json) {
    console.log(JSON.stringify({
      success: true,
      worker_id: targetWorker.id,
      container_id: targetWorker.container_id,
      thread_name: targetWorker.thread_name,
      status: 'killed'
    }, null, 2));
  } else if (!options.quiet) {
    console.log(`Worker ${targetWorker.id} (thread: ${targetWorker.thread_name}) marked as killed`);
  }
}
