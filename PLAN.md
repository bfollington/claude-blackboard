# Next-Ups Tab Implementation Plan

## Overview

This document outlines the implementation plan for adding a new "Next-Ups" tab to the Blackboard TUI. Next-ups are lightweight notes/plans that users can write while workers are running, representing future work that hasn't yet been promoted to a full thread.

## Feature Requirements

### Core Functionality
1. **Next-Ups Tab**: A new tab (tab #4) accessible via the `4` key
2. **Note Creation**: Create new next-up notes in the TUI
3. **Template Support**: Mark next-ups as templates for repeatable tasks
4. **Launch as Thread**: Convert a next-up into a new thread (archives non-templates)
5. **Editing**: Edit next-up content inline or in external editor
6. **Persistence**: Store next-ups in the database across sessions

### User Workflow
1. While workers are running, user presses `4` to switch to next-ups tab
2. User creates new next-ups or edits existing ones
3. When ready, user can launch a next-up as a new thread
4. Templates remain available for repeated use; regular next-ups are archived

## Data Model Design

### Database Schema

Add a new `next_ups` table to `/blackboard/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS next_ups (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,  -- Markdown content describing the work
    is_template INTEGER NOT NULL DEFAULT 0,  -- 0 = note, 1 = template
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived', 'launched')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_launched_at TEXT,  -- For templates, track when last used
    launch_count INTEGER DEFAULT 0  -- For templates, track usage
);

CREATE INDEX IF NOT EXISTS idx_next_ups_status ON next_ups(status);
CREATE INDEX IF NOT EXISTS idx_next_ups_updated ON next_ups(updated_at DESC);
```

### TypeScript Types

Add to `/blackboard/cli/src/types/schema.ts`:

```typescript
export type NextUpStatus = 'active' | 'archived' | 'launched';

export interface NextUp {
  id: string;
  title: string;
  content: string;
  is_template: number;  // 0 or 1 (SQLite boolean)
  status: NextUpStatus;
  created_at: string;
  updated_at: string;
  last_launched_at: string | null;
  launch_count: number;
}
```

### Database Queries

Add to `/blackboard/cli/src/db/queries.ts`:

```typescript
/**
 * Lists active next-ups, ordered by most recently updated.
 */
export function listNextUps(includeArchived = false): NextUp[];

/**
 * Inserts a new next-up.
 */
export function insertNextUp(nextUp: Omit<NextUp, 'id' | 'created_at' | 'updated_at' | 'last_launched_at' | 'launch_count'>): string;

/**
 * Updates a next-up's title and content.
 */
export function updateNextUp(id: string, updates: { title?: string; content?: string; is_template?: number }): void;

/**
 * Archives a next-up (sets status to 'archived').
 */
export function archiveNextUp(id: string): void;

/**
 * Marks a next-up as launched and updates launch metrics.
 */
export function launchNextUp(id: string): void;

/**
 * Deletes a next-up permanently.
 */
export function deleteNextUp(id: string): void;

/**
 * Gets a next-up by ID.
 */
export function getNextUpById(id: string): NextUp | null;

/**
 * Touches a next-up (updates updated_at).
 */
export function touchNextUp(id: string): void;
```

## UI Architecture

### State Management

Add to `/blackboard/cli/src/tui/state.ts`:

```typescript
// Add to TabId type
export type TabId = "threads" | "bugs" | "reflections" | "next-ups";

// Add to TuiState interface
export interface TuiState {
  // ... existing fields ...

  // Next-ups
  nextUps: Signal<NextUp[]>;
  selectedNextUpIndex: Signal<number>;
  isCreatingNextUp: Signal<boolean>;
  newNextUpTitle: Signal<string>;
}

// Add computed values
selectedNextUp: Computed<NextUp | null>;
nextUpListItems: Computed<NextUpListItem[]>;
```

### Actions

Add to `createTuiActions()` in `/blackboard/cli/src/tui/state.ts`:

```typescript
// Next-ups actions
loadNextUps: () => Promise<void>;
createNextUp: (title: string) => void;
toggleNextUpTemplate: () => void;
launchNextUpAsThread: () => Promise<void>;
archiveNextUp: () => void;
deleteNextUp: () => void;
moveNextUpSelection: (delta: number) => void;
```

### Component Structure

Create `/blackboard/cli/src/tui/components/next-ups-list.ts`:

- **Layout**: Full-width list (similar to bugs tab)
- **Row Format**:
  ```
  >* next-up-title-truncated - 5m ago [T]
  ```
  - `>` = selection indicator (focused)
  - `*` = status icon (active, archived, launched)
  - Title (truncated with `~` if too long)
  - Relative timestamp
  - `[T]` = template indicator (optional)

- **Status Icons**:
  - `*` = active
  - `#` = template (is_template=1, status=active)
  - `.` = archived
  - `→` = launched

- **Keyboard Controls**:
  - `j/k` or arrow keys: Navigate
  - `n`: New next-up
  - `Enter` or `l`: Launch as thread
  - `t`: Toggle template status
  - `a`: Archive next-up
  - `d`: Delete next-up (with confirmation)
  - `o`: Open in external editor
  - `e`: Edit title inline

### Header/Content Display

Since next-ups contain markdown content (potentially multi-paragraph), we need to decide on the display:

**Option A: List-only view** (simpler, like bugs tab)
- Show only title in list
- Edit content via external editor (`o` key)
- Launch creates thread with content as plan

**Option B: Split view** (richer, like threads tab)
- Left: Next-up list (30% width)
- Right: Content preview (70% width)
- Show markdown content in right pane when next-up selected
- Edit content inline or via external editor

**Recommendation**: Start with **Option A** (list-only) for MVP, can enhance to Option B later.

### Next-Up Creation Flow

1. User presses `n` in next-ups tab
2. Input box appears for title (similar to thread creation)
3. After entering title, opens editor for content
4. Saves as active next-up with is_template=0

### Launch as Thread Flow

1. User selects a next-up and presses `Enter` or `l`
2. System creates new thread with name generated from title (kebab-case)
3. Creates a plan with the next-up content as plan_markdown
4. Links plan to new thread
5. If next-up is NOT a template: archives it (status='launched')
6. If next-up IS a template: increments launch_count, updates last_launched_at
7. Switches to threads tab and selects the new thread
8. User can spawn worker to start work

## File Changes Required

### Database Layer

1. **`/blackboard/schema.sql`**
   - Add `next_ups` table
   - Add indexes

2. **`/blackboard/cli/src/types/schema.ts`**
   - Add `NextUpStatus` type
   - Add `NextUp` interface

3. **`/blackboard/cli/src/db/queries.ts`**
   - Add next-ups query functions

### TUI Layer

4. **`/blackboard/cli/src/tui/state.ts`**
   - Add `next-ups` to `TabId` type
   - Add next-ups state to `TuiState`
   - Add next-ups actions to `createTuiActions()`
   - Add next-ups computed values

5. **`/blackboard/cli/src/tui/components/tab-bar.ts`**
   - Update to show 4 tabs: `[1] Threads [2] Bugs [3] Reflections [4] Next-Ups`

6. **`/blackboard/cli/src/tui/components/next-ups-list.ts`** (NEW)
   - Create full next-ups list component

7. **`/blackboard/cli/src/tui/components/next-up-input.ts`** (NEW)
   - Create next-up title input component

8. **`/blackboard/cli/src/tui/mod.ts`**
   - Wire up next-ups tab rendering
   - Wire up next-ups keyboard handlers

9. **`/blackboard/cli/src/tui/components/status-bar.ts`**
   - Add next-ups keybinding hints

### CLI Layer

10. **`/blackboard/cli/src/commands/next-up.ts`** (NEW, OPTIONAL)
    - Add CLI commands for next-up management outside TUI
    - `blackboard next-up list`
    - `blackboard next-up create <title>`
    - `blackboard next-up launch <id>`
    - `blackboard next-up delete <id>`

## Open Questions

### 1. Content Editor Integration
**Question**: How should users edit next-up content?
- **Option A**: Always use external editor (like plan editing)
- **Option B**: Inline editing in TUI with multiline input
- **Option C**: Inline for short content, external for longer

**Recommendation**: Use external editor (Option A) for MVP to match plan editing UX.

### 2. Thread Name Generation
**Question**: How to generate thread names from next-up titles?
- **Option A**: Auto-convert title to kebab-case (e.g., "Fix Auth Bug" → "fix-auth-bug")
- **Option B**: Prompt user to enter thread name when launching
- **Option C**: Use title as-is if valid, otherwise prompt

**Recommendation**: Option A with fallback to Option B if auto-conversion fails validation.

### 3. Status Bar Real Estate
**Question**: Tab bar is getting crowded with 4 tabs. How to manage space?
- **Option A**: Use shorter names: `[1] Thds [2] Bugs [3] Refs [4] Next`
- **Option B**: Keep full names, let it wrap if needed
- **Option C**: Show only active tab name, use numbers for others: `1 2 3 [4] Next-Ups`

**Recommendation**: Option B initially (full names), refine if space issues arise in practice.

### 4. Reflections Tab Integration
**Question**: Reflections tab (tab #3) is not yet implemented. Should we:
- **Option A**: Implement next-ups as tab #4, leave tab #3 empty/placeholder
- **Option B**: Skip tab #3 for now, make next-ups tab #3
- **Option C**: Implement reflections first, then next-ups

**Recommendation**: Option A - keep tab numbering consistent, implement tab #4 as next-ups.

### 5. Archive vs Delete
**Question**: Should users be able to permanently delete next-ups, or only archive them?
- **Option A**: Archive only (safer, can recover)
- **Option B**: Delete only (cleaner, no clutter)
- **Option C**: Both (archive with `a`, delete with `d` + confirmation)

**Recommendation**: Option C - archive for safety, delete for cleaning up old items.

### 6. Template Discovery
**Question**: How should users discover and browse templates?
- **Option A**: Templates appear in main list, visually distinct with `#` icon
- **Option B**: Separate filter for templates (like thread status filter)
- **Option C**: Separate "Templates" section at top of list

**Recommendation**: Option A for MVP (simpler), add filter (Option B) if needed later.

### 7. Launch Behavior
**Question**: After launching a next-up as a thread, should we:
- **Option A**: Stay on next-ups tab
- **Option B**: Switch to threads tab and select the new thread
- **Option C**: Prompt user to choose

**Recommendation**: Option B - switch to threads tab to maintain context and allow immediate worker spawn.

## Implementation Phases

### Phase 1: Database & Core Functions (MVP)
- Add `next_ups` table to schema
- Add TypeScript types
- Add query functions
- Add schema migration handling

### Phase 2: TUI State & Actions
- Update state with next-ups signals
- Add next-ups actions
- Wire up auto-refresh for next-ups

### Phase 3: UI Components
- Create `next-ups-list.ts` component
- Create `next-up-input.ts` component
- Update tab bar for 4 tabs
- Update status bar for next-ups keybindings

### Phase 4: Integration & Keyboard Handlers
- Wire up next-ups tab in `mod.ts`
- Implement keyboard handlers
- Add external editor integration
- Implement launch-as-thread flow

### Phase 5: Polish & Testing
- Add confirmation dialogs where needed
- Test all keyboard shortcuts
- Test edge cases (empty list, validation, etc.)
- Update documentation

### Phase 6: Optional Enhancements (Post-MVP)
- CLI commands for next-up management
- Split view (list + content preview)
- Status filter for next-ups
- Search/find within next-ups
- Duplicate template to create new template

## Success Criteria

- Users can create, edit, and delete next-ups in the TUI
- Users can mark next-ups as templates
- Users can launch next-ups as new threads
- Templates persist and can be launched multiple times
- Regular next-ups are archived when launched
- UI is consistent with existing tabs (threads, bugs)
- Keyboard shortcuts follow existing conventions
- Changes persist across TUI sessions

## Technical Considerations

### Database Migration
- Need to handle schema migration for existing databases
- Current approach: schema.sql is loaded on connection, tables created if not exist
- Adding new table should be seamless for new installations
- Existing installations will auto-create table on next DB access

### State Management
- Next-ups state should follow same pattern as threads/bugs
- Auto-refresh every 5 seconds (like other entities)
- Use computed values for filtered/formatted lists
- Cleanup subscriptions on tab switch

### External Editor Integration
- Reuse existing temp file approach from plan editing
- Watch for file changes and save on modification
- Handle editor crash/cancellation gracefully

### Thread Creation
- Reuse existing thread creation logic where possible
- Ensure git branch creation if configured
- Handle name collision (thread already exists)
- Validate thread name format (kebab-case)

## Risk Assessment

### Low Risk
- Database schema changes (additive only, backwards compatible)
- UI components (follow established patterns)
- State management (reuse existing patterns)

### Medium Risk
- Thread creation from next-up (needs careful validation)
- External editor integration (file watching, cleanup)
- Status bar space (may need truncation/wrapping)

### High Risk
- None identified

## Estimated Complexity

- **Database Layer**: Low complexity, ~2-3 hours
- **State & Actions**: Low-medium complexity, ~3-4 hours
- **UI Components**: Medium complexity, ~5-6 hours
- **Integration**: Medium complexity, ~4-5 hours
- **Testing & Polish**: Low-medium complexity, ~2-3 hours

**Total estimate**: ~16-21 hours of focused development time

## Next Steps

1. ✅ Complete this plan
2. Review plan with stakeholders (answer open questions)
3. Begin Phase 1 implementation (database layer)
4. Iterate through phases 2-5
5. Test thoroughly in real usage scenarios
6. Consider Phase 6 enhancements based on user feedback
