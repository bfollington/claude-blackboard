/**
 * SessionStart hook - Initialize blackboard database if it doesn't exist.
 * Also runs migrations on existing databases.
 */

import { readStdin } from "../utils/stdin.ts";
import { resolveDbPath, getDb } from "../db/connection.ts";
import { dbExists, initializeSchema } from "../db/schema.ts";
import { migrate as migrateThreads } from "../db/migrations/001_threads.ts";

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

    // Output JSON with full blackboard system explanation
    const systemExplanation = `## Blackboard System Initialized

The blackboard is a persistent SQLite database for tracking work across Claude sessions.

### Core Concepts

- **Threads**: Named units of work that persist across sessions. Each thread tracks a plan, steps, and breadcrumbs.
- **Plans**: Markdown documents capturing your approach. Created when you exit plan mode.
- **Steps**: Discrete tasks extracted from TodoWrite. Progress is tracked automatically.
- **Breadcrumbs**: Progress records left by subagents as they work.

### Workflow

1. **Start a thread**: \`blackboard thread new <kebab-case-name>\` or just enter plan mode (a thread will be auto-created)

2. **Load a thread**: Use \`/blackboard:thread <name>\` to load full context and orchestration instructions

3. **Execute with subagents**: Use \`blackboard:implementer\` subagents to work on steps. They record breadcrumbs automatically.

4. **Track progress**:
   - \`/crumb <summary>\` - Record progress
   - \`/oops <mistake>\` - Record corrections
   - \`/bug-report <title> --steps <repro>\` - File blocking issues

5. **Resume later**: Next session, you'll see recent threads and can load any with \`/blackboard:thread <name>\`

### Commands

- \`blackboard thread list\` - See all threads
- \`blackboard thread status [name]\` - See thread details
- \`blackboard status\` - See current plan/steps
- \`blackboard query "<sql>"\` - Ad-hoc queries

Start by creating a thread or entering plan mode for your current task.`;

    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: systemExplanation,
        },
      }),
    );
  } else {
    // Database exists - run migrations to ensure schema is up to date
    try {
      const db = getDb();
      migrateThreads(db);
    } catch {
      // Migration errors are non-fatal (might already be migrated)
    }
    // Exit cleanly (no output)
    Deno.exit(0);
  }
}
