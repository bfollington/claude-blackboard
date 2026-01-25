/**
 * Step command - Manage plan steps.
 * Thread-aware: prefers current thread's plan over active plan.
 */

import { getDb } from "../db/connection.ts";
import {
  getCurrentThread,
  resolveThread,
  getActivePlan,
  getPlanById,
  getStepsForPlan,
  getStepById,
  insertStep,
  deleteStep,
  updateStepStatus,
  updateStepDescription,
  getMaxStepOrder,
} from "../db/queries.ts";
import type { StepStatus } from "../types/schema.ts";

interface StepListOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
  status?: StepStatus;
}

interface StepAddOptions {
  db?: string;
  quiet?: boolean;
  status?: StepStatus;
  position?: number;
}

interface StepUpdateOptions {
  db?: string;
  quiet?: boolean;
  status?: StepStatus;
  description?: string;
}

interface StepRemoveOptions {
  db?: string;
  quiet?: boolean;
  force?: boolean;
}

interface StepReorderOptions {
  db?: string;
  quiet?: boolean;
  position: number;
}

/**
 * Gets the plan ID to use, preferring current thread's plan.
 * If threadOrPlan is provided, tries to resolve it as a thread name/ID first,
 * then falls back to treating it as a plan ID.
 */
function getTargetPlanId(threadOrPlan?: string): string | null {
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
  const thread = getCurrentThread();
  if (thread?.current_plan_id) {
    return thread.current_plan_id;
  }

  // Fall back to active plan
  const activePlan = getActivePlan();
  return activePlan?.id ?? null;
}

/**
 * Formats a status indicator for display.
 */
function formatStatusIndicator(status: StepStatus): string {
  switch (status) {
    case 'completed':
      return '[x]';
    case 'in_progress':
      return '[~]';
    case 'failed':
      return '[!]';
    case 'skipped':
      return '[-]';
    case 'pending':
    default:
      return '[ ]';
  }
}

/**
 * List steps for a thread or plan.
 *
 * @param threadOrPlan - Thread name/ID or plan ID (optional, defaults to current thread)
 * @param options - Command options
 */
export async function stepListCommand(
  threadOrPlan: string | undefined,
  options: StepListOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get target plan
  const planId = getTargetPlanId(threadOrPlan);
  if (!planId) {
    console.error("Error: No active plan or thread found");
    Deno.exit(1);
  }

  // Get steps
  let steps = getStepsForPlan(planId);

  // Filter by status if requested
  if (options.status) {
    steps = steps.filter(s => s.status === options.status);
  }

  if (steps.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([]));
    } else if (!options.quiet) {
      console.log("No steps found");
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(steps, null, 2));
    return;
  }

  // Text output
  const plan = getPlanById(planId);
  if (!options.quiet && plan) {
    console.log(`Steps for plan: ${plan.description || plan.id}\n`);
  }

  for (const step of steps) {
    const indicator = formatStatusIndicator(step.status);
    const statusSuffix = step.status !== 'completed' && step.status !== 'pending'
      ? ` (${step.status})`
      : '';
    console.log(`${step.step_order}. ${indicator} ${step.description}${statusSuffix}`);
  }
}

/**
 * Add a new step to the current thread's plan.
 *
 * @param description - Step description
 * @param options - Command options
 */
