/**
 * Reflect command - Capture a reflection on the current session or plan.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import { getTargetPlanId, quietLog } from "../utils/command.ts";
import { generateId } from "../utils/id.ts";

interface ReflectOptions {
  db?: string;
  quiet?: boolean;
  trigger?: string;
}

/**
 * Record a reflection in the database.
 *
 * @param content - Optional reflection content (if not provided, will be prompted)
 * @param options - Command options
 */
export async function reflectCommand(
  content: string | undefined,
  options: ReflectOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get target plan (optional - reflections can exist without a plan)
  const planId = getTargetPlanId();

  // If no content provided, prompt for it
  let reflectionContent = content;
  if (!reflectionContent) {
    console.log("Enter reflection (Ctrl+D to finish):");
    const lines: string[] = [];
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(1024);

    while (true) {
      const n = await Deno.stdin.read(buffer);
      if (n === null) break; // EOF
      lines.push(decoder.decode(buffer.subarray(0, n)));
    }

    reflectionContent = lines.join("");
    if (!reflectionContent.trim()) {
      console.error("Error: Reflection content cannot be empty");
      Deno.exit(1);
    }
  }

  // Generate ID
  const refId = generateId();

  // Determine trigger type
  const trigger = options.trigger ?? "manual";

  // Insert reflection
  const stmt = db.prepare(`
    INSERT INTO reflections (
      id, plan_id, trigger, content
    )
    VALUES (
      :id, :plan_id, :trigger, :content
    )
  `);

  stmt.run({
    id: refId,
    plan_id: planId,
    trigger: trigger,
    content: reflectionContent,
  });

  quietLog(`Reflection ${refId} recorded`, options.quiet);
}
