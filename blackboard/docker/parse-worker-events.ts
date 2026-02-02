#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
/**
 * Parse Claude stream-json output and extract worker events.
 * Reads from stdin, parses tool calls and results, extracts file paths.
 * Inserts structured events into worker_events table.
 *
 * Usage: claude --output-format stream-json | parse-worker-events.ts <worker_id> <iteration> <db_path>
 */

import { Database } from "jsr:@db/sqlite@0.11";

const WORKER_ID = Deno.args[0];
const ITERATION = parseInt(Deno.args[1], 10);
const DB_PATH = Deno.args[2];

if (!WORKER_ID || isNaN(ITERATION) || !DB_PATH) {
  console.error("Usage: parse-worker-events.ts <worker_id> <iteration> <db_path>");
  Deno.exit(1);
}

// Open database connection
const db = new Database(DB_PATH);

/**
 * Insert a worker event into the database.
 */
function insertEvent(event: {
  event_type: string;
  tool_name?: string;
  tool_input?: string;
  tool_output_preview?: string;
  file_path?: string;
  duration_ms?: number;
}): void {
  try {
    const stmt = db.prepare(`
      INSERT INTO worker_events (
        worker_id, iteration, event_type, tool_name, tool_input,
        tool_output_preview, file_path, duration_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      WORKER_ID,
      ITERATION,
      event.event_type,
      event.tool_name ?? null,
      event.tool_input ?? null,
      event.tool_output_preview ?? null,
      event.file_path ?? null,
      event.duration_ms ?? null
    );
  } catch (error) {
    console.error(`Failed to insert event: ${error}`);
  }
}

/**
 * Extract file path from tool input based on tool name.
 */
function extractFilePath(toolName: string, input: any): string | undefined {
  if (!input || typeof input !== "object") return undefined;

  // File operation tools
  if (["Read", "Edit", "Write"].includes(toolName)) {
    return input.file_path;
  }

  // Search tools
  if (toolName === "Glob") {
    // Glob doesn't have a single file path, but we can track the pattern
    return input.pattern ? `glob:${input.pattern}` : undefined;
  }

  if (toolName === "Grep") {
    // Grep may have a path parameter
    return input.path;
  }

  return undefined;
}

/**
 * Truncate output to a reasonable preview length.
 */
function truncateOutput(output: string, maxLength = 500): string {
  if (output.length <= maxLength) return output;
  return output.substring(0, maxLength) + "...";
}

/**
 * Process a stream-json event from Claude.
 */
function processEvent(line: string): void {
  try {
    const event = JSON.parse(line);

    // Handle message_start events
    if (event.type === "message_start") {
      // Could track message metadata if needed
      return;
    }

    // Handle content_block_start for tool_use
    if (event.type === "content_block_start") {
      const block = event.content_block;
      if (block?.type === "tool_use") {
        insertEvent({
          event_type: "tool_call",
          tool_name: block.name,
          tool_input: JSON.stringify(block.input || {}),
          file_path: extractFilePath(block.name, block.input),
        });
      }
      return;
    }

    // Handle content_block_delta for text chunks
    if (event.type === "content_block_delta") {
      const delta = event.delta;
      if (delta?.type === "text_delta" && delta.text) {
        // Store text deltas (could be tool thinking or responses)
        insertEvent({
          event_type: "text",
          tool_output_preview: truncateOutput(delta.text),
        });
      }
      return;
    }

    // Handle message_delta for stop reasons
    if (event.type === "message_delta") {
      if (event.delta?.stop_reason) {
        insertEvent({
          event_type: "system",
          tool_output_preview: `stop_reason: ${event.delta.stop_reason}`,
        });
      }
      return;
    }

    // Handle error events
    if (event.type === "error") {
      insertEvent({
        event_type: "error",
        tool_output_preview: JSON.stringify(event.error || event),
      });
      return;
    }

    // For tool results, we need to look at the message content
    // These come in as regular message objects with role=user
    if (event.type === "message" && event.role === "user") {
      const content = event.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "tool_result") {
            insertEvent({
              event_type: "tool_result",
              tool_name: block.tool_use_id ? `result:${block.tool_use_id}` : undefined,
              tool_output_preview: typeof block.content === "string"
                ? truncateOutput(block.content)
                : truncateOutput(JSON.stringify(block.content)),
            });
          }
        }
      }
      return;
    }

  } catch (error) {
    // Ignore parse errors - not all lines are JSON
    // (Claude may output non-JSON text)
  }
}

// Read from stdin line by line
const decoder = new TextDecoder();
for await (const chunk of Deno.stdin.readable) {
  const text = decoder.decode(chunk);
  const lines = text.split("\n");

  for (const line of lines) {
    if (line.trim()) {
      processEvent(line);
      // Also pass through to stdout for logging
      console.log(line);
    }
  }
}

db.close();
