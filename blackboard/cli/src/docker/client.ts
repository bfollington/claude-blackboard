/**
 * Docker integration module for blackboard worker containers.
 * Wraps Docker CLI commands using Deno.Command to avoid SDK dependencies.
 * Compatible with OrbStack, Docker Desktop, and Colima.
 */

// Types

export interface ContainerOptions {
  image: string;
  threadName: string;
  dbDir: string;           // Host path to .claude/ dir (mounts as /app/db)
  repoDir?: string;        // Host path to git workspace (mounts as /app/repo)
  authMode: 'env' | 'config';
  apiKey?: string;         // When authMode=env
  claudeConfigDir?: string; // When authMode=config (default: ~/.claude)
  maxIterations?: number;
  memory?: string;         // Default: "512m"
  workerId: string;        // Pre-generated worker ID
  labels?: Record<string, string>;
  envVars?: Record<string, string>; // Additional environment variables to pass
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  labels: Record<string, string>;
}

export interface ContainerState {
  running: boolean;
  exitCode: number | null;
  status: string;
}

interface DockerResult {
  stdout: string;
  stderr: string;
  code: number;
}

// Helper function to run docker commands

async function runDocker(args: string[]): Promise<DockerResult> {
  const command = new Deno.Command("docker", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();
  const { stdout, stderr, code } = await process.output();

  return {
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
    code,
  };
}

// Public functions

/**
 * Parse a .env file and return key-value pairs.
 * Handles comments, empty lines, and quoted values.
 */
export async function parseEnvFile(filePath: string): Promise<Record<string, string>> {
  const envVars: Record<string, string> = {};

  try {
    const content = await Deno.readTextFile(filePath);
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key) {
        envVars[key] = value;
      }
    }
  } catch {
    // File doesn't exist or can't be read - return empty
  }

  return envVars;
}

/**
 * Check if docker is available and responsive.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const result = await runDocker(["info", "--format", "{{.ID}}"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Build the worker image.
 * @throws Error if build fails
 */
