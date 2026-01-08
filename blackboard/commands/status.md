---
description: Show current blackboard status
allowed-tools: Bash
---

Display the current state of the blackboard.

## Active Plan
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT id, status, substr(description, 1, 50) as description, created_at FROM active_plan" 2>/dev/null || echo "No active plan"`

## Steps Progress
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT status, COUNT(*) as count FROM plan_steps WHERE plan_id = (SELECT id FROM active_plan) GROUP BY status ORDER BY CASE status WHEN 'completed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'pending' THEN 3 ELSE 4 END" 2>/dev/null || echo "No steps"`

## Step Details
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT step_order as '#', status, substr(description, 1, 50) as description FROM plan_steps WHERE plan_id = (SELECT id FROM active_plan) ORDER BY step_order LIMIT 10" 2>/dev/null || echo "No steps"`

## Recent Breadcrumbs
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT substr(created_at, 12, 8) as time, agent_type, substr(summary, 1, 40) as summary FROM breadcrumbs WHERE plan_id = (SELECT id FROM active_plan) ORDER BY created_at DESC LIMIT 5" 2>/dev/null || echo "No breadcrumbs"`

## Open Bug Reports
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT id, substr(title, 1, 40) as title, substr(created_at, 1, 10) as date FROM bug_reports WHERE status = 'open' LIMIT 5" 2>/dev/null || echo "No open bugs"`

## Recent Corrections
!`sqlite3 -header -column "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT substr(created_at, 1, 10) as date, substr(mistake, 1, 40) as mistake FROM corrections ORDER BY created_at DESC LIMIT 3" 2>/dev/null || echo "No corrections recorded"`