export async function stepAddCommand(
  description: string,
  options: StepAddOptions
): Promise<void> {
  const db = getDb(options.db);

  // Get target plan (current thread only, no explicit plan arg)
  const planId = getTargetPlanId();
  if (!planId) {
    console.error("Error: No active plan or thread found");
    Deno.exit(1);
  }

  const status = options.status ?? 'pending';

  // If position is specified, we need to reorder existing steps
  if (options.position !== undefined) {
    const position = options.position;

    // Validate position
    const maxOrder = getMaxStepOrder(planId);
    if (position < 1 || position > maxOrder + 1) {
      console.error(`Error: Position must be between 1 and ${maxOrder + 1}`);
      Deno.exit(1);
    }

    // Get existing steps
    const existingSteps = getStepsForPlan(planId);

    // Start transaction
    db.exec("BEGIN TRANSACTION");

    try {
      // Insert new step at position
      const stepId = insertStep(planId, { description, status, step_order: position });

      // Renumber steps that come after
      const updateStmt = db.prepare(`
        UPDATE plan_steps
        SET step_order = step_order + 1
        WHERE plan_id = :planId AND step_order >= :position AND id != :stepId
      `);
      updateStmt.run({ planId, position, stepId });

      db.exec("COMMIT");

      if (!options.quiet) {
        console.log(`Step added at position ${position}: ${description}`);
      }
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else {
    // Append at end
    const stepId = insertStep(planId, { description, status });

    if (!options.quiet) {
      const maxOrder = getMaxStepOrder(planId);
      console.log(`Step added at position ${maxOrder}: ${description}`);
    }
  }
}

/**
 * Update a step's status or description.
 *
 * @param stepId - Step ID
 * @param options - Command options (must provide at least one of status or description)
 */
export async function stepUpdateCommand(
  stepId: string,
  options: StepUpdateOptions
): Promise<void> {
  const db = getDb(options.db);

  // Validate that at least one option is provided
  if (!options.status && !options.description) {
    console.error("Error: Must provide at least one of --status or --description");
    Deno.exit(1);
  }

  // Verify step exists
  const step = getStepById(stepId);
  if (!step) {
    console.error(`Error: Step "${stepId}" not found`);
    Deno.exit(1);
  }

  // Update fields
  if (options.status) {
    updateStepStatus(stepId, options.status);
  }
  if (options.description) {
    updateStepDescription(stepId, options.description);
  }

  if (!options.quiet) {
    const updates: string[] = [];
    if (options.status) updates.push(`status: ${options.status}`);
    if (options.description) updates.push(`description: ${options.description}`);
    console.log(`Step ${stepId} updated (${updates.join(', ')})`);
  }
}

/**
 * Remove a step from a plan.
 *
 * @param stepId - Step ID to remove
 * @param options - Command options
 */
export async function stepRemoveCommand(
  stepId: string,
  options: StepRemoveOptions
): Promise<void> {
  const db = getDb(options.db);

  // Verify step exists
  const step = getStepById(stepId);
  if (!step) {
    console.error(`Error: Step "${stepId}" not found`);
    Deno.exit(1);
  }

  // Warn if removing completed step without --force
  if (step.status === 'completed' && !options.force) {
    console.error("Error: Cannot remove completed step without --force flag");
    console.error(`Step: ${step.description}`);
    Deno.exit(1);
  }

  // Delete the step
  deleteStep(stepId);

  if (!options.quiet) {
    console.log(`Step removed: ${step.description}`);
  }
}

/**
 * Reorder a step to a new position.
 *
 * @param stepId - Step ID to reorder
 * @param options - Command options (requires --position)
 */
export async function stepReorderCommand(
  stepId: string,
  options: StepReorderOptions
): Promise<void> {
  const db = getDb(options.db);

  // Verify step exists
  const step = getStepById(stepId);
  if (!step) {
    console.error(`Error: Step "${stepId}" not found`);
    Deno.exit(1);
  }

  const newPosition = options.position;
  const oldPosition = step.step_order;

  // Validate new position
  const maxOrder = getMaxStepOrder(step.plan_id);
  if (newPosition < 1 || newPosition > maxOrder) {
    console.error(`Error: Position must be between 1 and ${maxOrder}`);
    Deno.exit(1);
  }

  if (newPosition === oldPosition) {
    if (!options.quiet) {
      console.log("Step is already at that position");
    }
    return;
  }

  // Start transaction
  db.exec("BEGIN TRANSACTION");

  try {
    if (newPosition < oldPosition) {
      // Moving up: increment steps between new and old position
      const updateStmt = db.prepare(`
        UPDATE plan_steps
        SET step_order = step_order + 1
        WHERE plan_id = :planId
          AND step_order >= :newPosition
          AND step_order < :oldPosition
      `);
      updateStmt.run({ planId: step.plan_id, newPosition, oldPosition });
    } else {
      // Moving down: decrement steps between old and new position
      const updateStmt = db.prepare(`
        UPDATE plan_steps
        SET step_order = step_order - 1
        WHERE plan_id = :planId
          AND step_order > :oldPosition
          AND step_order <= :newPosition
      `);
      updateStmt.run({ planId: step.plan_id, oldPosition, newPosition });
    }

    // Update the step itself
    const updateStepStmt = db.prepare(`
      UPDATE plan_steps
      SET step_order = :newPosition
      WHERE id = :stepId
    `);
    updateStepStmt.run({ stepId, newPosition });

    db.exec("COMMIT");

    if (!options.quiet) {
      console.log(`Step moved from position ${oldPosition} to ${newPosition}`);
    }
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