export async function dockerBuild(tag: string, contextPath: string): Promise<void> {
  const dockerfilePath = `${contextPath}/blackboard/docker/Dockerfile`;
  const result = await runDocker([
    "build",
    "-t",
    tag,
    "-f",
    dockerfilePath,
    contextPath,
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Docker build failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }
}

/**
 * Run a new container and return container ID.
 * @throws Error if docker run fails
 */
export async function dockerRun(options: ContainerOptions): Promise<string> {
  const args = [
    "run",
    "--detach",
    "--name",
    `blackboard-worker-${options.workerId}`,
    "--label",
    "blackboard.managed=true",
    "--label",
    `blackboard.thread=${options.threadName}`,
    "--label",
    `blackboard.worker-id=${options.workerId}`,
    "--memory",
    options.memory || "1g",
    "-v",
    `${options.dbDir}:/app/db:rw`,
  ];

  // Add repo volume if provided
  if (options.repoDir) {
    args.push("-v", `${options.repoDir}:/app/repo:rw`);
  }

  // Add environment variables
  args.push("-e", `THREAD_NAME=${options.threadName}`);
  args.push("-e", `WORKER_ID=${options.workerId}`);
  args.push("-e", `MAX_ITERATIONS=${options.maxIterations || 50}`);

  // Handle authentication mode
  if (options.authMode === "env") {
    const apiKey = options.apiKey || Deno.env.get("ANTHROPIC_API_KEY");
    if (apiKey) {
      args.push("-e", `ANTHROPIC_API_KEY=${apiKey}`);
    }
  } else if (options.authMode === "config") {
    const configDir = options.claudeConfigDir || `${Deno.env.get("HOME")}/.claude`;
    args.push("-v", `${configDir}:/root/.claude:ro`);
  }

  // Add additional environment variables from envVars
  if (options.envVars) {
    for (const [key, value] of Object.entries(options.envVars)) {
      // Skip ANTHROPIC_API_KEY if already set above
      if (key === "ANTHROPIC_API_KEY") continue;
      args.push("-e", `${key}=${value}`);
    }
  }

  // Add custom labels if provided
  if (options.labels) {
    for (const [key, value] of Object.entries(options.labels)) {
      args.push("--label", `${key}=${value}`);
    }
  }

  // Add image as final argument
  args.push(options.image);

  const result = await runDocker(args);

  if (result.code !== 0) {
    throw new Error(
      `Docker run failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }

  return result.stdout;
}

/**
 * Kill a container immediately.
 * @throws Error if docker kill fails
 */
export async function dockerKill(containerId: string): Promise<void> {
  const result = await runDocker(["kill", containerId]);

  if (result.code !== 0) {
    throw new Error(
      `Docker kill failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }
}

/**
 * Stop a container with timeout.
 * @throws Error if docker stop fails
 */
export async function dockerStop(containerId: string, timeout?: number): Promise<void> {
  const result = await runDocker([
    "stop",
    "--time",
    String(timeout || 30),
    containerId,
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Docker stop failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }
}

/**
 * Remove a container forcefully.
 * @throws Error if docker rm fails
 */
export async function dockerRm(containerId: string): Promise<void> {
  const result = await runDocker(["rm", "-f", containerId]);

  if (result.code !== 0) {
    throw new Error(
      `Docker rm failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }
}

/**
 * List containers matching labels.
 */
export async function dockerPs(labels?: Record<string, string>): Promise<ContainerInfo[]> {
  const args = ["ps", "-a"];

  // Add label filters
  if (labels) {
    for (const [key, value] of Object.entries(labels)) {
      args.push("--filter", `label=${key}=${value}`);
    }
  }

  // Request JSON output
  args.push("--format", "{{json .}}");

  const result = await runDocker(args);

  if (result.code !== 0) {
    throw new Error(
      `Docker ps failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }

  if (!result.stdout) {
    return [];
  }

  // Parse JSON lines
  const containers: ContainerInfo[] = [];
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;

    try {
      const raw = JSON.parse(line);

      // Parse labels from "key1=value1,key2=value2" format
      const labels: Record<string, string> = {};
      if (raw.Labels) {
        for (const pair of raw.Labels.split(",")) {
          const [key, ...valueParts] = pair.split("=");
          if (key) {
            labels[key.trim()] = valueParts.join("=").trim();
          }
        }
      }

      containers.push({
        id: raw.ID || "",
        name: raw.Names || "",
        status: raw.Status || "",
        labels,
      });
    } catch (e) {
      // Skip malformed JSON lines
      console.error(`Failed to parse docker ps output line: ${line}`, e);
    }
  }

  return containers;
}

/**
 * Inspect container state.
 * @throws Error if docker inspect fails
 */
export async function dockerInspect(containerId: string): Promise<ContainerState> {
  const result = await runDocker([
    "inspect",
    "--format",
    "{{json .State}}",
    containerId,
  ]);

  if (result.code !== 0) {
    throw new Error(
      `Docker inspect failed (exit ${result.code}): ${result.stderr || result.stdout}`
    );
  }

  const state = JSON.parse(result.stdout);

  return {
    running: state.Running === true,
    exitCode: state.ExitCode ?? null,
    status: state.Status || "unknown",
  };
}

/**
 * Remove orphaned containers (labeled blackboard.managed=true but not in DB).
 * @param activeWorkerIds List of worker IDs currently in the database
 * @returns Number of containers removed
 */
export async function cleanupOrphans(activeWorkerIds: string[]): Promise<number> {
  // List all containers with blackboard.managed=true label
  const containers = await dockerPs({ "blackboard.managed": "true" });

  let removed = 0;

  for (const container of containers) {
    const workerId = container.labels["blackboard.worker-id"];

    // If no worker-id label or not in active list, remove it
    if (!workerId || !activeWorkerIds.includes(workerId)) {
      try {
        await dockerRm(container.id);
        removed++;
      } catch (e) {
        console.error(`Failed to remove orphaned container ${container.id}:`, e);
      }
    }
  }

  return removed;
}
