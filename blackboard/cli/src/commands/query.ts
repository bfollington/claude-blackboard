/**
 * Query command - Run ad-hoc SQL queries against the blackboard database.
 */

import { getDb } from "../db/connection.ts";
import { formatTable } from "../output/table.ts";
import { outputJson } from "../utils/command.ts";

interface QueryOptions {
  db?: string;
  quiet?: boolean;
  json?: boolean;
}

/**
 * Execute a SQL query and display results.
 *
 * @param sql - SQL query string
 * @param options - Command options
 */
export async function queryCommand(
  sql: string,
  options: QueryOptions
): Promise<void> {
  const db = getDb(options.db);

  try {
    const stmt = db.prepare(sql);
    const results = stmt.all();

    if (options.json) {
      outputJson(results);
      return;
    }

    if (results.length === 0) {
      if (!options.quiet) {
        console.log("(no results)");
      }
      return;
    }

    // Extract headers from first row
    const headers = Object.keys(results[0]);

    // Convert rows to string arrays
    const rows = results.map((row: any) =>
      headers.map((h) => {
        const val = row[h];
        return val === null || val === undefined ? "" : String(val);
      })
    );

    console.log(formatTable(headers, rows));

    if (!options.quiet) {
      console.log(`\n${results.length} row(s) returned`);
    }
  } catch (error) {
    console.error("Query error:", error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
