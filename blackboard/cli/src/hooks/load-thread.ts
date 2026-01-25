/**
 * Hook to load a thread and output its context packet.
 * Used by /blackboard:thread skill.
 */

import { dbExists } from "../db/schema.ts";
import {
  resolveThread,
  touchThread,
  updateThread,
  getCurrentThread,
  setSessionState,
} from "../db/queries.ts";
import { generateContextPacket } from "../commands/thread.ts";
import { getCurrentGitBranch } from "../utils/git.ts";

/**
 * Load thread hook handler.
 * - Accepts thread name as argument
 * - Resolves thread by name or ID
 * - Updates thread's updated_at and git_branches
 * - Outputs context packet
 */
export async function loadThread(threadName?: string): Promise<void> {

  // Check database exists
  if (!dbExists()) {
    console.error("Error: Blackboard database not found. Run session start hook first.");
    Deno.exit(1);
  }

  // Resolve thread
  let thread;
  if (threadName) {
    thread = resolveThread(threadName);
    if (!thread) {
      console.error(`Error: Thread "${threadName}" not found`);
      console.error("");
      console.error("Create it with:");
      console.error(`  blackboard thread new ${threadName}`);
      Deno.exit(1);
    }
  } else {
    // No name provided - use current thread
    thread = getCurrentThread();
    if (!thread) {
      console.error("Error: No thread name provided and no active thread found");
      console.error("");
      console.error("Create a new thread with:");
      console.error("  blackboard thread new <name>");
      Deno.exit(1);
    }
  }

  // Touch thread to mark as active
  touchThread(thread.id);

  // Record explicit thread selection for this session
  setSessionState("selected_thread_id", thread.id);

  // Update git branches if we're on a new branch
  const currentBranch = getCurrentGitBranch();
  if (currentBranch) {
    const existingBranches = thread.git_branches?.split(",").filter(Boolean) || [];
    if (!existingBranches.includes(currentBranch)) {
      existingBranches.push(currentBranch);
      updateThread(thread.id, { git_branches: existingBranches.join(",") });
      // Refresh thread with updated branches
      thread = resolveThread(thread.id)!;
    }
  }

  // Output context packet
  const contextPacket = generateContextPacket(thread);
  console.log(contextPacket);
}
