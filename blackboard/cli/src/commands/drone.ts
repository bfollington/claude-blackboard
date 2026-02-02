/**
 * Drone command - Manage autonomous worker configurations.
 * Drones are persistent prompt configurations that can be spawned repeatedly.
 */

import {
  createDrone,
  getDrone,
  listDrones,
  updateDrone,
  archiveDrone,
  deleteDrone,
  listDroneSessions,
} from "../db/drone-queries.ts";
import type { DroneStatus } from "../types/schema.ts";
import { relativeTime, formatLocalTime } from "../utils/time.ts";

interface DroneNewOptions {
  prompt?: string;
  file?: string;
  maxIterations?: number;
  timeout?: number;
  cooldown?: number;
  quiet?: boolean;
  json?: boolean;
}

interface DroneListOptions {
  status?: DroneStatus;
  quiet?: boolean;
  json?: boolean;
}

interface DroneShowOptions {
  quiet?: boolean;
  json?: boolean;
}

interface DroneEditOptions {
  quiet?: boolean;
}

interface DroneArchiveOptions {
  quiet?: boolean;
}

interface DroneDeleteOptions {
  quiet?: boolean;
  force?: boolean;
}

/**
 * Validates that a drone name is kebab-case.
 */
function isValidDroneName(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

/**
 * Opens content in the user's editor and returns the edited content.
 * Creates a temp file, waits for the editor to close, then reads the result.
 */
async function openInEditor(content: string): Promise<string | null> {
  // Create temp file with .md extension
  const tempFile = await Deno.makeTempFile({ suffix: ".md" });

  try {
    // Write initial content
    await Deno.writeTextFile(tempFile, content);

    // Get editor from env (VISUAL first, then EDITOR, default to vim)
    const editor = Deno.env.get("VISUAL") || Deno.env.get("EDITOR") || "vim";

    // Split editor command to handle cases like "code --wait"
    const editorParts = editor.split(/\s+/);
    const editorCmd = editorParts[0];
    const editorArgs = editorParts.slice(1);

    // Open editor and wait for it to close
    const command = new Deno.Command(editorCmd, {
      args: [...editorArgs, tempFile],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const child = command.spawn();
    const status = await child.status;

    if (!status.success) {
      console.error("Editor exited with error");
      return null;
    }

    // Read the edited content
    const editedContent = await Deno.readTextFile(tempFile);
    return editedContent;
  } finally {
    // Clean up temp file
    try {
      await Deno.remove(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a new drone.
 */
export async function droneNewCommand(
  name: string,
  options: DroneNewOptions
): Promise<void> {
  if (!isValidDroneName(name)) {
    console.error(
      "Error: Drone name must be kebab-case (lowercase letters, numbers, hyphens)"
    );
    console.error("Examples: fix-typos, update-deps, security-scan");
    Deno.exit(1);
  }

  // Check if drone already exists
  const existing = getDrone(name);
  if (existing) {
    console.error(`Error: Drone "${name}" already exists`);
    Deno.exit(1);
  }

  let prompt: string;

  // Get prompt from file or option
  if (options.file) {
    try {
      prompt = await Deno.readTextFile(options.file);
    } catch (err) {
      console.error(`Error reading file "${options.file}": ${err instanceof Error ? err.message : err}`);
      Deno.exit(1);
    }
  } else if (options.prompt) {
    prompt = options.prompt;
  } else {
    console.error("Error: Either --prompt or --file must be provided");
    Deno.exit(1);
  }

  // Create the drone
  const droneId = createDrone(name, prompt, {
    maxIterations: options.maxIterations,
    timeoutMinutes: options.timeout,
    cooldownSeconds: options.cooldown,
  });

  if (options.json) {
    const drone = getDrone(droneId);
    console.log(JSON.stringify(drone, null, 2));
  } else if (!options.quiet) {
    console.log(`Drone "${name}" created (${droneId})`);
    console.log(`Max iterations: ${options.maxIterations ?? 100}`);
    console.log(`Timeout: ${options.timeout ?? 60} minutes`);
    console.log(`Cooldown: ${options.cooldown ?? 60} seconds`);
  }
}

/**
 * List all drones.
 */
export async function droneListCommand(
  options: DroneListOptions
): Promise<void> {
  const drones = listDrones({ status: options.status });

  if (drones.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([]));
    } else if (!options.quiet) {
      console.log("No drones found");
      console.log("\nCreate one with: blackboard drone new <name> --prompt \"...\"");
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(drones, null, 2));
    return;
  }

  // Table output
  console.log("Drones:\n");
  for (const d of drones) {
    const statusIcon =
      d.status === "active"
        ? "●"
        : d.status === "paused"
        ? "○"
        : "◌";

    const promptPreview = d.prompt.slice(0, 60).replace(/\n/g, " ");
    const promptSuffix = d.prompt.length > 60 ? "..." : "";

    console.log(
      `  ${statusIcon} ${d.name} - ${promptPreview}${promptSuffix}`
    );
    console.log(
      `     ${d.max_iterations} iterations, ${d.timeout_minutes}min timeout, ${d.cooldown_seconds}s cooldown - ${relativeTime(d.updated_at)}`
    );
  }
}

/**
 * Show detailed drone status and recent sessions.
 */
export async function droneShowCommand(
  name: string,
  options: DroneShowOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  if (options.json) {
    const sessions = listDroneSessions(name, 10);
    console.log(JSON.stringify({ ...drone, recent_sessions: sessions }, null, 2));
    return;
  }

  // Text output
  console.log(`## Drone: ${drone.name}`);
  console.log(`Status: ${drone.status} | ID: ${drone.id}`);
  console.log(`Created: ${relativeTime(drone.created_at)} | Updated: ${relativeTime(drone.updated_at)}`);
  console.log();

  console.log("## Configuration");
  console.log(`Max iterations: ${drone.max_iterations}`);
  console.log(`Timeout: ${drone.timeout_minutes} minutes`);
  console.log(`Cooldown: ${drone.cooldown_seconds} seconds`);
  console.log();

  console.log("## Prompt");
  console.log(drone.prompt);
  console.log();

  // Recent sessions
  const sessions = listDroneSessions(name, 10);
  if (sessions.length > 0) {
    console.log("## Recent Sessions");
    for (const session of sessions) {
      const statusIcon = session.status === "completed" ? "✓" :
                        session.status === "running" ? "●" :
                        session.status === "stopped" ? "○" : "✗";
      const branch = session.git_branch ? ` on ${session.git_branch}` : "";
      const time = formatLocalTime(session.started_at);
      const stopInfo = session.stop_reason ? ` (${session.stop_reason})` : "";

      console.log(
        `  ${statusIcon} ${session.id} - ${session.iteration} iterations${branch} - ${time}${stopInfo}`
      );
    }
  } else {
    console.log("## Recent Sessions");
    console.log("No sessions yet");
  }
}

/**
 * Edit a drone's prompt in the user's editor.
 */
export async function droneEditCommand(
  name: string,
  options: DroneEditOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  // Open in editor
  const result = await openInEditor(drone.prompt);

  if (!result) {
    console.error("Failed to get edited content");
    Deno.exit(1);
  }

  // Check if content changed
  if (result === drone.prompt) {
    if (!options.quiet) {
      console.log("No changes made");
    }
    return;
  }

  // Update the drone
  updateDrone(name, { prompt: result });

  if (!options.quiet) {
    console.log(`Drone "${name}" updated`);
  }
}

/**
 * Archive a drone (soft delete).
 */
export async function droneArchiveCommand(
  name: string,
  options: DroneArchiveOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  if (drone.status === "archived") {
    console.error(`Error: Drone "${name}" is already archived`);
    Deno.exit(1);
  }

  archiveDrone(name);

  if (!options.quiet) {
    console.log(`Drone "${name}" archived`);
  }
}

/**
 * Delete a drone permanently (hard delete).
 */
export async function droneDeleteCommand(
  name: string,
  options: DroneDeleteOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  // Confirm deletion unless --force is provided
  if (!options.force) {
    console.log(`About to permanently delete drone "${name}"`);
    console.log("This will also delete all associated sessions.");

    const response = prompt("Type the drone name to confirm: ");
    if (response !== name) {
      console.log("Deletion cancelled");
      return;
    }
  }

  deleteDrone(name);

  if (!options.quiet) {
    console.log(`Drone "${name}" deleted`);
  }
}

// ============================================================================
// Drone Execution Commands
// ============================================================================

import {
  createDroneSession,
  getCurrentSession,
  updateSessionStatus,
} from "../db/drone-queries.ts";
import { insertWorker } from "../db/worker-queries.ts";
import { generateId } from "../utils/id.ts";
import { spawnDroneContainer, isDockerAvailable, dockerKill, dockerImageExists, dockerBuild, resolveDockerfile } from "../docker/client.ts";
import { getDb, resolveDbPath } from "../db/connection.ts";
import { extractAndValidateOAuthToken } from "../utils/oauth.ts";
import { dirname, fromFileUrl, join } from "jsr:@std/path";

interface DroneStartOptions {
  quiet?: boolean;
  maxIterations?: number;
  cooldownSeconds?: number;
  auth?: string;
  apiKey?: string;
  repo?: string;
  memory?: string;
  image?: string;
  build?: boolean;
}

interface DroneStopOptions {
  quiet?: boolean;
}

interface DroneLogsOptions {
  follow?: boolean;
  tool?: string;
  file?: string;
  limit?: number;
  json?: boolean;
}

/**
 * Start a drone (creates session and spawns container).
 */
export async function droneStartCommand(
  name: string,
  options: DroneStartOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  // Check if drone is already running
  const currentSession = getCurrentSession(name);
  if (currentSession) {
    console.error(`Error: Drone "${name}" is already running (session: ${currentSession.id})`);
    console.error(`Stop it with: blackboard drone stop ${name}`);
    Deno.exit(1);
  }

  // Check Docker availability
  if (!options.quiet) {
    console.log("Checking Docker availability...");
  }

  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    console.error("Error: Docker is not available. Please ensure Docker is installed and running.");
    console.error("Supported Docker environments: Docker Desktop, OrbStack, Colima");
    Deno.exit(1);
  }

  // Check if image exists or needs building
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
      console.error("Error: No Dockerfile found. Expected either:");
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

  // Determine auth mode with auto-detection
  let authMode: "env" | "config" | "oauth";
  let oauthToken: string | undefined;

  if (options.auth === "oauth") {
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
    const apiKey = options.apiKey || Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error(
        "Error: --auth env requires ANTHROPIC_API_KEY environment variable or --api-key flag"
      );
      Deno.exit(1);
    }
    authMode = "env";
  } else if (options.auth === "config") {
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

  // Generate IDs
  const sessionId = generateId();
  const workerId = generateId();

  // Resolve dbDir: the directory containing blackboard.db
  const dbPath = resolveDbPath();
  const dbDir = dirname(dbPath);
  const repoDir = options.repo || Deno.cwd();

  // Create worker record first (drone_sessions references workers via FK)
  insertWorker({
    id: workerId,
    container_id: "", // Will be updated after container starts
    thread_id: null, // Drones don't belong to threads
    status: "running",
    auth_mode: authMode,
    iteration: 0,
    max_iterations: options.maxIterations || drone.max_iterations,
  });

  // Create session in database (after worker exists for FK constraint)
  const shortSessionId = sessionId.slice(0, 8);
  const gitBranch = `drones/${name}/${shortSessionId}`;
  createDroneSession(drone.id, workerId, gitBranch);

  // Update session status to running
  updateSessionStatus(sessionId, "running");

  if (!options.quiet) {
    console.log(`Spawning drone "${name}" (session ${shortSessionId})...`);
  }

  try {
    // Spawn container
    const containerId = await spawnDroneContainer({
      image: imageName,
      droneName: name,
      sessionId,
      dronePrompt: drone.prompt,
      dbDir,
      repoDir,
      authMode,
      apiKey: options.apiKey,
      oauthToken,
      maxIterations: options.maxIterations || drone.max_iterations,
      cooldownSeconds: options.cooldownSeconds || drone.cooldown_seconds,
      memory: options.memory || "1g",
      workerId,
      labels: {
        "blackboard.drone-name": name,
      },
    });

    // Update worker with container ID
    const db = getDb();
    db.exec(`UPDATE workers SET container_id = '${containerId}' WHERE id = '${workerId}'`);

    if (!options.quiet) {
      console.log(`Drone "${name}" started successfully!`);
      console.log(`  Session ID:   ${sessionId}`);
      console.log(`  Worker ID:    ${workerId}`);
      console.log(`  Branch:       ${gitBranch}`);
      console.log(`  Container ID: ${containerId}`);
      console.log(`\nView logs with:    blackboard drone logs ${name}`);
      console.log(`Stop with:         blackboard drone stop ${name}`);
    }
  } catch (error) {
    // Clean up on failure
    updateSessionStatus(sessionId, "failed", "container_spawn_failed");
    const db = getDb();
    db.exec(`UPDATE workers SET status = 'failed' WHERE id = '${workerId}'`);
    console.error(`Error starting drone: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
}

/**
 * Stop a running drone.
 */
export async function droneStopCommand(
  name: string,
  options: DroneStopOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  // Get current session
  const currentSession = getCurrentSession(name);
  if (!currentSession) {
    console.error(`Error: Drone "${name}" is not running`);
    Deno.exit(1);
  }

  // Update session status to stopped
  updateSessionStatus(currentSession.id, "stopped", "manual");

  // Get worker and kill container
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM workers WHERE id = ?");
  const worker = stmt.get(currentSession.worker_id) as any;

  if (worker && worker.container_id) {
    try {
      await dockerKill(worker.container_id);
      if (!options.quiet) {
        console.log(`Container killed: ${worker.container_id}`);
      }
    } catch (error) {
      // Container might already be stopped
      console.error(`Warning: Failed to kill container: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Update worker status
  db.exec(`UPDATE workers SET status = 'killed' WHERE id = '${currentSession.worker_id}'`);

  if (!options.quiet) {
    console.log(`Drone "${name}" stopped`);
  }
}

/**
 * Show logs for a drone.
 */
export async function droneLogsCommand(
  name: string,
  options: DroneLogsOptions
): Promise<void> {
  const drone = getDrone(name);
  if (!drone) {
    console.error(`Error: Drone "${name}" not found`);
    Deno.exit(1);
  }

  // Get current session
  const currentSession = getCurrentSession(name);
  if (!currentSession) {
    console.error(`No active session for drone "${name}"`);
    console.error(`Start it with: blackboard drone start ${name}`);
    Deno.exit(1);
  }

  if (!currentSession.worker_id) {
    console.error(`Session ${currentSession.id} has no worker ID`);
    Deno.exit(1);
  }

  // Import worker event query functions
  const { getWorkerEvents } = await import("../db/worker-queries.ts");

  if (options.follow) {
    // Follow mode - continuously poll for new events
    console.log(`Following logs for drone "${name}" (Ctrl+C to stop)...`);
    let lastEventId = 0;

    while (true) {
      const events = getWorkerEvents(currentSession.worker_id, {
        toolName: options.tool,
        filePath: options.file,
      });

      // Filter to new events
      const newEvents = events.filter(e => parseInt(e.id) > lastEventId);

      for (const event of newEvents) {
        if (options.json) {
          console.log(JSON.stringify(event));
        } else {
          const timestamp = new Date(event.timestamp).toISOString();
          const prefix = `[${timestamp}] [iter ${event.iteration}] [${event.event_type}]`;

          if (event.tool_name) {
            console.log(`${prefix} ${event.tool_name}`);
            if (event.file_path) {
              console.log(`  File: ${event.file_path}`);
            }
          } else if (event.tool_output_preview) {
            console.log(`${prefix} ${event.tool_output_preview}`);
          }
        }

        lastEventId = Math.max(lastEventId, parseInt(event.id));
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } else {
    // One-time fetch
    const events = getWorkerEvents(currentSession.worker_id, {
      limit: options.limit,
      toolName: options.tool,
      filePath: options.file,
    });

    if (events.length === 0) {
      console.log("No events yet");
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(events, null, 2));
    } else {
      for (const event of events) {
        const timestamp = new Date(event.timestamp).toISOString();
        const prefix = `[${timestamp}] [iter ${event.iteration}] [${event.event_type}]`;

        if (event.tool_name) {
          console.log(`${prefix} ${event.tool_name}`);
          if (event.file_path) {
            console.log(`  File: ${event.file_path}`);
          }
          if (event.tool_input) {
            console.log(`  Input: ${event.tool_input.slice(0, 100)}...`);
          }
        } else if (event.tool_output_preview) {
          console.log(`${prefix} ${event.tool_output_preview}`);
        }
      }
    }
  }
}
