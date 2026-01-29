/**
 * Task reader utilities for Claude Code tasks.
 * Reads task files from ~/.claude/tasks/<session_id>/<task_id>.json
 */

import { getSessionsForThread, upsertTask, getPersistedTasksForThread } from "../db/queries.ts";
import { join } from "jsr:@std/path@^1.0.8";

export interface ClaudeTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: string;
  blocks: string[];
  blockedBy: string[];
}

/**
 * Gets the Claude tasks directory path (~/.claude/tasks)
 * @returns Absolute path to the tasks directory
 */
function getTasksDir(): string {
  const home = Deno.env.get("HOME");
  if (!home) {
    throw new Error("HOME environment variable not set");
  }
  return join(home, ".claude", "tasks");
}

/**
 * Reads a single task file and returns the parsed task.
 * @param filePath - Absolute path to the task JSON file
 * @returns Parsed task or null if file is invalid
 */
function readTaskFile(filePath: string): ClaudeTask | null {
  try {
    const content = Deno.readTextFileSync(filePath);
    const task = JSON.parse(content) as ClaudeTask;

    // Ensure required fields exist
    if (!task.id || !task.subject || !task.status) {
      return null;
    }

    // Ensure arrays exist
    task.blocks = task.blocks || [];
    task.blockedBy = task.blockedBy || [];

    return task;
  } catch {
    // Invalid JSON or file read error
    return null;
  }
}

/**
 * Gets tasks for a single session by reading ~/.claude/tasks/<sessionId>/*.json
 * Also persists tasks to the database for historical preservation.
 *
 * @param sessionId - Claude session ID
 * @param threadId - Thread ID (optional, for persisting tasks to DB)
 * @returns Array of tasks for the session (empty array if session has no tasks)
 */
export function getTasksForSession(sessionId: string, threadId?: string | null): ClaudeTask[] {
  const tasks: ClaudeTask[] = [];
  const sessionDir = join(getTasksDir(), sessionId);

  // Check if session directory exists
  try {
    const dirInfo = Deno.statSync(sessionDir);
    if (!dirInfo.isDirectory) {
      return tasks;
    }
  } catch {
    // Directory doesn't exist - no tasks for this session
    return tasks;
  }

  // Read all .json files in the session directory
  try {
    for (const entry of Deno.readDirSync(sessionDir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const taskPath = join(sessionDir, entry.name);
        const task = readTaskFile(taskPath);
        if (task) {
          tasks.push(task);

          // Persist task to database if threadId is provided
          if (threadId !== undefined) {
            try {
              upsertTask(sessionId, threadId, task);
            } catch {
              // Silently continue if DB persistence fails
            }
          }
        }
      }
    }
  } catch {
    // Error reading directory
    return tasks;
  }

  return tasks;
}

/**
 * Gets all tasks for a thread by:
 * 1. Getting all session_ids from thread_sessions table
 * 2. Reading tasks from each session directory (and persisting to DB)
 * 3. Returning combined list (later sessions' tasks appear after earlier ones)
 *
 * @param threadId - Thread ID
 * @returns Array of tasks from all sessions that worked on this thread
 */
export function getTasksForThread(threadId: string): ClaudeTask[] {
  const sessionIds = getSessionsForThread(threadId);
  const allTasks: ClaudeTask[] = [];

  // Get tasks from each session in order (oldest to newest)
  // Pass threadId to enable DB persistence
  for (const sessionId of sessionIds) {
    const sessionTasks = getTasksForSession(sessionId, threadId);
    allTasks.push(...sessionTasks);
  }

  return allTasks;
}

/**
 * Gets all tasks for a thread including historical tasks from the database.
 * Merges live filesystem tasks with persisted DB tasks:
 * - Filesystem tasks take precedence (they are current)
 * - DB-only tasks are added (they were deleted from filesystem)
 *
 * @param threadId - Thread ID
 * @returns Array of tasks including both live and historical tasks
 */
export function getTasksForThreadWithHistory(threadId: string): ClaudeTask[] {
  // Get live tasks from filesystem (also persists them to DB)
  const liveTasks = getTasksForThread(threadId);

  // Get persisted tasks from database
  const persistedTasks = getPersistedTasksForThread(threadId);

  // Create a map of live task IDs for quick lookup
  const liveTaskIds = new Set(liveTasks.map(t => t.id));

  // Merge: start with live tasks, add DB-only tasks
  const merged: ClaudeTask[] = [...liveTasks];

  for (const persistedTask of persistedTasks) {
    if (!liveTaskIds.has(persistedTask.id)) {
      // This task was deleted from filesystem but exists in DB
      merged.push({
        id: persistedTask.id,
        subject: persistedTask.subject,
        description: persistedTask.description ?? "",
        activeForm: persistedTask.activeForm ?? undefined,
        status: persistedTask.status,
        blocks: persistedTask.blocks,
        blockedBy: persistedTask.blockedBy,
      });
    }
  }

  return merged;
}
