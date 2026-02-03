/**
 * Shared utilities for command implementations.
 * Provides common patterns used across multiple commands.
 */

import {
  getCurrentThread,
  resolveThread,
  getPlanById,
} from "../db/queries.ts";

/**
 * Gets the plan ID from the current thread (most recently touched).
 * This is used by thread-aware commands that prefer the current thread's plan.
 *
 * @returns The current thread's plan ID, or null if no current thread or plan exists
 */
export function getTargetPlanId(): string | null {
  const thread = getCurrentThread();
  return thread?.current_plan_id ?? null;
}

/**
 * Gets the plan ID to use from a thread or plan identifier.
 * If threadOrPlan is provided, tries to resolve it as a thread name/ID first,
 * then falls back to treating it as a plan ID.
 * Otherwise uses the current thread (most recently touched).
 *
 * @param threadOrPlan - Optional thread name/ID or plan ID
 * @returns The plan ID, or null if not found
 */
export function getTargetPlanIdFromArg(threadOrPlan?: string): string | null {
  if (threadOrPlan) {
    // Try to resolve as thread first
    const thread = resolveThread(threadOrPlan);
    if (thread?.current_plan_id) {
      return thread.current_plan_id;
    }

    // Try as plan ID directly
    const plan = getPlanById(threadOrPlan);
    if (plan) {
      return plan.id;
    }

    return null;
  }

  // No explicit arg - use current thread's plan
  return getTargetPlanId();
}

/**
 * Conditionally logs a message to console if quiet mode is not enabled.
 *
 * @param message - The message to log
 * @param quiet - Whether quiet mode is enabled
 */
export function quietLog(message: string, quiet?: boolean): void {
  if (!quiet) {
    console.log(message);
  }
}

/**
 * Outputs data as formatted JSON to console.
 * Uses consistent formatting with 2-space indentation.
 *
 * @param data - The data to output as JSON
 */
export function outputJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}
