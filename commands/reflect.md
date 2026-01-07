---
description: Capture a reflection on the current session or plan
argument-hint: [reflection content]
allowed-tools: Bash
---

Capture insights, lessons learned, or observations from this session.

## Current Context

Active plan:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT id, description, status FROM active_plan" 2>/dev/null || echo "No active plan"`

Breadcrumb count:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT COUNT(*) as total FROM breadcrumbs WHERE plan_id = (SELECT id FROM active_plan)" 2>/dev/null || echo "0"`

Step completion:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT status, COUNT(*) as count FROM plan_steps WHERE plan_id = (SELECT id FROM active_plan) GROUP BY status" 2>/dev/null || echo "No steps"`

Recent issues from breadcrumbs:
!`sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "SELECT issues FROM breadcrumbs WHERE plan_id = (SELECT id FROM active_plan) AND issues IS NOT NULL ORDER BY created_at DESC LIMIT 3" 2>/dev/null || echo "No issues recorded"`

## Instructions

If reflection content is provided in the arguments below, record it directly.

If NO content is provided, synthesize a reflection based on:
- What was accomplished (check breadcrumbs)
- What challenges were encountered (check issues in breadcrumbs)
- What would be done differently
- Key learnings

Arguments: $ARGUMENTS

Generate an ID and insert:
```bash
REF_ID=$(openssl rand -hex 4)
sqlite3 "$CLAUDE_PROJECT_DIR/.claude/blackboard.db" "INSERT INTO reflections (id, plan_id, trigger, content) VALUES ('$REF_ID', (SELECT id FROM active_plan), 'manual', '<escaped content>')"
echo "Reflection $REF_ID recorded"
```

Escape single quotes by doubling them in the content.
