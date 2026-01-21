/**
 * PostToolUse[ExitPlanMode] hook - Inject orchestration instructions.
 * Thread-aware version that references the current thread.
 */

import { readStdin } from "../utils/stdin.ts";
import { getActivePlan, getCurrentThread } from "../db/queries.ts";

interface PostToolUseInput {
  tool_name?: string;
  [key: string]: unknown;
}

/**
 * Inject orchestration hook handler.
 * - Reads JSON from stdin (PostToolUseInput)
 * - Verifies tool_name === "ExitPlanMode", exits if not
 * - Gets the active plan and current thread
 * - Outputs thread-aware orchestration instructions
 */
export async function injectOrchestration(): Promise<void> {
  const input = await readStdin<PostToolUseInput>();

  // Check if this is ExitPlanMode
  if (input.tool_name !== "ExitPlanMode") {
    Deno.exit(0);
  }

  // Get active plan and current thread
  const plan = getActivePlan();
  if (!plan) {
    Deno.exit(0);
  }

  const thread = getCurrentThread();
  const threadInfo = thread
    ? `Thread: **${thread.name}** | `
    : "";

  // Build thread-aware orchestration prompt
  const prompt = `## Plan Stored: ${plan.id}

${threadInfo}Plan: "${plan.description}"

The plan has been stored and associated with ${thread ? `thread "${thread.name}"` : "an auto-created thread"}. Now execute it:

### 1. Create Steps
Use TodoWrite to break this plan into discrete, ordered steps. Each todo becomes a tracked plan_step.

### 2. Staged Execution
Implement steps using the \`blackboard:implementer\` subagent:

\`\`\`
Task tool with subagent_type: "blackboard:implementer"
Prompt: "Implement step X: <description>. Plan ID: ${plan.id}"
\`\`\`

- Subagents record breadcrumbs automatically via \`blackboard crumb\`
- ALWAYS use subagents to conserve root context window
- Parallelize independent steps when possible

### 3. Context Continuity
Before each batch, check recent progress:
\`\`\`bash
blackboard query "SELECT summary, issues FROM breadcrumbs WHERE plan_id='${plan.id}' ORDER BY created_at DESC LIMIT 5"
\`\`\`

### 4. Progress Tracking
- Step status updates automatically when subagents complete
- Use \`/crumb <summary>\` for manual progress notes
- Use \`/oops <mistake>\` if you make a correctable error
- Use \`/bug-report <title> --steps <repro>\` if blocked

### 5. Completion
When all steps are done:
1. Run \`/reflect\` to capture lessons learned
2. The thread remains available for future sessions

${thread ? `To reload this thread later: \`/blackboard:thread ${thread.name}\`` : ""}

**Begin by creating the steps with TodoWrite.**`;

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
