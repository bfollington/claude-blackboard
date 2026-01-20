# Blackboard Threads Implementation Plan

## Overview

Introduce **threads** as the top-level organizing concept in blackboard. A thread represents a conceptual unit of work/investigation that persists across Claude sessions. Plans become versioned children of threads, and the thread's state (plan, steps, breadcrumbs) can be loaded/resumed at any time.

## Core Concepts

- **Thread**: Named unit of work. Has 0-1 current plan, tracks git branches, can be resumed across sessions.
- **Plan versioning**: Each planning session creates a new plan; thread points to "current" plan.
- **Context packet**: Full state + orchestration instructions output by `/blackboard:thread` skill.
- **REPL mode**: `blackboard thread work <ID>` launches Claude with permissions bypassed and context packet injected.

## Data Model Changes

### New `threads` table

```sql
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  current_plan_id TEXT REFERENCES plans(id),
  git_branches TEXT,  -- comma-separated, auto-detected on activation
  status TEXT NOT NULL DEFAULT 'active'  -- active, paused, completed, archived
);
CREATE INDEX idx_threads_updated ON threads(updated_at DESC);
CREATE INDEX idx_threads_status ON threads(status);
```

### Modify `plans` table

```sql
ALTER TABLE plans ADD COLUMN thread_id TEXT REFERENCES threads(id);
CREATE INDEX idx_plans_thread ON plans(thread_id, created_at DESC);
```

### Migration strategy

Add migration script that:
1. Creates `threads` table
2. Adds `thread_id` column to `plans`
3. Optionally creates a "default" thread and associates existing plans with it

## CLI Commands

### `blackboard thread new <name>`
- Creates new thread with given name
- Auto-detects current git branch, stores in `git_branches`
- Sets `updated_at` to now (makes it "active")
- Outputs: thread ID and confirmation

### `blackboard thread list`
- Lists all threads ordered by `updated_at` DESC
- Shows: name, status, current plan summary, pending step count, last updated
- Options: `--status <filter>`, `--json`

### `blackboard thread status [name]`
- If no name, shows most recently updated thread
- Shows: full plan, all steps with status, recent breadcrumbs, git branches
- Options: `--json`, `--brief`

### `blackboard thread work <name>`
- Resolves thread by name
- Outputs the **context packet** (see below)
- Launches `claude` with:
  - `-p "/blackboard:thread <name>"`
  - `--dangerously-skip-permissions` (or equivalent)
- This is the REPL/worker mode entry point

## Skill: `/blackboard:thread <ID>`

**Location**: `blackboard/commands/thread.md`

When invoked:
1. Resolves thread by ID/name
2. Updates `threads.updated_at = now()` (marks as active)
3. Auto-detects current git branch, appends to `git_branches` if new
4. Queries: current plan, pending steps, last 5 breadcrumbs, open bugs
5. Outputs **context packet**

### Context Packet Format

```markdown
## Thread: <name>
Status: <status> | Git branches: <branches>

## Current Plan
<plan_markdown or "No plan yet - use planning mode to create one">

## Steps
- [x] Step 1: description (completed)
- [ ] Step 2: description (pending) ← CURRENT
- [ ] Step 3: description (pending)

## Recent Breadcrumbs
- <timestamp> [step 2]: <summary>
- <timestamp> [step 1]: <summary>

## Open Issues
- BUG-123: <title>

---

## Orchestration

You are working on thread "<name>". Your workflow:

1. **If no plan exists**: Enter planning mode, design the approach, exit plan mode. The plan will be stored automatically.

2. **If plan exists with pending steps**:
   - Use the `blackboard:implementer` subagent to work on pending steps
   - The implementer will record breadcrumbs as it works
   - Steps are marked complete automatically when breadcrumbs reference them

3. **Recording progress**:
   - Use `/crumb <summary>` to record progress (auto-associates with current thread)
   - Use `/oops <mistake>` if you make a correctable error
   - Use `/bug-report <title> --steps <repro>` if blocked

4. **When stuck or session ending**: Use `/reflect` to capture learnings before context compaction.

5. **Switching threads**: Invoke `/blackboard:thread <other-name>` to switch context.

Continue with the current thread now.
```

## Hook Changes

### SessionStart (`check-resume.ts` → `session-start.ts`)

Replace current resume logic with thread-aware version:

```
Query: SELECT name, status, (SELECT COUNT(*) FROM plan_steps WHERE ...) as pending_count
FROM threads ORDER BY updated_at DESC LIMIT 5
```

Output:
```
Recent threads:
  • auth-refactor (3 pending steps) - last active 2h ago
  • bug-fix-123 (completed)
  • perf-investigation (paused)

Use /blackboard:thread <name> to load a thread, or /blackboard:thread new <name> to start fresh.
```

### ExitPlanMode (`store-plan.ts`)

Modify to:
1. Get "current thread" (most recently updated, status=active)
2. If no current thread, create one with auto-generated name (e.g., "plan-<timestamp>")
3. Create new plan with `thread_id` set
4. Update `threads.current_plan_id` to new plan
5. Update `threads.updated_at`

### Other commands (`/crumb`, `/oops`, `/bug-report`, `/reflect`)

Add logic to auto-associate with current thread's current plan:
1. If `--plan` not specified, look up most recently updated thread
2. Use that thread's `current_plan_id`
3. This makes the commands "just work" after invoking `/blackboard:thread`

## Files to Modify/Create

### New files
- `cli/src/commands/thread.ts` - thread subcommand (new, list, status, work)
- `commands/thread.md` - skill definition for `/blackboard:thread`
- `cli/src/db/migrations/001_threads.ts` - migration script

### Modified files
- `schema.sql` - add threads table, modify plans table
- `cli/src/types/schema.ts` - add Thread type, update Plan type
- `cli/src/db/queries.ts` - add thread queries, modify plan queries
- `cli/src/hooks/store-plan.ts` - thread-aware plan storage
- `cli/src/hooks/check-resume.ts` → `session-start.ts` - thread listing
- `cli/src/commands/crumb.ts` - auto-associate with current thread
- `cli/src/commands/oops.ts` - auto-associate with current thread
- `cli/src/commands/bug-report.ts` - auto-associate with current thread
- `cli/src/commands/reflect.ts` - auto-associate with current thread
- `hooks/hooks.json` - update hook references

## Verification

1. **Create thread**: `blackboard thread new test-feature` creates entry in DB
2. **List threads**: `blackboard thread list` shows the new thread
3. **Load thread**: In Claude, `/blackboard:thread test-feature` outputs context packet
4. **Plan association**: Exit plan mode → plan created with thread_id set
5. **Breadcrumb association**: `/crumb "did thing"` associates with thread's plan
6. **REPL mode**: `blackboard thread work test-feature` launches Claude with context
7. **Resume**: Kill session, run `/blackboard:thread test-feature`, see previous state

## Design Decisions

- **Thread names**: Kebab-case only (lowercase-with-dashes). No spaces or special characters. Simpler CLI ergonomics, no quoting needed.
- **Orphan plans**: Auto-create thread. If a plan is created without an active thread, generate a thread from the plan's first line (slugified) or use `plan-<timestamp>` as fallback.
