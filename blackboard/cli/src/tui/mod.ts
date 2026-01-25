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
import { Signal } from "https://deno.land/x/tui@2.1.11/src/signals/mod.ts";
import { createTuiState, createTuiActions } from "./state.ts";
import type { TuiState, TuiActions } from "./state.ts";
import { createTabBar } from "./components/tab-bar.ts";
import { createThreadList } from "./components/thread-list.ts";
import { createDetailPanel } from "./components/detail-panel.ts";
import { editInExternalEditor } from "./actions/editor.ts";
import { createStatusBar } from "./components/status-bar.ts";

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

// Edit request type for triggering external editor
interface EditRequest {
  type: "plan" | "step" | "crumb";
  index?: number;
}

/**
 * Launch the interactive TUI dashboard.
 * Returns when user quits (q or Ctrl+C).
 */
export async function launchTui(_options: TuiOptions): Promise<void> {
  // Initialize reactive state
  const state = createTuiState();
  const actions = createTuiActions(state);

  // Load initial data
  actions.loadThreads();

  // Signal for pending edit requests (to handle outside TUI event loop)
  const pendingEdit = new Signal<EditRequest | null>(null);

  // Main loop - supports TUI restart after editor sessions
  while (!state.shouldQuit.value) {
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

    // Handle keybindings
    tui.on("keyPress", (event) => {
      // Quit on 'q' or Ctrl+C
      if (event.key === "q" || (event.ctrl && event.key === "c")) {
        actions.quit();
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

      // Edit key 'e' - trigger external editor based on focused pane
      if (event.key === "e") {
        const pane = state.focusedPane.value;
        if (pane === "plan") {
          pendingEdit.value = { type: "plan" };
        } else if (pane === "steps") {
          pendingEdit.value = { type: "step", index: state.selectedStepIndex.value };
        } else if (pane === "crumbs") {
          pendingEdit.value = { type: "crumb", index: state.selectedCrumbIndex.value };
        }
        return;
      }

      // Navigation and actions based on focused pane
      handlePaneKeyPress(event, state, actions);
    });

    // Run the TUI
    tui.run();

    // Wait for quit signal or edit request
    await new Promise<void>((resolve) => {
      const checkStatus = setInterval(() => {
        if (state.shouldQuit.value || pendingEdit.value !== null) {
          clearInterval(checkStatus);
          resolve();
        }
      }, 50);
    });

    // Clean up TUI
    cleanupStatusBar();
    cleanupDetailPanel();
    cleanupThreadList();
    cleanupTabBar();
    tui.destroy();

    // Handle edit request if present
    if (pendingEdit.value !== null && !state.shouldQuit.value) {
      const edit = pendingEdit.value;
      pendingEdit.value = null;

      await handleEditRequest(edit, state, actions);
    }
  }
}

/**
 * Handle an edit request by opening external editor.
 */
async function handleEditRequest(
  edit: EditRequest,
  state: TuiState,
  actions: TuiActions
): Promise<void> {
  let content: string | null = null;
  let suffix = ".md";

  // Get content to edit
  switch (edit.type) {
    case "plan":
      content = actions.getPlanMarkdown();
      suffix = ".md";
      break;
    case "step":
      content = actions.getStepDescription(edit.index ?? 0);
      suffix = ".txt";
      break;
    case "crumb":
      content = actions.getCrumbSummary(edit.index ?? 0);
      suffix = ".txt";
      break;
  }

  if (content === null) {
    return;
  }

  // Open editor
  const result = await editInExternalEditor(content, suffix);

  // Save if changed
  if (result.changed && result.content !== null) {
    switch (edit.type) {
      case "plan":
        actions.savePlanMarkdown(result.content);
        break;
      case "step":
        actions.saveStepDescription(edit.index ?? 0, result.content.trim());
        break;
      case "crumb":
        actions.saveCrumbSummary(edit.index ?? 0, result.content.trim());
        break;
    }
  } else if (result.error) {
    actions.setStatusMessage(`Edit failed: ${result.error}`);
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
      // Plan pane handled by 'e' key above
      break;
  }
}

// Re-export state types for use in components
export type { TuiState, TuiActions, TabId, PaneId, ThreadListItem } from "./state.ts";
