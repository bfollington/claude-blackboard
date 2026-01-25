/**
 * Thread command - Manage work threads that persist across sessions.
 */

import { getDb } from "../db/connection.ts";
import {
  getCurrentThread,
  resolveThread,
  insertThread,
  updateThread,
  touchThread,
  listThreads,
  getStepsForPlan,
  getRecentBreadcrumbs,
  getOpenBugReports,
  getPlanById,
  updatePlanMarkdown,
  insertPlan,
} from "../db/queries.ts";
import { generateId } from "../utils/id.ts";
import type { Thread, ThreadStatus } from "../types/schema.ts";

interface ThreadNewOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
}

interface ThreadListOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  status?: ThreadStatus;
}

interface ThreadStatusOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  brief?: boolean;
}

interface ThreadWorkOptions {
  db?: string;
  quiet?: boolean;
}

interface ThreadPlanOptions {
  db?: string;
  quiet?: boolean;
  file?: string;
}

/**
 * Validates that a thread name is kebab-case.
 */
function isValidThreadName(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

/**
 * Gets the current git branch.
 */
function getCurrentGitBranch(): string | null {
  try {
    const command = new Deno.Command("git", {
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const result = command.outputSync();
    if (result.success) {
      return new TextDecoder().decode(result.stdout).trim();
    }
  } catch {
    // Not in a git repo or git not available
  }
  return null;
}

/**
 * Formats a relative time string from ISO datetime.
 */
function relativeTime(isoDate: string): string {
  const date = new Date(isoDate + "Z"); // Assume UTC
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return isoDate.split("T")[0];
}

/**
 * Create a new thread.
 */
export async function threadNewCommand(
  name: string,
  options: ThreadNewOptions
): Promise<void> {
  if (!isValidThreadName(name)) {
    console.error(
      "Error: Thread name must be kebab-case (lowercase letters, numbers, hyphens)"
    );
    console.error("Examples: auth-refactor, fix-bug-123, feature-dark-mode");
    Deno.exit(1);
  }

  // Check if thread already exists
  const existing = resolveThread(name);
  if (existing) {
    console.error(`Error: Thread "${name}" already exists`);
    Deno.exit(1);
  }

  const threadId = generateId();
  const gitBranch = getCurrentGitBranch();

  insertThread({
    id: threadId,
    name,
    current_plan_id: null,
    git_branches: gitBranch,
    status: "active",
  });

  if (options.json) {
    console.log(JSON.stringify({ id: threadId, name, git_branch: gitBranch }));
  } else if (!options.quiet) {
    console.log(`Thread "${name}" created (${threadId})`);
    if (gitBranch) {
      console.log(`Git branch: ${gitBranch}`);
    }
    console.log(`\nUse /blackboard:thread ${name} to load this thread`);
  }
}

/**
 * List all threads.
 */
export async function threadListCommand(
  options: ThreadListOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get threads with pending step counts
  const threads = listThreads(options.status);

  if (threads.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([]));
    } else if (!options.quiet) {
      console.log("No threads found");
      console.log("\nCreate one with: blackboard thread new <name>");
    }
    return;
  }

  if (options.json) {
    // Enrich with pending counts
    const enriched = threads.map((t) => {
      let pendingCount = 0;
      if (t.current_plan_id) {
        const steps = getStepsForPlan(t.current_plan_id);
        pendingCount = steps.filter(
          (s) => s.status === "pending" || s.status === "in_progress"
        ).length;
      }
      return { ...t, pending_steps: pendingCount };
    });
    console.log(JSON.stringify(enriched, null, 2));
    return;
  }

  // Table output
  console.log("Threads:\n");
  for (const t of threads) {
    let pendingCount = 0;
    let planSummary = "no plan";
    if (t.current_plan_id) {
      const steps = getStepsForPlan(t.current_plan_id);
      pendingCount = steps.filter(
        (s) => s.status === "pending" || s.status === "in_progress"
      ).length;
      const completedCount = steps.filter((s) => s.status === "completed").length;
      planSummary = `${completedCount}/${steps.length} steps`;
    }

    const statusIcon =
      t.status === "active"
        ? "●"
        : t.status === "paused"
        ? "○"
        : t.status === "completed"
        ? "✓"
        : "◌";

    const pendingStr = pendingCount > 0 ? ` (${pendingCount} pending)` : "";
    console.log(
      `  ${statusIcon} ${t.name}${pendingStr} - ${planSummary} - ${relativeTime(t.updated_at)}`
    );
  }
}

/**
 * Show detailed thread status.
 */
export async function threadStatusCommand(
  name: string | undefined,
  options: ThreadStatusOptions
): Promise<void> {
  const db = getDb(options.db);

  // Resolve thread
  let thread: Thread | null;
  if (name) {
    thread = resolveThread(name);
    if (!thread) {
      console.error(`Error: Thread "${name}" not found`);
      Deno.exit(1);
    }
  } else {
    thread = getCurrentThread();
    if (!thread) {
      console.error("Error: No active thread found");
      console.error("\nCreate one with: blackboard thread new <name>");
      Deno.exit(1);
    }
  }

  if (options.json) {
    const result: Record<string, unknown> = { ...thread };

    if (thread.current_plan_id) {
      const steps = getStepsForPlan(thread.current_plan_id);
      const breadcrumbs = getRecentBreadcrumbs(thread.current_plan_id, 5);
      result.steps = steps;
      result.recent_breadcrumbs = breadcrumbs;
    }

    const bugs = getOpenBugReports(5);
    result.open_bugs = bugs;

    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Text output
  console.log(`## Thread: ${thread.name}`);
  console.log(`Status: ${thread.status} | ID: ${thread.id}`);
  if (thread.git_branches) {
    console.log(`Git branches: ${thread.git_branches}`);
  }
  console.log(`Last updated: ${relativeTime(thread.updated_at)}`);
  console.log();

  if (!thread.current_plan_id) {
    console.log("No plan yet - use planning mode to create one");
    return;
  }

  // Get plan details
  const stmt = db.prepare("SELECT * FROM plans WHERE id = :id");
  const plans = stmt.all({ id: thread.current_plan_id }) as Array<{
    description: string | null;
    plan_markdown: string;
  }>;
  const plan = plans[0];

  if (plan) {
    console.log(`## Current Plan: ${plan.description || "(no description)"}`);
    if (!options.brief) {
      console.log();
      console.log(plan.plan_markdown);
      console.log();
    }
  }

  // Steps
  const steps = getStepsForPlan(thread.current_plan_id);
  if (steps.length > 0) {
    console.log("## Steps");
    const currentStep = steps.find(
      (s) => s.status === "pending" || s.status === "in_progress"
    );
    for (const step of steps) {
      const check = step.status === "completed" ? "[x]" : "[ ]";
      const current = step.id === currentStep?.id ? " ← CURRENT" : "";
      const statusSuffix =
        step.status !== "completed" && step.status !== "pending"
          ? ` (${step.status})`
          : "";
      console.log(`- ${check} ${step.description}${statusSuffix}${current}`);
    }
    console.log();
  }

  // Recent breadcrumbs
  const breadcrumbs = getRecentBreadcrumbs(thread.current_plan_id, 5);
  if (breadcrumbs.length > 0 && !options.brief) {
    console.log("## Recent Breadcrumbs");
    for (const crumb of breadcrumbs) {
      const time = crumb.created_at.split("T")[1]?.split(".")[0] || "";
      console.log(`- ${time}: ${crumb.summary}`);
    }
    console.log();
  }

  // Open bugs
  const bugs = getOpenBugReports(3);
  if (bugs.length > 0) {
    console.log("## Open Issues");
    for (const bug of bugs) {
      console.log(`- ${bug.id}: ${bug.title}`);
    }
  }
}

/**
 * Launch Claude with thread context (REPL mode).
 */
export async function threadWorkCommand(
  name: string,
  options: ThreadWorkOptions
): Promise<void> {
  const thread = resolveThread(name);
  if (!thread) {
    console.error(`Error: Thread "${name}" not found`);
    Deno.exit(1);
  }

  // Touch the thread to mark it as active
  touchThread(thread.id);

  // Update git branches if we're on a new branch
  const currentBranch = getCurrentGitBranch();
  if (currentBranch) {
    const existingBranches = thread.git_branches?.split(",") || [];
    if (!existingBranches.includes(currentBranch)) {
      existingBranches.push(currentBranch);
      updateThread(thread.id, { git_branches: existingBranches.join(",") });
    }
  }

  // Launch Claude with the thread skill
  const command = new Deno.Command("claude", {
    args: ["-p", `/blackboard:thread ${thread.name}`, "--dangerously-skip-permissions"],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!options.quiet) {
    console.log(`Launching Claude with thread "${thread.name}"...`);
  }

  const child = command.spawn();
  const status = await child.status;
  Deno.exit(status.code);
}

/**
 * Opens content in the user's editor and returns the edited content.
 * Creates a temp file, waits for the editor to close, then reads the result.
 */
async function openInEditor(content: string): Promise<string | null> {
  // Create temp file with .md extension
  const tempFile = await Deno.makeTempFile({ suffix: ".md" });

  try {
    // Write initial content
    await Deno.writeTextFile(tempFile, content);

    // Get editor from env (VISUAL first, then EDITOR, default to vim)
    const editor = Deno.env.get("VISUAL") || Deno.env.get("EDITOR") || "vim";

    // Split editor command to handle cases like "code --wait"
    const editorParts = editor.split(/\s+/);
    const editorCmd = editorParts[0];
    const editorArgs = editorParts.slice(1);

    // Open editor and wait for it to close
    const command = new Deno.Command(editorCmd, {
      args: [...editorArgs, tempFile],
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const child = command.spawn();
    const status = await child.status;

    if (!status.success) {
      console.error("Editor exited with error");
      return null;
    }

    // Read the edited content
    const editedContent = await Deno.readTextFile(tempFile);
    return editedContent;
  } finally {
    // Clean up temp file
    try {
      await Deno.remove(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Edit or create a plan for a thread.
 * If a file path is provided, reads the plan from that file.
 * Otherwise, opens an external editor.
 */
export async function threadPlanCommand(
  name: string,
  options: ThreadPlanOptions
): Promise<void> {
  const thread = resolveThread(name);
  if (!thread) {
    console.error(`Error: Thread "${name}" not found`);
    Deno.exit(1);
  }

  let result: string | null = null;

  // If file provided, read from it directly
  if (options.file) {
    try {
      result = await Deno.readTextFile(options.file);
    } catch (err) {
      console.error(`Error reading file "${options.file}": ${err instanceof Error ? err.message : err}`);
      Deno.exit(1);
    }
  } else {
    // Get existing plan or create template for editor
    let content = '';

    if (thread.current_plan_id) {
      const plan = getPlanById(thread.current_plan_id);
      content = plan?.plan_markdown || '';
    } else {
      // Create a template for new plans
      content = `# ${name}\n\n## Overview\n\n## Steps\n\n1. \n2. \n3. \n`;
    }

    // Open in editor, wait for save
    result = await openInEditor(content);

    if (!result) {
      console.error("Failed to get edited content");
      Deno.exit(1);
    }

    // Check if content changed (only for editor mode)
    if (result === content) {
      if (!options.quiet) {
        console.log("No changes made");
      }
      return;
    }
  }

  // Update existing plan or create new one
  if (thread.current_plan_id) {
    updatePlanMarkdown(thread.current_plan_id, result);
    if (!options.quiet) {
      console.log(`Plan updated for thread "${name}"`);
    }
  } else {
    // Create new plan
    const planId = generateId();
    const description = result.split('\n')[0]?.replace(/^#\s*/, '').trim() || 'Untitled';

    insertPlan({
      id: planId,
      status: 'accepted',
      description,
      plan_markdown: result,
      session_id: null,
      thread_id: thread.id,
    });

    updateThread(thread.id, { current_plan_id: planId });

    if (!options.quiet) {
      console.log(`Plan created for thread "${name}"`);
    }
  }
}

/**
 * Generate context packet for a thread (used by /blackboard:thread skill).
 */
export function generateContextPacket(thread: Thread): string {
  const db = getDb();
  const lines: string[] = [];

  lines.push(`## Thread: ${thread.name}`);
  lines.push(`Status: ${thread.status} | Git branches: ${thread.git_branches || "none"}`);
  lines.push("");

  // Current Plan
  lines.push("## Current Plan");
  if (!thread.current_plan_id) {
    lines.push("No plan yet - use planning mode to create one");
  } else {
    const stmt = db.prepare("SELECT * FROM plans WHERE id = :id");
    const plans = stmt.all({ id: thread.current_plan_id }) as Array<{
      plan_markdown: string;
    }>;
    if (plans[0]) {
      lines.push(plans[0].plan_markdown);
    }
  }
  lines.push("");

  // Steps
  if (thread.current_plan_id) {
    const steps = getStepsForPlan(thread.current_plan_id);
    if (steps.length > 0) {
      lines.push("## Steps");
      const currentStep = steps.find(
        (s) => s.status === "pending" || s.status === "in_progress"
      );
      for (const step of steps) {
        const check = step.status === "completed" ? "[x]" : "[ ]";
        const current = step.id === currentStep?.id ? " ← CURRENT" : "";
        lines.push(`- ${check} ${step.description}${current}`);
      }
      lines.push("");
    }

    // Recent breadcrumbs
    const breadcrumbs = getRecentBreadcrumbs(thread.current_plan_id, 5);
    if (breadcrumbs.length > 0) {
      lines.push("## Recent Breadcrumbs");
      for (const crumb of breadcrumbs.reverse()) {
        const time = crumb.created_at.split("T")[1]?.split(".")[0] || "";
        const stepRef = crumb.step_id ? `[step]` : "";
        lines.push(`- ${time} ${stepRef}: ${crumb.summary}`);
      }
      lines.push("");
    }
  }

  // Open bugs
  const bugs = getOpenBugReports(5);
  if (bugs.length > 0) {
    lines.push("## Open Issues");
    for (const bug of bugs) {
      lines.push(`- ${bug.id}: ${bug.title}`);
    }
    lines.push("");
  }

  // Orchestration instructions
  lines.push("---");
  lines.push("");
  lines.push("## Orchestration");
  lines.push("");
  lines.push(`You are working on thread "${thread.name}". Your workflow:`);
  lines.push("");
  lines.push(
    "1. **If no plan exists**: Enter planning mode, design the approach, exit plan mode. The plan will be stored automatically."
  );
  lines.push("");
  lines.push("2. **If plan exists with pending steps**:");
  lines.push("   - Use the `blackboard:implementer` subagent to work on pending steps");
  lines.push("   - The implementer will record breadcrumbs as it works");
  lines.push("   - Steps are marked complete automatically when breadcrumbs reference them");
  lines.push("");
  lines.push("3. **Recording progress**:");
  lines.push("   - Use `/crumb <summary>` to record progress (auto-associates with current thread)");
  lines.push("   - Use `/oops <mistake>` if you make a correctable error");
  lines.push("   - Use `/bug-report <title> --steps <repro>` if blocked");
  lines.push("");
  lines.push(
    "4. **When stuck or session ending**: Use `/reflect` to capture learnings before context compaction."
  );
  lines.push("");
  lines.push("5. **Switching threads**: Invoke `/blackboard:thread <other-name>` to switch context.");
  lines.push("");
  lines.push("Continue with the current thread now.");

  return lines.join("\n");
}
