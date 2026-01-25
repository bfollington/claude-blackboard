/**
 * Logs command - View worker logs.
 */

import { getDb } from "../db/connection.ts";

interface LogsOptions {
  db?: string;
  stream?: string;
  tail?: number;
  follow?: boolean;
  iteration?: number;
}

interface WorkerLog {
  id: number;
  worker_id: string;
  timestamp: string;
  stream: string;
  line: string;
  iteration: number | null;
}

/**
 * Formats a timestamp for display.
 */
function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate + "Z"); // Assume UTC
  return date.toISOString().substring(11, 23); // HH:MM:SS.mmm
}

/**
 * Resolves a worker ID prefix to full ID.
 */
function resolveWorkerPrefix(prefix: string, db: any): string | null {
  const stmt = db.prepare(
    "SELECT id FROM workers WHERE id LIKE ? ORDER BY created_at DESC LIMIT 1"
  );
  const result = stmt.get(`${prefix}%`) as { id: string } | undefined;
  return result?.id || null;
}

/**
 * View logs for a specific worker.
 */
export async function logsCommand(
  workerIdPrefix: string,
  options: LogsOptions
): Promise<void> {
  const db = getDb(options.db);

  // Resolve worker ID prefix
  const workerId = resolveWorkerPrefix(workerIdPrefix, db);
  if (!workerId) {
    console.error(`No worker found matching prefix: ${workerIdPrefix}`);
    Deno.exit(1);
  }

  // Build query
  let query = `
    SELECT id, worker_id, timestamp, stream, line, iteration
    FROM worker_logs
    WHERE worker_id = ?
  `;

  const params: any[] = [workerId];

  if (options.stream) {
    query += " AND stream = ?";
    params.push(options.stream);
  }

  if (options.iteration !== undefined) {
    query += " AND iteration = ?";
    params.push(options.iteration);
  }

  query += " ORDER BY timestamp ASC, id ASC";

  if (options.tail) {
    // For tail, we need to get the last N rows
    // SQLite doesn't have LIMIT from end directly, so we reverse twice
    query = `
      SELECT * FROM (
        SELECT * FROM (${query})
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
      ) ORDER BY timestamp ASC, id ASC
    `;
    params.push(options.tail);
  }

  const stmt = db.prepare(query);
  let logs = stmt.all(...params) as WorkerLog[];

  if (logs.length === 0) {
    console.log(`No logs found for worker ${workerId.substring(0, 8)}`);
    return;
  }

  // Display logs
  for (const log of logs) {
    const time = formatTimestamp(log.timestamp);
    const streamPrefix =
      log.stream === "stderr"
        ? "[ERR]"
        : log.stream === "system"
        ? "[SYS]"
        : "[OUT]";
    const iterPrefix = log.iteration !== null ? `[${log.iteration}]` : "";

    console.log(`${time} ${streamPrefix}${iterPrefix} ${log.line}`);
  }

  // Follow mode: poll for new logs
  if (options.follow) {
    let lastId = logs[logs.length - 1]?.id || 0;

    console.log("\n--- Following logs (Ctrl+C to exit) ---");

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2s

      const followQuery = `
        SELECT id, worker_id, timestamp, stream, line, iteration
        FROM worker_logs
        WHERE worker_id = ? AND id > ?
        ORDER BY timestamp ASC, id ASC
      `;

      const followParams = [workerId, lastId];
      if (options.stream) {
        // Not adding stream filter in follow mode for simplicity
        // Could be enhanced later
      }

      const followStmt = db.prepare(followQuery);
      const newLogs = followStmt.all(...followParams) as WorkerLog[];

      for (const log of newLogs) {
        const time = formatTimestamp(log.timestamp);
        const streamPrefix =
          log.stream === "stderr"
            ? "[ERR]"
            : log.stream === "system"
            ? "[SYS]"
            : "[OUT]";
        const iterPrefix = log.iteration !== null ? `[${log.iteration}]` : "";

        console.log(`${time} ${streamPrefix}${iterPrefix} ${log.line}`);
        lastId = log.id;
      }
    }
  }
}
