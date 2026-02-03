/**
 * Status command - Display thread-centric blackboard status.
 * Shows recent threads, current session, and quick actions.
 */

import { getDb } from "../db/connection.ts";
import {
  listThreads,
  getStepsForPlan,
  getOpenBugReports,
  getCurrentThread,
} from "../db/queries.ts";
import { formatTable } from "../output/table.ts";
import { formatLocalTime, relativeTime } from "../utils/time.ts";
import { getTasksForThreadWithHistory } from "../utils/tasks.ts";
import { outputJson } from "../utils/command.ts";

interface StatusOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
}

interface ThreadWithProgress {
  id: string;
  name: string;
  status: string;
  updated_at: string;
  current_plan_id: string | null;
  completedSteps: number;
  totalSteps: number;
}

/**
 * Display thread-centric blackboard status.
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const db = getDb(options.db);

  // Get recent threads (last 10)
  const threads = listThreads(undefined, 10);

  // Get step progress for each thread
  const threadsWithProgress: ThreadWithProgress[] = threads.map(thread => {
    let completedSteps = 0;
    let totalSteps = 0;

    if (thread.current_plan_id) {
      const steps = getStepsForPlan(thread.current_plan_id);
      totalSteps = steps.length;
      completedSteps = steps.filter(s => s.status === 'completed').length;
    }

    return {
      id: thread.id,
      name: thread.name,
      status: thread.status,
      updated_at: thread.updated_at,
      current_plan_id: thread.current_plan_id,
      completedSteps,
      totalSteps,
    };
  });

  // Get current thread (active session)
  const currentThread = getCurrentThread();

  // Get open bug reports
  const bugReports = getOpenBugReports(5);

  // Get recent breadcrumbs across all threads
  const recentBreadcrumbs = queryAll(db, `
    SELECT created_at, agent_type, substr(summary, 1, 60) as summary
    FROM breadcrumbs
    ORDER BY created_at DESC
    LIMIT 5
  `);

  if (options.json) {
    // JSON mode - return structured data
    const data = {
      recentThreads: threadsWithProgress.map(t => ({
        name: t.name,
        status: t.status,
        stepsCompleted: t.completedSteps,
        stepsTotal: t.totalSteps,
        lastActivity: t.updated_at,
        relativeTime: relativeTime(t.updated_at),
      })),
      currentThread: currentThread ? {
        name: currentThread.name,
        status: currentThread.status,
      } : null,
      openBugReports: bugReports.map(b => ({
        id: b.id,
        title: b.title,
        created_at: b.created_at,
      })),
      recentActivity: recentBreadcrumbs.map(b => ({
        time: formatLocalTime(b.created_at),
        agent_type: b.agent_type || 'unknown',
        summary: b.summary,
      })),
    };
    outputJson(data);
    return;
  }

  // Table mode - format as readable output
  if (!options.quiet) {
    console.log("\n=== Blackboard Status ===\n");
  }

  // Recent Threads
  console.log("Recent Threads:");
  if (threadsWithProgress.length > 0) {
    const threadRows = threadsWithProgress.map(t => {
      // Status indicator
      let indicator = '';
      switch (t.status) {
        case 'active':
          indicator = '●';
          break;
        case 'completed':
          indicator = '✓';
          break;
        case 'paused':
          indicator = '◌';
          break;
        case 'archived':
          indicator = '▪';
          break;
        default:
          indicator = '○';
      }

      const progress = t.totalSteps > 0 ? `${t.completedSteps}/${t.totalSteps} steps` : 'no steps';
      const time = relativeTime(t.updated_at);

      return [
        `${indicator} ${t.name}`,
        `[${t.status}]`,
        progress,
        time,
      ];
    });

    console.log(formatTable(
      ["Thread", "Status", "Progress", "Last Activity"],
      threadRows
    ));
  } else {
    console.log("  (no threads)");
  }
  console.log();

  // Current Session
  if (currentThread) {
    console.log("Current Session:");
    console.log(`  Active thread: ${currentThread.name} [${currentThread.status}]`);
    if (currentThread.current_plan_id) {
      const steps = getStepsForPlan(currentThread.current_plan_id);
      const completed = steps.filter(s => s.status === 'completed').length;
      console.log(`  Progress: ${completed}/${steps.length} steps completed`);
    }

    // Show tasks for current thread
    const tasks = getTasksForThreadWithHistory(currentThread.id);
    if (tasks.length > 0) {
      const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
      const completedTasks = tasks.filter(t => t.status === 'completed');
      console.log(`  Tasks: ${completedTasks.length}/${tasks.length} completed`);
    }

    console.log();
  }

  // Quick Actions
  console.log("Quick Actions:");
  console.log("  /blackboard:thread <name>    Load thread context interactively");
  console.log("  blackboard work <name>       Start working on a thread");
  console.log("  blackboard status            Show this status");
  console.log();

  // Open Bug Reports
  console.log("Open Issues:");
  if (bugReports.length > 0) {
    const bugRows = bugReports.map(b => [
      b.id.substring(0, 8),
      b.title.substring(0, 50),
      relativeTime(b.created_at),
    ]);
    console.log(formatTable(
      ["ID", "Title", "Created"],
      bugRows
    ));
  } else {
    console.log("  (no open bug reports)");
  }
  console.log();

  // Recent Activity
  console.log("Recent Activity:");
  if (recentBreadcrumbs.length > 0) {
    const activityRows = recentBreadcrumbs.map(b => [
      formatLocalTime(b.created_at),
      `[${b.agent_type || 'unknown'}]`,
      b.summary,
    ]);
    console.log(formatTable(
      ["Time", "Agent", "Summary"],
      activityRows
    ));
  } else {
    console.log("  (no recent activity)");
  }
  console.log();
}

// Helper function for querying
function queryAll(db: any, sql: string): any[] {
  const stmt = db.prepare(sql);
  return stmt.all();
}
