/**
 * Work command - Start working on a thread.
 *
 * By default, spawns an isolated container worker.
 * Use --local to run Claude directly in the current environment (modifies local repo).
 */

import { dirname, fromFileUrl, join } from "jsr:@std/path";
import { getDb, resolveDbPath } from "../db/connection.ts";
import { resolveThread, touchThread, updateThread } from "../db/queries.ts";
import { insertWorker } from "../db/worker-queries.ts";
import {
  isDockerAvailable,
  dockerImageExists,
  dockerBuild,
  dockerRun,
  resolveDockerfile,
  type ContainerOptions,
} from "../docker/client.ts";
import { generateId } from "../utils/id.ts";
import { extractAndValidateOAuthToken } from "../utils/oauth.ts";
import { getCurrentGitBranch } from "../utils/git.ts";

export interface WorkOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  // Isolation mode
  local?: boolean;
  // Container options (when not --local)
  auth?: string;
  apiKey?: string;
  repo?: string;
  maxIterations?: number;
  memory?: string;
  image?: string;
  build?: boolean;
}

/**
 * Work on a thread - either in an isolated container (default) or locally.
 */
export async function workCommand(
  threadName: string,
  options: WorkOptions
): Promise<void> {
  const thread = resolveThread(threadName);
  if (!thread) {
    console.error(`Error: Thread "${threadName}" not found`);
    Deno.exit(1);
  }

  if (options.local) {
    // Local mode: run Claude directly (modifies local repo)
    await runLocalWorker(threadName, options);
  } else {
    // Default: spawn isolated container
    await spawnContainerWorker(threadName, options);
  }
}

/**
 * Spawn a containerized worker for a thread.
 */
async function spawnContainerWorker(
  threadName: string,
  options: WorkOptions
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

  // Auto-build image if missing (unless --build already requested)
  if (!options.build) {
    const imageExists = await dockerImageExists(imageName);
    if (!imageExists) {
      if (!options.quiet) {
        console.log(`Image "${imageName}" not found locally. Building...`);
      }
      options.build = true;
    }
  }

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

  // 6. Determine auth mode with auto-detection
  let authMode: "env" | "config" | "oauth";
  let oauthToken: string | undefined;

  if (options.auth === "oauth") {
    // Explicit --auth oauth: require OAuth, fail if not available
    const oauthResult = await extractAndValidateOAuthToken(options.quiet);
    if (!oauthResult) {
      console.error("Error: OAuth authentication not available.");
      console.error("Run 'claude login' or 'claude setup-token' to authenticate.");
      Deno.exit(1);
    }
    authMode = "oauth";
    oauthToken = oauthResult.token;
    if (!options.quiet) {
      console.log("Using OAuth authentication from Claude Code session");
    }
  } else if (options.auth === "env") {
    // Explicit --auth env: require API key
    const apiKey = options.apiKey || Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error(
        "Error: --auth env requires ANTHROPIC_API_KEY environment variable or --api-key flag"
      );
      Deno.exit(1);
    }
    authMode = "env";
  } else if (options.auth === "config") {
    // Explicit --auth config: mount ~/.claude directory
    authMode = "config";
  } else {
    // Auto-detection: try OAuth first, then fall back to API key
    const oauthResult = await extractAndValidateOAuthToken(true); // quiet mode for auto-detect
    if (oauthResult) {
      authMode = "oauth";
      oauthToken = oauthResult.token;
      if (!options.quiet) {
        console.log("Auto-detected OAuth authentication from Claude Code session");
      }
    } else {
      // Fall back to API key
      const apiKey = options.apiKey || Deno.env.get("ANTHROPIC_API_KEY");
      if (apiKey) {
        authMode = "env";
        if (!options.quiet) {
          console.log("Using API key authentication");
        }
      } else {
        console.error("Error: No authentication method available.");
        console.error("");
        console.error("Options:");
        console.error("  1. Run 'claude login' to authenticate with OAuth (recommended for Pro/Max)");
        console.error("  2. Set ANTHROPIC_API_KEY environment variable");
        console.error("  3. Use --api-key flag");
        Deno.exit(1);
      }
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
    oauthToken,
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

/**
 * Run Claude locally with thread context (non-isolated, modifies local repo).
 */
async function runLocalWorker(
  threadName: string,
  options: WorkOptions
): Promise<void> {
  const thread = resolveThread(threadName);
  if (!thread) {
    console.error(`Error: Thread "${threadName}" not found`);
    Deno.exit(1);
  }

  // Touch the thread to mark it as active
  touchThread(thread.id);

  // Update git branches if we're on a new branch
  const currentBranch = getCurrentGitBranch();
  if (currentBranch) {
    const existingBranches = thread.git_branches?.split(",") || [];
    if (!existingBranches.includes(currentBranch)) {
      existingBranches.push(currentBranch);
      updateThread(thread.id, { git_branches: existingBranches.join(",") });
    }
  }

  if (!options.quiet) {
    console.log(`Running Claude locally for thread "${threadName}"...`);
    console.log(`WARNING: This modifies your local repository directly.`);
    console.log(`Use 'blackboard work ${threadName}' (without --local) for isolated execution.\n`);
  }

  // Launch Claude with the thread skill
  const command = new Deno.Command("claude", {
    args: ["-p", `/blackboard:thread ${thread.name}`, "--dangerously-skip-permissions"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const child = command.spawn();
  const status = await child.status;
  Deno.exit(status.code);
}
