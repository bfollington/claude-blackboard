/**
 * Main TUI entry point for the blackboard dashboard.
 * Provides an interactive terminal interface for managing threads, plans, steps, and breadcrumbs.
 */

import {
  Tui,
  handleInput,
  handleKeyboardControls,
  handleMouseControls,
} from "https://deno.land/x/tui@2.1.11/mod.ts";
import { crayon } from "https://deno.land/x/crayon@3.3.3/mod.ts";
import { createTuiState, createTuiActions } from "./state.ts";
import type { TuiState, TuiActions } from "./state.ts";
import { createTabBar } from "./components/tab-bar.ts";
import { createThreadList } from "./components/thread-list.ts";
import { createDetailPanel } from "./components/detail-panel.ts";
import { createStatusBar } from "./components/status-bar.ts";
import { createFindInput } from "./components/find-input.ts";
import { createThreadInput } from "./components/thread-input.ts";
import { createBugList } from "./components/bug-list.ts";
import { createNextUpsList } from "./components/next-ups-list.ts";
import { createNextUpInput } from "./components/next-up-input.ts";
import { createConfirmDialog } from "./components/confirm-dialog.ts";

export interface TuiOptions {
  db?: string;
}

/**
 * TUI application context containing the Tui instance, state, and actions.
 * This is passed to components for rendering and event handling.
 */
export interface TuiContext {
  tui: Tui;
  state: TuiState;
  actions: TuiActions;
}

// Track currently open file for import
interface OpenFile {
  path: string;
  type: "plan" | "step" | "crumb";
  index?: number;
  originalContent: string;
  isNew: boolean; // Whether this is creating a new item vs editing existing
}

// ANSI escape sequences for terminal control
const DISABLE_MOUSE = "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";
const SHOW_CURSOR = "\x1b[?25h";

/**
 * Restore terminal to normal state.
 * This disables mouse tracking and shows the cursor.
 */
function restoreTerminal(): void {
  const encoder = new TextEncoder();
  Deno.stdout.writeSync(encoder.encode(DISABLE_MOUSE + SHOW_CURSOR));
}

/**
 * Open content in external app using 'open' command (macOS).
 * Creates a temp file and opens it - user edits externally then uses 'i' to import.
 */
async function openInExternalApp(
  content: string,
  type: "plan" | "step" | "crumb",
  index?: number,
  isNew = false
): Promise<OpenFile | null> {
  const suffix = type === "plan" ? ".md" : ".txt";
  const prefix = type === "plan" ? "plan" : type === "step" ? "step" : "crumb";

  // Create temp file with descriptive name
  const tmpDir = await Deno.makeTempDir({ prefix: "blackboard-" });
  const tmpFile = `${tmpDir}/${prefix}${suffix}`;

  try {
    // Write content to temp file
    await Deno.writeTextFile(tmpFile, content);

    // Use 'open' command to launch editor
    // Respects VISUAL or EDITOR env vars, falls back to system default
    const editor = Deno.env.get("VISUAL") || Deno.env.get("EDITOR");
    const args = editor
      ? ["-a", editor, tmpFile]  // open -a <app> <file>
      : [tmpFile];               // open <file> (system default)

    const cmd = new Deno.Command("open", {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    });

    const result = await cmd.output();

    if (!result.success) {
      return null;
    }

    return {
      path: tmpFile,
      type,
      index,
      originalContent: content,
      isNew,
    };
  } catch {
    return null;
  }
}

/**
 * Import content from the open file.
 */
async function importOpenFile(
  openFile: OpenFile,
  actions: TuiActions
): Promise<boolean> {
  try {
    const newContent = await Deno.readTextFile(openFile.path);

    if (newContent === openFile.originalContent) {
      actions.setStatusMessage("No changes to import");
      return false;
    }

    switch (openFile.type) {
      case "plan":
        if (openFile.isNew) {
          actions.createPlan(newContent);
          actions.setStatusMessage("Plan created");
        } else {
          actions.savePlanMarkdown(newContent);
          actions.setStatusMessage("Plan imported");
        }
        break;
      case "step":
        actions.saveStepDescription(openFile.index ?? 0, newContent.trim());
        actions.setStatusMessage("Step imported");
        break;
      case "crumb":
        actions.saveCrumbSummary(openFile.index ?? 0, newContent.trim());
        actions.setStatusMessage("Crumb imported");
        break;
    }

    // Clean up temp file after successful import
    try {
      await Deno.remove(openFile.path);
      // Try to remove the temp directory too
      const dir = openFile.path.substring(0, openFile.path.lastIndexOf("/"));
      await Deno.remove(dir);
    } catch {
      // Ignore cleanup errors
    }

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    actions.setStatusMessage(`Import failed: ${message}`);
    return false;
  }
}

