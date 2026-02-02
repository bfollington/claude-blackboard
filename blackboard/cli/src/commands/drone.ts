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
