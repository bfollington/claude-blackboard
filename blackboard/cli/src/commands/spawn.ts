/**
 * Spawn command - Launch a containerized worker for a thread.
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { getDb, resolveDbPath } from "../db/connection.ts";
import { resolveThread } from "../db/queries.ts";
import { insertWorker } from "../db/worker-queries.ts";
import {
  isDockerAvailable,
  dockerBuild,
  dockerRun,
  resolveDockerfile,
  type ContainerOptions,
} from "../docker/client.ts";
import { generateId } from "../utils/id.ts";

export interface SpawnOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  auth?: string;
  apiKey?: string;
  repo?: string;
  maxIterations?: number;
  memory?: string;
  image?: string;
  build?: boolean;
}

/**
 * Spawn a containerized worker for a thread.
 */
export async function spawnCommand(
  threadName: string,
  options: SpawnOptions
): Promise<void> {
  const db = getDb(options.db);

  // 1. Resolve thread by name (must exist, must be active or paused)
  const thread = resolveThread(threadName);
  if (!thread) {
    console.error(`Error: Thread "${threadName}" not found`);
    Deno.exit(1);
  }

  if (thread.status !== "active" && thread.status !== "paused") {
    console.error(
      `Error: Thread "${threadName}" has status "${thread.status}". Only active or paused threads can spawn workers.`
    );
    Deno.exit(1);
  }

  // 2. Check Docker is available
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

  // 3. If --build flag, build the worker image
  const imageName = options.image || "blackboard-worker:latest";

  if (options.build) {
    if (!options.quiet) {
      console.log(`Building worker image: ${imageName}`);
    }

    // Find the plugin root (where blackboard/ directory lives)
    const pluginRoot = Deno.env.get("CLAUDE_PLUGIN_ROOT") ||
      join(dirname(fromFileUrl(import.meta.url)), "..", "..", "..", "..");

    // Resolve project root (usually cwd, or from --repo flag)
    const projectRoot = options.repo || Deno.cwd();

    // Resolve which Dockerfile to use
    const dockerfilePath = await resolveDockerfile(projectRoot, pluginRoot);

    if (!dockerfilePath) {
      console.error(
        "Error: No Dockerfile found. Expected either:"
      );
      console.error(`  - ${projectRoot}/Dockerfile.worker (project-specific)`);
      console.error(`  - ${pluginRoot}/blackboard/docker/Dockerfile (plugin default)`);
      console.error("\nRun 'blackboard init-worker' to create a project-specific Dockerfile.");
      Deno.exit(1);
    }

    if (!options.quiet) {
      console.log(`Using Dockerfile: ${dockerfilePath}`);
    }

    // Context path is the plugin root (contains blackboard/ directory)
    const contextPath = pluginRoot;

    try {
      await dockerBuild(imageName, contextPath, dockerfilePath);
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

  // 4. Generate worker ID
  const workerId = generateId();

  // 5. Resolve dbDir: the directory containing blackboard.db
  const dbPath = resolveDbPath();
  const dbDir = dirname(dbPath);

  // 6. Determine auth mode
  const authMode = (options.auth || "env") as "env" | "config";

  // If auth mode is env and no api key provided, check environment
  if (authMode === "env" && !options.apiKey) {
    const envKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!envKey) {
      console.error(
        "Error: --auth env requires ANTHROPIC_API_KEY environment variable or --api-key flag"
      );
      Deno.exit(1);
    }
  }

  // 7. Call dockerRun with proper ContainerOptions
  if (!options.quiet) {
    console.log(`Spawning worker ${workerId} for thread "${threadName}"...`);
  }

  const containerOptions: ContainerOptions = {
    image: imageName,
    threadName,
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
      `Error starting container: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }

  // 8. Call insertWorker to register in DB
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
      `Error registering worker in database: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(`Container ${containerId} may need to be stopped manually.`);
    Deno.exit(1);
  }

  // 9. Print worker ID and container ID
  if (options.json) {
    console.log(
      JSON.stringify({
        worker_id: workerId,
        container_id: containerId,
        thread_name: threadName,
        thread_id: thread.id,
      })
    );
  } else if (!options.quiet) {
    console.log(`Worker spawned successfully!`);
    console.log(`  Worker ID:    ${workerId}`);
    console.log(`  Container ID: ${containerId}`);
    console.log(`  Thread:       ${threadName}`);
    console.log(
      `\nMonitor with: blackboard workers status ${workerId}`
    );
  }
}
