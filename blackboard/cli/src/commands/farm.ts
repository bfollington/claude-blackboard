/**
 * Farm command - Orchestrate multiple containerized workers across threads.
 * Monitors and manages a fleet of workers, respawning failed ones automatically.
 */

import { dirname } from "jsr:@std/path";
import { resolveDbPath } from "../db/connection.ts";
import { listThreads, getStepsForPlan, resolveThread, getPendingSteps } from "../db/queries.ts";
import {
  insertWorker,
  getActiveWorkers,
  getStaleWorkers,
  updateWorkerStatus,
} from "../db/worker-queries.ts";
import {
  isDockerAvailable,
  dockerBuild,
  dockerRun,
  dockerRm,
  cleanupOrphans,
  type ContainerOptions,
} from "../docker/client.ts";
import { generateId } from "../utils/id.ts";
import type { Thread } from "../types/schema.ts";

export interface FarmOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  threads?: string;
  concurrency?: number;
  auth?: string;
  apiKey?: string;
  repo?: string;
  maxIterations?: number;
  memory?: string;
  image?: string;
  build?: boolean;
}

interface WorkQueueItem {
  thread: Thread;
  retries: number;
}

interface FarmStats {
  active: number;
  completed: number;
  failed: number;
  remaining: number;
}

/**
 * Spawn a single worker for a thread.
 * Returns worker ID on success, null on failure.
 */
