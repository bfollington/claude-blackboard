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
} from "./hooks/mod.ts";
import {
  statusCommand,
  queryCommand,
  crumbCommand,
  oopsCommand,
  bugReportCommand,
  reflectCommand,
  installCommand,
} from "./commands/mod.ts";

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

  // Hook subcommand group
  .command("hook", hookCommand);
