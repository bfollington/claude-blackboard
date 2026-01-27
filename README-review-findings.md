# README Review Findings

Date: 2026-01-27
Thread: review-readme
Plan: 34bfcf6a

## Executive Summary

The README is generally accurate and well-structured, but has several issues that could confuse new users:

1. **Missing commands** - Documents commands that don't exist as slash commands
2. **Structural inaccuracy** - Plugin structure section doesn't match actual directory layout
3. **Installation path confusion** - Multiple conflicting paths mentioned
4. **Quick start buried** - Most critical path (installation) is clear but workflow explanation comes too late
5. **Missing TUI documentation** - Mentions TUI workflow but provides no details

## Detailed Findings

### 1. Installation Instructions (ACCURATE ✓)

**Status: Generally accurate with minor issues**

- ✓ GitHub installation path is correct
- ✓ Deno requirement is accurate
- ✓ CLI installation steps are correct
- ⚠️ Line 63: Path shown is plugin cache path, which is correct but varies by version
- ⚠️ Line 57: `/blackboard:install` command mentioned but not documented elsewhere

**Recommendation:** Add note that `<version>` in path will vary.

### 2. Plugin Structure Section (INACCURATE ✗)

**Lines 156-189: Major discrepancies**

README shows:
```
blackboard/
├── .claude-plugin/
│   └── marketplace.json
```

Reality: `.claude-plugin/` is at **root level**, not inside `blackboard/`
- Actual: `/app/work/.claude-plugin/marketplace.json`
- Documented: `blackboard/.claude-plugin/marketplace.json`

README shows:
```
├── schema.sql
└── README.md
```

