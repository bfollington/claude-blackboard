/**
 * SessionStart hook - Initialize blackboard database if it doesn't exist.
 * Matches behavior of blackboard/scripts/init-db.sh
 */

import { readStdin } from "../utils/stdin.ts";
import { resolveDbPath } from "../db/connection.ts";
import { dbExists, initializeSchema } from "../db/schema.ts";

/**
 * Initialize database hook handler.
 * - Creates .claude/ directory if needed
 * - Initializes database schema if database doesn't exist
 * - Adds blackboard.db to .gitignore if not already present
 * - Outputs JSON with hookSpecificOutput if database was created
 */
export async function initDb(): Promise<void> {
  // Read stdin (SessionStart input) but we don't need it
  await readStdin<unknown>();

  const projectDir = Deno.env.get("CLAUDE_PROJECT_DIR") ?? Deno.cwd();
  const dbDir = `${projectDir}/.claude`;
  const dbPath = resolveDbPath();
  const gitignorePath = `${projectDir}/.gitignore`;

  // Create directory if needed
  try {
    await Deno.mkdir(dbDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }

  // Initialize database if it doesn't exist
  const isNewDb = !dbExists();

  if (isNewDb) {
    initializeSchema();

    // Add to .gitignore if not already present
    try {
      const gitignoreExists = await Deno.stat(gitignorePath)
        .then((stat) => stat.isFile)
        .catch(() => false);

      if (gitignoreExists) {
        const content = await Deno.readTextFile(gitignorePath);
        if (!content.includes("blackboard.db")) {
          await Deno.writeTextFile(
            gitignorePath,
            `${content}\n# Claude Code blackboard\n.claude/blackboard.db\n`,
          );
        }
      }
    } catch {
      // If .gitignore operations fail, that's okay
    }

    // Output JSON indicating database was created
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext:
            "Blackboard database initialized at .claude/blackboard.db",
        },
      }),
    );
  } else {
    // Database exists, just exit cleanly (no output)
    Deno.exit(0);
  }
}
