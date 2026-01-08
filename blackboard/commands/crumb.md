---
description: Record a breadcrumb for the current plan. Use this to track progress.
argument-hint: <summary> [--step <step_id>] [--issues <issues>] [--files <file1,file2>] [--next <context>]
allowed-tools: Bash
---

Record what you accomplished as a breadcrumb for the active plan.

## Current Context

Active plan:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT id, description FROM active_plan" 2>/dev/null || echo "No active plan"`

Recent breadcrumbs:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT created_at, substr(summary, 1, 60) as summary FROM recent_crumbs LIMIT 3" 2>/dev/null || echo "No breadcrumbs yet"`

## Instructions

Parse the arguments provided below and record a breadcrumb.

Arguments to parse: $ARGUMENTS

Expected format:
- First positional argument or text before flags: the summary
- `--step <id>`: step_id this breadcrumb relates to
- `--issues <text>`: any issues or blockers encountered  
- `--files <list>`: comma-separated list of files touched
- `--next <text>`: context for the next agent

Run the crumb script:
```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/crumb.sh" "<summary>" --step "<step_id>" --files "<files>" --issues "<issues>" --next "<next_context>"
```

Omit flags that weren't provided. Escape quotes properly in the arguments.
