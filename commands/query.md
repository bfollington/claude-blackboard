---
description: Run an ad-hoc SQL query against the blackboard database
argument-hint: <sql query>
allowed-tools: Bash
---

Run a custom SQL query against the blackboard.

## Available Tables

- `plans` - id, created_at, status, description, plan_markdown, session_id
- `plan_steps` - id, plan_id, step_order, description, status, created_at
- `breadcrumbs` - id, plan_id, step_id, created_at, agent_type, summary, files_touched, issues, next_context
- `reflections` - id, plan_id, created_at, trigger, content
- `corrections` - id, plan_id, created_at, mistake, symptoms, resolution, tags
- `bug_reports` - id, plan_id, created_at, title, repro_steps, evidence, status

## Available Views

- `active_plan` - Current active plan
- `pending_steps` - Steps not yet completed
- `recent_crumbs` - Last 10 breadcrumbs with plan/step context

## Query

Run the following with the provided arguments:

```bash
sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "$ARGUMENTS"
```

## Example Queries

- All plans: `SELECT * FROM plans ORDER BY created_at DESC`
- Search corrections: `SELECT * FROM corrections WHERE tags LIKE '%typescript%'`
- Find related breadcrumbs: `SELECT * FROM breadcrumbs WHERE summary LIKE '%auth%'`
- Check plan history: `SELECT id, status, description FROM plans ORDER BY created_at DESC LIMIT 10`