Reality: No `README.md` in `blackboard/` (it's in `blackboard/cli/`)

**Recommendation:** Fix directory structure to match reality:
```
./
├── .claude-plugin/
│   └── marketplace.json
└── blackboard/
    ├── commands/
    ├── agents/
    ├── hooks/
    ├── scripts/
    ├── schema.sql
    └── cli/
        ├── README.md
        └── src/
```

### 3. Commands Documentation (INCOMPLETE ⚠️)

**Lines 145-155: Documents 6 commands**

README lists these slash commands:
- `/crumb` ✓ (exists: blackboard/commands/crumb.md)
- `/reflect` ✓ (exists: blackboard/commands/reflect.md)
- `/oops` ✓ (exists: blackboard/commands/oops.md)
- `/bug-report` ✓ (exists: blackboard/commands/bug-report.md)
- `/status` ✓ (exists: blackboard/commands/status.md)
- `/query` ✓ (exists: blackboard/commands/query.md)

**Missing from documentation:**
- `/thread` (exists: blackboard/commands/thread.md)
- `/threads` (exists: blackboard/commands/threads.md)
- `/plan` (exists: blackboard/commands/plan.md)
- `/install` (exists: blackboard/commands/install.md)

**Recommendation:** Either add the missing 4 commands to the table or explain why they're not listed (e.g., internal-only).

### 4. Database Schema Documentation (INCOMPLETE ⚠️)

**Lines 191-207: Schema documentation**

README documents these tables:
- `plans` ✓
- `plan_steps` ✓
- `breadcrumbs` ✓
- `reflections` ✓
- `corrections` ✓
- `bug_reports` ✓

**Missing from documentation:**
- `threads` (primary organizing concept!)
- `next_ups` (for TUI workflow)
- `workers` (for container management)
- `worker_logs` (for debugging)
- `session_state` (for state tracking)

**Views documented:** ✓ All correct
- `active_plan` ✓
- `pending_steps` ✓
- `recent_crumbs` ✓

**Missing views:**
- `current_thread`

**Recommendation:** Add the missing tables, especially `threads` since it's fundamental to the architecture.

### 5. Workflow Section (CONFUSING ⚠️)

**Lines 79-103: Workflow description**

Issues:
- Section title "Workflow (Claude)" suggests there are alternatives, but the alternatives are barely explained
- Line 100: "Workflow (CLI)" - one sentence, no detail
- Line 102: "Workflow (TUI)" - one sentence, no detail
- The main workflow focuses on plan mode, but many users might want to use the plugin without plan mode

**Recommendation:**
- Either provide equal detail for all 3 workflows or remove the subsections
- Add a simple "Quick Start" workflow before the detailed explanation
- Consider moving detailed plan-mode workflow to a separate section

### 6. Quick Start Path (BURIED ⚠️)

The README jumps straight into "What It Does" without showing a simple working example. New users want to see:

1. Install it
2. Try one command
3. See the value

Current structure:
1. What It Does (abstract concepts)
2. Installation (good!)
3. How It Works (detailed workflow)
4. Commands (buried at line 145)

**Recommendation:**
```markdown
## Quick Start

1. Install the plugin (see Installation)
2. Try your first breadcrumb:
   ```
   /crumb "Set up the project"
   ```
3. Check status:
   ```
   /status
   ```
4. See the full workflow below
```

### 7. Technical Inaccuracies

**Line 3:** "Rather than maximum concurrnecy" - typo: "concurrency"

**Line 76:** Claims database is "project-specific and should be gitignored"
- Accurate ✓ (.claude/ directories are typically gitignored)

**Line 78:** "The blackboard CLI provides all functionality through a unified command"
- Accurate ✓ (verified with `blackboard --help`)

### 8. Excessive Detail Issues

**Line 104-143: "Customizing Worker Images"**
This section is excellent but may be overwhelming for new users. Consider:
- Moving to a "Advanced Usage" section at the end
- Or keeping it but adding clearer "Skip this if you're just getting started" guidance

**Line 242-277: "Development" section**
Perfect placement - advanced users who need this will scroll to find it.

### 9. Missing Critical Information

**TUI Dashboard:**
- Line 102 mentions TUI workflow
- CLI README mentions `blackboard dashboard` command
- Main README shows NO information about the TUI

**Recommendation:** Add a section:
```markdown
## Interactive Dashboard

Launch the TUI to manage threads visually:
```bash
blackboard dashboard
```

Features:
- Create and manage threads
- Edit plans in your system editor
- Monitor containerized workers
- View progress and breadcrumbs
```

### 10. Database Location Confusion

Multiple paths mentioned:
- Line 76: `.claude/blackboard.db` ✓ (correct, verified)
- Line 233: Manual init mentions `blackboard hook init-db` (correct)

But CLI README says:
- Default: `$CLAUDE_PROJECT_DIR/.claude/blackboard.db`

In this worker environment:
- `CLAUDE_PROJECT_DIR=/app/work`
- Database is at `/app/work/.claude/blackboard.db` ✓
- But we're using `/app/db/blackboard.db` in worker context

**Recommendation:** Clarify that workers may use a different database path.

## Priority Fixes

### P0 (Blocking/Confusing):
1. Fix plugin structure section (lines 156-189)
2. Add `threads` table to schema documentation
3. Fix typo "concurrnecy" → "concurrency"

### P1 (Improves First-Time Experience):
4. Add Quick Start section at top
5. Document TUI dashboard
6. Complete commands table with all 10 commands

### P2 (Nice to Have):
7. Add missing schema tables (next_ups, workers, etc.)
8. Restructure workflows section for clarity
9. Add "Skip if new" markers to advanced sections

## Overall Assessment

**Accuracy: 7/10**
- Core functionality is accurately described
- Installation instructions are correct
- Major issues with structure documentation and schema completeness

**Quick Start: 5/10**
- Installation is clear
- But no simple "try this first" example
- Workflow explanation comes too early and is too detailed

**Completeness: 6/10**
- Missing 4 slash commands
- Missing 5 database tables
- TUI barely mentioned despite being a major feature

## Recommended Action Plan

1. Fix the plugin structure diagram (5 min)
2. Add Quick Start section (10 min)
3. Complete the commands table (5 min)
4. Add `threads` to schema docs (3 min)
5. Add TUI dashboard section (10 min)
6. Fix typo (1 min)
7. Consider restructuring workflows (15 min)

Total estimated time: ~50 minutes of edits
