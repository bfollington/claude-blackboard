/**
 * Shared drone operations for launching and stopping drone sessions.
 * Used by both CLI commands and TUI actions to avoid duplication.
 */

import { getDrone, getCurrentSession, createDroneSession, updateSessionStatus } from "../db/drone-queries.ts";
import { insertWorker, updateWorkerStatus } from "../db/worker-queries.ts";
import { generateId } from "../utils/id.ts";
import {
  spawnDroneContainer,
  isDockerAvailable,
  dockerKill,
  dockerImageExists,
  dockerBuild,
  resolveDockerfile,
} from "../docker/client.ts";
import { getDb, resolveDbPath } from "../db/connection.ts";
import { extractAndValidateOAuthToken } from "../utils/oauth.ts";
import { dirname, fromFileUrl, join } from "jsr:@std/path";
import type { Drone, Worker } from "../types/schema.ts";

// ============================================================================
// Types
// ============================================================================

export interface LaunchDroneOptions {
  /** Override max iterations (defaults to drone config) */
  maxIterations?: number;
  /** Override cooldown seconds (defaults to drone config) */
  cooldownSeconds?: number;
  /** API key for env auth mode */
  apiKey?: string;
  /** Docker image name (defaults to blackboard-worker:latest) */
  image?: string;
  /** Memory limit (defaults to 1g) */
  memory?: string;
  /** Repository directory (defaults to cwd) */
  repoDir?: string;
  /** Force rebuild image */
  build?: boolean;
  /** Suppress status messages */
  quiet?: boolean;
  /** Callback for status messages */
  onStatus?: (message: string) => void;
}

export interface LaunchDroneResult {
  sessionId: string;
  workerId: string;
  containerId: string;
  gitBranch: string;
}

export interface StopDroneResult {
  sessionId: string;
  workerId: string;
}

// ============================================================================
// Launch Drone
// ============================================================================

/**
 * Launch a drone session. Handles Docker availability check, image building,
 * authentication auto-detection, worker/session creation, and container spawning.
 *
 * @param droneNameOrId - Drone name or ID
 * @param options - Launch options
 * @returns Launch result with session/worker/container IDs
 * @throws Error if drone not found, already running, Docker unavailable, or spawn fails
 */
export async function launchDrone(
  droneNameOrId: string,
  options: LaunchDroneOptions = {}
): Promise<LaunchDroneResult> {
  const log = options.onStatus ?? (options.quiet ? () => {} : console.log);

  // Resolve drone
  const drone = getDrone(droneNameOrId);
  if (!drone) {
    throw new Error(`Drone "${droneNameOrId}" not found`);
  }

  // Check if already running
  const currentSession = getCurrentSession(drone.id);
  if (currentSession) {
    throw new Error(`Drone "${drone.name}" is already running (session: ${currentSession.id})`);
  }

  // Check Docker availability
  log("Checking Docker availability...");
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    throw new Error("Docker is not available. Please ensure Docker is installed and running.");
  }

  // Check/build image
  const imageName = options.image || "blackboard-worker:latest";
  let needsBuild = options.build || false;

  if (!needsBuild) {
    const imageExists = await dockerImageExists(imageName);
    if (!imageExists) {
      log(`Image "${imageName}" not found locally. Building...`);
      needsBuild = true;
    }
  }

  if (needsBuild) {
    log(`Building worker image: ${imageName}`);

    const pluginRoot = Deno.env.get("CLAUDE_PLUGIN_ROOT") ||
      join(dirname(fromFileUrl(import.meta.url)), "..", "..", "..", "..");
    const projectRoot = options.repoDir || Deno.cwd();
    const dockerfilePath = await resolveDockerfile(projectRoot, pluginRoot);

    if (!dockerfilePath) {
      throw new Error(
        "No Dockerfile found. Expected either:\n" +
        `  - ${projectRoot}/Dockerfile.worker (project-specific)\n` +
        `  - ${pluginRoot}/blackboard/docker/Dockerfile (plugin default)\n\n` +
        "Run 'blackboard init-worker' to create a project-specific Dockerfile."
      );
    }

    log(`Using Dockerfile: ${dockerfilePath}`);
    await dockerBuild(imageName, pluginRoot, dockerfilePath);
    log(`Build complete: ${imageName}`);
  }

  // Auto-detect authentication
  const authResult = await detectAuthentication(options.apiKey, options.quiet);
  if (!authResult.success) {
    throw new Error(authResult.error!);
  }

  log(`Using ${authResult.authMode === "oauth" ? "OAuth" : "API key"} authentication`);

  // Generate IDs
  const sessionId = generateId();
  const workerId = generateId();

  // Resolve paths
  const dbPath = resolveDbPath();
  const dbDir = dirname(dbPath);
  const repoDir = options.repoDir || Deno.cwd();

  // Create git branch name
  const shortSessionId = sessionId.slice(0, 8);
  const gitBranch = `drones/${drone.name}/${shortSessionId}`;

  // Create worker record first (drone_sessions references workers via FK)
  insertWorker({
    id: workerId,
    container_id: "", // Will be updated after container starts
    thread_id: null, // Drones don't belong to threads
    status: "running",
    auth_mode: authResult.authMode,
    iteration: 0,
    max_iterations: options.maxIterations || drone.max_iterations,
  });

  // Create session in database (pass pre-generated sessionId)
  createDroneSession(drone.id, workerId, gitBranch, sessionId);

  // Update session status to running
  updateSessionStatus(sessionId, "running");

  log(`Spawning drone "${drone.name}" (session ${shortSessionId})...`);

  try {
    // Spawn container
    const containerId = await spawnDroneContainer({
      image: imageName,
      droneName: drone.name,
      sessionId,
      dronePrompt: drone.prompt,
      dbDir,
      repoDir,
      authMode: authResult.authMode,
      apiKey: options.apiKey,
      oauthToken: authResult.oauthToken,
      maxIterations: options.maxIterations || drone.max_iterations,
      cooldownSeconds: options.cooldownSeconds || drone.cooldown_seconds,
      memory: options.memory || "1g",
      workerId,
      labels: {
        "blackboard.drone-name": drone.name,
      },
    });

    // Update worker with container ID
    const db = getDb();
    const stmt = db.prepare("UPDATE workers SET container_id = ? WHERE id = ?");
    stmt.run(containerId, workerId);

    return {
      sessionId,
      workerId,
      containerId,
      gitBranch,
    };
  } catch (error) {
    // Clean up on failure
    updateSessionStatus(sessionId, "failed", "container_spawn_failed");
    updateWorkerStatus(workerId, "failed");
    throw error;
  }
}