/**
 * Launch the interactive TUI dashboard.
 * Returns when user quits (q or Ctrl+C).
 */
export async function launchTui(_options: TuiOptions): Promise<void> {
  // Initialize reactive state
  const state = createTuiState();
  const actions = createTuiActions(state);

  // Load initial data - delay slightly to allow Computed dependency tracking to complete
  // (deno_tui's Computed signals register dependencies asynchronously via trackDependencies())
  await new Promise((resolve) => setTimeout(resolve, 10));
  actions.loadThreads();
  actions.loadWorkers();

  // Track currently open file for import
  let currentOpenFile: OpenFile | null = null;

  // Track tab-specific cleanup functions
  let threadTabCleanups: Array<() => void> = [];
  let bugsTabCleanups: Array<() => void> = [];
  let nextUpsTabCleanups: Array<() => void> = [];

  // Ensure terminal is restored on exit
  const cleanup = () => {
    restoreTerminal();
  };

  // Handle Ctrl+C at process level
  Deno.addSignalListener("SIGINT", () => {
    cleanup();
    Deno.exit(0);
  });

  try {
    // Create and run TUI
    const tui = new Tui({
      style: crayon.bgBlack,
      refreshRate: 1000 / 60, // 60 FPS
    });

    // Enable input handling
    handleInput(tui);
    handleKeyboardControls(tui);
    handleMouseControls(tui);

    // Create UI components
    const terminalSize = tui.canvas.size.value;
    const leftPanelWidth = Math.max(20, Math.floor(terminalSize.columns * 0.25));

    const cleanupTabBar = createTabBar({ tui, state, row: 0 });

    // Status bar at bottom
    const cleanupStatusBar = createStatusBar({
      tui,
      state,
      row: terminalSize.rows - 1,
      width: terminalSize.columns,
    });

    // Tab rendering functions
    const renderThreadsTab = () => {
      // Clean up any existing thread tab components
      threadTabCleanups.forEach(cleanup => cleanup());
      threadTabCleanups = [];

      const cleanupThreadList = createThreadList({
        tui,
        state,
        rectangle: {
          column: 0,
          row: 1,
          width: leftPanelWidth,
          height: terminalSize.rows - 2,
        },
      });

      const detailPanelColumn = leftPanelWidth + 1;
      const detailPanelWidth = terminalSize.columns - detailPanelColumn;
      const cleanupDetailPanel = createDetailPanel({
        tui,
        state,
        rectangle: {
          column: detailPanelColumn,
          row: 1,
          width: detailPanelWidth,
          height: terminalSize.rows - 2,
        },
      });

      threadTabCleanups.push(cleanupThreadList, cleanupDetailPanel);
    };

    const renderBugsTab = () => {
      // Clean up any existing bugs tab components
      bugsTabCleanups.forEach(cleanup => cleanup());
      bugsTabCleanups = [];

      // Load bug reports
      actions.loadBugReports();

      // Bug list uses full width (no detail panel)
      const cleanupBugList = createBugList({
        tui,
        state,
        rectangle: {
          column: 0,
          row: 1,
          width: terminalSize.columns,
          height: terminalSize.rows - 2,
        },
      });

      bugsTabCleanups.push(cleanupBugList);
    };

    const renderNextUpsTab = () => {
      // Clean up any existing next-ups tab components
      nextUpsTabCleanups.forEach(cleanup => cleanup());
      nextUpsTabCleanups = [];

      // Load next-ups
      actions.loadNextUps();

      // Next-ups list uses full width (no detail panel)
      const cleanupNextUpsList = createNextUpsList({
        tui,
        state,
        rectangle: {
          column: 0,
          row: 1,
          width: terminalSize.columns,
          height: terminalSize.rows - 2,
        },
      });

      nextUpsTabCleanups.push(cleanupNextUpsList);
    };

    // Subscribe to tab changes to switch components
    state.activeTab.subscribe((tab) => {
      if (tab === "threads") {
        // Clean up other tabs, render threads tab
        bugsTabCleanups.forEach(cleanup => cleanup());
        bugsTabCleanups = [];
        nextUpsTabCleanups.forEach(cleanup => cleanup());
        nextUpsTabCleanups = [];
        renderThreadsTab();
      } else if (tab === "bugs") {
        // Clean up other tabs, render bugs tab
        threadTabCleanups.forEach(cleanup => cleanup());
        threadTabCleanups = [];
        nextUpsTabCleanups.forEach(cleanup => cleanup());
        nextUpsTabCleanups = [];
        renderBugsTab();
      } else if (tab === "next-ups") {
        // Clean up other tabs, render next-ups tab
        threadTabCleanups.forEach(cleanup => cleanup());
        threadTabCleanups = [];
        bugsTabCleanups.forEach(cleanup => cleanup());
        bugsTabCleanups = [];
        renderNextUpsTab();
      }
      // Note: reflections tab not implemented yet
    });

    // Initial render based on active tab
    if (state.activeTab.value === "bugs") {
      renderBugsTab();
    } else if (state.activeTab.value === "next-ups") {
      renderNextUpsTab();
    } else {
      renderThreadsTab();
    }

    // Find input overlay (conditionally rendered based on state)
    const findInputCleanups: Array<() => void> = [];
    const updateFindInput = () => {
      if (state.findState.value.isActive && findInputCleanups.length === 0) {
        const cleanup = createFindInput({
          tui,
          state,
          onQueryChange: (query) => actions.updateFindQuery(query),
          onNext: () => actions.findNext(),
          onPrevious: () => actions.findPrevious(),
          onExit: () => actions.exitFind(),
          onClear: () => actions.clearFind(),
        });
        findInputCleanups.push(cleanup);
      } else if (!state.findState.value.isActive && findInputCleanups.length > 0) {
        const cleanup = findInputCleanups.pop();
        cleanup?.();
      }
    };

    // Watch for find state changes
    state.findState.subscribe(() => {
      updateFindInput();
    });

    // Initial check
    updateFindInput();

    // Thread input overlay (conditionally rendered based on state)
    const threadInputCleanups: Array<() => void> = [];
    const updateThreadInput = () => {
      if (state.isCreatingThread.value && threadInputCleanups.length === 0) {
        const cleanup = createThreadInput({
          tui,
          state,
          onNameChange: (name) => actions.updateNewThreadName(name),
          onConfirm: () => actions.confirmCreateThread(),
          onCancel: () => actions.cancelCreateThread(),
        });
        threadInputCleanups.push(cleanup);
      } else if (!state.isCreatingThread.value && threadInputCleanups.length > 0) {
        const cleanup = threadInputCleanups.pop();
        cleanup?.();
      }
    };

    // Watch for thread creation state changes
    state.isCreatingThread.subscribe(() => {
      updateThreadInput();
    });

    // Initial check
    updateThreadInput();

    // Next-up input overlay (conditionally rendered based on state)
    const nextUpInputCleanups: Array<() => void> = [];
    const updateNextUpInput = () => {
      if (state.isCreatingNextUp.value && nextUpInputCleanups.length === 0) {
        const cleanup = createNextUpInput({
          tui,
          state,
          onTitleChange: (title) => actions.updateNewNextUpTitle(title),
          onConfirm: () => actions.confirmCreateNextUp(),
          onCancel: () => actions.cancelCreateNextUp(),
        });
        nextUpInputCleanups.push(cleanup);
      } else if (!state.isCreatingNextUp.value && nextUpInputCleanups.length > 0) {
        const cleanup = nextUpInputCleanups.pop();
        cleanup?.();
      }
    };

    // Watch for next-up creation state changes
    state.isCreatingNextUp.subscribe(() => {
      updateNextUpInput();
    });

    // Initial check
    updateNextUpInput();

    // Confirmation dialog overlay (conditionally rendered based on state)
    const confirmDialogCleanups: Array<() => void> = [];
    const updateConfirmDialog = () => {
      if (state.isConfirming.value && confirmDialogCleanups.length === 0) {
        const cleanup = createConfirmDialog({
          tui,
          message: state.confirmMessage.value,
          onConfirm: () => actions.confirmDialogYes(),
          onCancel: () => actions.confirmDialogNo(),
        });
        confirmDialogCleanups.push(cleanup);
      } else if (!state.isConfirming.value && confirmDialogCleanups.length > 0) {
        const cleanup = confirmDialogCleanups.pop();
        cleanup?.();
      }
    };

    // Watch for confirmation state changes
    state.isConfirming.subscribe(() => {
      updateConfirmDialog();
    });

    // Initial check
    updateConfirmDialog();

    // Set up auto-refresh every 5 seconds
    const REFRESH_INTERVAL_MS = 5000;
    const refreshInterval = setInterval(() => {
      // Only refresh if not in find mode
      if (!state.findState.value.isActive) {
        actions.refreshAll();
      }
    }, REFRESH_INTERVAL_MS);

    // Handle keybindings
    tui.on("keyPress", async (event) => {
      // Check if find is active - find input handles its own keys
      const findActive = state.findState.value.isActive;

      // Quit on 'q' or Ctrl+C (only if not in find mode)
      if (!findActive && (event.key === "q" || (event.ctrl && event.key === "c"))) {
        actions.quit();
        return;
      }

      // Start find mode with '/' (only if not already active)
      if (!findActive && event.key === "/") {
        actions.startFind();
        return;
      }

      // 'n' key: context-dependent (find next OR create new thread)
      if (!findActive && event.key === "n") {
        const findState = state.findState.value;
        // If there are find matches, 'n' navigates to next match
        if (findState.matches.length > 0) {
          actions.findNext();
        // Otherwise, if focused on list pane and not creating thread, 'n' creates new thread
        } else if (!state.isCreatingThread.value && state.focusedPane.value === "list") {
          actions.startCreateThread();
        }
        return;
      }
      // Shift+N always does find previous (if matches exist)
      if (!findActive && event.shift && event.key === "n") {
        actions.findPrevious();
        return;
      }

      // Clear find on Escape
      if (event.key === "escape") {
        const findState = state.findState.value;
        if (findActive) {
          // If typing, cancel the search
          actions.clearFind();
        } else if (findState.matches.length > 0) {
          // If not typing but have matches, clear them
          actions.clearFind();
        }
        return;
      }

      // Don't process other keys if find input is active
      if (findActive) {
        return;
      }

      // Skip other key handling if creating thread
      if (state.isCreatingThread.value) {
        return;
      }

      // Tab switching: 1, 2, 3, 4
      if (event.key === "1") {
        actions.switchTab("threads");
        return;
      }
      if (event.key === "2") {
        actions.switchTab("bugs");
        return;
      }
      if (event.key === "3") {
        actions.switchTab("reflections");
        return;
      }
      if (event.key === "4") {
        actions.switchTab("next-ups");
        return;
      }

      // Tab key cycles focus within threads tab
      if (event.key === "tab" && state.activeTab.value === "threads") {
        actions.cycleFocus();
        return;
      }

      // 'o' key - Open in external app
      if (event.key === "o") {
        const pane = state.focusedPane.value;
        let content: string | null = null;
        let type: "plan" | "step" | "crumb" = "plan";
        let index: number | undefined;
        let isNew = false;

        if (pane === "plan") {
          content = actions.getPlanMarkdown();
          type = "plan";

          // If no plan exists, create a template for a new plan
          if (!content) {
            const thread = state.selectedThread.value;
            if (thread) {
              content = `# ${thread.name}\n\n## Overview\n\n## Steps\n\n1. \n2. \n3. \n`;
              isNew = true;
            }
          }
        } else if (pane === "steps") {
          index = state.selectedStepIndex.value;
          content = actions.getStepDescription(index);
          type = "step";
        } else if (pane === "crumbs") {
          index = state.selectedCrumbIndex.value;
          content = actions.getCrumbSummary(index);
          type = "crumb";
        }

        if (content) {
          const openFile = await openInExternalApp(content, type, index, isNew);
          if (openFile) {
            currentOpenFile = openFile;
            const action = isNew ? "Created" : "Opened";
            actions.setStatusMessage(`${action} ${type} - press 'i' to import changes`);
          } else {
            actions.setStatusMessage("Failed to open file");
          }
        } else {
          actions.setStatusMessage("Nothing to open");
        }
        return;
      }

      // 'i' key - Import from open file
      if (event.key === "i") {
        if (currentOpenFile) {
          const imported = await importOpenFile(currentOpenFile, actions);
          if (imported) {
            currentOpenFile = null;
          }
        } else {
          actions.setStatusMessage("No file open - press 'o' to open first");
        }
        return;
      }

      // Worker operations (on threads tab, any pane)
      if (event.key === "w" && !event.shift) {
        if (state.activeTab.value !== "threads") {
          actions.setStatusMessage("Switch to threads tab first");
          return;
        }
        const thread = state.selectedThread.value;
        if (!thread) {
          actions.setStatusMessage("No thread selected");
        } else if (thread.status !== "active" && thread.status !== "paused") {
          actions.setStatusMessage(`Thread is ${thread.status}, need active/paused`);
        } else {
          actions.setStatusMessage("Spawning worker...");
          // Use .catch() to handle async errors since we can't await in event handler
          actions.spawnWorker(thread).catch((err) => {
            actions.setStatusMessage(`Spawn error: ${err.message?.slice(0, 30) || err}`);
          });
        }
        return;
      }

      // Kill worker with Shift+W (on threads tab, any pane)
      if (event.shift && event.key === "w" && state.activeTab.value === "threads") {
        const thread = state.selectedThread.value;
        if (!thread) {
          actions.setStatusMessage("No thread selected");
        } else {
          const workers = state.workersForSelectedThread.value;
          if (workers.length === 0) {
            actions.setStatusMessage("No active workers for this thread");
          } else if (workers.length === 1) {
            actions.setStatusMessage("Killing worker...");
            actions.killWorker(workers[0].id).catch((err) => {
              actions.setStatusMessage(`Kill error: ${err.message?.slice(0, 30) || err}`);
            });
          } else {
            actions.setStatusMessage(`Killing ${workers.length} workers...`);
            actions.killAllWorkersForThread(thread).catch((err) => {
              actions.setStatusMessage(`Kill error: ${err.message?.slice(0, 30) || err}`);
            });
          }
        }
        return;
      }

      // Bug tab navigation and actions
      if (state.activeTab.value === "bugs") {
        const isDown = event.key === "j" || event.key === "down";
        const isUp = event.key === "k" || event.key === "up";

        if (isDown) { actions.moveBugSelection(1); return; }
        if (isUp) { actions.moveBugSelection(-1); return; }

        // Filter cycling with Shift+Tab
        if (event.shift && event.key === "tab") { actions.cycleBugFilter(); return; }

        // Status changes
        const bug = state.selectedBug.value;
        if (event.key === "r" && !event.shift) {
          // 'r' = resolve
          if (bug && bug.status === "open") actions.updateBugStatus(bug, "resolved");
          return;
        }
        if (event.key === "r" && event.shift) {
          // Shift+R = reopen
          if (bug && bug.status !== "open") actions.updateBugStatus(bug, "open");
          return;
        }
        if (event.key === "x") {
          // 'x' = won't fix
          if (bug && bug.status === "open") actions.updateBugStatus(bug, "wontfix");
          return;
        }
        return; // Don't process other keys when on bugs tab
      }

      // Next-ups tab navigation and actions
      if (state.activeTab.value === "next-ups") {
        const isDown = event.key === "j" || event.key === "down";
        const isUp = event.key === "k" || event.key === "up";

        if (isDown) { actions.moveNextUpSelection(1); return; }
        if (isUp) { actions.moveNextUpSelection(-1); return; }

        // Create new next-up with 'n'
        if (event.key === "n") {
          actions.startCreateNextUp();
          return;
        }

        // Launch next-up as thread with Enter or 'l'
        if (event.key === "return" || event.key === "l") {
          const nextUp = state.selectedNextUp.value;
          if (nextUp) {
            actions.setStatusMessage("Launching next-up as thread...");
            actions.launchNextUpAsThread().catch((err) => {
              actions.setStatusMessage(`Launch error: ${err.message?.slice(0, 30) || err}`);
            });
          }
          return;
        }

        // Toggle template status with 't'
        if (event.key === "t") {
          actions.toggleNextUpTemplate();
          return;
        }

        // Archive next-up with 'a'
        if (event.key === "a") {
          actions.archiveNextUpItem();
          return;
        }

        // Delete next-up with 'd'
        if (event.key === "d") {
          actions.deleteNextUpItem();
          return;
        }

        // Edit next-up content with 'o'
        if (event.key === "o") {
          actions.setStatusMessage("Opening editor...");
          actions.editNextUpContent().catch((err) => {
            actions.setStatusMessage(`Edit error: ${err.message?.slice(0, 30) || err}`);
          });
          return;
        }

        return; // Don't process other keys when on next-ups tab
      }

      // Navigation and actions based on focused pane (threads tab only)
      handlePaneKeyPress(event, state, actions);
    });

    // Run the TUI
    tui.run();

    // Wait for quit signal
    await new Promise<void>((resolve) => {
      const checkStatus = setInterval(() => {
        if (state.shouldQuit.value) {
          clearInterval(checkStatus);
          resolve();
        }
      }, 50);
    });

    // Clean up TUI
    findInputCleanups.pop()?.();
    threadInputCleanups.pop()?.();
    nextUpInputCleanups.pop()?.();
    confirmDialogCleanups.pop()?.();
    cleanupStatusBar();
    threadTabCleanups.forEach(cleanup => cleanup());
    bugsTabCleanups.forEach(cleanup => cleanup());
    nextUpsTabCleanups.forEach(cleanup => cleanup());
    cleanupTabBar();

    // Clear refresh interval
    clearInterval(refreshInterval);

    // Destroy TUI
    tui.destroy();
  } finally {
    // Always restore terminal on exit
    cleanup();
  }
}

