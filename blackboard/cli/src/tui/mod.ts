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
  index?: number
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
        actions.savePlanMarkdown(newContent);
        actions.setStatusMessage("Plan imported");
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

  // Track currently open file for import
  let currentOpenFile: OpenFile | null = null;

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

    // Status bar at bottom
    const cleanupStatusBar = createStatusBar({
      tui,
      state,
      row: terminalSize.rows - 1,
      width: terminalSize.columns,
    });

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

    // Handle keybindings
    tui.on("keyPress", (event) => {
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

      // Find navigation keys (only when not in find input mode)
      if (!findActive && event.key === "n") {
        actions.findNext();
        return;
      }
      if (!findActive && event.shift && event.key === "n") {
        actions.findPrevious();
        return;
      }

      // Exit find on Escape (even when not in input mode)
      if (event.key === "escape") {
        if (findActive) {
          actions.exitFind();
        }
        return;
      }

      // Don't process other keys if find input is active
      if (findActive) {
        return;
      }

      // Tab switching: 1, 2, 3
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

        if (pane === "plan") {
          content = actions.getPlanMarkdown();
          type = "plan";
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
          const openFile = await openInExternalApp(content, type, index);
          if (openFile) {
            currentOpenFile = openFile;
            actions.setStatusMessage(`Opened ${type} - press 'i' to import changes`);
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

      // Navigation and actions based on focused pane
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
    cleanupStatusBar();
    cleanupDetailPanel();
    cleanupThreadList();
    cleanupTabBar();

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
