/**
 * SessionStart hook - Check for active plan with pending steps and offer to resume.
 * Matches behavior of blackboard/scripts/check-resume.sh
 */

import { dbExists } from "../db/schema.ts";
import { getActivePlan, getStepsForPlan } from "../db/queries.ts";

/**
 * Check resume hook handler.
 * - Checks if database exists (exit 0 if not)
 * - Queries for active plan with pending steps
 * - If found, outputs systemMessage with resume instructions
 * - If not found, exits silently
 */
export async function checkResume(): Promise<void> {
  // Check database exists
  if (!dbExists()) {
    Deno.exit(0);
  }

  // Get active plan
  const plan = getActivePlan();
  if (!plan) {
    Deno.exit(0);
  }

  // Get steps for plan
  const steps = getStepsForPlan(plan.id);
  const pendingSteps = steps.filter((s) =>
    s.status === "pending" || s.status === "in_progress"
  );

  if (pendingSteps.length === 0) {
    Deno.exit(0);
  }

  // Calculate step counts
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = steps.length;
  const pendingCount = pendingSteps.length;

  // Build resume prompt
  const prompt = `## Active Plan Detected: ${plan.id}

**"${plan.description}"** - ${completedCount}/${totalCount} steps completed, ${pendingCount} remaining.

To resume this plan:

1. **Check context** - Query recent breadcrumbs to see where we left off:
   \`\`\`bash
   blackboard query "SELECT summary, issues, next_context FROM breadcrumbs WHERE plan_id='${plan.id}' ORDER BY created_at DESC LIMIT 5"
   \`\`\`

2. **Execute pending steps** using subagents:
   - Spawn Task tools with \`subagent_type: "blackboard:implementer"\`
   - Pass explicitly: plan_id="${plan.id}" and the step_id(s) being worked on
   - Subagents record breadcrumbs via \`blackboard crumb\`

3. **Step status** updates automatically via SubagentStop hook.

4. **Completion**: When all steps done, run /reflect.

Run \`/blackboard:status\` to see full details, or say "continue" to resume work.`;

  // Output JSON with systemMessage
  console.log(
    JSON.stringify({
      systemMessage: prompt,
    }),
  );
}