/**
 * Handle key presses based on the currently focused pane.
 */
function handlePaneKeyPress(
  event: { key: string; ctrl?: boolean; shift?: boolean; meta?: boolean },
  state: TuiState,
  actions: TuiActions
): void {
  const pane = state.focusedPane.value;

  // j/k or arrow navigation
  const isDown = event.key === "j" || event.key === "down";
  const isUp = event.key === "k" || event.key === "up";

  switch (pane) {
    case "list":
      if (isDown) actions.moveThreadSelection(1);
      if (isUp) actions.moveThreadSelection(-1);

      // Thread filter cycling
      if (event.key === "tab" && event.shift) {
        actions.cycleThreadFilter();
      }

      // Archive thread
      if (event.key === "a") {
        const thread = state.selectedThread.value;
        if (thread) actions.archiveThread(thread);
      }

      // Pause/unpause thread
      if (event.key === "p") {
        const thread = state.selectedThread.value;
        if (thread) actions.toggleThreadPause(thread);
      }

      // Merge thread
      if (event.key === "m") {
        const thread = state.selectedThread.value;
        if (thread) actions.mergeThread(thread);
      }
      break;

    case "steps":
      if (isDown) actions.moveStepSelection(1);
      if (isUp) actions.moveStepSelection(-1);

      // Toggle step status with space or enter
      if (event.key === "space" || event.key === "return") {
        actions.toggleStepStatus(state.selectedStepIndex.value);
      }

      // Move step up/down with shift+J/K
      if (event.shift && event.key === "J") {
        const idx = state.selectedStepIndex.value;
        actions.moveStep(idx, idx + 1);
      }
      if (event.shift && event.key === "K") {
        const idx = state.selectedStepIndex.value;
        actions.moveStep(idx, idx - 1);
      }
      break;

    case "crumbs":
      if (isDown) actions.moveCrumbSelection(1);
      if (isUp) actions.moveCrumbSelection(-1);
      break;

    case "plan":
      // Plan pane - 'o' to open handled above
      break;
  }
}

// Re-export state types for use in components
export type { TuiState, TuiActions, TabId, PaneId, ThreadListItem } from "./state.ts";