async function spawnWorker(
  thread: Thread,
  options: FarmOptions,
  dbDir: string
): Promise<string | null> {
  const workerId = generateId();
  const imageName = options.image || "blackboard-worker:latest";
  const authMode = (options.auth || "env") as "env" | "config";

  if (!options.quiet) {
    console.log(`  Spawning worker for thread "${thread.name}" (${workerId.substring(0, 8)})`);
  }

  const containerOptions: ContainerOptions = {
    image: imageName,
    threadName: thread.name,
    dbDir,
    repoDir: options.repo || Deno.cwd(),
    authMode,
    apiKey: options.apiKey,
    maxIterations: options.maxIterations || 50,
    memory: options.memory || "512m",
    workerId,
  };

  let containerId: string;
  try {
    containerId = await dockerRun(containerOptions);
  } catch (error) {
    console.error(
      `  Error starting container for ${thread.name}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }

  try {
    insertWorker({
      id: workerId,
      container_id: containerId,
      thread_id: thread.id,
      status: "running",
      auth_mode: authMode,
      iteration: 0,
      max_iterations: options.maxIterations || 50,
    });
  } catch (error) {
    console.error(
      `  Error registering worker in database: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(`  Container ${containerId} may need to be stopped manually.`);
    return null;
  }

  return workerId;
}

/**
 * Check if a thread has pending work.
 */
function hasPendingWork(thread: Thread): boolean {
  if (!thread.current_plan_id) {
    return false;
  }

  const pendingSteps = getPendingSteps(thread.current_plan_id);
  return pendingSteps.length > 0;
}

/**
 * Resolve thread list based on options.
 */
function resolveThreadList(options: FarmOptions): Thread[] {
  if (options.threads) {
    // Parse comma-separated thread names
    const threadNames = options.threads.split(",").map(n => n.trim());
    const threads: Thread[] = [];

    for (const name of threadNames) {
      const thread = resolveThread(name);
      if (!thread) {
        console.error(`Warning: Thread "${name}" not found, skipping`);
        continue;
      }

      if (thread.status !== "active" && thread.status !== "paused") {
        console.error(
          `Warning: Thread "${name}" has status "${thread.status}", skipping`
        );
        continue;
      }

      threads.push(thread);
    }

    return threads;
  } else {
    // List all active threads with pending work
    const activeThreads = listThreads("active", 100);
    return activeThreads.filter(hasPendingWork);
  }
}

/**
 * Print status line.
 */
function printStatus(stats: FarmStats, quiet: boolean): void {
  if (quiet) return;

  console.log(
    `Status: Active: ${stats.active} | Completed: ${stats.completed} | Failed: ${stats.failed} | Remaining: ${stats.remaining}`
  );
}

/**
 * Farm command - orchestrate multiple workers.
 */
export async function farmCommand(options: FarmOptions): Promise<void> {
  const concurrency = options.concurrency || 3;
  const imageName = options.image || "blackboard-worker:latest";

  // 1. Check Docker is available
  if (!options.quiet) {
    console.log("Checking Docker availability...");
  }

  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    console.error(
      "Error: Docker is not available. Please ensure Docker is installed and running."
    );
    console.error(
      "Supported Docker environments: Docker Desktop, OrbStack, Colima"
    );
    Deno.exit(1);
  }

  // 2. If --build flag, build the worker image
  if (options.build) {
    if (!options.quiet) {
      console.log(`Building worker image: ${imageName}`);
    }

    const contextPath = options.repo || Deno.cwd();

    try {
      await dockerBuild(imageName, contextPath);
      if (!options.quiet) {
        console.log(`Build complete: ${imageName}`);
      }
    } catch (error) {
      console.error(
        `Error building Docker image: ${error instanceof Error ? error.message : String(error)}`
      );
      Deno.exit(1);
    }
  }

  // 3. Cleanup orphaned containers
  if (!options.quiet) {
    console.log("Cleaning up orphaned containers...");
  }

  const activeWorkers = getActiveWorkers();
  const activeWorkerIds = activeWorkers.map(w => w.id);

  try {
    const orphansRemoved = await cleanupOrphans(activeWorkerIds);
    if (!options.quiet && orphansRemoved > 0) {
      console.log(`Removed ${orphansRemoved} orphaned container(s)`);
    }
  } catch (error) {
    console.error(
      `Warning: Failed to cleanup orphans: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // 4. Resolve thread list
  const threads = resolveThreadList(options);

  if (threads.length === 0) {
    if (!options.quiet) {
      console.log("No threads with pending work found.");
    }
    return;
  }

  if (!options.quiet) {
    console.log(`Found ${threads.length} thread(s) with pending work:`);
    for (const thread of threads) {
      const pendingCount = thread.current_plan_id
        ? getPendingSteps(thread.current_plan_id).length
        : 0;
      console.log(`  - ${thread.name} (${pendingCount} pending steps)`);
    }
  }

  // 5. Validate auth configuration
  const authMode = options.auth || "env";
  if (authMode === "env" && !options.apiKey) {
    const envKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!envKey) {
      console.error(
        "Error: --auth env requires ANTHROPIC_API_KEY environment variable or --api-key flag"
      );
      Deno.exit(1);
    }
  }

  // 6. Initialize work queue
  const workQueue: WorkQueueItem[] = threads.map(thread => ({
    thread,
    retries: 0,
  }));

  const dbPath = resolveDbPath();
  const dbDir = dirname(dbPath);

  const stats: FarmStats = {
    active: 0,
    completed: 0,
    failed: 0,
    remaining: workQueue.length,
  };

  // Track worker -> thread mapping for failure handling
  const workerThreadMap = new Map<string, Thread>();

  if (!options.quiet) {
    console.log(`\nStarting farm with concurrency=${concurrency}`);
    console.log("Press Ctrl+C to stop gracefully\n");
  }

  // 7. Spawn initial batch of workers
  while (workQueue.length > 0 && stats.active < concurrency) {
    const item = workQueue.shift()!;
    const workerId = await spawnWorker(item.thread, options, dbDir);

    if (workerId) {
      stats.active++;
      stats.remaining--;
      workerThreadMap.set(workerId, item.thread);
    } else {
      // Failed to spawn, put back in queue if retries available
      item.retries++;
      if (item.retries < 3) {
        workQueue.push(item);
      } else {
        console.error(`  Max retries exceeded for thread "${item.thread.name}"`);
        stats.failed++;
        stats.remaining--;
      }
    }
  }

  printStatus(stats, options.quiet || false);

  // 8. Monitor loop
  while (stats.active > 0 || workQueue.length > 0) {
    // Sleep 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check for stale workers (30 second timeout)
    const staleWorkers = getStaleWorkers(30);

    for (const worker of staleWorkers) {
      if (!options.quiet) {
        console.log(`\nStale worker detected: ${worker.id.substring(0, 8)}`);
      }

      // Try to remove the container
      try {
        await dockerRm(worker.container_id);
      } catch (error) {
        console.error(
          `  Warning: Failed to remove stale container ${worker.container_id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Update worker status
      updateWorkerStatus(worker.id, "failed");
      stats.active--;
      stats.failed++;

      // Check if thread still has pending work
      const thread = workerThreadMap.get(worker.id);
      if (thread && hasPendingWork(thread)) {
        // Re-add to work queue
        workQueue.push({ thread, retries: 0 });
        stats.remaining++;
        if (!options.quiet) {
          console.log(`  Re-queuing thread "${thread.name}"`);
        }
      }

      workerThreadMap.delete(worker.id);
    }

    // Check for completed/failed workers (query recent workers with terminal status)
    const allWorkers = getActiveWorkers();
    const currentActiveIds = new Set(allWorkers.map(w => w.id));

    // Find workers that were active but are no longer
    const completedWorkerIds: string[] = [];
    for (const [workerId, _thread] of workerThreadMap.entries()) {
      if (!currentActiveIds.has(workerId)) {
        completedWorkerIds.push(workerId);
      }
    }

    for (const workerId of completedWorkerIds) {
      const thread = workerThreadMap.get(workerId)!;

      // Check if thread still has pending work
      if (hasPendingWork(thread)) {
        if (!options.quiet) {
          console.log(`\nWorker ${workerId.substring(0, 8)} completed, but thread "${thread.name}" has more work`);
        }
        // Note: Worker already marked completed/failed, don't adjust stats.active
        // We'll spawn a new worker below if capacity allows
        workQueue.push({ thread, retries: 0 });
        stats.remaining++;
      } else {
        if (!options.quiet) {
          console.log(`\nWorker ${workerId.substring(0, 8)} completed thread "${thread.name}"`);
        }
        stats.completed++;
      }

      stats.active--;
      workerThreadMap.delete(workerId);
    }

    // Spawn more workers if we have capacity and work
    while (workQueue.length > 0 && stats.active < concurrency) {
      const item = workQueue.shift()!;
      const workerId = await spawnWorker(item.thread, options, dbDir);

      if (workerId) {
        stats.active++;
        stats.remaining--;
        workerThreadMap.set(workerId, item.thread);
      } else {
        // Failed to spawn
        item.retries++;
        if (item.retries < 3) {
          workQueue.push(item);
        } else {
          console.error(`  Max retries exceeded for thread "${item.thread.name}"`);
          stats.failed++;
          stats.remaining--;
        }
      }
    }

    printStatus(stats, options.quiet || false);
  }

  // 9. Final summary
  if (options.json) {
    console.log(JSON.stringify({
      completed: stats.completed,
      failed: stats.failed,
      total_threads: threads.length,
    }));
  } else if (!options.quiet) {
    console.log("\nFarm completed!");
    console.log(`  Threads completed: ${stats.completed}`);
    console.log(`  Threads failed: ${stats.failed}`);
    console.log(`  Total threads: ${threads.length}`);
  }
}
