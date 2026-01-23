/**
 * Cliffy command tree for blackboard CLI.
 * Defines all commands, subcommands, options, and arguments.
 */

import { Command } from "@cliffy/command";
import { resolveDbPath } from "./db/connection.ts";
import {
  initDb,
  checkResume,
  storePlan,
  injectOrchestration,
  captureTodo,
  updateStepStatusHook,
  promptReflect,
  loadThread,
} from "./hooks/mod.ts";
import {
  statusCommand,
  queryCommand,
  crumbCommand,
  oopsCommand,
  bugReportCommand,
  reflectCommand,
  installCommand,
  threadNewCommand,
  threadListCommand,
  threadStatusCommand,
  threadWorkCommand,
  workersCommand,
  killCommand,
  spawnCommand,
  drainCommand,
  farmCommand,
} from "./commands/mod.ts";

/**
 * Thread subcommand group - manage work threads.
 */
const threadCommand = new Command()
  .description("Manage work threads")
  .action(() => {
    console.log("Thread subcommand - use one of the available commands:");
    console.log("  new <name>      Create a new thread");
    console.log("  list            List all threads");
    console.log("  status [name]   Show thread status");
    console.log("  work <name>     Launch Claude with thread context");
  })
  .command("new", "Create a new thread")
  .arguments("<name:string>")
  .action(async (_options: void, name: string) => {
    await threadNewCommand(name, {});
  })
  .reset()
  .command("list", "List all threads")
  .option("--status <status:string>", "Filter by status (active|paused|completed|archived)")
  .action(async (options: { status?: string }) => {
    // Cast status to ThreadStatus if provided
    const listOptions = {
      status: options.status as "active" | "paused" | "completed" | "archived" | undefined,
    };
    await threadListCommand(listOptions);
  })
  .reset()
  .command("status", "Show thread status")
  .arguments("[name:string]")
  .option("-b, --brief", "Brief output (no plan markdown)")
  .action(async (options: { brief?: boolean }, name?: string) => {
    await threadStatusCommand(name, options);
  })
  .reset()
  .command("work", "Launch Claude with thread context")
  .arguments("<name:string>")
  .action(async (_options: void, name: string) => {
    await threadWorkCommand(name, {});
  });

/**
 * Hook subcommand group - all hook handlers for Claude Code plugin integration.
 */
const hookCommand = new Command()
  .description("Hook handlers (JSON stdin/stdout)")
  .action(() => {
    console.log("Hook subcommand - use one of the available handlers:");
    console.log("  init-db              Initialize database");
    console.log("  check-resume         Check for active plan");
    console.log("  store-plan           Store plan from ExitPlanMode");
    console.log("  inject-orchestration Output orchestration instructions");
    console.log("  capture-todo         Sync TodoWrite to steps");
    console.log("  update-step-status   Mark step complete");
    console.log("  prompt-reflect       Suggest reflection");
    console.log("  load-thread          Load thread context packet");
  })
  .command("init-db", "Initialize database (SessionStart)")
  .action(async () => {
    await initDb();
  })
  .reset()
  .command("check-resume", "Check for active plan (SessionStart)")
  .action(async () => {
    await checkResume();
  })
  .reset()
  .command("store-plan", "Store plan from ExitPlanMode (PreToolUse)")
  .action(async () => {
    await storePlan();
  })
  .reset()
  .command(
    "inject-orchestration",
    "Output orchestration instructions (PostToolUse[ExitPlanMode])",
  )
  .action(async () => {
    await injectOrchestration();
  })
  .reset()
  .command("capture-todo", "Sync TodoWrite to steps (PostToolUse[TodoWrite])")
  .action(async () => {
    await captureTodo();
  })
  .reset()
  .command("update-step-status", "Mark step complete (SubagentStop)")
  .action(async () => {
    await updateStepStatusHook();
  })
  .reset()
  .command("prompt-reflect", "Suggest reflection (PreCompact)")
  .action(async () => {
    await promptReflect();
  })
  .reset()
  .command("load-thread", "Load thread context packet")
  .arguments("[name:string]")
  .action(async (_options, name) => {
    await loadThread(name);
  });

/**
 * Main CLI command tree.
 * Includes interactive commands and hook handlers.
 */