// ============================================================================
// Stop Drone
// ============================================================================

/**
 * Stop a running drone session. Kills the container and updates database status.
 *
 * @param droneNameOrId - Drone name or ID
 * @returns Stop result with session/worker IDs
 * @throws Error if drone not found or not running
 */
export async function stopDrone(droneNameOrId: string): Promise<StopDroneResult> {
  // Resolve drone
  const drone = getDrone(droneNameOrId);
  if (!drone) {
    throw new Error(`Drone "${droneNameOrId}" not found`);
  }

  // Get current session
  const currentSession = getCurrentSession(drone.id);
  if (!currentSession) {
    throw new Error(`Drone "${drone.name}" is not running`);
  }

  // Update session status to stopped
  updateSessionStatus(currentSession.id, "stopped", "manual");

  const workerId = currentSession.worker_id;
  if (!workerId) {
    throw new Error(`Session ${currentSession.id} has no associated worker`);
  }

  // Get worker and kill container
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM workers WHERE id = ?");
  const worker = stmt.get(workerId) as Worker | undefined;

  if (worker?.container_id) {
    try {
      await dockerKill(worker.container_id);
    } catch {
      // Container might already be stopped - not a critical error
    }
  }

  // Update worker status
  updateWorkerStatus(workerId, "killed");

  return {
    sessionId: currentSession.id,
    workerId,
  };
}

// ============================================================================
// Helpers
// ============================================================================

interface AuthResult {
  success: boolean;
  authMode: "env" | "oauth";
  oauthToken?: string;
  error?: string;
}

/**
 * Auto-detect authentication method. Tries OAuth first, then falls back to API key.
 */
async function detectAuthentication(
  apiKey?: string,
  quiet?: boolean
): Promise<AuthResult> {
  // Try OAuth first
  const oauthResult = await extractAndValidateOAuthToken(quiet ?? true);
  if (oauthResult) {
    return {
      success: true,
      authMode: "oauth",
      oauthToken: oauthResult.token,
    };
  }

  // Fall back to API key
  const key = apiKey || Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    return {
      success: true,
      authMode: "env",
    };
  }

  return {
    success: false,
    authMode: "env",
    error:
      "No authentication method available.\n\n" +
      "Options:\n" +
      "  1. Run 'claude login' to authenticate with OAuth (recommended for Pro/Max)\n" +
      "  2. Set ANTHROPIC_API_KEY environment variable\n" +
      "  3. Use --api-key flag",
  };
}
