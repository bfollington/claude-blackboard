/**
 * Reflect command - Capture a reflection on the current session or plan.
 */

import { getDb } from "../db/connection.ts";
import { getActivePlan } from "../db/queries.ts";

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

  // Get active plan (optional - reflections can exist without a plan)
  const activePlan = getActivePlan();
  const planId = activePlan?.id ?? null;

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
  const refId = crypto.randomUUID().replace(/-/g, "").substring(0, 8);

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

  if (!options.quiet) {
    console.log(`Reflection ${refId} recorded`);
  }
}
