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

- `sqlite3` CLI (usually pre-installed)
- `jq` for JSON parsing in hooks
- `openssl` for ID generation (usually pre-installed)

## How It Works

### Automatic Initialization

The plugin automatically creates `.claude/blackboard.db` in your project on session start. The database is project-specific and should be gitignored.

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
├── scripts/                  # Shell scripts for hooks and subagents
│   ├── init-db.sh
│   ├── store-plan.sh
│   ├── inject-orchestration.sh
│   ├── capture-todo.sh
│   ├── update-step-status.sh
│   ├── prompt-reflect.sh
│   ├── crumb.sh
│   ├── oops.sh
│   └── bug-report.sh
├── schema.sql
└── README.md
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
3. Ensure scripts are executable

### Database not created

The database is created automatically on session start. If missing:
```bash
sqlite3 .claude/blackboard.db < path/to/plugin/schema.sql
```

### Hooks not firing

1. Verify hooks in `/hooks`
2. Run with `--debug` to see hook execution
3. Check scripts are executable: `chmod +x scripts/*.sh`

### Missing dependencies

```bash
# macOS
brew install jq sqlite3

# Ubuntu/Debian
apt install jq sqlite3
```

## Development

To modify the plugin:

1. Make changes to files
2. Uninstall: `/plugin uninstall blackboard@marketplace-name`
3. Reinstall: `/plugin install blackboard@marketplace-name`
