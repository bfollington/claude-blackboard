# Blackboard CLI

A Deno-based command-line interface for the Claude Code blackboard plugin. Provides safe SQL operations, hook handlers, and interactive commands for managing plans, breadcrumbs, reflections, and more.

## Overview

The blackboard CLI replaces the original bash scripts with a single, unified TypeScript-based tool that offers:

- **Type-safe database operations** with prepared statements (no SQL injection)
- **Single permission requirement**: `Bash(blackboard:*)` in Claude Code
- **Proper error handling** with meaningful exit codes
- **Interactive commands** for manual use
- **Hook handlers** for Claude Code plugin integration

## Installation

### Prerequisites

- **Deno 2.x** - Install with:
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```
- Ensure `~/.deno/bin` is in your PATH:
  ```bash
  export PATH="$HOME/.deno/bin:$PATH"
  ```

### Install the CLI

From the cli directory:

```bash
# Install globally to ~/.deno/bin
deno task install

# Verify installation
blackboard --version
```

This makes the `blackboard` command available globally.

## Commands

### Interactive Commands

These are meant for manual use and provide human-friendly output.

#### `blackboard status`

Show the current state of the blackboard including active plans, pending steps, and recent breadcrumbs.

```bash
blackboard status
```

#### `blackboard query <sql>`

Run an ad-hoc SQL query against the database.

```bash
blackboard query "SELECT * FROM plans WHERE status = 'in_progress'"
```

#### `blackboard crumb <summary>`

Record a breadcrumb (progress marker) with optional metadata.

```bash
blackboard crumb "Implemented user authentication" \
  --step abc123 \
  --files "src/auth.ts,src/types.ts" \
  --issues "Had to work around missing types" \
  --next "Token refresh still needed"
```

Options:
- `-s, --step <id>` - Step ID this breadcrumb relates to
- `-f, --files <list>` - Comma-separated list of files touched
- `-i, --issues <text>` - Issues or blockers encountered
- `-n, --next <text>` - Context for the next agent
- `-a, --agent <type>` - Agent type (default: implementer)

#### `blackboard oops <mistake>`

Record a correction (a mistake and how it was resolved).

```bash
blackboard oops "Used wrong import path" \
  --symptoms "Module not found error" \
  --fix "Use relative path instead of absolute" \
  --tags "typescript,imports"
```

Options:
- `-s, --symptoms <text>` - Error symptoms or how the mistake manifested
- `-f, --fix <text>` - The correct approach or resolution
- `-t, --tags <list>` - Comma-separated tags for categorization

#### `blackboard bug-report <title>`

File a bug report for a blocking issue.

```bash
blackboard bug-report "Database migration fails" \
  --steps "1. Run migration command  2. See error in logs" \
  --evidence "Error: column already exists"
```

Options:
- `-s, --steps <text>` - Reproduction steps (required)
- `-e, --evidence <text>` - Error logs or other evidence

#### `blackboard reflect [content]`

Capture a reflection on the session.

```bash
blackboard reflect "Learned to use prepared statements for SQL safety"
```

If content is omitted, you'll be prompted to enter it interactively.

Options:
- `--trigger <type>` - What triggered this reflection (manual|compact|completion|stop)

### Hook Handlers

These are designed for use by the Claude Code plugin system. They read JSON from stdin and write JSON to stdout.

#### `blackboard hook init-db`

Initialize the database schema. Called on SessionStart.

#### `blackboard hook check-resume`

Check if there's an active plan and emit a system message if so. Called on SessionStart.

#### `blackboard hook store-plan`

Extract and store a plan from ExitPlanMode JSON. Called on PreToolUse[ExitPlanMode].

#### `blackboard hook inject-orchestration`

Output orchestration instructions for subagent execution. Called on PostToolUse[ExitPlanMode].

#### `blackboard hook capture-todo`

Sync TodoWrite items to plan_steps. Called on PostToolUse[TodoWrite].

#### `blackboard hook update-step-status`

Mark step(s) as complete. Called on SubagentStop.

#### `blackboard hook prompt-reflect`

Suggest that the user create a reflection. Called on PreCompact.

## Global Options

All commands support these global options:

- `-d, --db <path>` - Override the database path (default: `$CLAUDE_PROJECT_DIR/.claude/blackboard.db`)
- `-q, --quiet` - Suppress non-essential output
- `--json` - Output as JSON instead of human-friendly tables

## Development

### Running in Development Mode

Use the `dev` task to run the CLI with watch mode:

```bash
# Run a command with auto-reload on file changes
deno task dev status
deno task dev query "SELECT * FROM plans"
```

### Installing Local Changes

After making changes, reinstall to test:

```bash
deno task install
```

### Project Structure

```
cli/
├── deno.json            # Deno configuration, dependencies, tasks
├── mod.ts               # Entry point
├── src/
│   ├── cli.ts           # Cliffy command tree
│   ├── commands/        # Interactive command implementations
│   │   ├── status.ts
│   │   ├── query.ts
│   │   ├── crumb.ts
│   │   ├── oops.ts
│   │   ├── bug-report.ts
│   │   └── reflect.ts
│   ├── hooks/           # Hook handler implementations
│   │   ├── init-db.ts
│   │   ├── check-resume.ts
│   │   ├── store-plan.ts
│   │   ├── inject-orchestration.ts
│   │   ├── capture-todo.ts
│   │   ├── update-step-status.ts
│   │   └── prompt-reflect.ts
│   ├── db/              # Database layer
│   │   ├── connection.ts
│   │   ├── schema.ts
│   │   └── queries.ts
│   ├── output/          # Output formatting
│   │   ├── json.ts
│   │   └── table.ts
│   ├── types/           # TypeScript type definitions
│   │   ├── schema.ts
│   │   └── hooks.ts
│   └── utils/           # Utility functions
```

### Technology Stack

- **Runtime**: Deno 2.x
- **CLI Framework**: [@cliffy/command](https://cliffy.io/) from jsr.io
- **SQLite**: [@db/sqlite](https://jsr.io/@db/sqlite) - Native FFI bindings for maximum performance
- **Type Safety**: Full TypeScript with strict mode

### Key Design Principles

1. **SQL Safety**: All database operations use prepared statements to prevent injection attacks
2. **Environment Awareness**: Respects `CLAUDE_PROJECT_DIR` for database path resolution
3. **Exit Codes**: Meaningful exit codes for error handling
   - 0: Success (or "not my hook" for hook handlers)
   - 1: General error
   - 2: Invalid input
   - 3: Database error
4. **Hook vs Interactive**: Hooks use JSON I/O, interactive commands use human-friendly tables

## Permissions

The CLI requires these Deno permissions:

- `--allow-read` - Read database files and schema
- `--allow-write` - Write to database
- `--allow-env` - Access `CLAUDE_PROJECT_DIR` and other environment variables
- `--allow-ffi` - SQLite native bindings via FFI

These are bundled into the single `Bash(blackboard:*)` permission in Claude Code.

## License

Same as the parent blackboard plugin.
