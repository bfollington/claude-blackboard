/**
 * Cliffy command tree for blackboard CLI.
 * Defines all commands, subcommands, options, and arguments.
 */

import { Command } from "@cliffy/command";
import { resolveDbPath } from "./db/connection.ts";

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
  .action(() => {
    console.log("TODO: implement hook init-db");
  })
  .reset()
  .command("check-resume", "Check for active plan (SessionStart)")
  .action(() => {
    console.log("TODO: implement hook check-resume");
  })
  .reset()
  .command("store-plan", "Store plan from ExitPlanMode (PreToolUse)")
  .action(() => {
    console.log("TODO: implement hook store-plan");
  })
  .reset()
  .command(
    "inject-orchestration",
    "Output orchestration instructions (PostToolUse[ExitPlanMode])",
  )
  .action(() => {
    console.log("TODO: implement hook inject-orchestration");
  })
  .reset()
  .command("capture-todo", "Sync TodoWrite to steps (PostToolUse[TodoWrite])")
  .action(() => {
    console.log("TODO: implement hook capture-todo");
  })
  .reset()
  .command("update-step-status", "Mark step complete (SubagentStop)")
  .action(() => {
    console.log("TODO: implement hook update-step-status");
  })
  .reset()
  .command("prompt-reflect", "Suggest reflection (PreCompact)")
  .action(() => {
    console.log("TODO: implement hook prompt-reflect");
  });

/**
 * Main CLI command tree.
 * Includes interactive commands and hook handlers.
 */
export const cli = new Command()
  .name("blackboard")
  .version("0.3.0")
  .description("SQLite blackboard for Claude Code context sharing")
  .globalOption("-d, --db <path:string>", "Database path", {
    default: resolveDbPath(),
  })
  .globalOption("-q, --quiet", "Suppress non-essential output")
  .globalOption("--json", "Output as JSON")

  // Interactive commands
  .command("status", "Show current blackboard status")
  .action(() => {
    console.log("TODO: implement status");
  })
  .reset()

  .command("query", "Run ad-hoc SQL query")
  .arguments("<sql:string>")
  .action((_options, sql) => {
    console.log("TODO: implement query");
    console.log(`SQL: ${sql}`);
  })
  .reset()

  .command("crumb", "Record a breadcrumb")
  .arguments("<summary:string>")
  .option("-s, --step <id:string>", "Step ID")
  .option("-f, --files <list:string>", "Comma-separated file list")
  .option("-i, --issues <text:string>", "Issues encountered")
  .option("-n, --next <text:string>", "Context for next agent")
  .action((options, summary) => {
    console.log("TODO: implement crumb");
    console.log(`Summary: ${summary}`);
    console.log(`Options:`, options);
  })
  .reset()

  .command("oops", "Record a correction")
  .arguments("<mistake:string>")
  .option("-s, --symptoms <text:string>", "Error symptoms")
  .option("-f, --fix <text:string>", "Correct approach")
  .option("-t, --tags <list:string>", "Comma-separated tags")
  .action((options, mistake) => {
    console.log("TODO: implement oops");
    console.log(`Mistake: ${mistake}`);
    console.log(`Options:`, options);
  })
  .reset()

  .command("bug-report", "File a bug report")
  .arguments("<title:string>")
  .option("-s, --steps <text:string>", "Reproduction steps")
  .option("-e, --evidence <text:string>", "Error logs or evidence")
  .action((options, title) => {
    console.log("TODO: implement bug-report");
    console.log(`Title: ${title}`);
    console.log(`Options:`, options);
  })
  .reset()

  .command("reflect", "Capture a reflection")
  .arguments("[content:string]")
  .option("-t, --type <type:string>", "Reflection type")
  .action((options, content) => {
    console.log("TODO: implement reflect");
    console.log(`Content: ${content}`);
    console.log(`Options:`, options);
  })
  .reset()

  // Hook subcommand group
  .command("hook", hookCommand);