export const cli = new Command()
  .name("blackboard")
  .version("0.3.2")
  .description("SQLite blackboard for Claude Code context sharing")
  .globalOption("-d, --db <path:string>", "Database path", {
    default: resolveDbPath(),
  })
  .globalOption("-q, --quiet", "Suppress non-essential output")
  .globalOption("--json", "Output as JSON")

  // Interactive commands
  .command("status", "Show current blackboard status")
  .action(async (options) => {
    await statusCommand(options);
  })
  .reset()

  .command("install", "Show installation and update instructions")
  .action((options) => {
    installCommand(options);
  })
  .reset()

  .command("query", "Run ad-hoc SQL query")
  .arguments("<sql:string>")
  .action(async (options, sql) => {
    await queryCommand(sql, options);
  })
  .reset()

  .command("crumb", "Record a breadcrumb")
  .arguments("<summary:string>")
  .option("-s, --step <id:string>", "Step ID")
  .option("-f, --files <list:string>", "Comma-separated file list")
  .option("-i, --issues <text:string>", "Issues encountered")
  .option("-n, --next <text:string>", "Context for next agent")
  .option("-a, --agent <type:string>", "Agent type (default: implementer)")
  .action(async (options, summary) => {
    await crumbCommand(summary, options);
  })
  .reset()

  .command("oops", "Record a correction")
  .arguments("<mistake:string>")
  .option("-s, --symptoms <text:string>", "Error symptoms")
  .option("-f, --fix <text:string>", "Correct approach")
  .option("-t, --tags <list:string>", "Comma-separated tags")
  .action(async (options, mistake) => {
    await oopsCommand(mistake, options);
  })
  .reset()

  .command("bug-report", "File a bug report")
  .arguments("<title:string>")
  .option("-s, --steps <text:string>", "Reproduction steps", { required: true })
  .option("-e, --evidence <text:string>", "Error logs or evidence")
  .action(async (options, title) => {
    await bugReportCommand(title, options);
  })
  .reset()

  .command("reflect", "Capture a reflection")
  .arguments("[content:string]")
  .option("--trigger <type:string>", "Reflection trigger (manual|compact|completion|stop)")
  .action(async (options, content) => {
    await reflectCommand(content, options);
  })
  .reset()

  .command("workers", "List and monitor container workers")
  .option("-a, --all", "Include completed/failed/killed workers")
  .action(async (options) => {
    await workersCommand(options);
  })
  .reset()

  .command("kill", "Kill a running worker container")
  .arguments("<worker-id-or-thread-name:string>")
  .action(async (options, workerIdOrThreadName) => {
    await killCommand(workerIdOrThreadName, options);
  })
  .reset()

  .command("spawn", "Spawn a worker container for a thread")
  .arguments("<thread-name:string>")
  .option("--auth <mode:string>", "Auth mode: env or config", { default: "env" })
  .option("--api-key <key:string>", "Anthropic API key")
  .option("--repo <path:string>", "Git workspace to mount")
  .option("--max-iterations <n:number>", "Max iterations", { default: 50 })
  .option("--memory <size:string>", "Container memory limit", { default: "512m" })
  .option("--image <name:string>", "Worker image", { default: "blackboard-worker:latest" })
  .option("--build", "Build worker image before spawning")
  .action(async (options, threadName) => {
    await spawnCommand(threadName, options);
  })
  .reset()

  .command("drain", "Stop all running worker containers")
  .option("--force", "Force kill immediately")
  .option("--timeout <seconds:number>", "Grace period before force kill", { default: 30 })
  .action(async (options) => {
    await drainCommand(options);
  })
  .reset()

  .command("farm", "Spawn and monitor workers for multiple threads")
  .option("--threads <names:string>", "Comma-separated thread names")
  .option("--concurrency <n:number>", "Max simultaneous workers", { default: 3 })
  .option("--auth <mode:string>", "Auth mode: env or config", { default: "env" })
  .option("--api-key <key:string>", "Anthropic API key")
  .option("--repo <path:string>", "Git workspace to mount")
  .option("--max-iterations <n:number>", "Max iterations per worker", { default: 50 })
  .option("--memory <size:string>", "Container memory limit", { default: "512m" })
  .option("--image <name:string>", "Worker image", { default: "blackboard-worker:latest" })
  .option("--build", "Build worker image before starting")
  .action(async (options) => {
    await farmCommand(options);
  })
  .reset()

  // Thread subcommand group
  .command("thread", threadCommand)
  .reset()

  // Hook subcommand group
  .command("hook", hookCommand);
