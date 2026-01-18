/**
 * PostToolUse[ExitPlanMode] hook - Inject orchestration instructions.
 * Matches behavior of blackboard/scripts/inject-orchestration.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { getActivePlan } from "../db/queries.ts";

interface PostToolUseInput {
  tool_name?: string;
  [key: string]: unknown;
}

/**
 * Inject orchestration hook handler.
 * - Reads JSON from stdin (PostToolUseInput)
 * - Verifies tool_name === "ExitPlanMode", exits if not
 * - Gets the active plan that was just stored
 * - Outputs orchestration instructions as additionalContext
 */
export async function injectOrchestration(): Promise<void> {
  const input = await readStdin<PostToolUseInput>();

  // Check if this is ExitPlanMode
  if (input.tool_name !== "ExitPlanMode") {
    Deno.exit(0);
  }

  // Get active plan
  const plan = getActivePlan();
  if (!plan) {
    Deno.exit(0);
  }

  // Build orchestration prompt (matches the template from bash script)
  const prompt = `## Plan Stored: ${plan.id}

The plan "${plan.description}" has been stored in the blackboard. Now execute it:

1. **Create steps**: Use TodoWrite to break this plan into discrete, ordered steps. Each todo item becomes a plan_step in the database.

2. **Staged execution**: Implement steps using subagents. For each batch of parallelizable steps:
   - Spawn Task tools with the implementer subagent
   - Pass explicitly in the prompt: plan_id="${plan.id}" and the step_id(s) being worked on
   - Subagents will record breadcrumbs using \`blackboard crumb\`
   - ALWAYS use a subagent, even for trivial, serial changes to conserve the root context window

3. **Context continuity**: Before spawning each batch, query recent breadcrumbs:
   \`\`\`bash
   blackboard query "SELECT summary, issues, next_context FROM breadcrumbs WHERE plan_id='${plan.id}' ORDER BY created_at DESC LIMIT 5"
   \`\`\`

4. **Step status**: After each subagent completes, the step status updates automatically via the SubagentStop hook.

5. **Completion**: When all steps are done, run /reflect to capture lessons learned.

Begin by creating the steps with TodoWrite.`;

  // Output JSON with additionalContext
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: prompt,
      },
    }),
  );
}
