/**
 * Work command - Start working on a thread.
 *
 * By default, spawns an isolated container worker.
 * Use --local to run Claude directly in the current environment (modifies local repo).
 */

import { spawnCommand, type SpawnOptions } from "./spawn.ts";
import { resolveThread, touchThread, updateThread } from "../db/queries.ts";
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
    const spawnOptions: SpawnOptions = {
      db: options.db,
      quiet: options.quiet,
      json: options.json,
      auth: options.auth,
      apiKey: options.apiKey,
      repo: options.repo || Deno.cwd(),
      maxIterations: options.maxIterations,
      memory: options.memory,
      image: options.image,
      build: options.build,
    };
    await spawnCommand(threadName, spawnOptions);
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
