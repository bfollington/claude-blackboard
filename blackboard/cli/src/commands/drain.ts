/**
 * Drain command - Stop all active worker containers gracefully or forcefully.
 * Updates worker status to 'killed' in the database.
 */

import { getActiveWorkers, updateWorkerStatus } from "../db/worker-queries.ts";
import { dockerKill, dockerStop } from "../docker/client.ts";

export interface DrainOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  force?: boolean;
  timeout?: number;
}

/**
 * Drain all active workers by stopping their containers.
 *
 * @param options - Drain command options
 */
export async function drainCommand(options: DrainOptions): Promise<void> {
  // Get all active workers
  const workers = getActiveWorkers();

  if (workers.length === 0) {
    if (!options.quiet && !options.json) {
      console.log("No active workers to drain");
    }
    if (options.json) {
      console.log(JSON.stringify({ drained: 0, failed: 0, workers: [] }));
    }
    return;
  }

  const timeout = options.timeout ?? 30;
  const results: Array<{ id: string; thread: string; success: boolean; error?: string }> = [];

  // Print starting message
  if (!options.quiet && !options.json) {
    console.log(`Draining ${workers.length} active worker(s)...`);
    if (options.force) {
      console.log("Using force kill (no grace period)");
    } else {
      console.log(`Grace period: ${timeout} seconds`);
    }
    console.log();
  }

  // Process each worker
  for (const worker of workers) {
    const result = {
      id: worker.id,
      thread: worker.thread_name,
      success: false,
      error: undefined as string | undefined,
    };

    try {
      // Stop or kill the container
      if (options.force) {
        await dockerKill(worker.container_id);
      } else {
        await dockerStop(worker.container_id, timeout);
      }

      // Update worker status in database
      updateWorkerStatus(worker.id, "killed");
      result.success = true;

      if (!options.quiet && !options.json) {
        console.log(`✓ Stopped worker ${worker.id} (thread: ${worker.thread_name})`);
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);

      if (!options.quiet && !options.json) {
        console.error(`✗ Failed to stop worker ${worker.id}: ${result.error}`);
      }

      // Try to update status anyway, even if container stop failed
      try {
        updateWorkerStatus(worker.id, "killed");
      } catch (dbError) {
        if (!options.quiet && !options.json) {
          console.error(`  (Also failed to update database status: ${dbError})`);
        }
      }
    }

    results.push(result);
  }

  // Print summary
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  if (options.json) {
    console.log(JSON.stringify({
      drained: succeeded,
      failed,
      workers: results,
    }, null, 2));
  } else if (!options.quiet) {
    console.log();
    console.log(`Drain complete: ${succeeded} stopped, ${failed} failed`);
  }
}
