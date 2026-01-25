#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-ffi --allow-run

/**
 * Blackboard CLI - Deno-based replacement for bash scripts
 *
 * Entry point for the blackboard command-line tool.
 * Provides safe SQL operations, hook handlers, and interactive commands.
 */

import { cli } from "./src/cli.ts";

if (import.meta.main) {
  await cli.parse(Deno.args);
}
