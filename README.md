# Blackboard Plugin for Claude Code

A local SQLite-based "blackboard" for sharing context between Claude Code sessions and subagents.

## What It Does

Creates a persistent database that stores:
- **Plans**: Captured when exiting plan mode
- **Steps**: Parsed from TodoWrite tool usage
- **Breadcrumbs**: Progress records from subagents
- **Reflections**: Session insights and learnings
- **Corrections**: Recorded mistakes and their solutions
- **Bug Reports**: Blocking issues with reproduction steps

## Installation

### Option 1: Install from GitHub (Recommended)

```bash
# In Claude Code, add the marketplace
/plugin marketplace add bfollington/claude-blackboard

# Install the plugin
/plugin install blackboard@bfollington
```

### Option 2: Install from Local Directory

```bash
# Clone the repo
git clone https://github.com/bfollington/claude-blackboard.git

# In Claude Code, add as local marketplace
/plugin marketplace add ./claude-blackboard

# Install
/plugin install blackboard@claude-blackboard
```

### Prerequisites

- **Deno 2.x** (required for the blackboard CLI)
  ```bash
  # Install Deno if not already installed
  curl -fsSL https://deno.land/install.sh | sh
  ```
- Ensure `~/.deno/bin` is in your PATH:
  ```bash
  export PATH="$HOME/.deno/bin:$PATH"
  ```

### CLI Installation

After installing the plugin, you need to install the `blackboard` CLI command:

```bash
# Navigate to the plugin directory (usually in ~/.claude/plugins/)
cd ~/.claude/plugins/bfollington-claude-blackboard/blackboard/cli

# Install the CLI globally
deno task install
```

This installs the `blackboard` command to `~/.deno/bin`, making it available globally with a single `Bash(blackboard:*)` permission in Claude Code.

## How It Works

### Automatic Initialization

The plugin automatically creates `.claude/blackboard.db` in your project on session start. The database is project-specific and should be gitignored.

The blackboard CLI provides all functionality through a unified command with subcommands for both interactive use and hook handlers.

### Workflow

1. **Planning**: Enter plan mode (Shift+Tab twice), describe what you want to build. When you approve and Claude calls `ExitPlanMode`:
   - The plan is stored in the blackboard
   - Orchestration instructions are injected

2. **Step Creation**: Claude breaks the plan into steps using `TodoWrite`. Each todo becomes a tracked `plan_step`.

3. **Staged Execution**: Claude spawns subagents (using the `implementer` agent) to work on steps. Each subagent:
   - Queries the database for context
   - Implements its assigned step(s)
   - Records a breadcrumb before returning

4. **Completion**: When all steps are done, run `/reflect` to capture learnings.

### SQLite Browser

I recommend using Base (https://menial.co.uk/base/) on macOS to view the state of your DB. Alternatively, use `/query` within `claude-code` to have Claude explore the DB for you.

## Commands

| Command | Description |
|---------|-------------|
| `/crumb` | Record a breadcrumb (progress marker) |
| `/reflect` | Capture a reflection on the session |
| `/oops` | Record a mistake and its resolution |
| `/bug-report` | File a blocking bug with repro steps |
| `/status` | Show current blackboard state |
| `/query` | Run ad-hoc SQL against the database |

## Plugin Structure

```
blackboard/
├── .claude-plugin/
│   └── marketplace.json     # Marketplace manifest
├── commands/                 # Slash commands
│   ├── crumb.md
│   ├── reflect.md
│   ├── oops.md
│   ├── bug-report.md
│   ├── status.md
│   └── query.md
├── agents/
│   └── implementer.md       # Subagent for staged execution
├── hooks/
│   └── hooks.json           # Hook configuration
├── scripts/
│   └── check-cli.sh         # CLI installation check
├── schema.sql
└── README.md

├── cli/                      # Deno-based CLI (replaces bash scripts)
│   ├── deno.json
│   ├── mod.ts               # Entry point
│   └── src/
│       ├── cli.ts           # Command tree
│       ├── commands/        # Interactive commands
│       ├── hooks/           # Hook handlers
│       ├── db/              # Database layer
│       ├── output/          # Output formatting
│       ├── types/           # TypeScript types
│       └── utils/           # Utilities
```

## Database Schema

### Tables

- `plans` - Stored plans with status tracking
- `plan_steps` - Individual steps broken down from plans
- `breadcrumbs` - Progress markers from subagents
- `reflections` - Session insights
- `corrections` - Recorded mistakes and fixes
- `bug_reports` - Blocking issues

### Views

- `active_plan` - Current active/in-progress plan
- `pending_steps` - Steps not yet completed
- `recent_crumbs` - Last 10 breadcrumbs with context

## Troubleshooting

### Plugin not loading

1. Check it's installed: `/plugin`
2. Run Claude Code with `--debug` to see loading details

### CLI not installed

If you see errors about the `blackboard` command not being found:

1. Install Deno 2.x: `curl -fsSL https://deno.land/install.sh | sh`
2. Add `~/.deno/bin` to your PATH
3. Install the CLI:
   ```bash
   cd ~/.claude/plugins/bfollington-claude-blackboard/blackboard/cli
   deno task install
   ```
4. Verify installation: `blackboard --version`

### Database not created

The database is created automatically on session start. To manually initialize:
```bash
blackboard hook init-db
```

### Hooks not firing

1. Verify hooks in `/hooks`
2. Run with `--debug` to see hook execution
3. Ensure the `blackboard` CLI is installed and in PATH

## Development

### Modifying the Plugin

1. Make changes to files in `blackboard/` directory
2. Uninstall: `/plugin uninstall blackboard@marketplace-name`
3. Reinstall: `/plugin install blackboard@marketplace-name`

### Developing the CLI

The CLI is written in TypeScript using Deno. To work on it:

```bash
cd blackboard/cli

# Run in development mode with watch
deno task dev status

# Install your local changes globally
deno task install

# Run tests (if available)
deno test

# Format code
deno fmt

# Lint code
deno lint
```

The CLI uses:
- **@cliffy/command** for the command-line interface
- **@db/sqlite** for native SQLite access via FFI
- Prepared statements to prevent SQL injection
- TypeScript for type safety
